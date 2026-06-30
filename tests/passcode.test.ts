// TC-006 / TC-007 / TC-015 パスコード発行・id受領・再発行 (design-docs/31)

import { describe, it, expect, beforeEach } from "vitest";
import {
  issuePasscode,
  onCreateKeyResult,
  reissuePasscode,
} from "@/server/usecases/passcode";
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

async function setupReservation() {
  const fx = await createStoreFixture({ switchbotKeypadId: "KEYPAD-DEV-0001" });
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
  return { fx, customer, reservationId: r.id };
}

describe("passcode (TC-006/007/015)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
  });

  it("TC-007: issuePasscode → LINE push 1回, 本文に6桁コード", async () => {
    const { reservationId } = await setupReservation();

    await issuePasscode(reservationId);

    expect(mocks.line.push).toHaveBeenCalledTimes(1);
    const messages = mocks.line.push.mock.calls[0][1] as { text: string }[];
    const text = messages.map((m) => m.text).join("\n");
    expect(text).toMatch(/暗証番号:\s*\d{6}/);

    // createKey は password=6桁
    expect(mocks.switchbot.createKey).toHaveBeenCalledTimes(1);
    const arg = mocks.switchbot.createKey.mock.calls[0][0];
    expect(String(arg.password)).toMatch(/^\d{6}$/);
  });

  it("TC-006: onCreateKeyResult で keyId 保存 + status=active", async () => {
    const { reservationId } = await setupReservation();
    await issuePasscode(reservationId);

    // SwitchBot createKey 結果 webhook 相当の payload
    const payload = {
      eventType: "create",
      context: {
        deviceMac: "KEYPAD-DEV-0001",
        name: `r${reservationId}`,
        keyId: 987654,
      },
    };
    await onCreateKeyResult(payload);

    const passcode = await prisma.passcode.findUnique({
      where: { reservationId },
    });
    expect(passcode?.switchbotKeyId).toBe(987654);
    expect(passcode?.status).toBe("active");
  });

  it("TC-015: reissue → 旧deleteKey → 新createKey → 再通知 (呼出順)", async () => {
    const { reservationId } = await setupReservation();

    // 既存 active パスコード (key_id 付き) を用意
    await issuePasscode(reservationId);
    await onCreateKeyResult({
      context: { name: `r${reservationId}`, keyId: 111 },
    });

    // モックの呼出履歴をリセットして再発行のみ観察
    mocks.switchbot.deleteKey.mockClear();
    mocks.switchbot.createKey.mockClear();
    mocks.line.push.mockClear();

    const order: string[] = [];
    mocks.switchbot.deleteKey.mockImplementation(async () => {
      order.push("deleteKey");
      return { statusCode: 100, message: "success" };
    });
    mocks.switchbot.createKey.mockImplementation(async () => {
      order.push("createKey");
      return { statusCode: 100, message: "success" };
    });
    mocks.line.push.mockImplementation(async () => {
      order.push("push");
      return "msg";
    });

    await reissuePasscode(reservationId);

    expect(mocks.switchbot.deleteKey).toHaveBeenCalledWith("KEYPAD-DEV-0001", 111);
    expect(mocks.switchbot.createKey).toHaveBeenCalledTimes(1);
    expect(mocks.line.push).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["deleteKey", "createKey", "push"]);
  });
});
