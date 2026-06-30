// API-009 Stripe Webhook POST /api/webhooks/stripe
// Stripe-Signature を検証。完了セッション → confirmPaidReservation。冪等。

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";
import { markEventProcessed } from "@/server/lib/idempotency";
import { confirmPaidReservation } from "@/server/usecases/reservation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  // 署名検証 (不正は 400 破棄)
  if (!getServices().stripe.verifySignature(rawBody, signature)) {
    logger.warn("stripe webhook: invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const completed = getServices().stripe.parseCompletedSession(rawBody);
  if (!completed) {
    // 対象外イベントは 200 で受理 (再送不要)
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    // 冪等: session.id をキーに重複処理を防ぐ
    const first = await markEventProcessed("stripe", completed.sessionId, true);
    if (first) {
      await confirmPaidReservation(completed.reservationId, completed.sessionId);
    }
  } catch (e) {
    logger.error("stripe webhook: handling failed", {
      sessionId: completed.sessionId,
      error: String(e),
    });
    // 一時障害は 500 で Stripe に再送させる
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
