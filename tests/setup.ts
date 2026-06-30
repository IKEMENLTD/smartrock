// Vitest グローバルセットアップ (design-docs/30)
// - .env.test を読み込み、テスト用 Postgres(sds_test) を使う
// - 各テストの前後で DB をクリーンにする
import { config as loadEnv } from "dotenv";
import { afterAll, beforeEach } from "vitest";

loadEnv({ path: ".env.test" });

// Prisma は遅延 import（env 読み込み後にクライアントを生成させる）
import { prisma } from "@/server/lib/prisma";
import { resetServices } from "@/server/services/registry";

// 依存順を考慮して truncate する対象テーブル
const TABLES = [
  "scheduled_tasks",
  "access_logs",
  "notifications",
  "passcodes",
  "payments",
  "reservations",
  "webhook_events",
  "devices",
  "menus",
  "business_hours",
  "booths",
  "customers",
  "stores",
  "admin_users",
];

export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}

beforeEach(async () => {
  resetServices();
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
