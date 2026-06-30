# sds — 無人セルフ脱毛サロン 予約・入退室管理システム

Étoile Beauty 合同会社の完全無人セルフ脱毛サロン向け。**公式LINEで予約 → 予約時間だけ有効な解錠パスコードを自動発行 → SwitchBot キーパッドで入退室**までを自動化する。スタッフ常駐なし・スマートロック月額ゼロ運営を目指す。

設計の正本は [`design-docs/`](./design-docs/)（要件定義〜詳細設計〜テスト設計を全シートmd化）。実装時の判断・既定値は [`IMPLEMENTATION_NOTES.md`](./IMPLEMENTATION_NOTES.md)。

## 全体像

```
[顧客のLINE/LIFF] ─▶ [web: Next.js API] ◀─▶ [postgres]
                            ├─▶ Google Calendar (予約ミラー / 手動ブロック取得)
                            ├─▶ SwitchBot API   (createKey / deleteKey / 施解錠)
                            ├─▶ LINE Messaging  (パスコード/リマインド/お礼 push)
                            └─▶ Stripe (任意)
[worker: node-cron(1min)] ─poll▶ [scheduled_tasks] ─▶ 時限でパスコード発行/失効/通知
[SwitchBot Cloud] ─webhook▶ [/api/webhooks/switchbot] ─▶ passcode.key_id後埋め / 入退室ログ
[Tapo C320WS/C225] ─RTSP▶ [Frigate NVR] (入口のみ録画・施術エリア非撮影)
```

## 技術スタック

- **Next.js 14 (App Router) + TypeScript + Tailwind** … 顧客LIFF・管理画面・API を1リポジトリで
- **PostgreSQL 16 + Prisma** … 予約/パスコード/ログ/タスク
- **worker (node-cron + scheduled_tasks)** … 時限ジョブを DB 永続キューで堅牢に
- **Auth.js (NextAuth)** … 管理者認証。顧客は LINE LIFF idToken
- 外部: **LINE Messaging+LIFF / Google Calendar(SA) / SwitchBot API v1.1 / Stripe(任意) / Frigate**

## ディレクトリ

```
design-docs/            設計書(md)
prisma/                 schema.prisma(TBL-001〜014) + seed.ts
src/
  app/
    liff/               顧客LIFF画面 SC-001〜005
    admin/              管理画面 SC-101〜107
    api/                Route Handlers API-001〜017 + webhooks
  server/
    services/           外部連携(差し替え可能 / registry経由)
    usecases/           業務ロジック F-001〜012
    scheduler/          worker + handlers
    auth/               Auth.js + LIFF idToken検証
    lib/                prisma/config/logger/hmac/idempotency/retry/http
  types/
tests/                  Vitest (TC-001〜020)
frigate/                NVR設定例
docker-compose.yml      web / worker / postgres / frigate
```

## セットアップ

```bash
cp .env.example .env        # design-docs/27 の変数を設定
docker compose up -d postgres
npm install
npx prisma migrate deploy   # or: npm run prisma:migrate
npm run seed                # 店舗/営業時間/メニュー/管理者
npm run dev                 # web (http://localhost:3000)
npm run worker              # scheduler (別プロセス)
```

LINE/SwitchBot の webhook URL を `APP_BASE_URL/api/webhooks/*` に登録（SwitchBot は setupWebhook）。

### 主要エンドポイント

| | |
|---|---|
| 顧客LIFF | `/liff`（エントリ→`/liff/slots`→`/liff/confirm`→`/liff/done`、`/liff/me`） |
| 管理画面 | `/admin`（`/admin/login` でログイン） |
| Webhook | `/api/webhooks/{line,stripe,switchbot}` |

## テスト / 完了の定義

```bash
npm test          # Vitest (要: テスト用Postgres + .env.test)
npm run typecheck # tsc --noEmit
npm run build     # next build
```

完了の定義(DoD)= design-docs/31 の TC（優先度『高』必須）が pass し、typecheck/build が通ること。

## SwitchBot 連携の肝（必読の落とし穴 / design-docs/16,25）

1. `createKey` は**非同期**。同期応答に passcode id が無く、id は **createKey 結果 webhook** でのみ取得 → `passcodes.switchbot_key_id` に後埋め（無いと `deleteKey` 不可）。
2. 施解錠 webhook は解錠者を特定できない → 予約時間帯から **推定紐付け**、本人証跡は入口カメラ録画で補完。
3. パスコードはキーパッドにローカル保存 → **通信断でも解錠可（締め出し回避 / NFR-001）**。反面、終了済コードの `deleteKey` クリーンアップを確実に回す。
