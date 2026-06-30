export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">
        Étoile Beauty セルフ脱毛サロン
      </h1>
      <p className="text-neutral-600">
        ご予約は公式LINEから。空き枠の確認・予約・入室パスコードの受け取りまで
        LINE上で完結します。
      </p>
      <div className="flex flex-col gap-2 text-sm text-neutral-500">
        <a className="text-brand underline" href="/liff">
          予約画面 (LIFF) を開く
        </a>
        <a className="text-brand underline" href="/admin">
          管理画面
        </a>
      </div>
    </main>
  );
}
