// TC-003 / TC-004 / TC-005 予約作成 (design-docs/31)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createReservation } from "@/server/usecases/reservation";
import { setServicesForTest } from "@/server/services/registry";
import { config } from "@/server/lib/config";
import { prisma } from "@/server/lib/prisma";
import { DomainError } from "@/server/usecases/errors";
import {
  createStoreFixture,
  createCustomer,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

// 十分未来の確定可能な枠 (営業10-18, 枠60)。startAt は ISO8601(+09:00)。
const DATE = "2030-07-01";
const START_ISO = `${DATE}T10:00:00+09:00`;

describe("createReservation (TC-003/004/005)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;
  let savedPaymentsEnabled: boolean;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
    savedPaymentsEnabled = config.ops.paymentsEnabled;
    // 決済 OFF を強制 (TC-003 前提 / .env.test は true だが本TCは決済なし)
    (config.ops as { paymentsEnabled: boolean }).paymentsEnabled = false;
  });

  afterEach(() => {
    (config.ops as { paymentsEnabled: boolean }).paymentsEnabled =
      savedPaymentsEnabled;
  });

  async function setup() {
    const fx = await createStoreFixture({
      openTime: "10:00",
      closeTime: "18:00",
      slotMinutes: 60,
      durationMinutes: 60,
      // calendar ミラーを起こすため calendarId を設定
      googleCalendarId: "cal-test",
    });
    const customer = await createCustomer();
    return { fx, customer };
  }

  it("TC-003: 決済OFF 正常 → confirmed, scheduled_tasks 3件", async () => {
    const { fx, customer } = await setup();

    const result = await createReservation({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: START_ISO,
      agreeTerms: true,
    });

    expect(result.status).toBe("confirmed");
    expect(result.needsPayment).toBe(false);

    const tasks = await prisma.scheduledTask.findMany({
      where: { reservationId: result.id },
    });
    expect(tasks).toHaveLength(3);
    const types = tasks.map((t) => t.type).sort();
    expect(types).toEqual(
      ["revoke_passcode", "send_reminder", "send_thanks"].sort(),
    );
  });

  it("TC-004: 同一枠に2回 createReservation → 2回目 slot_full", async () => {
    const { fx, customer } = await setup();

    const first = await createReservation({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: START_ISO,
      agreeTerms: true,
    });
    expect(first.status).toBe("confirmed");

    await expect(
      createReservation({
        customerId: customer.id,
        storeId: fx.storeId,
        boothId: fx.boothId,
        menuId: fx.menuId,
        startAt: START_ISO,
        agreeTerms: true,
      }),
    ).rejects.toMatchObject({ code: "slot_full" });
  });

  it("TC-004b: 開始時刻が異なる時間帯重複も slot_full (枠長>slot)", async () => {
    // 枠30分・所要60分 → 10:00予約(10:00-11:00)と10:30開始(10:30-11:30)は
    // start_at が異なり UNIQUE では検知不能。範囲重複チェックで slot_full になること。
    const fx = await createStoreFixture({
      openTime: "10:00",
      closeTime: "18:00",
      slotMinutes: 30,
      durationMinutes: 60,
    });
    const customer = await createCustomer();

    const first = await createReservation({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: `${DATE}T10:00:00+09:00`,
      agreeTerms: true,
    });
    expect(first.status).toBe("confirmed");

    await expect(
      createReservation({
        customerId: customer.id,
        storeId: fx.storeId,
        boothId: fx.boothId,
        menuId: fx.menuId,
        startAt: `${DATE}T10:30:00+09:00`, // 枠境界一致だが時間帯が重なる
        agreeTerms: true,
      }),
    ).rejects.toMatchObject({ code: "slot_full" });

    // 重複は1件のみ確定
    const count = await prisma.reservation.count({
      where: { boothId: fx.boothId, status: "confirmed" },
    });
    expect(count).toBe(1);
  });

  it("TC-005: createKey が type/name/epoch で呼ばれる", async () => {
    const { fx, customer } = await setup();

    const result = await createReservation({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: START_ISO,
      agreeTerms: true,
    });

    expect(mocks.switchbot.createKey).toHaveBeenCalledTimes(1);
    const arg = mocks.switchbot.createKey.mock.calls[0][0];
    expect(arg.name).toBe(`r${result.id}`);

    // valid_from = start - 10m, valid_to = end + 15m (epoch 秒)
    const start = jstToUtc(DATE, "10:00").getTime();
    const end = jstToUtc(DATE, "11:00").getTime();
    const expectedStartEpoch = Math.floor((start - 10 * 60_000) / 1000);
    const expectedEndEpoch = Math.floor((end + 15 * 60_000) / 1000);
    expect(arg.startEpoch).toBe(expectedStartEpoch);
    expect(arg.endEpoch).toBe(expectedEndEpoch);

    // passcode 行に timeLimit が記録される
    const passcode = await prisma.passcode.findUnique({
      where: { reservationId: result.id },
    });
    expect(passcode?.type).toBe("timeLimit");
  });

  it("DomainError 型が rejects に乗る (回帰)", async () => {
    const { fx, customer } = await setup();
    await expect(
      createReservation({
        customerId: customer.id,
        storeId: fx.storeId,
        boothId: fx.boothId,
        menuId: fx.menuId,
        startAt: START_ISO,
        agreeTerms: false, // 規約未同意
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
