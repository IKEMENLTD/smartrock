// TC-013 / TC-014 Webhook 冪等・署名検証 (design-docs/31)

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { POST as switchbotPOST } from "@/app/api/webhooks/switchbot/route";
import { POST as linePOST } from "@/app/api/webhooks/line/route";
import { NextRequest } from "next/server";
import { setServicesForTest } from "@/server/services/registry";
import { config } from "@/server/lib/config";
import { verifyLineSignature } from "@/server/lib/hmac";
import { prisma } from "@/server/lib/prisma";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

const DATE = "2030-07-01";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("webhooks (TC-013/014)", () => {
  let mocks: ReturnType<typeof makeAllMocks>;

  beforeEach(() => {
    mocks = makeAllMocks();
    setServicesForTest(mocks);
  });

  it("TC-013: switchbot 同一event_id 2回 → 2回目早期return, access_logs は1件のまま", async () => {
    const fx = await createStoreFixture({
      switchbotLockId: "LOCK-DEV-0001",
      switchbotKeypadId: "KEYPAD-DEV-0001",
    });
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

    // changeReport 相当 (keyId を含まない → recordAccess)。許可 deviceId。
    const ts = jstToUtc(DATE, "10:30").getTime();
    const body = {
      eventType: "changeReport",
      context: {
        deviceMac: "LOCK-DEV-0001",
        lockState: "UNLOCKED",
        timeOfSample: ts,
        timeStamp: ts,
      },
    };

    const res1 = await switchbotPOST(jsonRequest("http://localhost/api/webhooks/switchbot", body));
    expect(res1.status).toBe(200);
    const res2 = await switchbotPOST(jsonRequest("http://localhost/api/webhooks/switchbot", body));
    const json2 = await res2.json();
    expect(json2.duplicate).toBe(true);

    const logs = await prisma.accessLog.findMany({ where: { storeId: fx.storeId } });
    expect(logs).toHaveLength(1);

    const events = await prisma.webhookEvent.findMany({ where: { provider: "switchbot" } });
    expect(events).toHaveLength(1);
  });

  it("TC-014: LINE 不正署名 → 400 で破棄, 副作用なし", async () => {
    // verifySignature を false に
    mocks.line.verifySignature.mockReturnValue(false);

    const body = {
      events: [
        {
          type: "follow",
          webhookEventId: "evt-1",
          source: { userId: "U-evil" },
        },
      ],
    };
    const res = await linePOST(
      jsonRequest("http://localhost/api/webhooks/line", body, {
        "x-line-signature": "INVALID",
      }),
    );
    expect(res.status).toBe(400);

    // handleEvent が呼ばれていない (customer 未作成 / push 未呼出)
    expect(mocks.line.push).not.toHaveBeenCalled();
    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(0);
    const events = await prisma.webhookEvent.findMany({ where: { provider: "line" } });
    expect(events).toHaveLength(0);
  });

  it("TC-014(正常系): 正しい署名 → 200 で処理 (follow で顧客作成)", async () => {
    // mock verifySignature を実 HMAC 検証に差し替え
    mocks.line.verifySignature.mockImplementation((raw: string, sig: string | null) =>
      verifyLineSignature(raw, sig, config.line.channelSecret),
    );

    const body = {
      events: [
        {
          type: "follow",
          webhookEventId: "evt-ok-1",
          source: { userId: "U-good" },
        },
      ],
    };
    const raw = JSON.stringify(body);
    const sig = crypto
      .createHmac("sha256", config.line.channelSecret)
      .update(raw, "utf8")
      .digest("base64");

    const req = new NextRequest("http://localhost/api/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": sig },
      body: raw,
    });
    const res = await linePOST(req);
    expect(res.status).toBe(200);

    const customer = await prisma.customer.findUnique({
      where: { lineUserId: "U-good" },
    });
    expect(customer).not.toBeNull();
    expect(mocks.line.push).toHaveBeenCalled();
  });
});
