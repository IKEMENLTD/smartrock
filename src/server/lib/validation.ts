// 入力バリデーション (zod) (design-docs/23)

import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください");

/** API-001 空き枠検索クエリ */
export const availabilityQuerySchema = z
  .object({
    storeId: z.coerce.number().int().positive(),
    menuId: z.coerce.number().int().positive(),
    from: dateOnly,
    to: dateOnly,
  })
  .refine(
    (v) => {
      const from = Date.parse(`${v.from}T00:00:00+09:00`);
      const to = Date.parse(`${v.to}T00:00:00+09:00`);
      if (Number.isNaN(from) || Number.isNaN(to)) return false;
      return to >= from;
    },
    { message: "to は from 以降の日付を指定してください" },
  )
  .refine(
    (v) => {
      const from = Date.parse(`${v.from}T00:00:00+09:00`);
      const to = Date.parse(`${v.to}T00:00:00+09:00`);
      const days = (to - from) / 86_400_000;
      return days <= 31;
    },
    { message: "期間は最大31日までです" },
  );

/** API-002 予約作成ボディ */
export const createReservationSchema = z.object({
  storeId: z.number().int().positive(),
  menuId: z.number().int().positive(),
  boothId: z.number().int().positive(),
  startAt: z.string().min(1, "startAt は必須です"),
  agreeTerms: z.boolean(),
});

/** ページネーション共通 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** API-008 決済チェックアウト */
export const checkoutSchema = z.object({
  reservationId: z.number().int().positive(),
});
