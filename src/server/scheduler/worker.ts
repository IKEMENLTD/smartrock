// ワーカー起動 (design-docs/25 / NFR-001)
// node-cron で毎分 processDueTasks(now) を呼ぶ。`tsx src/server/scheduler/worker.ts` で起動。

import "dotenv/config";
import cron from "node-cron";
import { logger } from "@/server/lib/logger";
import { processDueTasks } from "./handlers";

let running = false;

async function tick(): Promise<void> {
  // 前回 tick が長引いている場合は重複起動しない (同一プロセス内ガード)。
  if (running) {
    logger.warn("worker: previous tick still running, skip");
    return;
  }
  running = true;
  try {
    const { processed } = await processDueTasks(new Date());
    if (processed > 0) {
      logger.info("worker: tick done", { processed });
    }
  } catch (e) {
    logger.error("worker: tick failed", { error: String(e) });
  } finally {
    running = false;
  }
}

function main(): void {
  logger.info("worker: starting (cron: every minute)");
  cron.schedule("* * * * *", () => {
    void tick();
  });

  // 起動直後にも一度実行しておく。
  void tick();
}

main();
