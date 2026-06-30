// Google Calendar Service (design-docs/16 外部連携仕様, FR-007, NFR-006)
// サービスアカウント (JWT) で events.insert / events.delete / freebusy.query を行う。
// モジュール import 時に例外を投げない。auth / client は初回呼び出し時に遅延構築する。

import { google, type calendar_v3 } from "googleapis";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";
import { withRetry } from "@/server/lib/retry";
import type {
  BusyInterval,
  CalendarReservationInput,
  CalendarService,
} from "./types";

// 遅延初期化した calendar client をキャッシュ。
let cachedClient: calendar_v3.Calendar | null = null;

// config.google.saJson は JSON 文字列 (改行含む) を想定。パース失敗時は null。
function parseServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = config.google.saJson;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!json.client_email || !json.private_key) return null;
    return { client_email: json.client_email, private_key: json.private_key };
  } catch (err) {
    logger.warn("calendar SA json parse failed", { err: String(err) });
    return null;
  }
}

// calendar client を取得 (未設定なら null)。
function getClient(): calendar_v3.Calendar | null {
  if (cachedClient) return cachedClient;
  const sa = parseServiceAccount();
  if (!sa) return null;
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  cachedClient = google.calendar({ version: "v3", auth });
  return cachedClient;
}

export const calendarService: CalendarService = {
  // design-docs/16: events.insert で確定予約をミラー。返り値は event id。
  async insertEvent(
    calendarId: string,
    reservation: CalendarReservationInput,
  ): Promise<string> {
    const cal = getClient();
    if (!cal) throw new Error("calendar service account not configured");
    logger.info("calendar insertEvent", { calendarId, summary: reservation.summary });
    const res = await withRetry(
      () =>
        cal.events.insert({
          calendarId,
          requestBody: {
            summary: reservation.summary,
            description: reservation.description,
            start: { dateTime: reservation.startAt.toISOString(), timeZone: reservation.timezone },
            end: { dateTime: reservation.endAt.toISOString(), timeZone: reservation.timezone },
          },
        }),
      {
        onRetry: (attempt, err) =>
          logger.warn("calendar insertEvent retry", { calendarId, attempt, err: String(err) }),
      },
    );
    const id = res.data.id;
    if (!id) throw new Error("calendar insertEvent: missing event id");
    logger.info("calendar insertEvent ok", { calendarId, eventId: id });
    return id;
  },

  // design-docs/16: events.delete で取消を反映。
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const cal = getClient();
    if (!cal) throw new Error("calendar service account not configured");
    logger.info("calendar deleteEvent", { calendarId, eventId });
    await withRetry(
      () => cal.events.delete({ calendarId, eventId }),
      {
        onRetry: (attempt, err) =>
          logger.warn("calendar deleteEvent retry", { calendarId, eventId, attempt, err: String(err) }),
      },
    );
  },

  // design-docs/16 / FR-007: 手動ブロック含む busy 区間を取得。
  // env 未設定や calendarId 空なら空配列を返す (throw しない)。
  async getBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    if (!calendarId) return [];
    const cal = getClient();
    if (!cal) return [];
    try {
      const res = await withRetry(() =>
        cal.freebusy.query({
          requestBody: {
            timeMin: from.toISOString(),
            timeMax: to.toISOString(),
            items: [{ id: calendarId }],
          },
        }),
      );
      const cals = res.data.calendars ?? {};
      const busyRaw = cals[calendarId]?.busy ?? [];
      const intervals: BusyInterval[] = [];
      for (const b of busyRaw) {
        if (b.start && b.end) {
          intervals.push({ start: new Date(b.start), end: new Date(b.end) });
        }
      }
      logger.info("calendar getBusy", { calendarId, count: intervals.length });
      return intervals;
    } catch (err) {
      logger.warn("calendar getBusy failed", { calendarId, err: String(err) });
      return [];
    }
  },
};
