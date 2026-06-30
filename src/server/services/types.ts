// Service 層インターフェース (design-docs/21_モジュール・関数設計.md, NFR-006)
// 外部連携を型で固定し、UseCase 層は実装ではなくこの契約に依存する。
// テストではこのインターフェースをモックに差し替える。

// ---- SwitchBot (design-docs/16) ----
export interface SwitchbotCreateKeyParams {
  deviceId: string;
  name: string; // device 内で一意 (例 r{reservationId})
  password: string; // 6-12桁
  startEpoch: number; // epoch秒
  endEpoch: number; // epoch秒
}

export interface SwitchbotResult {
  statusCode: number;
  message: string;
  body?: unknown;
}

export interface SwitchbotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  battery?: number;
  online?: boolean;
}

export interface SwitchbotService {
  /** timeLimit パスコード作成。id は同期応答に含まれず webhook で後埋め。 */
  createKey(params: SwitchbotCreateKeyParams): Promise<SwitchbotResult>;
  /** パスコード削除。switchbot_key_id が必須。 */
  deleteKey(deviceId: string, keyId: number): Promise<SwitchbotResult>;
  /** 遠隔施解錠 (管理用) */
  controlLock(deviceId: string, action: "lock" | "unlock"): Promise<SwitchbotResult>;
  /** device 一覧 / 状態 / 電池取得 */
  getDevices(): Promise<SwitchbotDevice[]>;
}

// ---- LINE (design-docs/16) ----
export interface LineMessage {
  type: "text";
  text: string;
}

export interface LineService {
  /** プッシュ送信。messageId(あれば)を返す。 */
  push(userId: string, messages: LineMessage[]): Promise<string | null>;
  /** x-line-signature 検証 */
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** LIFF idToken を検証し line userId を取得 */
  verifyIdToken(idToken: string): Promise<{ userId: string; displayName?: string }>;
  /** プロフィール取得 */
  getProfile(userId: string): Promise<{ userId: string; displayName?: string }>;
}

// ---- Google Calendar (design-docs/16) ----
export interface CalendarReservationInput {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface CalendarService {
  insertEvent(calendarId: string, reservation: CalendarReservationInput): Promise<string>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /** 手動ブロック含む busy 区間取得 (FR-007) */
  getBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]>;
}

// ---- Stripe (任意 / design-docs/16) ----
export interface StripeService {
  createCheckout(reservationId: number, amountYen: number): Promise<{ url: string; sessionId: string }>;
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** webhook payload から完了セッションを抽出 */
  parseCompletedSession(rawBody: string): { sessionId: string; reservationId: number } | null;
}

// ---- Frigate (死活/録画状態 / design-docs/16) ----
export interface FrigateCameraStatus {
  name: string;
  recording: boolean;
  lastSeenAt?: string;
}

export interface FrigateService {
  getStatus(): Promise<FrigateCameraStatus[]>;
}

// ---- Service レジストリ ----
// UseCase / Worker はこのレジストリ経由で Service を参照する。
// テスト時に部分的に差し替え可能。
export interface Services {
  switchbot: SwitchbotService;
  line: LineService;
  calendar: CalendarService;
  stripe: StripeService;
  frigate: FrigateService;
}
