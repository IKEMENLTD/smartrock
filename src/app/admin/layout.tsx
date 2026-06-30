"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const nav = [
  { href: "/admin", label: "ダッシュボード", exact: true },
  { href: "/admin/reservations", label: "予約" },
  { href: "/admin/access-logs", label: "入退室ログ" },
  { href: "/admin/devices", label: "デバイス" },
  { href: "/admin/settings", label: "設定" },
];

function SideNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <p className="text-base font-bold text-brand-dark">Étoile Admin</p>
        <p className="text-[11px] text-neutral-400">管理コンソール</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "text-neutral-700 hover:bg-brand/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-200 px-4 py-4 text-xs text-neutral-500">
        {session?.user?.email && (
          <p className="mb-2 truncate" title={session.user.email}>
            {session.user.email}
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="text-brand underline"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // ログイン画面はサイドナビ無しのシンプルレイアウト
  if (pathname === "/admin/login") {
    return <div className="min-h-screen bg-neutral-100">{children}</div>;
  }
  return (
    <div className="flex min-h-screen bg-neutral-100">
      <SideNav />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
