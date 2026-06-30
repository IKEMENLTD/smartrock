// Frigate Service (死活/録画状態 / design-docs/16 外部連携仕様, NFR-006)
// Frigate の /api/stats からカメラ毎の録画状態を取得する。シンプル実装。
// モジュール import 時に例外を投げない。FRIGATE_URL 未設定なら空配列。

import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { withRetry } from "@/server/lib/retry";
import type { FrigateCameraStatus, FrigateService } from "./types";

// FRIGATE_URL は config.frigate.url 経由 (例: http://frigate:5000)。
function frigateUrl(): string {
  return config.frigate.url;
}

// /api/stats の cameras エントリ (必要部分のみ)。
interface FrigateStatsCamera {
  camera_fps?: number;
  detection_fps?: number;
}

interface FrigateStats {
  cameras?: Record<string, FrigateStatsCamera>;
  // record プロセスの稼働状況 (録画有効判定の補助)
  service?: { recordings?: unknown };
}

export const frigateService: FrigateService = {
  // design-docs/16: /api/stats を取得しカメラ毎の録画状態を返す。失敗時は空配列 + warn。
  async getStatus(): Promise<FrigateCameraStatus[]> {
    const base = frigateUrl();
    if (!base) return [];
    try {
      const stats = await withRetry(async () => {
        const res = await fetch(`${base.replace(/\/$/, "")}/api/stats`);
        if (!res.ok) throw new Error(`frigate http ${res.status}`);
        return (await res.json()) as FrigateStats;
      });
      const cameras = stats.cameras ?? {};
      const now = new Date().toISOString();
      const result: FrigateCameraStatus[] = Object.entries(cameras).map(([name, cam]) => ({
        name,
        // camera_fps > 0 をカメラ稼働=録画中の簡易判定とする。
        recording: typeof cam.camera_fps === "number" && cam.camera_fps > 0,
        lastSeenAt: now,
      }));
      logger.info("frigate status", { count: result.length });
      return result;
    } catch (err) {
      logger.warn("frigate getStatus failed", { err: String(err) });
      return [];
    }
  },
};
