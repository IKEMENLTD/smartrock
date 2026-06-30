// API-007 LINE Webhook POST /api/webhooks/line
// x-line-signature を channel secret で検証。不正は 400 破棄 (TC-014)。冪等 (TC-013)。

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";
import { markEventProcessed } from "@/server/lib/idempotency";
import { ensureCustomerByLineUserId } from "@/server/usecases/notify";

export const runtime = "nodejs";

interface LineEventSource {
  userId?: string;
}
interface LineEvent {
  type: string;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: LineEventSource;
  replyToken?: string;
  message?: { type?: string; text?: string };
}

function liffUrl(): string {
  return config.line.liffId
    ? `https://liff.line.me/${config.line.liffId}`
    : config.app.baseUrl;
}

async function handleEvent(event: LineEvent): Promise<void> {
  const userId = event.source?.userId;

  switch (event.type) {
    case "follow": {
      if (userId) {
        let displayName: string | undefined;
        try {
          const profile = await getServices().line.getProfile(userId);
          displayName = profile.displayName;
        } catch {
          // プロフィール取得失敗は無視
        }
        await ensureCustomerByLineUserId(userId, displayName);
        try {
          await getServices().line.push(userId, [
            {
              type: "text",
              text:
                "友だち追加ありがとうございます。\n" +
                `ご予約はこちらから: ${liffUrl()}`,
            },
          ]);
        } catch (e) {
          logger.warn("line follow greet push failed", { error: String(e) });
        }
      }
      break;
    }
    case "message":
    case "postback": {
      if (userId) {
        try {
          await getServices().line.push(userId, [
            {
              type: "text",
              text: `ご予約・確認はこちらから:\n${liffUrl()}`,
            },
          ]);
        } catch (e) {
          logger.warn("line guide push failed", { error: String(e) });
        }
      }
      break;
    }
    default:
      // 未対応イベントは無視
      break;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  // 署名検証 (不正は 400 破棄 / TC-014)
  if (!getServices().line.verifySignature(rawBody, signature)) {
    logger.warn("line webhook: invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let parsed: { events?: LineEvent[] };
  try {
    parsed = JSON.parse(rawBody) as { events?: LineEvent[] };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const events = parsed.events ?? [];
  for (const event of events) {
    const eventId =
      event.webhookEventId ??
      `${event.type}:${event.source?.userId ?? "unknown"}:${event.replyToken ?? ""}`;
    try {
      // 冪等: 再送は早期スキップ (TC-013)
      const first = await markEventProcessed("line", eventId, true);
      if (!first) continue;
      await handleEvent(event);
    } catch (e) {
      // 個々のイベント失敗でも 200 を返す (LINE の再送暴発を避ける)。内部は log。
      logger.error("line webhook: event handling failed", {
        eventId,
        error: String(e),
      });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
