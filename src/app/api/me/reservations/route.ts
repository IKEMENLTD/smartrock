// API-005 自分の予約一覧 GET /api/me/reservations (LIFF 認証必須)

import type { NextRequest } from "next/server";
import { prisma } from "@/server/lib/prisma";
import { authenticateLiff } from "@/server/auth/liff";
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

export async function GET(req: NextRequest) {
  try {
    const { customerId } = await authenticateLiff(req);

    const reservations = await prisma.reservation.findMany({
      where: { customerId },
      include: { store: true, menu: true },
      orderBy: { startAt: "desc" },
      take: 100,
    });

    const items = reservations.map((r) => ({
      id: r.id,
      status: r.status,
      storeId: r.storeId,
      storeName: r.store.name,
      menuName: r.menu.name,
      startAt: toJstIso(r.startAt),
      endAt: toJstIso(r.endAt),
      paymentStatus: r.paymentStatus,
      amountYen: r.amountYen,
    }));

    return ok({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
