// F-002/003 予約登録・取消 (design-docs/12, 21, 23, 25 / TC-003,004,010,011,017)
// 二重予約防止は (booth_id, start_at) UNIQUE + P2002→slot_full マップで担保。
// 外部連携は必ず getServices() 経由。

import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";
import {
  PaymentStatus,
  ReservationStatus,
  TaskStatus,
  TaskType,
} from "@/types/domain";
import { DomainError, isUniqueViolation } from "./errors";
import { issuePasscode, revokePasscode } from "./passcode";

const MS = 60_000;
const JST_OFFSET_MIN = 9 * 60;

function toJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}` +
    `T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`
  );
}

/** UTC Date の JST 上の weekday(0=日..6=土)と "HH:mm" / "YYYY-MM-DD" */
function jstParts(date: Date): {
  weekday: number;
  hhmm: string;
  minutesOfDay: number;
} {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const h = jst.getUTCHours();
  const mi = jst.getUTCMinutes();
  return {
    weekday: jst.getUTCDay(),
    hhmm: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
    minutesOfDay: h * 60 + mi,
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  return h * 60 + m;
}

export async function createReservation(params: {
  customerId: number;
  storeId: number;
  boothId: number;
  menuId: number;
  startAt: string; // ISO8601
  agreeTerms: boolean;
}): Promise<{
  id: number;
  status: string;
  startAt: string;
  endAt: string;
  needsPayment: boolean;
}> {
  const { customerId, storeId, boothId, menuId, agreeTerms } = params;

  // 1. 規約同意必須
  if (!agreeTerms) {
    throw new DomainError("terms_required", "ご利用規約への同意が必要です");
  }

  const startAt = new Date(params.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new DomainError("invalid_request", "startAt の形式が不正です");
  }

  // 2. 関連エンティティ取得
  const [store, menu, booth, customer] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.menu.findUnique({ where: { id: menuId } }),
    prisma.booth.findUnique({ where: { id: boothId } }),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);
  if (!store) throw new DomainError("not_found", "店舗が見つかりません");
  if (!menu) throw new DomainError("not_found", "メニューが見つかりません");
  if (!booth || booth.storeId !== storeId)
    throw new DomainError("not_found", "ブースが見つかりません");
  if (!customer) throw new DomainError("not_found", "顧客が見つかりません");

  // 1(続). end_at = start + duration
  const endAt = new Date(startAt.getTime() + menu.durationMinutes * MS);

  // 2(続). 未来・営業時間内・枠境界一致の検証
  if (startAt.getTime() <= Date.now()) {
    throw new DomainError("invalid_request", "過去または現在時刻は予約できません");
  }

  const businessHour = await prisma.businessHour.findUnique({
    where: { storeId_weekday: { storeId, weekday: jstParts(startAt).weekday } },
  });
  if (!businessHour) {
    throw new DomainError("invalid_request", "営業時間外です");
  }
  const openMin = hhmmToMinutes(businessHour.openTime);
  const closeMin = hhmmToMinutes(businessHour.closeTime);
  const startMin = jstParts(startAt).minutesOfDay;
  const endMin = jstParts(endAt).minutesOfDay;

  if (startMin < openMin || endMin > closeMin || endMin <= startMin) {
    throw new DomainError("invalid_request", "営業時間外です");
  }
  // 枠境界一致: 開始は open から slot_minutes の倍数
  if ((startMin - openMin) % businessHour.slotMinutes !== 0) {
    throw new DomainError("invalid_request", "枠の境界に一致していません");
  }

  // 3. 決済判定
  const needsPayment = config.ops.paymentsEnabled && menu.priceYen > 0;

  // 3(続). 二重予約防止: INSERT は UNIQUE(booth_id, start_at) に依存。
  // 同時2リクエストは P2002 で片方のみ成功 → slot_full にマップ(TC-004)。
  let reservationId: number;
  try {
    const created = await prisma.reservation.create({
      data: {
        customerId,
        storeId,
        boothId,
        menuId,
        startAt,
        endAt,
        status: needsPayment
          ? ReservationStatus.Pending
          : ReservationStatus.Confirmed,
        amountYen: needsPayment ? menu.priceYen : 0,
        paymentStatus: needsPayment ? PaymentStatus.Unpaid : PaymentStatus.None,
      },
      select: { id: true },
    });
    reservationId = created.id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError(
        "slot_full",
        "この枠は埋まりました。別の時間をお選びください",
      );
    }
    throw e;
  }

  if (needsPayment) {
    // 4. 決済あり: payments 行 + expire_unpaid タスク。確定処理は決済確定まで保留。
    await prisma.payment.create({
      data: {
        reservationId,
        provider: "stripe",
        amountYen: menu.priceYen,
        status: "pending",
      },
    });
    await prisma.scheduledTask.create({
      data: {
        type: TaskType.ExpireUnpaid,
        reservationId,
        runAt: new Date(Date.now() + 15 * MS),
        status: TaskStatus.Scheduled,
      },
    });
  } else {
    // 4. 決済なし: 即確定処理(カレンダー/タスク3件/createKey)。
    await finalizeReservation(reservationId);
  }

  return {
    id: reservationId,
    status: needsPayment ? ReservationStatus.Pending : ReservationStatus.Confirmed,
    startAt: toJstIso(startAt),
    endAt: toJstIso(endAt),
    needsPayment,
  };
}

/**
 * 予約確定処理(createReservation の決済なし時 / confirmPaidReservation から共通呼出)。
 * - Google カレンダーへミラー(calendarId が無ければスキップ)→ event_id 保存。
 * - scheduled_tasks を 3件 INSERT (send_reminder/revoke_passcode/send_thanks)。
 * - issuePasscode を同期呼出。
 */
async function finalizeReservation(reservationId: number): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { store: true, menu: true },
  });
  if (!reservation) {
    logger.warn("finalizeReservation: reservation not found", { reservationId });
    return;
  }

  // Google カレンダーミラー
  const calendarId = reservation.store.googleCalendarId ?? config.google.calendarId;
  if (calendarId) {
    try {
      const eventId = await getServices().calendar.insertEvent(calendarId, {
        summary: `${reservation.menu.name} (予約#${reservationId})`,
        description: `reservationId=${reservationId}`,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        timezone: reservation.store.timezone,
      });
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { googleEventId: eventId },
      });
    } catch (e) {
      // カレンダーミラー失敗は予約をブロックしない。
      logger.error("finalizeReservation: calendar insert failed", {
        reservationId,
        error: String(e),
      });
    }
  }

  // scheduled_tasks 3件
  await prisma.scheduledTask.createMany({
    data: [
      {
        type: TaskType.SendReminder,
        reservationId,
        runAt: new Date(reservation.startAt.getTime() - 60 * MS),
        status: TaskStatus.Scheduled,
      },
      {
        type: TaskType.RevokePasscode,
        reservationId,
        runAt: new Date(reservation.endAt.getTime() + 30 * MS),
        status: TaskStatus.Scheduled,
      },
      {
        type: TaskType.SendThanks,
        reservationId,
        runAt: new Date(reservation.endAt.getTime() + 5 * MS),
        status: TaskStatus.Scheduled,
      },
    ],
  });

  // createKey 同期呼出(失敗しても Error は投げない設計)
  await issuePasscode(reservationId);
}

