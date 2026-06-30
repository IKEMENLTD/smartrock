"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "../_lib/PageState";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { formatDateTime } from "@/components/format";

interface Device {
  id: number | string;
  name: string;
  kind?: string; // lock / keypad / hub / camera
  online?: boolean;
  battery?: number | null;
  lastSeenAt?: string | null;
  warning?: boolean;
  warningMessage?: string;
}

const KIND_LABEL: Record<string, string> = {
  lock: "スマートロック",
  keypad: "キーパッド",
  hub: "ハブ",
  camera: "カメラ",
};

export default function DevicesPage() {
  const authStatus = useAuthGuard();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/devices");
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("デバイス状態の取得に失敗しました。");
      const data = (await res.json()) as { items?: Device[] } | Device[];
      setDevices(Array.isArray(data) ? data : (data.items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authStatus === "authenticated") void load();
  }, [authStatus, load]);

  if (authStatus !== "authenticated") return <AuthGate status={authStatus} />;

  return (
    <div>
      <PageHeader
        title="デバイス状態"
        action={
          <Button variant="secondary" onClick={load} disabled={loading}>
            更新
          </Button>
        }
      />

      {error && <ErrorCard message={error} />}

      {loading ? (
        <div className="py-20">
          <Spinner label="読み込み中..." />
        </div>
      ) : devices.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">
          登録されたデバイスがありません。
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const lowBattery = d.battery != null && d.battery <= 20;
            const warn = d.warning || d.online === false || lowBattery;
            return (
              <Card
                key={d.id}
                className={warn ? "border-amber-300 bg-amber-50" : undefined}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">{d.name}</p>
                    <p className="text-xs text-neutral-500">
                      {d.kind ? (KIND_LABEL[d.kind] ?? d.kind) : "—"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.online === false
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {d.online === false ? "オフライン" : "オンライン"}
                  </span>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">電池</dt>
                    <dd
                      className={
                        lowBattery
                          ? "font-semibold text-amber-700"
                          : "text-neutral-800"
                      }
                    >
                      {d.battery != null ? `${d.battery}%` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">最終応答</dt>
                    <dd className="text-neutral-800">
                      {formatDateTime(d.lastSeenAt)}
                    </dd>
                  </div>
                </dl>

                {warn && (
                  <p className="mt-3 rounded-md bg-amber-100 px-2 py-1.5 text-xs text-amber-800">
                    {d.warningMessage ??
                      (d.online === false
                        ? "応答がありません。確認してください。"
                        : lowBattery
                          ? "電池残量が低下しています。交換をご検討ください。"
                          : "警告があります。")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
