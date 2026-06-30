// LIFF 認証 (design-docs/23 API-002,004,005)
// Authorization: Bearer <idToken> または body.idToken を検証し customerId を得る。

import { getServices } from "@/server/services/registry";
import { ensureCustomerByLineUserId } from "@/server/usecases/notify";
import { DomainError } from "@/server/usecases/errors";
import { logger } from "@/server/lib/logger";

function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/**
 * リクエストから idToken を取り出し検証 → 顧客を特定する。
 * - Authorization: Bearer <idToken> を優先。
 * - 任意で渡された body の idToken をフォールバックに使う。
 * 失敗時は DomainError("unauthorized") (→ 401)。
 */
export async function authenticateLiff(
  req: Request,
  bodyIdToken?: string,
): Promise<{ customerId: number; lineUserId: string }> {
  const idToken = extractBearer(req) ?? bodyIdToken ?? null;
  if (!idToken) {
    throw new DomainError("unauthorized", "認証トークンがありません");
  }

  try {
    const verified = await getServices().line.verifyIdToken(idToken);
    const customer = await ensureCustomerByLineUserId(
      verified.userId,
      verified.displayName,
    );
    return { customerId: customer.id, lineUserId: customer.lineUserId };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    logger.warn("authenticateLiff: verify failed", { error: String(e) });
    throw new DomainError("unauthorized", "認証に失敗しました");
  }
}
