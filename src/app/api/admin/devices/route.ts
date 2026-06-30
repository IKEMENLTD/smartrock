// API-014 管理:デバイス一覧 GET /api/admin/devices (電池/最終応答/警告フラグ)

import { prisma } from "@/server/lib/prisma";
import { requireAdminApi } from "@/server/auth";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

const LOW_BATTERY = 20;
const STALE_MS = 24 * 60 * 60 * 1000; // 24h 応答なしを警告

export async function GET() {
  try {
    await requireAdminApi();

    const devices = await prisma.device.findMany({
      include: { store: true },
      orderBy: { id: "asc" },
    });

    const now = Date.now();
    const items = devices.map((d) => {
      const lowBattery = d.battery != null && d.battery <= LOW_BATTERY;
      const stale =
        d.lastSeenAt == null || now - d.lastSeenAt.getTime() > STALE_MS;
      const warning =
        d.status === "warning" || d.status === "offline" || lowBattery || stale;
      return {
        id: d.id,
        storeId: d.storeId,
        storeName: d.store.name,
        kind: d.kind,
        switchbotDeviceId: d.switchbotDeviceId,
        battery: d.battery,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        status: d.status,
        lowBattery,
        stale,
        warning,
      };
    });

    return ok({ items, total: items.length });
  } catch (err) {
    return errorResponse(err);
  }
}
