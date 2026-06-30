"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// 管理ページ共通: 未認証なら /admin/login へ誘導する。
// middleware が別途存在する場合でも二重防御として機能する。
export function useAuthGuard() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/admin/login");
    }
  }, [status, router]);

  return status; // "loading" | "authenticated" | "unauthenticated"
}
