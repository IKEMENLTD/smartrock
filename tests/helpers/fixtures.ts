// テスト用 fixtures ヘルパ (design-docs/30)
// store/booth/business_hours/menu/customer を最小作成する。
// 各テストは beforeEach の truncate 後に必要な分だけ自前で作る。

import { prisma } from "@/server/lib/prisma";

const JST_OFFSET_MIN = 9 * 60;

/** "YYYY-MM-DD" + "HH:mm"(JST) を UTC の Date に変換 (availability.ts と同じ規約) */
export function jstToUtc(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split("-").map((s) => Number.parseInt(s, 10));
  const [h, mi] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

export interface StoreFixtureOptions {
  name?: string;
  switchbotKeypadId?: string;
  switchbotLockId?: string | null;
  switchbotHubId?: string | null;
  googleCalendarId?: string | null;
  /** 営業時間 (全曜日に適用) */
  openTime?: string;
  closeTime?: string;
  slotMinutes?: number;
  bufferMinutes?: number;
  /** business_hours を作る曜日。省略時は全曜日 (0-6)。 */
  weekdays?: number[];
}

export interface StoreFixture {
  storeId: number;
  boothId: number;
  menuId: number;
}

/**
 * 店舗 + ブース1 + 全曜日の営業時間 + メニュー1 をまとめて作成する。
 * durationMinutes/priceYen はメニュー側オプションで上書き可能。
 */
export async function createStoreFixture(
  opts: StoreFixtureOptions & {
    durationMinutes?: number;
    priceYen?: number;
  } = {},
): Promise<StoreFixture> {
  const store = await prisma.store.create({
    data: {
      name: opts.name ?? "テスト店舗",
      timezone: "Asia/Tokyo",
      switchbotKeypadId: opts.switchbotKeypadId ?? "KEYPAD-DEV-0001",
      switchbotLockId: opts.switchbotLockId ?? "LOCK-DEV-0001",
      switchbotHubId: opts.switchbotHubId ?? null,
      googleCalendarId:
        opts.googleCalendarId === undefined ? null : opts.googleCalendarId,
      boothCount: 1,
    },
  });

  const booth = await prisma.booth.create({
    data: { storeId: store.id, name: "ブース1" },
  });

  const weekdays = opts.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
  for (const weekday of weekdays) {
    await prisma.businessHour.create({
      data: {
        storeId: store.id,
        weekday,
        openTime: opts.openTime ?? "10:00",
        closeTime: opts.closeTime ?? "18:00",
        slotMinutes: opts.slotMinutes ?? 60,
        bufferMinutes: opts.bufferMinutes ?? 15,
      },
    });
  }

  const menu = await prisma.menu.create({
    data: {
      storeId: store.id,
      name: "全身脱毛 (セルフ)",
      durationMinutes: opts.durationMinutes ?? 60,
      priceYen: opts.priceYen ?? 3980,
    },
  });

  return { storeId: store.id, boothId: booth.id, menuId: menu.id };
}

export async function createCustomer(
  lineUserId = "U-test-0001",
  displayName = "テスト太郎",
): Promise<{ id: number; lineUserId: string }> {
  const c = await prisma.customer.create({
    data: { lineUserId, displayName, agreedTermsAt: new Date() },
  });
  return { id: c.id, lineUserId: c.lineUserId };
}

/** 確定予約を直接作成する (createReservation を介さずに状態を組む用)。 */
export async function createReservationRow(params: {
  customerId: number;
  storeId: number;
  boothId: number;
  menuId: number;
  startAt: Date;
  endAt: Date;
  status?: string;
  googleEventId?: string | null;
  amountYen?: number;
  paymentStatus?: string;
}): Promise<{ id: number }> {
  const r = await prisma.reservation.create({
    data: {
      customerId: params.customerId,
      storeId: params.storeId,
      boothId: params.boothId,
      menuId: params.menuId,
      startAt: params.startAt,
      endAt: params.endAt,
      status: params.status ?? "confirmed",
      googleEventId: params.googleEventId ?? null,
      amountYen: params.amountYen ?? 0,
      paymentStatus: params.paymentStatus ?? "none",
    },
    select: { id: true },
  });
  return r;
}
