"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../_lib/useAuthGuard";
import { AuthGate, ErrorCard, PageHeader } from "../_lib/PageState";
import { Button } from "@/components/Button";
import { Card, CardTitle } from "@/components/Card";
import { Spinner } from "@/components/Spinner";

interface BusinessHour {
  dayOfWeek: number; // 0=日 .. 6=土
  openTime: string; // HH:mm
  closeTime: string;
  closed?: boolean;
}

interface MenuItem {
  id?: number;
  name: string;
  price: number;
  durationMin: number;
  active?: boolean;
}

interface Settings {
  store: {
    id?: number;
    name: string;
    address?: string;
    phone?: string;
  };
  businessHours: BusinessHour[];
  menus: MenuItem[];
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function emptySettings(): Settings {
  return {
    store: { name: "", address: "", phone: "" },
    businessHours: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      openTime: "10:00",
      closeTime: "20:00",
      closed: i === 0,
    })),
    menus: [],
  };
}

export default function SettingsPage() {
  const authStatus = useAuthGuard();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(emptySettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("設定の取得に失敗しました。");
      const data = (await res.json()) as Partial<Settings>;
      const base = emptySettings();
      setSettings({
        store: { ...base.store, ...data.store },
        businessHours:
          data.businessHours && data.businessHours.length > 0
            ? data.businessHours
            : base.businessHours,
        menus: data.menus ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authStatus === "authenticated") void load();
  }, [authStatus, load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("設定の保存に失敗しました。");
      setSaveMsg("設定を保存しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  function updateStore(patch: Partial<Settings["store"]>) {
    setSettings((s) => ({ ...s, store: { ...s.store, ...patch } }));
  }

  function updateHour(idx: number, patch: Partial<BusinessHour>) {
    setSettings((s) => ({
      ...s,
      businessHours: s.businessHours.map((h, i) =>
        i === idx ? { ...h, ...patch } : h,
      ),
    }));
  }

  function updateMenu(idx: number, patch: Partial<MenuItem>) {
    setSettings((s) => ({
      ...s,
      menus: s.menus.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  }

  function addMenu() {
    setSettings((s) => ({
      ...s,
      menus: [
        ...s.menus,
        { name: "", price: 0, durationMin: 60, active: true },
      ],
    }));
  }

  function removeMenu(idx: number) {
    setSettings((s) => ({
      ...s,
      menus: s.menus.filter((_, i) => i !== idx),
    }));
  }

  if (authStatus !== "authenticated") return <AuthGate status={authStatus} />;

  return (
    <div>
      <PageHeader
        title="設定"
        description="店舗情報・営業時間・メニューを編集します"
        action={
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "保存中..." : "保存"}
          </Button>
        }
      />

      {error && <ErrorCard message={error} />}
      {saveMsg && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          {saveMsg}
        </Card>
      )}

      {loading ? (
        <div className="py-20">
          <Spinner label="読み込み中..." />
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="space-y-4">
            <CardTitle>店舗情報</CardTitle>
            <Field label="店舗名">
              <input
                value={settings.store.name}
                onChange={(e) => updateStore({ name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="住所">
              <input
                value={settings.store.address ?? ""}
                onChange={(e) => updateStore({ address: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="電話番号">
              <input
                value={settings.store.phone ?? ""}
                onChange={(e) => updateStore({ phone: e.target.value })}
                className={inputCls}
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <CardTitle>営業時間</CardTitle>
            <div className="space-y-2">
              {settings.businessHours.map((h, i) => (
                <div
                  key={h.dayOfWeek}
                  className="flex flex-wrap items-center gap-3"
                >
                  <span className="w-8 text-sm font-medium text-neutral-700">
                    {DOW[h.dayOfWeek]}
                  </span>
                  <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      checked={!h.closed}
                      onChange={(e) =>
                        updateHour(i, { closed: !e.target.checked })
                      }
                      className="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand"
                    />
                    営業
                  </label>
                  <input
                    type="time"
                    value={h.openTime}
                    disabled={h.closed}
                    onChange={(e) => updateHour(i, { openTime: e.target.value })}
                    className={`${inputCls} w-32 disabled:bg-neutral-100`}
                  />
                  <span className="text-neutral-400">〜</span>
                  <input
                    type="time"
                    value={h.closeTime}
                    disabled={h.closed}
                    onChange={(e) =>
                      updateHour(i, { closeTime: e.target.value })
                    }
                    className={`${inputCls} w-32 disabled:bg-neutral-100`}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle>メニュー</CardTitle>
              <Button variant="secondary" onClick={addMenu}>
                ＋ 追加
              </Button>
            </div>
            {settings.menus.length === 0 ? (
              <p className="text-sm text-neutral-400">
                メニューがありません。「追加」で作成してください。
              </p>
            ) : (
              <div className="space-y-3">
                {settings.menus.map((m, i) => (
                  <div
                    key={m.id ?? `new-${i}`}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-3"
                  >
                    <Field label="メニュー名" className="flex-1">
                      <input
                        value={m.name}
                        onChange={(e) => updateMenu(i, { name: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="料金(円)">
                      <input
                        type="number"
                        min={0}
                        value={m.price}
                        onChange={(e) =>
                          updateMenu(i, { price: Number(e.target.value) })
                        }
                        className={`${inputCls} w-28`}
                      />
                    </Field>
                    <Field label="所要(分)">
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={m.durationMin}
                        onChange={(e) =>
                          updateMenu(i, { durationMin: Number(e.target.value) })
                        }
                        className={`${inputCls} w-24`}
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      onClick={() => removeMenu(i)}
                      className="text-red-600"
                    >
                      削除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs text-neutral-500">{label}</label>
      {children}
    </div>
  );
}
