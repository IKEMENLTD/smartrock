// API-008 決済チェックアウト POST /api/payments/checkout (任意機能)

import type { NextRequest } from "next/server";
import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { getServices } from "@/server/services/registry";
import { authenticateLiff } from "@/server/auth/liff";
import { checkoutSchema } from "@/server/lib/validation";
import { DomainError } from "@/server/usecases/errors";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!config.ops.paymentsEnabled) {
      throw new DomainError("not_found", "決済機能は無効です");
    }

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { customerId } = await authenticateLiff(
      req,
      typeof raw.idToken === "string" ? raw.idToken : undefined,
    );

    const { reservationId } = checkoutSchema.parse(raw);

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new DomainError("not_found", "予約が見つかりません");
    }
    if (reservation.customerId !== customerId) {
      throw new DomainError("forbidden", "この予約を決済する権限がありません");
    }

    const checkout = await getServices().stripe.createCheckout(
      reservationId,
      reservation.amountYen,
    );

    return ok({ url: checkout.url, sessionId: checkout.sessionId });
  } catch (err) {
    return errorResponse(err);
  }
}
