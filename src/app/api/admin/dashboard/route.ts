// API-016 管理ダッシュボード GET /api/admin/dashboard

import { prisma } from "@/server/lib/prisma";
import { requireAdminApi } from "@/server/auth";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

const JST_OFFSET_MIN = 9 * 60;

/** JST の本日 00:00 / 翌日 00:00 を UTC Date で返す。 */
function jstTodayRange(now: Date): { start: Date; end: Date } {
  const jst = new Date(now.getTime() + JST_OFFSET_MIN * 60_000);
  const y = jst.getUTCFullYear();
  const mo = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const startMs = Date.UTC(y, mo, d) - JST_OFFSET_MIN * 60_000;
  return { start: new Date(startMs), end: new Date(startMs + 86_400_000) };
}

export async function GET() {
  try {
    await requireAdminApi();

    const { start, end } = jstTodayRange(new Date());

    const [todayCount, recentAccess, devices] = await Promise.all([
      prisma.reservation.count({
        where: { startAt: { gte: start, lt: end }, status: { not: "cancelled" } },
      }),
      prisma.accessLog.findMany({
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: {
          id: true,
          storeId: true,
          deviceId: true,
          eventType: true,
          occurredAt: true,
          reservationId: true,
        },
      }),
      prisma.device.findMany({
        select: {
          id: true,
          kind: true,
          battery: true,
          lastSeenAt: true,
          status: true,
        },
      }),
    ]);

    const deviceWarnings = devices.filter(
      (dv) =>
        dv.status === "warning" ||
        dv.status === "offline" ||
        (dv.battery != null && dv.battery <= 20),
    );

    return ok({
      todayReservationCount: todayCount,
      recentAccess: recentAccess.map((a) => ({
        ...a,
        occurredAt: a.occurredAt.toISOString(),
      })),
      deviceWarnings: deviceWarnings.map((dv) => ({
        id: dv.id,
        kind: dv.kind,
        battery: dv.battery,
        status: dv.status,
        lastSeenAt: dv.lastSeenAt?.toISOString() ?? null,
      })),
      deviceWarningCount: deviceWarnings.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
