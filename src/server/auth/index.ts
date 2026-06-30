// 管理セッションヘルパ (design-docs/23 管理系共通仕様)

import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./options";
import { DomainError } from "@/server/usecases/errors";

/** 現在の管理セッションを取得する (未認証は null)。 */
export async function getAdminSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

/**
 * API 用: 認証済み管理者の email/role を返す。
 * 未認証なら DomainError("unauthorized") を投げる (→ 401)。
 */
export async function requireAdminApi(): Promise<{ email: string; role: string }> {
  const session = await getAdminSession();
  const user = session?.user as { email?: string; role?: string } | undefined;
  if (!user?.email) {
    throw new DomainError("unauthorized", "認証が必要です");
  }
  return { email: user.email, role: user.role ?? "owner" };
}

/**
 * 画面 (Server Component) 用: 未認証なら /admin/login へリダイレクト。
 */
export async function requireAdminPage(): Promise<void> {
  const session = await getAdminSession();
  const user = session?.user as { email?: string } | undefined;
  if (!user?.email) {
    redirect("/admin/login");
  }
}
