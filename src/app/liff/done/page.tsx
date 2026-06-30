"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { closeLiff, isInClient } from "../_lib/liff";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

function DoneContent() {
  const params = useSearchParams();
  const id = params.get("id");

  return (
    <div className="space-y-6 py-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <span className="text-3xl text-emerald-600" aria-hidden="true">
          ✓
        </span>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-brand-dark">
          ご予約が完了しました
        </h1>
        {id && (
          <p className="text-xs text-neutral-400">予約番号: #{id}</p>
        )}
      </div>

      <Card className="space-y-2 text-left text-sm text-neutral-700">
        <p className="font-medium text-brand-dark">入室パスコードについて</p>
        <p>
          入室用のパスコードは、ご予約時間の少し前に
          <span className="font-medium">LINEのメッセージ</span>でお届けします。
        </p>
        <p className="text-xs text-neutral-500">
          当日はそのパスコードでドアを解錠してご入室ください。
        </p>
      </Card>

      <div className="space-y-2">
        {isInClient() ? (
          <Button fullWidth onClick={() => closeLiff()}>
            LINEに戻る
          </Button>
        ) : (
          <a href="https://line.me/" className="block">
            <Button fullWidth>LINEに戻る</Button>
          </a>
        )}
        <a href="/liff/me" className="block">
          <Button fullWidth variant="secondary">
            予約一覧を見る
          </Button>
        </a>
      </div>
    </div>
  );
}

export default function DonePage() {
  return (
    <Suspense fallback={null}>
      <DoneContent />
    </Suspense>
  );
}
