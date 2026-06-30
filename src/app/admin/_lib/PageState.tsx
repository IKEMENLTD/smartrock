"use client";

import { Spinner } from "@/components/Spinner";
import { Card } from "@/components/Card";

// 認証ロード中 / 未認証時の共通表示。
export function AuthGate({
  status,
}: {
  status: "loading" | "authenticated" | "unauthenticated";
}) {
  if (status === "loading") {
    return (
      <div className="py-24">
        <Spinner label="読み込み中..." />
      </div>
    );
  }
  // unauthenticated: useAuthGuard がリダイレクト中
  return (
    <div className="py-24 text-center text-sm text-neutral-500">
      ログインが必要です。{" "}
      <a href="/admin/login" className="text-brand underline">
        ログイン画面へ
      </a>
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50 text-sm text-red-700">
      {message}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-brand-dark">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
