// 構造化ログ (JSON)。外部API要求/応答・タスク実行・webhook受信を記録 (design-docs/17)
// 機微情報(パスコード/トークン/署名)はマスクする。

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = [
  "password",
  "passcode",
  "code",
  "codeHash",
  "token",
  "secret",
  "sign",
  "signature",
  "authorization",
  "channelAccessToken",
];

function mask(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(mask);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
        out[k] = "***";
      } else {
        out[k] = mask(v);
      }
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? (mask(meta) as Record<string, unknown>) : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
