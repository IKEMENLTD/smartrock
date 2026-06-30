"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "./_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "./_lib/PageState";
import { Button } from "@/components/Button";
import { Card, CardTitle } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { formatTime } from "@/components/format";

interface DashboardData {
  kpis?: {
    todayReservations?: number;
    pendingReservations?: number;
    activeNow?: number;
    deviceWarnings?: number;
  };
  todayReservations?: {
    id: number;
    startAt: string;
    menuName?: string;
    customerName?: string;
    status: string;
  }[];
  alerts?: { id: string | number; level?: string; message: string }[];
}

export default function DashboardPage() {
  const status = useAuthGuard();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("ダッシュボードの取得に失敗しました。");
      setData((await res.json()) as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status !== "authenticated") return <AuthGate status={status} />;

  const kpis = data?.kpis ?? {};

  return (
    <div>
      <PageHeader
        title="ダッシュボード"
        action={
          <Button variant="secondary" onClick={load} disabled={loading}>
            更新
          </Button>
        }
      />

      {error && <ErrorCard message={error} />}

      {loading && !data ? (
        <div className="py-20">
          <Spinner label="読み込み中..." />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="本日の予約" value={kpis.todayReservations} />
            <Kpi label="保留中" value={kpis.pendingReservations} />
            <Kpi label="現在入室中" value={kpis.activeNow} />
            <Kpi
              label="デバイス警告"
              value={kpis.deviceWarnings}
              warn={(kpis.deviceWarnings ?? 0) > 0}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle className="mb-3">本日の予約</CardTitle>
              {data?.todayReservations && data.todayReservations.length > 0 ? (
                <ul className="divide-y divide-neutral-100">
                  {data.todayReservations.map((r) => (
                    <li
                      key={r.id}
                      className="flex cursor-pointer items-center justify-between gap-3 py-2.5 hover:bg-brand/5"
                      onClick={() =>
                        router.push(`/admin/reservations/${r.id}`)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-neutral-800">
                          {formatTime(r.startAt)}
                        </span>
                        <span className="text-sm text-neutral-600">
                          {r.menuName ?? "—"}
                        </span>
                        {r.customerName && (
                          <span className="text-xs text-neutral-400">
                            {r.customerName}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-neutral-400">
                  本日の予約はありません。
                </p>
              )}
            </Card>

            <Card>
              <CardTitle className="mb-3">警告</CardTitle>
              {data?.alerts && data.alerts.length > 0 ? (
                <ul className="space-y-2">
                  {data.alerts.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    >
                      {a.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-neutral-400">
                  警告はありません。
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  warn,
}: {
  label: string;
  value?: number;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-300 bg-amber-50" : undefined}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          warn ? "text-amber-700" : "text-brand-dark"
        }`}
      >
        {value ?? "—"}
      </p>
    </Card>
  );
}
