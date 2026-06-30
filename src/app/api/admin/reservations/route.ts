// API-012 管理:予約一覧 GET /api/admin/reservations

import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requireAdminApi } from "@/server/auth";
import { paginationSchema } from "@/server/lib/validation";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi();

    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });

    const where: Prisma.ReservationWhereInput = {};
    const status = sp.get("status");
    if (status) where.status = status;
    const storeId = sp.get("storeId");
    if (storeId) {
      const n = Number.parseInt(storeId, 10);
      if (Number.isFinite(n)) where.storeId = n;
    }
    const from = sp.get("from");
    const to = sp.get("to");
    if (from || to) {
      where.startAt = {};
      if (from) {
        const d = new Date(`${from}T00:00:00+09:00`);
        if (!Number.isNaN(d.getTime())) where.startAt.gte = d;
      }
      if (to) {
        const d = new Date(`${to}T00:00:00+09:00`);
        if (!Number.isNaN(d.getTime()))
          where.startAt.lt = new Date(d.getTime() + 86_400_000);
      }
    }

    const [total, rows] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where,
        include: { store: true, menu: true, customer: true },
        orderBy: { startAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      status: r.status,
      storeId: r.storeId,
      storeName: r.store.name,
      menuName: r.menu.name,
      customerId: r.customerId,
      customerName: r.customer.displayName,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      paymentStatus: r.paymentStatus,
      amountYen: r.amountYen,
    }));

    return ok({ items, total, page });
  } catch (err) {
    return errorResponse(err);
  }
}
