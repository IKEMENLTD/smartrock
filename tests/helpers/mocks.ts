// テスト用 Service モックヘルパ (design-docs/30)
// vi.fn() で呼出を記録し、setServicesForTest で差し替える。

import { vi } from "vitest";
import type {
  CalendarService,
  FrigateService,
  LineService,
  StripeService,
  SwitchbotService,
} from "@/server/services/types";

export type MockSwitchbot = {
  [K in keyof SwitchbotService]: ReturnType<typeof vi.fn>;
};
export type MockLine = { [K in keyof LineService]: ReturnType<typeof vi.fn> };
export type MockCalendar = {
  [K in keyof CalendarService]: ReturnType<typeof vi.fn>;
};
export type MockStripe = { [K in keyof StripeService]: ReturnType<typeof vi.fn> };
export type MockFrigate = {
  [K in keyof FrigateService]: ReturnType<typeof vi.fn>;
};

/** createKey は成功 (statusCode 100), deleteKey/controlLock も成功既定。 */
export function makeMockSwitchbot(
  overrides: Partial<MockSwitchbot> = {},
): MockSwitchbot {
  return {
    createKey: vi.fn(async () => ({ statusCode: 100, message: "success" })),
    deleteKey: vi.fn(async () => ({ statusCode: 100, message: "success" })),
    controlLock: vi.fn(async () => ({ statusCode: 100, message: "success" })),
    getDevices: vi.fn(async () => []),
    ...overrides,
  };
}

/** push は messageId を返す。verifySignature 既定 true。 */
export function makeMockLine(overrides: Partial<MockLine> = {}): MockLine {
  return {
    push: vi.fn(async () => "msg-id-0001"),
    verifySignature: vi.fn(() => true),
    verifyIdToken: vi.fn(async () => ({ userId: "U-test-0001" })),
    getProfile: vi.fn(async () => ({ userId: "U-test-0001", displayName: "テスト太郎" })),
    ...overrides,
  };
}

/** getBusy は既定で空 (busy なし)。insertEvent は event id を返す。 */
export function makeMockCalendar(
  overrides: Partial<MockCalendar> = {},
): MockCalendar {
  return {
    insertEvent: vi.fn(async () => "gcal-event-0001"),
    deleteEvent: vi.fn(async () => undefined),
    getBusy: vi.fn(async () => []),
    ...overrides,
  };
}

export function makeMockStripe(overrides: Partial<MockStripe> = {}): MockStripe {
  return {
    createCheckout: vi.fn(async () => ({
      url: "https://stripe.test/checkout",
      sessionId: "cs_test_0001",
    })),
    verifySignature: vi.fn(() => true),
    parseCompletedSession: vi.fn(() => null),
    ...overrides,
  };
}

export function makeMockFrigate(
  overrides: Partial<MockFrigate> = {},
): MockFrigate {
  return {
    getStatus: vi.fn(async () => []),
    ...overrides,
  };
}

/** よく使う全モックをまとめて生成する。 */
export function makeAllMocks() {
  return {
    switchbot: makeMockSwitchbot(),
    line: makeMockLine(),
    calendar: makeMockCalendar(),
    stripe: makeMockStripe(),
    frigate: makeMockFrigate(),
  };
}
