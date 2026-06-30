"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadDraft, saveDraft, type ReservationDraft } from "../_lib/draft";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { addDays, formatTime, toDateInput } from "@/components/format";
import type { Slot } from "@/types/domain";

export default function SlotsPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [date, setDate] = useState<string>(() => toDateInput(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ドラフトが無ければエントリへ戻す
  useEffect(() => {
    const d = loadDraft();
    if (!d || !d.menuId) {
      router.replace("/liff");
      return;
    }
    setDraft(d);
  }, [router]);

  const fetchSlots = useCallback(
    async (d: ReservationDraft, day: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          storeId: String(d.storeId),
          menuId: String(d.menuId),
          from: day,
          to: day,
        });
        const res = await fetch(`/api/availability?${params.toString()}`);
        if (!res.ok) {
          throw new Error(
            "空き枠を取得できませんでした。時間をおいて再度お試しください。",
          );
        }
        const data = (await res.json()) as { slots: Slot[] };
        setSlots(data.slots ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
        setSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (draft) void fetchSlots(draft, date);
  }, [draft, date, fetchSlots]);

  function handleSelect(slot: Slot) {
    if (!draft) return;
    const next: ReservationDraft = {
      ...draft,
      boothId: slot.boothId,
      startAt: slot.startAt,
      endAt: slot.endAt,
    };
    saveDraft(next);
    router.push("/liff/confirm");
  }

  const today = toDateInput(new Date());
  const maxDate = addDays(today, 30);

  if (!draft) {
    return (
      <div className="py-20">
        <Spinner label="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-brand-dark">空き枠を選ぶ</h1>
        <p className="text-xs text-neutral-500">
          {draft.menuName ?? "メニュー"}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="date"
          className="block text-sm font-medium text-neutral-700"
        >
          ご希望日
        </label>
        <input
          id="date"
          type="date"
          value={date}
          min={today}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {loading ? (
        <div className="py-12">
          <Spinner label="空き枠を確認中..." />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      ) : slots.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">
          この日の空き枠はありません。別の日をお選びください。
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={`${slot.boothId}-${slot.startAt}`}
              type="button"
              onClick={() => handleSelect(slot)}
              className="rounded-lg border border-brand/40 bg-white py-3 text-sm font-medium text-brand-dark transition-colors hover:bg-brand hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {formatTime(slot.startAt)}
            </button>
          ))}
        </div>
      )}

      <Button variant="ghost" onClick={() => router.push("/liff")}>
        ← メニュー選択へ戻る
      </Button>
    </div>
  );
}