/**
 * TC-017: 決済ありで pending のまま15分経過した予約を自動キャンセル。
 * 既に確定/取消済なら何もしない(冪等)。
 */
export async function expireUnpaidReservation(reservationId: number): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation) {
    logger.warn("expireUnpaidReservation: not found", { reservationId });
    return;
  }
  // 既に支払済 or pending でない場合は何もしない。
  if (
    reservation.status !== ReservationStatus.Pending ||
    reservation.paymentStatus === PaymentStatus.Paid
  ) {
    return;
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: ReservationStatus.Cancelled },
  });
  await prisma.payment.updateMany({
    where: { reservationId },
    data: { status: "failed" },
  });

  // パスコードは未発行のはずだが、念のため失効(key_id 無ければ握りつぶす)。
  await safeRevoke(reservationId);

  // 未実行タスク(この expire_unpaid 含む)を取消。
  await cancelPendingTasks(reservationId);

  logger.info("expireUnpaidReservation: cancelled", { reservationId });
}

/**
 * 決済確定 webhook → pending を confirmed に昇格し確定処理を実行。
 * 既に confirmed なら何もしない(冪等)。
 */
export async function confirmPaidReservation(
  reservationId: number,
  stripeSessionId: string,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation) {
    logger.warn("confirmPaidReservation: not found", { reservationId });
    return;
  }
  if (reservation.paymentStatus === PaymentStatus.Paid) {
    return; // 冪等
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      status: ReservationStatus.Confirmed,
      paymentStatus: PaymentStatus.Paid,
    },
  });
  await prisma.payment.updateMany({
    where: { reservationId },
    data: { status: "paid", stripeSessionId },
  });

  // 不要になった expire_unpaid タスクを取消。
  await prisma.scheduledTask.updateMany({
    where: {
      reservationId,
      type: TaskType.ExpireUnpaid,
      status: TaskStatus.Scheduled,
    },
    data: { status: TaskStatus.Cancelled },
  });

  // 確定処理(カレンダー/タスク3件/createKey)。
  await finalizeReservation(reservationId);

  logger.info("confirmPaidReservation: confirmed", { reservationId });
}

