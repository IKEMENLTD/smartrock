// 環境変数の集約 (design-docs/27_環境変数・設定.md)
// 値の検証はここで一元化し、各 Service / UseCase は config 経由で参照する。

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function intEnv(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = env(name);
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

export const config = {
  app: {
    baseUrl: env("APP_BASE_URL") ?? "http://localhost:3000",
    tz: env("TZ") ?? "Asia/Tokyo",
  },
  line: {
    channelAccessToken: env("LINE_CHANNEL_ACCESS_TOKEN") ?? "",
    channelSecret: env("LINE_CHANNEL_SECRET") ?? "",
    liffId: env("LIFF_ID") ?? "",
  },
  google: {
    saJson: env("GOOGLE_SA_JSON") ?? "",
    calendarId: env("GOOGLE_CALENDAR_ID") ?? "",
  },
  switchbot: {
    token: env("SWITCHBOT_TOKEN") ?? "",
    secret: env("SWITCHBOT_SECRET") ?? "",
    webhookAllowDevices: (env("SWITCHBOT_WEBHOOK_ALLOW_DEVICES") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  stripe: {
    secretKey: env("STRIPE_SECRET_KEY") ?? "",
    webhookSecret: env("STRIPE_WEBHOOK_SECRET") ?? "",
  },
  frigate: {
    url: env("FRIGATE_URL") ?? "",
  },
  auth: {
    // middleware の withAuth は NEXTAUTH_SECRET を使うため両者を揃える
    secret: env("AUTH_SECRET") ?? env("NEXTAUTH_SECRET") ?? "dev-secret",
  },
  ops: {
    adminAlertLineUserId: env("ADMIN_ALERT_LINE_USER_ID") ?? "",
    passcodeValidBeforeMin: intEnv("PASSCODE_VALID_BEFORE_MIN", 10),
    passcodeValidAfterMin: intEnv("PASSCODE_VALID_AFTER_MIN", 15),
    cancelDeadlineHours: intEnv("CANCEL_DEADLINE_HOURS", 24),
    recordingRetentionDays: intEnv("RECORDING_RETENTION_DAYS", 30),
    paymentsEnabled: boolEnv("PAYMENTS_ENABLED", false),
    // scheduled_tasks の最大試行回数 (design-docs/25)
    maxTaskAttempts: intEnv("MAX_TASK_ATTEMPTS", 5),
  },
} as const;

export type AppConfig = typeof config;
