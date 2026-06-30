// API-002 予約作成 POST /api/reservations (LIFF 認証必須)

import type { NextRequest } from "next/server";
import { authenticateLiff } from "@/server/auth/liff";
import { createReservation } from "@/server/usecases/reservation";
import { createReservationSchema } from "@/server/lib/validation";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { customerId } = await authenticateLiff(
      req,
      typeof raw.idToken === "string" ? raw.idToken : undefined,
    );

    const body = createReservationSchema.parse(raw);

    const result = await createReservation({
      customerId,
      storeId: body.storeId,
      menuId: body.menuId,
      boothId: body.boothId,
      startAt: body.startAt,
      agreeTerms: body.agreeTerms,
    });

    return ok(
      {
        id: result.id,
        status: result.status,
        startAt: result.startAt,
        needsPayment: result.needsPayment,
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
