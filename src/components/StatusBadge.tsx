const labels: Record<string, { text: string; className: string }> = {
  pending: { text: "保留", className: "bg-amber-100 text-amber-800" },
  confirmed: { text: "確定", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { text: "キャンセル", className: "bg-neutral-200 text-neutral-600" },
  done: { text: "完了", className: "bg-sky-100 text-sky-800" },
  no_show: { text: "未来店", className: "bg-red-100 text-red-700" },
  // payment
  none: { text: "決済なし", className: "bg-neutral-100 text-neutral-600" },
  unpaid: { text: "未払い", className: "bg-amber-100 text-amber-800" },
  paid: { text: "支払済", className: "bg-emerald-100 text-emerald-800" },
  refunded: { text: "返金済", className: "bg-neutral-200 text-neutral-600" },
};

export function StatusBadge({ status }: { status: string }) {
  const l = labels[status] ?? {
    text: status,
    className: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${l.className}`}
    >
      {l.text}
    </span>
  );
}

export default StatusBadge;
