"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "../_lib/PageState";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { Table, type Column } from "@/components/Table";
import { formatDateTime, toDateInput, addDays } from "@/components/format";

interface AccessLog {
  id: number;
  occurredAt: string;
  deviceName?: string;
  action?: string; // lock / unlock
  reservationId?: number | null;
}

interface ListResponse {
  items: AccessLog[];
  total: number;
  page: number;
}

const LIMIT = 50;

export default function AccessLogsPage() {
  const authStatus = useAuthGuard();
  const router = useRouter();

  const today = toDateInput(new Date());
  const [from, setFrom] = useState(() => addDays(today, -7));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
      });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return params;
    },
    [from, to],
  );

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/access-logs?${buildParams(p).toString()}`,
        );
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("入退室ログの取得に失敗しました。");
        const data = (await res.json()) as ListResponse;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
      } finally {
        setLoading(false);
      }
    },
    [buildParams, router],
  );

  useEffect(() => {
    if (authStatus === "authenticated") void load(page);
  }, [authStatus, page, load]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      // 全件CSV: ページングを外して大きめlimit、Accept: text/csv
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(
        `/api/admin/access-logs?${params.toString()}`,
        { headers: { Accept: "text/csv" } },
      );
      if (!res.ok) throw new Error("CSVのエクスポートに失敗しました。");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `access-logs_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV出力に失敗しました。");
    } finally {
      setExporting(false);
    }
  }

  if (authStatus !== "authenticated") return <AuthGate status={authStatus} />;

  const columns: Column<AccessLog>[] = [
    {
      key: "occurredAt",
      header: "発生時刻",
      render: (l) => formatDateTime(l.occurredAt),
    },
    { key: "device", header: "デバイス", render: (l) => l.deviceName ?? "—" },
    {
      key: "action",
      header: "操作",
      render: (l) =>
        l.action === "unlock"
          ? "解錠"
          : l.action === "lock"
            ? "施錠"
            : (l.action ?? "—"),
    },
    {
      key: "reservation",
      header: "予約",
      render: (l) =>
        l.reservationId ? (
          <a
            href={`/admin/reservations/${l.reservationId}`}
            className="text-brand underline"
          >
            #{l.reservationId}
          </a>
        ) : (
          "—"
        ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <PageHeader
        title="入退室ログ"
        description={`全 ${total} 件`}
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={exporting}>
            {exporting ? "出力中..." : "CSVエクスポート"}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-neutral-500">開始日</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">終了日</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            void load(1);
          }}
        >
          検索
        </Button>
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
            rowKey={(l) => l.id}
            emptyMessage="該当するログはありません"
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
