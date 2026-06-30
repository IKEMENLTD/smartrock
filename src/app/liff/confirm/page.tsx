"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdToken } from "../_lib/liff";
import { clearDraft, loadDraft, type ReservationDraft } from "../_lib/draft";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { formatDateTime, formatYen } from "@/components/format";

interface CreateReservationResponse {
  id: number;
  status: string;
  startAt: string;
  needsPayment?: boolean;
}

interface CheckoutResponse {
  url?: string;
}

// design-docs/26 のエラー文言
function messageForStatus(status: number): string {
  switch (status) {
    case 409:
      return "この枠は埋まりました。別の時間をお選びください。";
    case 422:
      return "ご利用規約への同意が必要です。";
    case 401:
      return "ログイン情報が確認できませんでした。LINEから開き直してください。";
    case 400:
      return "入力内容を確認してください。";
    default:
      return "予約処理に失敗しました。時間をおいて再度お試しください。";
  }
}

export default function ConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    if (!d || !d.startAt || !d.boothId) {
      router.replace("/liff");
      return;
    }
    setDraft(d);
  }, [router]);

  async function handleConfirm() {
    if (!draft || !agree || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          storeId: draft.storeId,
          menuId: draft.menuId,
          boothId: draft.boothId,
          startAt: draft.startAt,
          agreeTerms: agree,
        }),
      });

      if (!res.ok) {
        setError(messageForStatus(res.status));
        setSubmitting(false);
        return;
      }

      const data = (await res.json()) as CreateReservationResponse;

      if (data.needsPayment) {
        // Stripe Checkout セッション作成 → リダイレクト
        const payRes = await fetch("/api/payments/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ reservationId: data.id }),
        });
        if (!payRes.ok) {
          setError("お支払い画面の準備に失敗しました。マイ予約からお支払いください。");
          setSubmitting(false);
          return;
        }
        const pay = (await payRes.json()) as CheckoutResponse;
        if (pay.url) {
          window.location.href = pay.url;
          return;
        }
        setError("お支払いURLを取得できませんでした。");
        setSubmitting(false);
        return;
      }

      // 決済不要 → 完了画面へ
      clearDraft();
      router.push(`/liff/done?id=${data.id}`);
    } catch {
      setError("通信エラーが発生しました。電波の良い場所で再度お試しください。");
      setSubmitting(false);
    }
  }

  if (!draft) {
    return (
      <div className="py-20">
        <Spinner label="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-brand-dark">予約内容の確認</h1>

      <Card className="space-y-3">
        <Row label="店舗" value={draft.storeName ?? `店舗 #${draft.storeId}`} />
        <Row label="メニュー" value={draft.menuName ?? `メニュー #${draft.menuId}`} />
        <Row label="日時" value={formatDateTime(draft.startAt)} />
        {draft.menuDurationMin != null && (
          <Row label="所要時間" value={`約${draft.menuDurationMin}分`} />
        )}
        <Row label="料金" value={formatYen(draft.menuPrice)} />
      </Card>

      <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-neutral-300 text-brand focus:ring-brand"
        />
        <span className="text-sm text-neutral-700">
          <a href="/terms" className="text-brand underline">
            ご利用規約
          </a>
          に同意します
        </span>
      </label>

      {error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      )}

      <Button
        fullWidth
        disabled={!agree || submitting}
        onClick={handleConfirm}
      >
        {submitting ? "処理中..." : "この内容で予約する"}
      </Button>

      <Button variant="ghost" onClick={() => router.push("/liff/slots")}>
        ← 空き枠選択へ戻る
      </Button>
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
