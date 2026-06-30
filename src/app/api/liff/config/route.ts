// API-006 LIFF 設定 GET /api/liff/config (公開)
// liffId に加え、顧客の予約導線で使う店舗・メニュー一覧を返す。
// (顧客向けメニュー一覧の専用APIは設計書に無いため本エンドポイントに集約)

import { config } from "@/server/lib/config";
import { prisma } from "@/server/lib/prisma";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [stores, menus] = await Promise.all([
      prisma.store.findMany({
        select: { id: true, name: true, boothCount: true },
        orderBy: { id: "asc" },
      }),
      prisma.menu.findMany({
        select: {
          id: true,
          storeId: true,
          name: true,
          durationMinutes: true,
          priceYen: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);

    return ok({ liffId: config.line.liffId, stores, menus });
  } catch (err) {
    return errorResponse(err);
  }
}
