// API-013 管理:入退室ログ GET /api/admin/access-logs (Accept: text/csv で CSV)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requireAdminApi } from "@/server/auth";
import { paginationSchema } from "@/server/lib/validation";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi();

    const sp = req.nextUrl.searchParams;
    const where: Prisma.AccessLogWhereInput = {};
    const storeId = sp.get("storeId");
    if (storeId) {
      const n = Number.parseInt(storeId, 10);
      if (Number.isFinite(n)) where.storeId = n;
    }
    const from = sp.get("from");
    const to = sp.get("to");
    if (from || to) {
      where.occurredAt = {};
      if (from) {
        const d = new Date(`${from}T00:00:00+09:00`);
        if (!Number.isNaN(d.getTime())) where.occurredAt.gte = d;
      }
      if (to) {
        const d = new Date(`${to}T00:00:00+09:00`);
        if (!Number.isNaN(d.getTime()))
          where.occurredAt.lt = new Date(d.getTime() + 86_400_000);
      }
    }

    const wantsCsv = (req.headers.get("accept") ?? "").includes("text/csv");

    if (wantsCsv) {
      const rows = await prisma.accessLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        take: 10000,
      });
      const header = [
        "id",
        "storeId",
        "reservationId",
        "deviceId",
        "eventType",
        "occurredAt",
      ];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.id,
            r.storeId,
            r.reservationId ?? "",
            r.deviceId,
            r.eventType,
            r.occurredAt.toISOString(),
          ]
            .map(csvCell)
            .join(","),
        );
      }
      const body = lines.join("\n");
      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="access-logs.csv"',
        },
      });
    }

    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    const [total, rows] = await Promise.all([
      prisma.accessLog.count({ where }),
      prisma.accessLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      storeId: r.storeId,
      reservationId: r.reservationId,
      deviceId: r.deviceId,
      eventType: r.eventType,
      occurredAt: r.occurredAt.toISOString(),
    }));

    return ok({ items, total, page });
  } catch (err) {
    return errorResponse(err);
  }
}
