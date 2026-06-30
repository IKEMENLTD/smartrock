// API-001 空き枠検索 GET /api/availability (公開)

import type { NextRequest } from "next/server";
import { getAvailability } from "@/server/usecases/availability";
import { availabilityQuerySchema } from "@/server/lib/validation";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = availabilityQuerySchema.parse({
      storeId: sp.get("storeId"),
      menuId: sp.get("menuId"),
      from: sp.get("from"),
      to: sp.get("to"),
    });

    const slots = await getAvailability(parsed);
    return ok({ slots });
  } catch (err) {
    return errorResponse(err);
  }
}
