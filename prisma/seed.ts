import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// 初期データ: 店舗 / 営業時間 / メニュー / 管理者 (design-docs/20)
const prisma = new PrismaClient();

async function main() {
  // --- 店舗 (Étoile Beauty) ---
  const store = await prisma.store.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Étoile Beauty 本店",
      timezone: "Asia/Tokyo",
      googleCalendarId: process.env.GOOGLE_CALENDAR_ID || null,
      switchbotKeypadId: process.env.SWITCHBOT_KEYPAD_ID || "KEYPAD-DEV-0001",
      switchbotLockId: process.env.SWITCHBOT_LOCK_ID || null,
      switchbotHubId: process.env.SWITCHBOT_HUB_ID || null,
      boothCount: 1,
    },
  });

  // --- ブース (booth_count=1 / AS-02) ---
  await prisma.booth.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, storeId: store.id, name: "ブース1" },
  });

  // --- 営業時間 (毎日 10:00-20:00, 枠60分, バッファ15分 / AS-03 既定) ---
  for (let weekday = 0; weekday < 7; weekday++) {
    await prisma.businessHour.upsert({
      where: { storeId_weekday: { storeId: store.id, weekday } },
      update: {},
      create: {
        storeId: store.id,
        weekday,
        openTime: "10:00",
        closeTime: "20:00",
        slotMinutes: 60,
        bufferMinutes: 15,
      },
    });
  }

  // --- メニュー ---
  const menus = [
    { id: 1, name: "全身脱毛 (セルフ)", durationMinutes: 60, priceYen: 3980 },
    { id: 2, name: "上半身脱毛 (セルフ)", durationMinutes: 45, priceYen: 2980 },
    { id: 3, name: "下半身脱毛 (セルフ)", durationMinutes: 45, priceYen: 2980 },
    { id: 4, name: "部分脱毛 (セルフ)", durationMinutes: 30, priceYen: 1980 },
  ];
  for (const m of menus) {
    await prisma.menu.upsert({
      where: { id: m.id },
      update: {},
      create: { ...m, storeId: store.id },
    });
  }

  // --- 管理者 (Auth.js Credentials) ---
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme123";
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "owner",
    },
  });

  // --- デバイス (監視対象の初期登録) ---
  const devices = [
    { kind: "lock", switchbotDeviceId: store.switchbotLockId },
    { kind: "keypad", switchbotDeviceId: store.switchbotKeypadId },
    { kind: "hub", switchbotDeviceId: store.switchbotHubId },
    { kind: "camera", switchbotDeviceId: null },
  ];
  for (const d of devices) {
    const existing = await prisma.device.findFirst({
      where: { storeId: store.id, kind: d.kind },
    });
    if (!existing) {
      await prisma.device.create({
        data: {
          storeId: store.id,
          kind: d.kind,
          switchbotDeviceId: d.switchbotDeviceId,
          status: "unknown",
        },
      });
    }
  }

  console.log("Seed completed:", { store: store.name, admin: adminEmail });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
