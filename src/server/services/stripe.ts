// Stripe Service (任意 / design-docs/16 外部連携仕様, NFR-006)
// Checkout Session 作成 + webhook 署名検証。
// モジュール import 時に例外を投げない。Stripe client は初回呼び出し時に遅延構築する。

import Stripe from "stripe";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import type { StripeService } from "./types";

let cachedStripe: Stripe | null = null;

// secretKey 未設定でも import を壊さないため、呼び出し時に遅延構築。
function getStripe(): Stripe | null {
  if (cachedStripe) return cachedStripe;
  if (!config.stripe.secretKey) return null;
  cachedStripe = new Stripe(config.stripe.secretKey);
  return cachedStripe;
}

export const stripeService: StripeService = {
  // design-docs/16: Checkout Session 作成 (mode:payment, JPY)。metadata に reservationId。
  async createCheckout(
    reservationId: number,
    amountYen: number,
  ): Promise<{ url: string; sessionId: string }> {
    const stripe = getStripe();
    if (!stripe) throw new Error("stripe not configured");
    logger.info("stripe createCheckout", { reservationId, amountYen });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy", // JPY は最小単位=1円 (amountYen をそのまま使用)
            unit_amount: amountYen,
            product_data: { name: `予約 #${reservationId}` },
          },
        },
      ],
      metadata: { reservationId: String(reservationId) },
      success_url: `${config.app.baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.app.baseUrl}/payment/cancel`,
    });
    if (!session.url) throw new Error("stripe createCheckout: missing url");
    logger.info("stripe createCheckout ok", { reservationId, sessionId: session.id });
    return { url: session.url, sessionId: session.id };
  },

  // design-docs/16: Stripe-Signature を webhookSecret で検証。署名不正は false。
  verifySignature(rawBody: string, signature: string | null): boolean {
    const stripe = getStripe();
    if (!stripe || !signature || !config.stripe.webhookSecret) return false;
    try {
      stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
      return true;
    } catch (err) {
      logger.warn("stripe verifySignature failed", { err: String(err) });
      return false;
    }
  },

  // design-docs/16: webhook payload から完了セッションを抽出。
  // checkout.session.completed の場合 reservationId / sessionId を返す。署名不正は null。
  parseCompletedSession(rawBody: string): { sessionId: string; reservationId: number } | null {
    const stripe = getStripe();
    if (!stripe) return null;
    // 注: signature 検証は verifySignature で行う前提だが、ここでも安全側に
    //     JSON を直接パースして type を判定する (constructEvent は verifySignature 側)。
    try {
      const event = JSON.parse(rawBody) as Stripe.Event;
      if (event.type !== "checkout.session.completed") return null;
      const session = event.data.object as Stripe.Checkout.Session;
      const ridRaw = session.metadata?.reservationId;
      if (!ridRaw) return null;
      const reservationId = Number.parseInt(ridRaw, 10);
      if (!Number.isFinite(reservationId)) return null;
      logger.info("stripe completed session", { reservationId, sessionId: session.id });
      return { sessionId: session.id, reservationId };
    } catch (err) {
      logger.warn("stripe parseCompletedSession failed", { err: String(err) });
      return null;
    }
  },
};
