// API-015 管理:パスコード再発行 POST /api/admin/reservations/{id}/reissue-passcode

import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth";
import { reissuePasscode } from "@/server/usecases/passcode";
import { DomainError } from "@/server/usecases/errors";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdminApi();

    const id = Number.parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      throw new DomainError("validation", "予約IDが不正です");
    }

    const result = await reissuePasscode(id);
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}
