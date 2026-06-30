// F-007 施解錠ログ記録 (design-docs/12, 23 / TC-012)
// changeReport webhook を access_logs へ。occurred_at が予約時間帯なら reservation_id を推定紐付け。

import { prisma } from "@/server/lib/prisma";
import { logger } from "@/server/lib/logger";
import { ReservationStatus } from "@/types/domain";

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

function toDate(value: unknown): Date {
  if (typeof value === "number") {
    // SwitchBot は epoch ミリ秒で送ることが多い。秒なら *1000。
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * F-007: changeReport から deviceId/eventType/occurredAt を抽出し access_logs へ INSERT。
 * store は deviceId(lock/keypad id) で特定。見つからなければ単一店舗前提で先頭店舗。
 * occurredAt が予約の [startAt, endAt] 範囲なら reservation_id を推定紐付け。
 */
export async function recordAccess(changeReport: unknown): Promise<void> {
  const rawDeviceId = deepFind(changeReport, ["deviceMac", "deviceId", "device_id"]);
  const rawEventType = deepFind(changeReport, [
    "eventType",
    "lockState",
    "event_type",
    "detectionState",
    "doorState",
  ]);
  const rawOccurredAt = deepFind(changeReport, [
    "timeOfSample",
    "occurredAt",
    "occurred_at",
    "ts",
    "time",
  ]);

  const deviceId = typeof rawDeviceId === "string" ? rawDeviceId : "unknown";
  const eventType = typeof rawEventType === "string" ? rawEventType : "unknown";
  const occurredAt = toDate(rawOccurredAt);

  // deviceId からの店舗特定 (lock / keypad / device 一致)
  let storeId: number | null = null;
  if (deviceId !== "unknown") {
    const store = await prisma.store.findFirst({
      where: {
        OR: [
          { switchbotLockId: deviceId },
          { switchbotKeypadId: deviceId },
          { switchbotHubId: deviceId },
        ],
      },
      select: { id: true },
    });
    storeId = store?.id ?? null;
    if (storeId == null) {
      const device = await prisma.device.findFirst({
        where: { switchbotDeviceId: deviceId },
        select: { storeId: true },
      });
      storeId = device?.storeId ?? null;
    }
  }
  if (storeId == null) {
    // 単一店舗前提のフォールバック
    const first = await prisma.store.findFirst({ select: { id: true } });
    if (!first) {
      logger.warn("recordAccess: no store found, drop event", { deviceId });
      return;
    }
    storeId = first.id;
  }

  // 時間帯から予約を推定紐付け(cancelled は除外)
  const reservation = await prisma.reservation.findFirst({
    where: {
      storeId,
      startAt: { lte: occurredAt },
      endAt: { gte: occurredAt },
      status: { not: ReservationStatus.Cancelled },
    },
    orderBy: { startAt: "desc" },
    select: { id: true },
  });

  await prisma.accessLog.create({
    data: {
      storeId,
      reservationId: reservation?.id ?? null,
      deviceId,
      eventType,
      occurredAt,
      rawJson: (changeReport ?? {}) as object,
    },
  });

  logger.info("recordAccess: logged", {
    storeId,
    deviceId,
    eventType,
    reservationId: reservation?.id ?? null,
  });
}
