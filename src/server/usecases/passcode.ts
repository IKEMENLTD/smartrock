// F-004/005/006 パスコード発行・id受領・失効 (design-docs/12, 21, 25 / TC-005,006,008,009)
// 平文コードは DB に保存しない(codeHash のみ)。平文は発行直後の通知に limited に使用。
// 外部連携は必ず getServices() 経由。

import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";
import {
  generateNumericCode,
  hashCode,
} from "@/server/lib/hmac";
import {
  PasscodeStatus,
  passcodeName,
  reservationIdFromPasscodeName,
} from "@/types/domain";
import { sendPasscodeNotification } from "./notify";

const MS = 60_000;

/**
 * F-004: createKey を同期呼出してパスコードを発行する。
 * - 6桁ランダム → codeHash 保存(平文非保持)。
 * - passcodes を upsert(reservation_id UNIQUE)、status=pending。
 * - createKey 成功で即 LINE 通知(平文はここでのみ保持し通知に渡す)。
 * - createKey 失敗は status=failed + logger.error。Error は投げない(予約は維持)。
 *   key id は createKey 結果 webhook(onCreateKeyResult)で後埋め。
 */
export async function issuePasscode(reservationId: number): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { store: true },
  });
  if (!reservation) {
    logger.warn("issuePasscode: reservation not found", { reservationId });
    return;
  }

  const deviceId = reservation.store.switchbotKeypadId;
  const name = passcodeName(reservationId); // r{id}

  const validFrom = new Date(
    reservation.startAt.getTime() - config.ops.passcodeValidBeforeMin * MS,
  );
  const validTo = new Date(
    reservation.endAt.getTime() + config.ops.passcodeValidAfterMin * MS,
  );

  // 平文はメモリ上のみ。DB には codeHash のみ保存する。
  const plainCode = generateNumericCode(6);
  const codeHash = hashCode(plainCode);

  await prisma.passcode.upsert({
    where: { reservationId },
    create: {
      reservationId,
      switchbotDeviceId: deviceId,
      passcodeName: name,
      codeHash,
      type: "timeLimit",
      validFrom,
      validTo,
      status: PasscodeStatus.Pending,
      switchbotKeyId: null,
    },
    update: {
      switchbotDeviceId: deviceId,
      passcodeName: name,
      codeHash,
      type: "timeLimit",
      validFrom,
      validTo,
      status: PasscodeStatus.Pending,
      switchbotKeyId: null,
    },
  });

  try {
    const result = await getServices().switchbot.createKey({
      deviceId,
      name,
      password: plainCode,
      startEpoch: Math.floor(validFrom.getTime() / 1000),
      endEpoch: Math.floor(validTo.getTime() / 1000),
    });

    if (result.statusCode >= 400) {
      throw new Error(
        `createKey returned statusCode=${result.statusCode}: ${result.message}`,
      );
    }

    // 成功: webhook 到達前でも顧客が番号を知れるよう即通知(平文を渡す)。
    await sendPasscodeNotification(reservationId, plainCode);
  } catch (e) {
    logger.error("issuePasscode: createKey failed", {
      reservationId,
      error: String(e),
    });
    await prisma.passcode.update({
      where: { reservationId },
      data: { status: PasscodeStatus.Failed },
    });
    // 予約は維持。タスク再試行は worker 側。Error は投げない。
  }
}

/** payload(ネスト不明)から指定キーの値を再帰探索する。 */
function deepFind(obj: unknown, keys: string[]): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keys.includes(k) && v != null) return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v != null && typeof v === "object") {
      const found = deepFind(v, keys);
      if (found != null) return found;
    }
  }
  return undefined;
}

/**
 * F-005: createKey 結果 webhook → key id 保存 → active → 冪等。
 * payload から name(=r{id}) と key id を抽出する(SwitchBot 公式構造に追従、不明部は柔軟探索)。
 */
export async function onCreateKeyResult(payload: unknown): Promise<void> {
  const rawName = deepFind(payload, ["name", "passcodeName", "keyName"]);
  const rawKeyId = deepFind(payload, ["keyId", "key_id", "id", "passcodeId"]);

  if (typeof rawName !== "string") {
    logger.warn("onCreateKeyResult: name not found in payload", {});
    return;
  }
  const reservationId = reservationIdFromPasscodeName(rawName);
  if (reservationId == null) {
    logger.warn("onCreateKeyResult: unparseable passcode name", { name: rawName });
    return;
  }

  const keyId =
    typeof rawKeyId === "number"
      ? rawKeyId
      : typeof rawKeyId === "string" && /^\d+$/.test(rawKeyId)
        ? Number.parseInt(rawKeyId, 10)
        : null;

  const passcode = await prisma.passcode.findUnique({ where: { reservationId } });
  if (!passcode) {
    logger.warn("onCreateKeyResult: passcode not found", { reservationId });
    return;
  }

  // 冪等: 既に active かつ key id 設定済なら何もしない。
  if (passcode.status === PasscodeStatus.Active && passcode.switchbotKeyId != null) {
    return;
  }

  await prisma.passcode.update({
    where: { reservationId },
    data: {
      switchbotKeyId: keyId ?? passcode.switchbotKeyId,
      status: PasscodeStatus.Active,
    },
  });

  logger.info("onCreateKeyResult: passcode activated", { reservationId, keyId });
}

/**
 * F-006: deleteKey でパスコードを失効。
 * - key id が NULL → deleteKey せず warn し Error を投げる(worker が再試行)。
 *   無限ループ回避は worker 側の最大試行制御に委ねる。
 * - key id あり → deleteKey 実行、status=deleted。
 */
export async function revokePasscode(reservationId: number): Promise<void> {
  const passcode = await prisma.passcode.findUnique({ where: { reservationId } });
  if (!passcode) {
    logger.warn("revokePasscode: passcode not found, skip", { reservationId });
    return;
  }

  if (passcode.status === PasscodeStatus.Deleted) {
    return; // 冪等
  }

  if (passcode.switchbotKeyId == null) {
    logger.warn("revokePasscode: switchbotKeyId is NULL, cannot deleteKey", {
      reservationId,
    });
    // worker に「未完了」を示し再試行させる。最大試行制御は worker 側。
    throw new Error(`revokePasscode: key id not yet received for r${reservationId}`);
  }

  await getServices().switchbot.deleteKey(
    passcode.switchbotDeviceId,
    passcode.switchbotKeyId,
  );

  await prisma.passcode.update({
    where: { reservationId },
    data: { status: PasscodeStatus.Deleted },
  });
}

/**
 * F-004/011: 管理者によるパスコード再発行。
 * 旧コードを deleteKey(可能なら)→ 新規 createKey → 再通知。
 */
export async function reissuePasscode(
  reservationId: number,
): Promise<{ reservationId: number; status: string }> {
  const passcode = await prisma.passcode.findUnique({ where: { reservationId } });

  // 旧コードがあり key id を持つなら削除(失敗してもブロックしない)。
  if (passcode?.switchbotKeyId != null && passcode.status !== PasscodeStatus.Deleted) {
    try {
      await getServices().switchbot.deleteKey(
        passcode.switchbotDeviceId,
        passcode.switchbotKeyId,
      );
    } catch (e) {
      logger.warn("reissuePasscode: old deleteKey failed, continuing", {
        reservationId,
        error: String(e),
      });
    }
  }

  // 新規発行(平文生成→createKey→通知、status は pending に戻る)。
  await issuePasscode(reservationId);

  const updated = await prisma.passcode.findUnique({ where: { reservationId } });
  return { reservationId, status: updated?.status ?? PasscodeStatus.Pending };
}
