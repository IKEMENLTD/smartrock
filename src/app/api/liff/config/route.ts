// API-006 LIFF 設定 GET /api/liff/config (公開)

import { config } from "@/server/lib/config";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ liffId: config.line.liffId });
  } catch (err) {
    return errorResponse(err);
  }
}
