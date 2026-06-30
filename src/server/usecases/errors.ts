// UseCase 層の業務エラー (design-docs/26_エラーハンドリング.md)
// API 層はこの `code` を見て HTTP ステータスへ変換する。
//   terms_required   -> 422
//   slot_full        -> 409
//   cancel_deadline  -> 403
//   not_found        -> 404
//   forbidden        -> 403
//   already_finalized-> 409

export type DomainErrorCode =
  | "terms_required"
  | "slot_full"
  | "cancel_deadline"
  | "not_found"
  | "forbidden"
  | "already_finalized"
  | "invalid_request"
  | "unauthorized"
  | "validation";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
    // instanceof を TS のダウンレベル出力でも効かせる
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

/** Prisma の UNIQUE 制約違反(P2002)判定 (二重予約検知に使用) */
export function isUniqueViolation(e: unknown): boolean {
  return prismaCode(e) === "P2002";
}

/**
 * Serializable トランザクションのシリアライズ失敗(書き込み競合)判定。
 * P2034 = Transaction failed due to a write conflict or a deadlock。
 * 同時予約で両者が重複チェックを通過した場合に片方がこれで失敗する。
 */
export function isSerializationFailure(e: unknown): boolean {
  const code = prismaCode(e);
  return code === "P2034" || code === "40001";
}

function prismaCode(e: unknown): string | undefined {
  if (typeof e === "object" && e != null && "code" in e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}
