// TC-016 Stripe webhook 決済確定 (design-docs/31)

import { describe, it, expect, beforeEach } from "vitest";
import { POST as stripePOST } from "@/app/api/webhooks/stripe/route";
import { NextRequest } from "next/server";
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

describe("stripe webhook (TC-016)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
  });

  it("checkout.session.completed → payment paid, reservation confirmed", async () => {
    const fx = await createStoreFixture({ googleCalendarId: "cal-test" });
    const customer = await createCustomer();
    const r = await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: jstToUtc(DATE, "10:00"),
      endAt: jstToUtc(DATE, "11:00"),
      status: "pending",
      amountYen: 3980,
      paymentStatus: "unpaid",
    });
    await prisma.payment.create({
      data: {
        reservationId: r.id,
        provider: "stripe",
        amountYen: 3980,
        status: "pending",
      },
    });
    await prisma.scheduledTask.create({
      data: {
        type: "expire_unpaid",
        reservationId: r.id,
        runAt: new Date(Date.now() + 15 * 60_000),
        status: "scheduled",
      },
    });

    // 署名検証OK + parse がこの予約を返すようにモック
    mocks.stripe.verifySignature.mockReturnValue(true);
    mocks.stripe.parseCompletedSession.mockReturnValue({
      sessionId: "cs_test_paid_1",
      reservationId: r.id,
    });

    const req = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "sig" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    const res = await stripePOST(req);
    expect(res.status).toBe(200);

    const reservation = await prisma.reservation.findUnique({ where: { id: r.id } });
    expect(reservation?.status).toBe("confirmed");
    expect(reservation?.paymentStatus).toBe("paid");

    const payment = await prisma.payment.findUnique({ where: { reservationId: r.id } });
    expect(payment?.status).toBe("paid");
    expect(payment?.stripeSessionId).toBe("cs_test_paid_1");

    // expire_unpaid タスクは cancelled
    const task = await prisma.scheduledTask.findFirst({
      where: { reservationId: r.id, type: "expire_unpaid" },
    });
    expect(task?.status).toBe("cancelled");

    // 確定処理で createKey が走り 3件タスク登録
    expect(mocks.switchbot.createKey).toHaveBeenCalledTimes(1);
    const finalizeTasks = await prisma.scheduledTask.findMany({
      where: {
        reservationId: r.id,
        type: { in: ["send_reminder", "revoke_passcode", "send_thanks"] },
      },
    });
    expect(finalizeTasks).toHaveLength(3);
  });
});
