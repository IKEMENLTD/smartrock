"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "../_lib/PageState";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { Table, type Column } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/components/format";

interface ReservationRow {
  id: number;
  startAt: string;
  menuName?: string;
  customerName?: string;
  status: string;
  paymentStatus?: string;
}

interface ListResponse {
  items: ReservationRow[];
  total: number;
  page: number;
}

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: "", label: "すべての状態" },
  { value: "pending", label: "保留" },
  { value: "confirmed", label: "確定" },
  { value: "done", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
  { value: "no_show", label: "未来店" },
];

export default function AdminReservationsPage() {
  const authStatus = useAuthGuard();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ReservationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { q: string; status: string; page: number }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(opts.page),
          limit: String(LIMIT),
        });
        if (opts.q) params.set("q", opts.q);
        if (opts.status) params.set("status", opts.status);
        const res = await fetch(`/api/admin/reservations?${params.toString()}`);
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("予約一覧の取得に失敗しました。");
        const data = (await res.json()) as ListResponse;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (authStatus === "authenticated") {
      void load({ q, status: statusFilter, page });
    }
    // q は検索ボタン押下時のみ反映するため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, statusFilter, page, load]);

  if (authStatus !== "authenticated") return <AuthGate status={authStatus} />;

  const columns: Column<ReservationRow>[] = [
    { key: "id", header: "ID", render: (r) => `#${r.id}` },
    { key: "startAt", header: "日時", render: (r) => formatDateTime(r.startAt) },
    { key: "menu", header: "メニュー", render: (r) => r.menuName ?? "—" },
    {
      key: "customer",
      header: "顧客",
      render: (r) => r.customerName ?? "—",
    },
    {
      key: "status",
      header: "状態",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "payment",
      header: "決済",
      render: (r) =>
        r.paymentStatus ? <StatusBadge status={r.paymentStatus} /> : "—",
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <PageHeader title="予約一覧" description={`全 ${total} 件`} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            void load({ q, status: statusFilter, page: 1 });
          }}
          className="flex items-end gap-2"
        >
          <div>
            <label className="block text-xs text-neutral-500">検索</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="顧客名・予約ID"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <Button type="submit" variant="secondary">
            検索
          </Button>
        </form>

        <div>
          <label className="block text-xs text-neutral-500">状態</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorCard message={error} />}

      {loading ? (
        <div className="py-20">
          <Spinner label="読み込み中..." />
        </div>
      ) : (
        <>
          <Table
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/admin/reservations/${r.id}`)}
            emptyMessage="該当する予約はありません"
          />

          <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              前へ
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              次へ
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
