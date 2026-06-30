// LINE Service (design-docs/16 外部連携仕様, NFR-006)
// Messaging API / LIFF を fetch + withRetry で呼び出す。
// 署名検証は lib/hmac の verifyLineSignature を使用。
// モジュール import 時に例外を投げない (env 未設定でも遅延参照)。

import { config } from "@/server/lib/config";
import { verifyLineSignature } from "@/server/lib/hmac";
import { logger } from "@/server/lib/logger";
import { withRetry } from "@/server/lib/retry";
import type { LineMessage, LineService } from "./types";

function bearer(): string {
  return `Bearer ${config.line.channelAccessToken}`;
}

// LIFF ID は "{channelId}-{liffSuffix}" 形式。verifyIdToken の client_id には
// 先頭の数字部分 (channel id) を用いる (design-docs/16)。
function liffChannelId(): string {
  const m = /^(\d+)/.exec(config.line.liffId);
  return m ? m[1] : config.line.liffId;
}

export const lineService: LineService = {
  // design-docs/16: プッシュ送信。x-line-request-id を messageId として返す (無ければ null)。
  async push(userId: string, messages: LineMessage[]): Promise<string | null> {
    logger.info("line push request", { to: userId, count: messages.length });
    const requestId = await withRetry(
      async () => {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            Authorization: bearer(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: userId, messages }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`line push http ${res.status}: ${text}`);
        }
        return res.headers.get("x-line-request-id");
      },
      {
        onRetry: (attempt, err) =>
          logger.warn("line push retry", { to: userId, attempt, err: String(err) }),
      },
    );
    logger.info("line push response", { to: userId, requestId });
    return requestId;
  },

  // design-docs/16: x-line-signature を channel secret で HMAC-SHA256 検証。
  verifySignature(rawBody: string, signature: string | null): boolean {
    return verifyLineSignature(rawBody, signature, config.line.channelSecret);
  },

  // design-docs/16: LIFF idToken を検証し line userId / displayName を取得。
  async verifyIdToken(idToken: string): Promise<{ userId: string; displayName?: string }> {
    const data = await withRetry(
      async () => {
        const body = new URLSearchParams({
          id_token: idToken,
          client_id: liffChannelId(),
        });
        const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`line verify http ${res.status}: ${text}`);
        }
        return (await res.json()) as { sub?: string; name?: string };
      },
      {
        onRetry: (attempt, err) =>
          logger.warn("line verifyIdToken retry", { attempt, err: String(err) }),
      },
    );
    if (!data.sub) throw new Error("line verifyIdToken: missing sub");
    logger.info("line verifyIdToken ok", { userId: data.sub });
    return { userId: data.sub, displayName: data.name };
  },

  // design-docs/16: プロフィール取得。
  async getProfile(userId: string): Promise<{ userId: string; displayName?: string }> {
    const data = await withRetry(
      async () => {
        const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: bearer() },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`line profile http ${res.status}: ${text}`);
        }
        return (await res.json()) as { userId?: string; displayName?: string };
      },
      {
        onRetry: (attempt, err) =>
          logger.warn("line getProfile retry", { userId, attempt, err: String(err) }),
      },
    );
    return { userId: data.userId ?? userId, displayName: data.displayName };
  },
};
