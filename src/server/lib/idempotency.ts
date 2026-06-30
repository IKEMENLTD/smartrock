import { prisma } from "./prisma";

// Webhook 冪等管理 (NFR-015 / design-docs/17)
// provider + event_id を webhook_events に UNIQUE 保存。重複は早期 return。

export type Provider = "line" | "stripe" | "switchbot";

/**
 * 初回イベントなら true を返し記録する。再送(重複)なら false。
 * UNIQUE 制約違反(P2002)を「既処理」とみなして冪等性を担保する。
 */
export async function markEventProcessed(
  provider: Provider,
  eventId: string,
  signatureVerified: boolean,
): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: { provider, eventId, signatureVerified },
    });
    return true;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return false;
    }
    throw e;
  }
}

export async function wasEventProcessed(
  provider: Provider,
  eventId: string,
): Promise<boolean> {
  const found = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider, eventId } },
  });
  return found != null;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e != null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
