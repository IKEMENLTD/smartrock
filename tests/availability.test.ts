// TC-001 / TC-002 / TC-002b 空き枠算出 (design-docs/31)

import { describe, it, expect, beforeEach } from "vitest";
import { getAvailability } from "@/server/usecases/availability";
import { GET } from "@/app/api/availability/route";
import { NextRequest } from "next/server";
import { setServicesForTest } from "@/server/services/registry";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

// 過去枠は除外されるため、十分未来の日付を使う。
const DATE = "2030-07-01"; // weekday は固定値ではないが全曜日に営業時間を入れる

describe("availability (TC-001/002/002b)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
  });

  it("TC-001: 既存予約10時の枠が除外され他枠は出る", async () => {
    // 営業10-18, 枠60, calendarId 設定 (busy は空モック)
    const fx = await createStoreFixture({
      openTime: "10:00",
      closeTime: "18:00",
      slotMinutes: 60,
      googleCalendarId: "cal-test",
    });
    const customer = await createCustomer();

    // 10:00-11:00 の既存予約
    await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: jstToUtc(DATE, "10:00"),
      endAt: jstToUtc(DATE, "11:00"),
      status: "confirmed",
    });

    const slots = await getAvailability({
      storeId: fx.storeId,
      menuId: fx.menuId,
      from: DATE,
      to: DATE,
    });

    const starts = slots.map((s) => s.startAt);
    // 10時枠は除外
    expect(starts).not.toContain(`${DATE}T10:00:00+09:00`);
    // 他枠 (11時, 12時 ... 17時) は出る
    expect(starts).toContain(`${DATE}T11:00:00+09:00`);
    expect(starts).toContain(`${DATE}T17:00:00+09:00`);
    // 18時開始は終了が19時で営業外なので出ない
    expect(starts).not.toContain(`${DATE}T18:00:00+09:00`);
  });

  it("TC-002: calendar busy 13時 → 13時枠が出ない", async () => {
    const fx = await createStoreFixture({
      openTime: "10:00",
      closeTime: "18:00",
      slotMinutes: 60,
      googleCalendarId: "cal-test",
    });

    mocks.calendar.getBusy.mockResolvedValue([
      { start: jstToUtc(DATE, "13:00"), end: jstToUtc(DATE, "14:00") },
    ]);

    const slots = await getAvailability({
      storeId: fx.storeId,
      menuId: fx.menuId,
      from: DATE,
      to: DATE,
    });

    const starts = slots.map((s) => s.startAt);
    expect(mocks.calendar.getBusy).toHaveBeenCalledTimes(1);
    expect(starts).not.toContain(`${DATE}T13:00:00+09:00`);
    expect(starts).toContain(`${DATE}T12:00:00+09:00`);
    expect(starts).toContain(`${DATE}T14:00:00+09:00`);
  });

  it("TC-002b: availability route で from 未指定 → 400", async () => {
    const fx = await createStoreFixture({ googleCalendarId: "cal-test" });
    const url =
      `http://localhost/api/availability?storeId=${fx.storeId}` +
      `&menuId=${fx.menuId}&to=${DATE}`; // from を欠落
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(400);
  });
});
