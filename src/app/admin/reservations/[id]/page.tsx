"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthGuard } from "../../_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "../../_lib/PageState";
import { Button } from "@/components/Button";
import { Card, CardTitle } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatYen } from "@/components/format";

interface ReservationDetail {
  id: number;
  status: string;
  paymentStatus?: string;
  startAt: string;
  endAt?: string;
  storeName?: string;
  menuName?: string;
  menuPrice?: number;
  customerName?: string;
  customerLineId?: string;
  passcode?: {
    status?: string;
    code?: string;
    validFrom?: string;
    validTo?: string;
  } | null;
}

export default function ReservationDetailPage() {
  const authStatus = useAuthGuard();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("予約詳細の取得に失敗しました。");
      setData((await res.json()) as ReservationDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (authStatus === "authenticated") void load();
  }, [authStatus, load]);

  async function reissuePasscode() {
    if (!id || busy) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${id}/reissue-passcode`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("パスコードの再発行に失敗しました。");
      setActionMsg("パスコードを再発行しました。LINEへ再通知されます。");
      await load();
    } catch (e) {
      setActionMsg(
        e instanceof Error ? e.message : "再発行処理に失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation() {
    if (!id || busy) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/reservations/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const msg =
          res.status === 403
            ? "キャンセル期限を過ぎています。"
            : res.status === 409
              ? "この予約は既にキャンセル済み、または完了しています。"
              : "キャンセル処理に失敗しました。";
        throw new Error(msg);
      }
      setShowCancel(false);
      setActionMsg("予約をキャンセルしました。");
      await load();
    } catch (e) {
      setActionMsg(
        e instanceof Error ? e.message : "キャンセル処理に失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  }

  if (authStatus !== "authenticated") return <AuthGate status={authStatus} />;

  const active =
    data && (data.status === "confirmed" || data.status === "pending");

  return (
    <div>
      <PageHeader
        title={`予約 #${id}`}
        action={
          <Button variant="ghost" onClick={() => router.push("/admin/reservations")}>
            ← 一覧へ
          </Button>
        }
      />

      {error && <ErrorCard message={error} />}
      {actionMsg && (
        <Card className="mb-4 border-brand/30 bg-brand/5 text-sm text-brand-dark">
          {actionMsg}
        </Card>
      )}

      {loading ? (
        <div className="py-20">
          <Spinner label="読み込み中..." />
        </div>
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-3">
            <CardTitle>予約情報</CardTitle>
            <Row label="状態" value={<StatusBadge status={data.status} />} />
            <Row
              label="決済"
              value={
                data.paymentStatus ? (
                  <StatusBadge status={data.paymentStatus} />
                ) : (
                  "—"
                )
              }
            />
            <Row label="店舗" value={data.storeName ?? "—"} />
            <Row label="メニュー" value={data.menuName ?? "—"} />
            <Row label="料金" value={formatYen(data.menuPrice)} />
            <Row label="開始" value={formatDateTime(data.startAt)} />
            <Row label="終了" value={formatDateTime(data.endAt)} />
            <Row label="顧客" value={data.customerName ?? "—"} />
          </Card>

          <Card className="space-y-3">
            <CardTitle>パスコード</CardTitle>
            {data.passcode ? (
              <>
                <Row
                  label="状態"
                  value={<StatusBadge status={data.passcode.status ?? "pending"} />}
                />
                <Row
                  label="コード"
                  value={data.passcode.code ?? "（未発行・非表示）"}
                />
                <Row
                  label="有効開始"
                  value={formatDateTime(data.passcode.validFrom)}
                />
                <Row
                  label="有効終了"
                  value={formatDateTime(data.passcode.validTo)}
                />
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                パスコードはまだ発行されていません。
              </p>
            )}

            <div className="space-y-2 pt-2">
              <Button
                fullWidth
                disabled={busy || !active}
                onClick={reissuePasscode}
              >
                パスコードを再発行
              </Button>
              <Button
                fullWidth
                variant="danger"
                disabled={busy || !active}
                onClick={() => setShowCancel(true)}
              >
                予約をキャンセル
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {showCancel && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold text-brand-dark">
              予約をキャンセルしますか？
            </h2>
            <p className="text-sm text-neutral-600">
              この操作は取り消せません。パスコードの削除・カレンダー削除も行われます。
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                disabled={busy}
                onClick={() => setShowCancel(false)}
              >
                戻る
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={busy}
                onClick={cancelReservation}
              >
                {busy ? "処理中..." : "キャンセルする"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}
