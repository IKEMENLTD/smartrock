// API-010 SwitchBot Webhook POST /api/webhooks/switchbot
// 署名なし。許可 deviceId のみ受理 + 冪等化。createKey結果 / changeReport を判別。

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { markEventProcessed } from "@/server/lib/idempotency";
import { onCreateKeyResult } from "@/server/usecases/passcode";
import { recordAccess } from "@/server/usecases/accessLog";

export const runtime = "nodejs";

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

function str(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    // 不正 body は無視 (200 で受理して破棄)
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    const deviceId =
      str(deepFind(payload, ["deviceMac", "deviceId", "device_id"])) ?? "unknown";

    // 許可リスト判定 (設定が空なら制限なしとして全許可しない: 安全側で空時は全受理)。
    const allow = config.switchbot.webhookAllowDevices;
    if (allow.length > 0 && deviceId !== "unknown" && !allow.includes(deviceId)) {
      logger.warn("switchbot webhook: device not allowed, ignore", { deviceId });
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }

    // 冪等キー: deviceId + timeStamp + eventType/context 種別
    const eventType =
      str(
        deepFind(payload, ["eventType", "event_type", "type", "scope", "context"]),
      ) ?? "unknown";
    const ts =
      str(
        deepFind(payload, ["timeStamp", "time", "ts", "timeOfSample", "occurredAt"]),
      ) ?? String(Date.now());
    const idemKey = `${deviceId}:${ts}:${eventType}`;

    const first = await markEventProcessed("switchbot", idemKey, false);
    if (!first) {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // 種別判定: keyId を含むなら createKey 結果、それ以外は changeReport(施解錠)。
    const keyId = deepFind(payload, ["keyId", "key_id", "passcodeId"]);
    const isCreateKeyResult = keyId != null;

    if (isCreateKeyResult) {
      await onCreateKeyResult(payload);
    } else {
      await recordAccess(payload);
    }
  } catch (e) {
    // 処理例外でも 200 を返し、内部は log (SwitchBot の暴発再送を避ける)。
    logger.error("switchbot webhook: handling failed", { error: String(e) });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
