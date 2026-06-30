// API-004 予約キャンセル POST /api/reservations/{id}/cancel (本人)

import type { NextRequest } from "next/server";
import { authenticateLiff } from "@/server/auth/liff";
import { cancelReservation } from "@/server/usecases/reservation";
import { DomainError } from "@/server/usecases/errors";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number.parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      throw new DomainError("validation", "予約IDが不正です");
    }

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { customerId } = await authenticateLiff(
      req,
      typeof raw.idToken === "string" ? raw.idToken : undefined,
    );

    const result = await cancelReservation({
      reservationId: id,
      actor: "customer",
      customerId,
    });

    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}
