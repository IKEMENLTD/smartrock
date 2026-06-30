// F-008 通知配信 (design-docs/12, 23 / TC-007)
// 予約確定/リマインド/お礼の LINE プッシュと notifications へのログ。
// 外部連携は必ず getServices() 経由。

import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { getServices } from "@/server/services/registry";

const JST_OFFSET_MIN = 9 * 60;

/** UTC Date を JST の "M月D日 H:mm" 表記へ (日本語通知用) */
function fmtJst(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const mo = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const h = jst.getUTCHours();
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${mo}月${d}日 ${h}:${mi}`;
}

/** UTC Date を JST の "H:mm" 表記へ */
function fmtTimeJst(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MIN * 60_000);
  const h = jst.getUTCHours();
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${h}:${mi}`;
}

/**
 * LINE userId から顧客を取得/作成する (follow / LIFF ログイン時)。
 * 既存があれば displayName を補完更新する。
 */
export async function ensureCustomerByLineUserId(
  lineUserId: string,
  displayName?: string,
): Promise<{ id: number; lineUserId: string }> {
  const customer = await prisma.customer.upsert({
    where: { lineUserId },
    create: { lineUserId, displayName: displayName ?? null },
    update: displayName ? { displayName } : {},
    select: { id: true, lineUserId: true },
  });
  return customer;
}

/** push 送信 + notifications ログ。失敗は記録のみで投げない(通知は予約をブロックしない)。 */
async function pushAndLog(
  customerId: number,
  lineUserId: string,
  template: string,
  text: string,
): Promise<void> {
  try {
    const messageId = await getServices().line.push(lineUserId, [
      { type: "text", text },
    ]);
    await prisma.notification.create({
      data: {
        customerId,
        channel: "line",
        template,
        status: "sent",
        lineMessageId: messageId ?? null,
      },
    });
  } catch (e) {
    logger.error("LINE push failed", { customerId, template, error: String(e) });
    await prisma.notification.create({
      data: { customerId, channel: "line", template, status: "failed" },
    });
  }
}

async function loadReservationWithCustomer(reservationId: number) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { customer: true, store: true },
  });
}

/**
 * 入室パスコード通知。平文コードが渡された場合はそれを案内に含める。
 * 平文は DB に保存せず、発行直後 (issuePasscode) からこの引数で受け渡す。
 */
export async function sendPasscodeNotification(
  reservationId: number,
  plainCode?: string,
): Promise<void> {
  const r = await loadReservationWithCustomer(reservationId);
  if (!r) {
    logger.warn("sendPasscodeNotification: reservation not found", { reservationId });
    return;
  }

  const codeLine = plainCode
    ? `暗証番号: ${plainCode}`
    : "暗証番号はキーパッドにてご利用いただけます。";

  const text =
    `【${r.store.name}】ご予約ありがとうございます。\n` +
    `ご利用日時: ${fmtJst(r.startAt)}〜${fmtTimeJst(r.endAt)}\n` +
    `${codeLine}\n` +
    `有効時間: ${fmtJst(r.startAt)} 前後\n` +
    `入口キーパッドに暗証番号を入力して解錠してください。`;

  await pushAndLog(r.customerId, r.customer.lineUserId, "passcode", text);
}

/** 開始60分前リマインド + コード再掲(平文は保持していないため案内のみ)。 */
export async function sendReminder(reservationId: number): Promise<void> {
  const r = await loadReservationWithCustomer(reservationId);
  if (!r) {
    logger.warn("sendReminder: reservation not found", { reservationId });
    return;
  }
  const text =
    `【${r.store.name}】まもなくご予約のお時間です。\n` +
    `開始: ${fmtJst(r.startAt)}\n` +
    `入室は発行済みの暗証番号をキーパッドに入力してください。`;

  await pushAndLog(r.customerId, r.customer.lineUserId, "reminder", text);
}

/** 終了後のお礼 + 次回予約導線。 */
export async function sendThanks(reservationId: number): Promise<void> {
  const r = await loadReservationWithCustomer(reservationId);
  if (!r) {
    logger.warn("sendThanks: reservation not found", { reservationId });
    return;
  }
  const text =
    `【${r.store.name}】本日はご利用ありがとうございました。\n` +
    `またのご予約をお待ちしております。\n` +
    `次回のご予約はこちら: ${config.app.baseUrl}`;

  await pushAndLog(r.customerId, r.customer.lineUserId, "thanks", text);
}

/** 管理者へアラート通知 (createKey失敗/タスク連続失敗など)。設定が無ければ何もしない。 */
export async function notifyAdmin(message: string): Promise<void> {
  const adminUserId = config.ops.adminAlertLineUserId;
  if (!adminUserId) {
    logger.warn("notifyAdmin: ADMIN_ALERT_LINE_USER_ID not set", { message });
    return;
  }
  try {
    await getServices().line.push(adminUserId, [
      { type: "text", text: `[管理通知] ${message}` },
    ]);
  } catch (e) {
    logger.error("notifyAdmin push failed", { error: String(e) });
  }
}
