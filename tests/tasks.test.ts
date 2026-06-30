// TC-008 / TC-009 / TC-017 スケジューラ処理 (design-docs/31, 25)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processDueTasks } from "@/server/scheduler/handlers";
import { setServicesForTest } from "@/server/services/registry";
import { config } from "@/server/lib/config";
import { prisma } from "@/server/lib/prisma";
import { issuePasscode, onCreateKeyResult } from "@/server/usecases/passcode";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

const DATE = "2030-07-01";

describe("scheduler processDueTasks (TC-008/009/017)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
  });

  async function setupActivePasscode(keyId: number | null) {
    const fx = await createStoreFixture();
    const customer = await createCustomer();
    const r = await createReservationRow({
      customerId: customer.id,
      storeId: fx.storeId,
      boothId: fx.boothId,
      menuId: fx.menuId,
      startAt: jstToUtc(DATE, "10:00"),
      endAt: jstToUtc(DATE, "11:00"),
      status: "confirmed",
    });
    await issuePasscode(r.id);
    if (keyId != null) {
      await onCreateKeyResult({ context: { name: `r${r.id}`, keyId } });
    } else {
      // key_id 未達のまま active 化 (id NULL を再現)
      await prisma.passcode.update({
        where: { reservationId: r.id },
        data: { status: "active", switchbotKeyId: null },
      });
    }
    return { fx, reservationId: r.id };
  }

  it("TC-008: revoke タスク(run_at過去, key_idあり) → deleteKey, passcode deleted, task done", async () => {
    const { reservationId } = await setupActivePasscode(555);

    const task = await prisma.scheduledTask.create({
      data: {
        type: "revoke_passcode",
        reservationId,
        runAt: new Date(Date.now() - 60_000),
        status: "scheduled",
      },
    });

    const { processed } = await processDueTasks(new Date());
    expect(processed).toBe(1);

    expect(mocks.switchbot.deleteKey).toHaveBeenCalledWith("KEYPAD-DEV-0001", 555);

    const passcode = await prisma.passcode.findUnique({ where: { reservationId } });
    expect(passcode?.status).toBe("deleted");

    const updated = await prisma.scheduledTask.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe("done");
  });

  it("TC-009: key_id NULL → deleteKey 呼ばれず, 無限ループせず最終 failed", async () => {
    const { reservationId } = await setupActivePasscode(null);

    await prisma.scheduledTask.create({
      data: {
        type: "revoke_passcode",
        reservationId,
        runAt: new Date(Date.now() - 60_000),
        status: "scheduled",
      },
    });

    // 1回の processDueTasks 内でリトライ消費し最終 failed になる (再 scheduled を拾い続ける)。
    const { processed } = await processDueTasks(new Date());

    expect(mocks.switchbot.deleteKey).not.toHaveBeenCalled();

    const task = await prisma.scheduledTask.findFirst({
      where: { reservationId, type: "revoke_passcode" },
    });
    expect(task?.status).toBe("failed");
    expect(task?.attempts).toBe(config.ops.maxTaskAttempts);
    // 試行回数 = maxTaskAttempts と一致 (= processed と一致)。無限ループしていない。
    expect(processed).toBe(config.ops.maxTaskAttempts);

    // 念のため再実行しても failed のまま attempts 増えない (拾わない)。
    const again = await processDueTasks(new Date());
    expect(again.processed).toBe(0);
    const task2 = await prisma.scheduledTask.findFirst({
      where: { reservationId, type: "revoke_passcode" },
    });
    expect(task2?.attempts).toBe(config.ops.maxTaskAttempts);
  });

  describe("TC-017: expire_unpaid", () => {
    let savedPaymentsEnabled: boolean;
    beforeEach(() => {
      savedPaymentsEnabled = config.ops.paymentsEnabled;
      (config.ops as { paymentsEnabled: boolean }).paymentsEnabled = true;
    });
    afterEach(() => {
      (config.ops as { paymentsEnabled: boolean }).paymentsEnabled =
        savedPaymentsEnabled;
    });

    it("pending予約 + expire_unpaid run_at過去 → 予約cancelled, コード削除", async () => {
      const fx = await createStoreFixture();
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
          runAt: new Date(Date.now() - 60_000),
          status: "scheduled",
        },
      });

      const { processed } = await processDueTasks(new Date());
      expect(processed).toBe(1);

      const reservation = await prisma.reservation.findUnique({ where: { id: r.id } });
      expect(reservation?.status).toBe("cancelled");

      const payment = await prisma.payment.findUnique({
        where: { reservationId: r.id },
      });
      expect(payment?.status).toBe("failed");
    });
  });
});
