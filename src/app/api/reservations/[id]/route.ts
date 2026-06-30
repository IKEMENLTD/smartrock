// API-003 予約詳細 GET /api/reservations/{id} (本人 or 管理)

import type { NextRequest } from "next/server";
import { prisma } from "@/server/lib/prisma";
import { authenticateLiff } from "@/server/auth/liff";
import { getAdminSession } from "@/server/auth";
import { DomainError } from "@/server/usecases/errors";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

const JST_OFFSET_MIN = 9 * 60;
function toJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}` +
    `T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number.parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      throw new DomainError("validation", "予約IDが不正です");
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { store: true, menu: true, booth: true, passcode: true },
    });
    if (!reservation) {
      throw new DomainError("not_found", "予約が見つかりません");
    }

    // 管理セッション or 本人 (LIFF) のいずれかであること。
    const adminSession = await getAdminSession();
    const isAdmin = Boolean(
      (adminSession?.user as { email?: string } | undefined)?.email,
    );

    if (!isAdmin) {
      const { customerId } = await authenticateLiff(req);
      if (reservation.customerId !== customerId) {
        throw new DomainError("forbidden", "この予約を参照する権限がありません");
      }
    }

    return ok({
      id: reservation.id,
      status: reservation.status,
      storeId: reservation.storeId,
      storeName: reservation.store.name,
      menuId: reservation.menuId,
      menuName: reservation.menu.name,
      boothId: reservation.boothId,
      boothName: reservation.booth.name,
      startAt: toJstIso(reservation.startAt),
      endAt: toJstIso(reservation.endAt),
      amountYen: reservation.amountYen,
      paymentStatus: reservation.paymentStatus,
      passcodeStatus: reservation.passcode?.status ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
