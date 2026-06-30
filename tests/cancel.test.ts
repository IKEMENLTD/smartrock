// TC-010 / TC-011 キャンセル (design-docs/31)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cancelReservation } from "@/server/usecases/reservation";
import { setServicesForTest } from "@/server/services/registry";
import { prisma } from "@/server/lib/prisma";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

// 固定の現在時刻 (JST 2026-07-01 00:00)
const NOW = new Date("2026-07-01T00:00:00+09:00");

describe("cancelReservation (TC-010/011)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setupReservation(startOffsetHours: number) {
    const fx = await createStoreFixture({ googleCalendarId: "cal-test" });
    const customer = await createCustomer();
    const startAt = new Date(NOW.getTime() + startOffsetHours * 3600_000);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);
    const r = await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt,
      endAt,
      status: "confirmed",
      googleEventId: "gcal-event-0001",
    });
    // active passcode (key_id 付き) + 未実行タスク
    await prisma.passcode.create({
      data: {
        reservationId: r.id,
        switchbotDeviceId: "KEYPAD-DEV-0001",
        switchbotKeyId: 777,
        passcodeName: `r${r.id}`,
        codeHash: "x".repeat(64),
        type: "timeLimit",
        validFrom: startAt,
        validTo: endAt,
        status: "active",
      },
    });
    await prisma.scheduledTask.create({
      data: {
        type: "send_thanks",
        reservationId: r.id,
        runAt: new Date(endAt.getTime() + 5 * 60_000),
        status: "scheduled",
      },
    });
    return { fx, customer, reservationId: r.id };
  }

  it("TC-010: 開始30h前 → cancelled, deleteKey, calendar.deleteEvent, tasks cancelled", async () => {
    const { customer, reservationId } = await setupReservation(30);

    const result = await cancelReservation({
      reservationId,
      actor: "customer",
      customerId: customer.id,
    });

    expect(result.status).toBe("cancelled");
    expect(mocks.switchbot.deleteKey).toHaveBeenCalledWith("KEYPAD-DEV-0001", 777);
    expect(mocks.calendar.deleteEvent).toHaveBeenCalledWith(
      "cal-test",
      "gcal-event-0001",
    );

    const passcode = await prisma.passcode.findUnique({ where: { reservationId } });
    expect(passcode?.status).toBe("deleted");

    const tasks = await prisma.scheduledTask.findMany({ where: { reservationId } });
    expect(tasks.every((t) => t.status === "cancelled")).toBe(true);
  });

  it("TC-011: 開始2h前(期限24h) → cancel_deadline", async () => {
    const { customer, reservationId } = await setupReservation(2);

    await expect(
      cancelReservation({
        reservationId,
        actor: "customer",
        customerId: customer.id,
      }),
    ).rejects.toMatchObject({ code: "cancel_deadline" });

    // 副作用なし (deleteKey 未呼出, status 維持)
    expect(mocks.switchbot.deleteKey).not.toHaveBeenCalled();
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(reservation?.status).toBe("confirmed");
  });
});
