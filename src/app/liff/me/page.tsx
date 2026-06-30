"use client";

import { useCallback, useEffect, useState } from "react";
import { getIdToken, initLiff } from "../_lib/liff";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/components/format";

interface MyReservation {
  id: number;
  status: string;
  storeName?: string;
  menuName?: string;
  startAt: string;
  endAt?: string;
  paymentStatus?: string;
  canCancel?: boolean;
}

function cancelMessage(status: number): string {
  switch (status) {
    case 403:
      return "キャンセル期限を過ぎています。";
    case 409:
      return "この予約は既にキャンセル済み、または完了しています。";
    case 404:
      return "予約が見つかりませんでした。";
    default:
      return "キャンセル処理に失敗しました。時間をおいて再度お試しください。";
  }
}

export default function MePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [cancelTarget, setCancelTarget] = useState<MyReservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await initLiff();
      const idToken = await getIdToken();
      const res = await fetch("/api/me/reservations", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        throw new Error("予約一覧を取得できませんでした。");
      }
      const data = (await res.json()) as
        | { items?: MyReservation[] }
        | MyReservation[];
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setReservations(items);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "通信エラーが発生しました。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmCancel() {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch(
        `/api/reservations/${cancelTarget.id}/cancel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        },
      );
      if (!res.ok) {
        setCancelError(cancelMessage(res.status));
        setCancelling(false);
        return;
      }
      setCancelTarget(null);
      setCancelling(false);
      await load();
    } catch {
      setCancelError("通信エラーが発生しました。");
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-brand-dark">マイ予約</h1>
        <a href="/liff" className="text-xs text-brand underline">
          新規予約
        </a>
      </div>

      {loading ? (
        <div className="py-16">
          <Spinner label="読み込み中..." />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      ) : reservations.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">
          現在ご予約はありません。
        </Card>
      ) : (
        <ul className="space-y-3">
          {reservations.map((r) => {
            const cancellable =
              (r.canCancel ?? true) &&
              (r.status === "confirmed" || r.status === "pending");
            return (
              <li key={r.id}>
                <Card className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-neutral-900">
                        {r.menuName ?? `予約 #${r.id}`}
                      </p>
                      {r.storeName && (
                        <p className="text-xs text-neutral-500">
                          {r.storeName}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-neutral-700">
                    {formatDateTime(r.startAt)}
                  </p>
                  {cancellable && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCancelError(null);
                        setCancelTarget(r);
                      }}
                    >
                      キャンセル
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {cancelTarget && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold text-brand-dark">
              予約をキャンセルしますか？
            </h2>
            <div className="space-y-1 text-sm text-neutral-700">
              <p>{cancelTarget.menuName ?? `予約 #${cancelTarget.id}`}</p>
              <p>{formatDateTime(cancelTarget.startAt)}</p>
            </div>
            {cancelError && (
              <p className="text-sm text-red-600">{cancelError}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
              >
                戻る
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={cancelling}
                onClick={confirmCancel}
              >
                {cancelling ? "処理中..." : "キャンセルする"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
