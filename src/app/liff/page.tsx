"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initLiff } from "./_lib/liff";
import { saveDraft, type ReservationDraft } from "./_lib/draft";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { formatYen } from "@/components/format";

interface Store {
  id: number;
  name: string;
}

interface Menu {
  id: number;
  name: string;
  price?: number;
  durationMin?: number;
  description?: string;
}

interface LiffConfig {
  liffId?: string;
  stores?: Store[];
  menus?: Menu[];
}

// メニュー一覧取得APIが無い場合のフォールバック (storeId=1)。
const FALLBACK_STORES: Store[] = [{ id: 1, name: "Étoile Beauty 本店" }];
const FALLBACK_MENUS: Menu[] = [
  {
    id: 1,
    name: "全身脱毛 (60分)",
    price: 6000,
    durationMin: 60,
    description: "全身まるごとセルフ脱毛コース",
  },
  {
    id: 2,
    name: "上半身脱毛 (45分)",
    price: 4500,
    durationMin: 45,
    description: "腕・脇・背中など上半身",
  },
  {
    id: 3,
    name: "VIO脱毛 (30分)",
    price: 3500,
    durationMin: 30,
    description: "デリケートゾーン専用コース",
  },
];

export default function EntryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>(FALLBACK_STORES);
  const [menus, setMenus] = useState<Menu[]>(FALLBACK_MENUS);
  const [storeId, setStoreId] = useState<number>(FALLBACK_STORES[0].id);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // LIFF初期化 (未ログインならログインへリダイレクト)
        await initLiff();
        // メニュー/店舗は LIFF config に含まれていれば利用、なければフォールバック
        const res = await fetch("/api/liff/config");
        if (res.ok) {
          const cfg = (await res.json()) as LiffConfig;
          if (!cancelled) {
            if (cfg.stores && cfg.stores.length > 0) {
              setStores(cfg.stores);
              setStoreId(cfg.stores[0].id);
            }
            if (cfg.menus && cfg.menus.length > 0) setMenus(cfg.menus);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "初期化に失敗しました。LINEアプリから開き直してください。",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleNext() {
    if (!selectedMenu) return;
    const store = stores.find((s) => s.id === storeId);
    const draft: ReservationDraft = {
      storeId,
      storeName: store?.name,
      menuId: selectedMenu.id,
      menuName: selectedMenu.name,
      menuPrice: selectedMenu.price,
      menuDurationMin: selectedMenu.durationMin,
    };
    saveDraft(draft);
    router.push("/liff/slots");
  }

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-bold text-brand-dark">ご予約</h1>
        <p className="text-xs text-neutral-500">
          店舗とメニューを選んでください
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      )}

      {stores.length > 1 && (
        <div className="space-y-2">
          <label
            htmlFor="store"
            className="block text-sm font-medium text-neutral-700"
          >
            店舗
          </label>
          <select
            id="store"
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium text-neutral-700">メニュー</p>
        <ul className="space-y-3">
          {menus.map((m) => {
            const active = selectedMenu?.id === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedMenu(m)}
                  aria-pressed={active}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? "border-brand bg-brand/5 ring-1 ring-brand"
                      : "border-neutral-200 bg-white hover:border-brand/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900">{m.name}</p>
                      {m.description && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {m.description}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-brand-dark">
                      {formatYen(m.price)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Button fullWidth disabled={!selectedMenu} onClick={handleNext}>
        空き枠を見る
      </Button>

      <div className="text-center">
        <a href="/liff/me" className="text-xs text-brand underline">
          予約の確認・キャンセルはこちら
        </a>
      </div>
    </div>
  );
}
