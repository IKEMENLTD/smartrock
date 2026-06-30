// ドメイン共通の型・定数 (design-docs/22, 25)
// Prisma 側は String 列だが、アプリ層ではユニオン型で安全に扱う。

export const ReservationStatus = {
  Pending: "pending",
  Confirmed: "confirmed",
  Cancelled: "cancelled",
  Done: "done",
  NoShow: "no_show",
} as const;
export type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const PaymentStatus = {
  None: "none",
  Unpaid: "unpaid",
  Paid: "paid",
  Refunded: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PasscodeStatus = {
  Pending: "pending",
  Active: "active",
  Deleted: "deleted",
  Failed: "failed",
} as const;
export type PasscodeStatus =
  (typeof PasscodeStatus)[keyof typeof PasscodeStatus];

export const TaskType = {
  IssuePasscode: "issue_passcode",
  RevokePasscode: "revoke_passcode",
  SendReminder: "send_reminder",
  SendThanks: "send_thanks",
  ExpireUnpaid: "expire_unpaid",
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskStatus = {
  Scheduled: "scheduled",
  Running: "running",
  Done: "done",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const DeviceKind = {
  Lock: "lock",
  Keypad: "keypad",
  Hub: "hub",
  Camera: "camera",
} as const;
export type DeviceKind = (typeof DeviceKind)[keyof typeof DeviceKind];

// F-001 空き枠
export interface Slot {
  boothId: number;
  startAt: string; // ISO8601 (+09:00)
  endAt: string;
}

// passcode 命名規則: r{reservationId} (design-docs/23, 25)
export function passcodeName(reservationId: number): string {
  return `r${reservationId}`;
}

export function reservationIdFromPasscodeName(name: string): number | null {
  const m = /^r(\d+)$/.exec(name);
  return m ? Number.parseInt(m[1], 10) : null;
}
