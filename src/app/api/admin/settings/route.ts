// API-017 管理:設定 GET/PUT /api/admin/settings (店舗・営業時間・メニュー)

import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/lib/prisma";
import { requireAdminApi } from "@/server/auth";
import { ok, errorResponse } from "@/server/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminApi();

    const stores = await prisma.store.findMany({
      include: {
        businessHours: { orderBy: { weekday: "asc" } },
        booths: { orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    });
    const menus = await prisma.menu.findMany({ orderBy: { id: "asc" } });

    return ok({ stores, menus });
  } catch (err) {
    return errorResponse(err);
  }
}

const businessHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().positive().optional(),
  bufferMinutes: z.number().int().min(0).optional(),
});

const menuSchema = z.object({
  id: z.number().int().positive().optional(),
  storeId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  priceYen: z.number().int().min(0),
});

const settingsPutSchema = z.object({
  store: z
    .object({
      id: z.number().int().positive(),
      name: z.string().min(1).optional(),
      timezone: z.string().optional(),
      boothCount: z.number().int().positive().optional(),
    })
    .optional(),
  businessHours: z.array(businessHourSchema).optional(),
  menus: z.array(menuSchema).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireAdminApi();

    const raw = (await req.json().catch(() => ({}))) as unknown;
    const body = settingsPutSchema.parse(raw);

    // 店舗基本情報
    if (body.store) {
      const { id, ...rest } = body.store;
      await prisma.store.update({ where: { id }, data: rest });
    }

    // 営業時間 (store 指定時のみ。weekday UNIQUE で upsert)
    if (body.businessHours && body.store) {
      const storeId = body.store.id;
      for (const bh of body.businessHours) {
        await prisma.businessHour.upsert({
          where: { storeId_weekday: { storeId, weekday: bh.weekday } },
          create: {
            storeId,
            weekday: bh.weekday,
            openTime: bh.openTime,
            closeTime: bh.closeTime,
            slotMinutes: bh.slotMinutes ?? 60,
            bufferMinutes: bh.bufferMinutes ?? 15,
          },
          update: {
            openTime: bh.openTime,
            closeTime: bh.closeTime,
            ...(bh.slotMinutes != null ? { slotMinutes: bh.slotMinutes } : {}),
            ...(bh.bufferMinutes != null
              ? { bufferMinutes: bh.bufferMinutes }
              : {}),
          },
        });
      }
    }

    // メニュー (id あり=更新 / なし=新規)
    if (body.menus) {
      for (const m of body.menus) {
        if (m.id != null) {
          await prisma.menu.update({
            where: { id: m.id },
            data: {
              name: m.name,
              durationMinutes: m.durationMinutes,
              priceYen: m.priceYen,
              ...(m.storeId !== undefined ? { storeId: m.storeId } : {}),
            },
          });
        } else {
          await prisma.menu.create({
            data: {
              name: m.name,
              durationMinutes: m.durationMinutes,
              priceYen: m.priceYen,
              storeId: m.storeId ?? null,
            },
          });
        }
      }
    }

    // 更新後の状態を返す
    const stores = await prisma.store.findMany({
      include: {
        businessHours: { orderBy: { weekday: "asc" } },
        booths: { orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    });
    const menus = await prisma.menu.findMany({ orderBy: { id: "asc" } });

    return ok({ stores, menus });
  } catch (err) {
    return errorResponse(err);
  }
}
