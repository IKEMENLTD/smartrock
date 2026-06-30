// スケジューラ ジョブ処理 (design-docs/25 / NFR-001, TC-009)
// processDueTasks は cron から分離した純関数。テストから直接呼べる。

import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { TaskStatus, TaskType } from "@/types/domain";
import {
  issuePasscode,
  revokePasscode,
} from "@/server/usecases/passcode";
import {
  sendReminder,
  sendThanks,
  notifyAdmin,
} from "@/server/usecases/notify";
import { expireUnpaidReservation } from "@/server/usecases/reservation";

interface ClaimedTask {
  id: number;
  type: string;
  reservationId: number | null;
  attempts: number;
}

/**
 * scheduled かつ run_at<=now のタスクを 1 件原子的に running 化して取得する。
 * FOR UPDATE SKIP LOCKED で多重起動耐性を持たせる。
 * 取得できなければ null。
 */
async function claimNextTask(now: Date): Promise<ClaimedTask | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: number; type: string; reservation_id: number | null; attempts: number }[]
    >`
      SELECT id, type, reservation_id, attempts
      FROM scheduled_tasks
      WHERE status = ${TaskStatus.Scheduled} AND run_at <= ${now}
      ORDER BY run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const row = rows[0];
    if (!row) return null;

    await tx.scheduledTask.update({
      where: { id: row.id },
      data: { status: TaskStatus.Running },
    });

    return {
      id: row.id,
      type: row.type,
      reservationId: row.reservation_id,
      attempts: row.attempts,
    };
  });
}

/** タスク種別ごとの実処理。reservationId 必須タスクで欠落時は Error。 */
async function dispatch(task: ClaimedTask): Promise<void> {
  const rid = task.reservationId;
  switch (task.type) {
    case TaskType.IssuePasscode:
      if (rid == null) throw new Error("issue_passcode: reservationId is null");
      await issuePasscode(rid);
      return;
    case TaskType.RevokePasscode:
      if (rid == null) throw new Error("revoke_passcode: reservationId is null");
      // key_id 未達なら revokePasscode が throw → failed 扱いで attempts 消費 (TC-009)
      await revokePasscode(rid);
      return;
    case TaskType.SendReminder:
      if (rid == null) throw new Error("send_reminder: reservationId is null");
      await sendReminder(rid);
      return;
    case TaskType.SendThanks:
      if (rid == null) throw new Error("send_thanks: reservationId is null");
      await sendThanks(rid);
      return;
    case TaskType.ExpireUnpaid:
      if (rid == null) throw new Error("expire_unpaid: reservationId is null");
      await expireUnpaidReservation(rid);
      return;
    default:
      throw new Error(`unknown task type: ${task.type}`);
  }
}

async function runOne(task: ClaimedTask): Promise<void> {
  try {
    await dispatch(task);
    await prisma.scheduledTask.update({
      where: { id: task.id },
      data: { status: TaskStatus.Done, lastError: null },
    });
  } catch (e) {
    const attempts = task.attempts + 1;
    const errMsg = String(e);
    const exhausted = attempts >= config.ops.maxTaskAttempts;

    await prisma.scheduledTask.update({
      where: { id: task.id },
      data: {
        // 上限到達でも上限未満でも status=failed。再試行は run_at<=now の failed を
        // 拾わない設計なので、上限未満は scheduled に戻して再試行可能にする。
        status: exhausted ? TaskStatus.Failed : TaskStatus.Scheduled,
        attempts,
        lastError: errMsg,
      },
    });

    logger.warn("scheduled task failed", {
      taskId: task.id,
      type: task.type,
      attempts,
      exhausted,
      error: errMsg,
    });

    if (exhausted) {
      // 最大試行到達 → 管理者へ通知 (無限ループ回避)。
      await notifyAdmin(
        `タスク失敗(上限到達): id=${task.id} type=${task.type} reservationId=${task.reservationId ?? "-"} error=${errMsg}`,
      ).catch((ne) =>
        logger.error("notifyAdmin failed", { error: String(ne) }),
      );
    }
  }
}

/**
 * 期限到来タスクをすべて処理する。
 * 1 件ずつ原子的に claim → 実行。claim できなくなったら終了。
 * @returns 処理した(=実行を試みた)件数
 */
export async function processDueTasks(
  now: Date,
): Promise<{ processed: number }> {
  let processed = 0;
  // 無限ループ防止のため、1 回の起動で処理する最大件数に上限を設ける。
  const MAX_PER_TICK = 500;

  while (processed < MAX_PER_TICK) {
    const task = await claimNextTask(now);
    if (!task) break;
    await runOne(task);
    processed += 1;
  }

  if (processed > 0) {
    logger.info("processDueTasks: completed", { processed });
  }
  return { processed };
}
