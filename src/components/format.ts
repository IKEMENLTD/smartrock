// 表示用フォーマッタ (日本語 / Asia/Tokyo)

const tz = "Asia/Tokyo";

export function formatYen(amount?: number | null): string {
  if (amount == null) return "—";
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(d);
}

// YYYY-MM-DD (Asia/Tokyo) を返す。input[type=date] / API クエリ用。
export function toDateInput(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA は YYYY-MM-DD
}

export function addDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}
