import crypto from "node:crypto";

// HMAC-SHA256 ユーティリティ (design-docs/16, 17)
// - SwitchBot 認証署名生成
// - LINE / Stripe の webhook 署名検証

/**
 * SwitchBot API v1.1 の認証ヘッダ生成。
 * sign = Base64(HMAC-SHA256(secret, token + t + nonce))
 */
export function switchbotSign(
  token: string,
  secret: string,
  t: number,
  nonce: string,
): string {
  const data = `${token}${t}${nonce}`;
  return crypto
    .createHmac("sha256", secret)
    .update(data, "utf8")
    .digest("base64");
}

/** LINE x-line-signature 検証 (Base64(HMAC-SHA256(channelSecret, rawBody))) */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  return timingSafeEqual(expected, signature);
}

/** タイミング攻撃に強い文字列比較 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** 暗証番号など平文を保存しないためのハッシュ化 */
export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

/** N桁のランダム数字パスコード生成 (既定6桁 / AS-04) */
export function generateNumericCode(digits = 6): string {
  let out = "";
  for (let i = 0; i < digits; i++) {
    out += crypto.randomInt(0, 10).toString();
  }
  return out;
}
