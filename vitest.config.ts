import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// .env.test を「worker プロセス起動前」に process.env へ載せる。
// (setup.ts の dotenv は Prisma エンジンの env スナップショットより後に走るため
//  DATABASE_URL が間に合わない。test.env は各 worker の process.env に先行注入される。)
const testEnv = loadEnv({ path: ".env.test", processEnv: {} }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: testEnv,
    // 単一の sds_test DB を共有するため、ファイル/テストの並行実行を禁止する。
    // (beforeEach の truncate が他ファイルのテストと競合し FK/UNIQUE 違反になるのを防ぐ)
    fileParallelism: false,
    sequence: { concurrent: false },
    poolOptions: {
      threads: { singleThread: true },
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
