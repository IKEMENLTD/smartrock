// F-001 空き枠算出 (design-docs/12, 21, 23 / TC-001, TC-002)
// business_hours を枠展開し、確定予約(booth占有) と Google カレンダー busy を除外する。

import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";
import { ReservationStatus, type Slot } from "@/types/domain";
import type { BusyInterval } from "@/server/services/types";

// 店舗のタイムゾーン (Asia/Tokyo) を前提に、+09:00 固定で日付/時刻を組み立てる。
// TIMESTAMPTZ なので Date(UTC) を内部で保持し、表示は +09:00 で行う。
const JST_OFFSET_MIN = 9 * 60;

/** "YYYY-MM-DD" + "HH:mm"(JST) を UTC の Date に変換 */
function jstDateTimeToUtc(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split("-").map((s) => Number.parseInt(s, 10));
  const [h, mi] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  // JST の壁時計を UTC エポックへ: UTC = JST - 9h
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

/** UTC Date を "YYYY-MM-DDTHH:mm:ss+09:00" (JST) 文字列へ */
function toJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = jst.getUTCFullYear();
  const mo = pad(jst.getUTCMonth() + 1);
  const d = pad(jst.getUTCDate());
  const h = pad(jst.getUTCHours());
  const mi = pad(jst.getUTCMinutes());
  const s = pad(jst.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

/** UTC Date の JST 上の weekday (0=日..6=土) と "YYYY-MM-DD" */
function jstDayInfo(date: Date): { weekday: number; dateStr: string } {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
  return { weekday: jst.getUTCDay(), dateStr };
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function getAvailability(params: {
  storeId: number;
  menuId: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (inclusive)
}): Promise<Slot[]> {
  const { storeId, menuId, from, to } = params;

  const [store, menu, businessHours, booths] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.menu.findUnique({ where: { id: menuId } }),
    prisma.businessHour.findMany({ where: { storeId } }),
    prisma.booth.findMany({ where: { storeId } }),
  ]);

  if (!store) return [];
  if (!menu) return [];
  if (booths.length === 0 || businessHours.length === 0) return [];

  const duration = menu.durationMinutes;

  // 探索範囲 (JST の from 00:00 〜 to 翌日 00:00) を UTC で確定
  const rangeStart = jstDateTimeToUtc(from, "00:00");
  const rangeEnd = jstDateTimeToUtc(to, "24:00"); // to の終端 = 翌日0時

  // 既存の有効予約 (cancelled 以外は占有とみなす)
  const reservations = await prisma.reservation.findMany({
    where: {
      storeId,
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
      status: { not: ReservationStatus.Cancelled },
    },
    select: { boothId: true, startAt: true, endAt: true },
  });

  // Google カレンダー busy (手動ブロック含む。calendarId が無ければスキップ)
  let busy: BusyInterval[] = [];
  const calendarId = store.googleCalendarId ?? config.google.calendarId;
  if (calendarId) {
    try {
      busy = await getServices().calendar.getBusy(calendarId, rangeStart, rangeEnd);
    } catch (e) {
      // busy 取得失敗時は安全側 (枠を出さない) ではなく可用性優先で空配列扱い。
      logger.warn("getAvailability: getBusy failed, ignoring busy", {
        storeId,
        error: String(e),
      });
      busy = [];
    }
  }

  const byWeekday = new Map<number, (typeof businessHours)[number]>();
  for (const bh of businessHours) byWeekday.set(bh.weekday, bh);

  const slots: Slot[] = [];

  // from..to の各日を JST 基準で走査
  for (let cursor = rangeStart.getTime(); cursor < rangeEnd.getTime(); ) {
    const dayDate = new Date(cursor);
    const { weekday, dateStr } = jstDayInfo(dayDate);
    const bh = byWeekday.get(weekday);
    // 次の日へ進めるための翌日0時 (JST)
    const nextDayStart = jstDateTimeToUtc(dateStr, "24:00").getTime();

    if (bh) {
      const open = jstDateTimeToUtc(dateStr, bh.openTime);
      const close = jstDateTimeToUtc(dateStr, bh.closeTime);
      const stepMs = bh.slotMinutes * 60_000;
      const durationMs = duration * 60_000;

      for (
        let slotStart = open.getTime();
        slotStart + durationMs <= close.getTime();
        slotStart += stepMs
      ) {
        const sStart = new Date(slotStart);
        const sEnd = new Date(slotStart + durationMs);

        // 過去枠は出さない
        if (sStart.getTime() <= Date.now()) continue;

        for (const booth of booths) {
          const reserved = reservations.some(
            (r) =>
              r.boothId === booth.id &&
              overlaps(sStart, sEnd, r.startAt, r.endAt),
          );
          if (reserved) continue;

          const blocked = busy.some((b) =>
            overlaps(sStart, sEnd, b.start, b.end),
          );
          if (blocked) continue;

          slots.push({
            boothId: booth.id,
            startAt: toJstIso(sStart),
            endAt: toJstIso(sEnd),
          });
        }
      }
    }

    cursor = nextDayStart;
  }

  // 時刻→boothId 昇順で安定ソート
  slots.sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) || a.boothId - b.boothId,
  );

  return slots;
}
