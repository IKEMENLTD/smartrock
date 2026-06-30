// TC-012 施解錠ログ記録 (design-docs/31)

import { describe, it, expect, beforeEach } from "vitest";
import { recordAccess } from "@/server/usecases/accessLog";
import { setServicesForTest } from "@/server/services/registry";
import { prisma } from "@/server/lib/prisma";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

const DATE = "2030-07-01";

describe("recordAccess (TC-012)", () => {
  beforeEach(() => {
    setServicesForTest(makeAllMocks());
  });

  it("changeReport(unlocked) → access_logs 追記, 時間帯一致で reservation 紐付け", async () => {
    const fx = await createStoreFixture({
      switchbotLockId: "LOCK-DEV-0001",
      switchbotKeypadId: "KEYPAD-DEV-0001",
    });
    const customer = await createCustomer();
    const start = jstToUtc(DATE, "10:00");
    const end = jstToUtc(DATE, "11:00");
    const r = await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: start,
      endAt: end,
      status: "confirmed",
    });

    // 予約時間帯内 (10:30) の解錠イベント
    const occurredAtMs = jstToUtc(DATE, "10:30").getTime();
    const payload = {
      eventType: "changeReport",
      context: {
        deviceMac: "LOCK-DEV-0001",
        lockState: "UNLOCKED",
        timeOfSample: occurredAtMs,
      },
    };

    await recordAccess(payload);

    const logs = await prisma.accessLog.findMany({ where: { storeId: fx.storeId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].deviceId).toBe("LOCK-DEV-0001");
    expect(logs[0].reservationId).toBe(r.id);
  });

  it("予約時間帯外のイベントは reservation 紐付けなし", async () => {
    const fx = await createStoreFixture({ switchbotLockId: "LOCK-DEV-0001" });
    const customer = await createCustomer();
    await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: jstToUtc(DATE, "10:00"),
      endAt: jstToUtc(DATE, "11:00"),
      status: "confirmed",
    });

    const payload = {
      context: {
        deviceMac: "LOCK-DEV-0001",
        lockState: "UNLOCKED",
        timeOfSample: jstToUtc(DATE, "15:00").getTime(),
      },
    };
    await recordAccess(payload);

    const logs = await prisma.accessLog.findMany({ where: { storeId: fx.storeId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].reservationId).toBeNull();
  });
});