export async function cancelReservation(params: {
  reservationId: number;
  actor: "customer" | "admin";
  customerId?: number;
}): Promise<{ id: number; status: string }> {
  const { reservationId, actor, customerId } = params;

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { store: true },
  });
  if (!reservation) {
    throw new DomainError("not_found", "予約が見つかりません");
  }

  // 本人確認(顧客操作時)
  if (actor === "customer" && reservation.customerId !== customerId) {
    throw new DomainError("forbidden", "この予約をキャンセルする権限がありません");
  }

  // 既に終端状態
  if (
    reservation.status === ReservationStatus.Cancelled ||
    reservation.status === ReservationStatus.Done
  ) {
    throw new DomainError("already_finalized", "この予約は既に確定または取消済です");
  }

  // キャンセル期限判定(顧客のみ。管理者は期限を無視できる)。
  if (actor === "customer") {
    const deadlineMs = config.ops.cancelDeadlineHours * 60 * MS;
    if (reservation.startAt.getTime() - Date.now() < deadlineMs) {
      throw new DomainError("cancel_deadline", "キャンセル期限を過ぎています");
    }
  }

  // status=cancelled
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: ReservationStatus.Cancelled },
  });

  // パスコード即時失効(key_id あれば deleteKey、無ければ警告のみで握りつぶす=ブロックしない)。
  await safeRevoke(reservationId);

  // カレンダー削除
  if (reservation.googleEventId) {
    const calendarId =
      reservation.store.googleCalendarId ?? config.google.calendarId;
    if (calendarId) {
      try {
        await getServices().calendar.deleteEvent(
          calendarId,
          reservation.googleEventId,
        );
      } catch (e) {
        logger.error("cancelReservation: calendar delete failed", {
          reservationId,
          error: String(e),
        });
      }
    }
  }

  // 未実行タスクを cancelled
  await cancelPendingTasks(reservationId);

  // 決済済なら返金ポリシー(status のみ。実返金APIは任意/未実装)。
  if (reservation.paymentStatus === PaymentStatus.Paid) {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { paymentStatus: PaymentStatus.Refunded },
    });
    await prisma.payment.updateMany({
      where: { reservationId },
      data: { status: "refunded" },
    });
  }

  return { id: reservationId, status: ReservationStatus.Cancelled };
}

/** revokePasscode を呼ぶが、key_id 未達(Error)はキャンセル/expire をブロックしないよう握りつぶす。 */
async function safeRevoke(reservationId: number): Promise<void> {
  try {
    await revokePasscode(reservationId);
  } catch (e) {
    logger.warn("safeRevoke: revoke incomplete, not blocking cancel", {
      reservationId,
      error: String(e),
    });
  }
}

/** 未実行(scheduled)タスクを cancelled にする。 */
async function cancelPendingTasks(reservationId: number): Promise<void> {
  await prisma.scheduledTask.updateMany({
    where: { reservationId, status: TaskStatus.Scheduled },
    data: { status: TaskStatus.Cancelled },
  });
}
