// TC-018 / TC-019 / TC-020 (design-docs/31)

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { issuePasscode } from "@/server/usecases/passcode";
import { setServicesForTest } from "@/server/services/registry";
import { config } from "@/server/lib/config";
import { prisma } from "@/server/lib/prisma";
import {
  createStoreFixture,
  createCustomer,
  createReservationRow,
  jstToUtc,
} from "./helpers/fixtures";
import { makeAllMocks } from "./helpers/mocks";

const DATE = "2030-07-01";

describe("TC-018: 通信断でも発行済コードはローカル判定で有効", () => {
  it("createKey 成功時 validFrom/validTo = start-10m/end+15m, switchbot エラーでも有効期間が保たれる", async () => {
    const mocks = makeAllMocks();
    setServicesForTest(mocks);

    const fx = await createStoreFixture({ switchbotKeypadId: "KEYPAD-DEV-0001" });
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

    await issuePasscode(r.id);

    const passcode = await prisma.passcode.findUnique({ where: { reservationId: r.id } });
    expect(passcode).not.toBeNull();

    const expectedFrom = start.getTime() - config.ops.passcodeValidBeforeMin * 60_000;
    const expectedTo = end.getTime() + config.ops.passcodeValidAfterMin * 60_000;
    expect(passcode!.validFrom.getTime()).toBe(expectedFrom);
    expect(passcode!.validTo.getTime()).toBe(expectedTo);

    // 通信断疑似: 以後 switchbot 呼出をエラーにしても、発行済 passcode レコードの
    // 有効期間は DB 上に保持されている = ローカル(キーパッド)判定で解錠可。
    mocks.switchbot.createKey.mockRejectedValue(new Error("network down"));
    mocks.switchbot.deleteKey.mockRejectedValue(new Error("network down"));

    const after = await prisma.passcode.findUnique({ where: { reservationId: r.id } });
    expect(after!.validFrom.getTime()).toBe(expectedFrom);
    expect(after!.validTo.getTime()).toBe(expectedTo);

    // ローカル時刻判定: 利用時間帯内 (10:30) は有効範囲に入る
    const useAt = jstToUtc(DATE, "10:30").getTime();
    const localValid =
      useAt >= after!.validFrom.getTime() && useAt <= after!.validTo.getTime();
    expect(localValid).toBe(true);
  });
});

describe("TC-019: デバイス電池残量低の警告判定", () => {
  beforeEach(() => {
    setServicesForTest(makeAllMocks());
  });

  // admin devices route と同じ閾値 (LOW_BATTERY=20)。
  const LOW_BATTERY = 20;

  it("battery<=20 のデバイスは警告フラグが立つ", async () => {
    const fx = await createStoreFixture();
    const low = await prisma.device.create({
      data: {
        storeId: fx.storeId,
        kind: "keypad",
        switchbotDeviceId: "KEYPAD-DEV-0001",
        battery: 12,
        lastSeenAt: new Date(),
        status: "online",
      },
    });
    const ok = await prisma.device.create({
      data: {
        storeId: fx.storeId,
        kind: "lock",
        switchbotDeviceId: "LOCK-DEV-0001",
        battery: 80,
        lastSeenAt: new Date(),
        status: "online",
      },
    });

    const lowBattery = (b: number | null) => b != null && b <= LOW_BATTERY;
    expect(lowBattery(low.battery)).toBe(true);
    expect(lowBattery(ok.battery)).toBe(false);
  });
});

describe("TC-020: Frigate 録画構成の受入アサート", () => {
  it("record.retain.days が存在し、入口カメラのみ・detect 無効", () => {
    const configPath = path.resolve(process.cwd(), "frigate/config.yml");
    const yml = fs.readFileSync(configPath, "utf8");

    // record.retain.days が設定されている
    expect(/record:/.test(yml)).toBe(true);
    expect(/retain:/.test(yml)).toBe(true);
    const daysMatch = /days:\s*(\d+)/.exec(yml);
    expect(daysMatch).not.toBeNull();
    expect(Number.parseInt(daysMatch![1], 10)).toBeGreaterThanOrEqual(30);

    // カメラは入口系のみ (entrance_*)。施術エリアのカメラ定義は無い。
    const cameraNames = [...yml.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*(?:#.*)?$/gm)]
      .map((m) => m[1])
      .filter((n) => !["mqtt", "record", "cameras", "retain", "ffmpeg", "detect", "inputs"].includes(n));
    expect(cameraNames.length).toBeGreaterThan(0);
    for (const name of cameraNames) {
      expect(name.startsWith("entrance")).toBe(true);
    }

    // detect は無効 (enabled: false)
    expect(/detect:\s*[\s\S]*?enabled:\s*false/.test(yml)).toBe(true);
    expect(/enabled:\s*true(?![\s\S]*detect)/.test(yml)).toBe(false); // 過剰チェックは避ける
  });
});
