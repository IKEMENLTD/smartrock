import Script from "next/script";

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* LIFF SDK を CDN から読み込み (window.liff) */}
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="beforeInteractive"
      />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-neutral-50">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
          <p className="text-center text-sm font-semibold tracking-wide text-brand-dark">
            Étoile Beauty
          </p>
        </header>
        <main className="flex-1 px-4 py-5">{children}</main>
        <footer className="px-4 py-4 text-center text-[11px] text-neutral-400">
          無人セルフ脱毛サロン 予約システム
        </footer>
      </div>
    </>
  );
}
