// API 共通の HTTP ヘルパ (design-docs/23, 26)
// DomainError.code → HTTP ステータス変換、ZodError → 400。

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/server/usecases/errors";

/** 成功レスポンス */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** エラーレスポンス */
export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * DomainError.code → HTTP ステータス。
 *   terms_required   -> 422
 *   slot_full        -> 409
 *   cancel_deadline  -> 403
 *   not_found        -> 404
 *   unauthorized     -> 401
 *   forbidden        -> 403
 *   validation       -> 400
 *   already_finalized-> 409
 *   invalid_request  -> 400
 *   その他           -> 500
 */
export function domainErrorStatus(code: string): number {
  switch (code) {
    case "terms_required":
      return 422;
    case "slot_full":
      return 409;
    case "already_finalized":
      return 409;
    case "cancel_deadline":
      return 403;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "unauthorized":
      return 401;
    case "validation":
      return 400;
    case "invalid_request":
      return 400;
    default:
      return 500;
  }
}

/**
 * 任意の例外を NextResponse へ変換する。
 * - DomainError → code に応じたステータス
 * - ZodError → 400 (validation)
 * - その他 → 500 (内部エラー。詳細は隠蔽)
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof DomainError) {
    return fail(err.code, err.message, domainErrorStatus(err.code));
  }
  if (err instanceof ZodError) {
    return fail("validation", err.issues.map((i) => i.message).join(", "), 400);
  }
  // 認証系は DomainError("unauthorized") で投げられる想定だが、
  // code フィールドを持つ任意のオブジェクトもマップする。
  if (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
  ) {
    const code = (err as { code: string }).code;
    const message =
      "message" in err && typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "エラーが発生しました";
    return fail(code, message, domainErrorStatus(code));
  }
  return fail("internal_error", "内部エラーが発生しました", 500);
}
