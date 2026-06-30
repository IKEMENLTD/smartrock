# 40_実装指示書_README

実装指示｜00_README 相当

Claude Codeが最初に読む入口

■ 0. これは何か

本スプレッドシート(設計書一式)に基づき 無人セルフ脱毛サロン 予約・入退室管理システム を実装するための指示。シート10で技術スタック、20でディレクトリ、22でDB、23でAPI、25でジョブ、31でテストを参照する。

■ 1. プロジェクト概要/スタック(確定)

・Next.js 14(App Router)+TypeScript+Tailwind / Node.js 20 / PostgreSQL 16 + Prisma / Auth.js / node-cron worker / Frigate(録画は別系統)。

・外部：LINE Messaging+LIFF, Google Calendar(サービスアカウント), SwitchBot API v1.1, Stripe(任意)。

■ 2. 設計書の読み順と役割

- シート | 役割 | 参照場面
- 01-07 要件 | What/Why/スコープ | 範囲確認
- 10-17 基本設計 | 全体構成・画面・データ・外部連携 | 構造把握(特に16外部連携)
- 20-27 詳細設計 | 実装の正本(API/DB/画面/ジョブ/環境変数) | 実装時
- 30-32 テスト設計 | 検証項目=完了判定根拠 | テスト作成・完了確認
■ 3. ディレクトリ構成

シート20のツリーに一致させて作成する。

■ 4. セットアップ/実行

・1) cp .env.example .env し シート27の変数を設定。

・2) docker compose up -d postgres (＋必要ならfrigate)。

・3) npm install → npx prisma migrate dev → npm run seed。

・4) npm run dev (web) / npm run worker (scheduler)。

・5) LINE/SwitchBotのwebhook URLを APP_BASE_URL/api/webhooks/* に登録。SwitchBotはsetupWebhookを実行。

■ 6. 完了の定義(DoD)

・シート31の全TC(優先度『高』は必須)を満たすテストが存在しpassする。

・build/lint/型チェックが通る(npm run build / lint / typecheck)。

・UC-01〜08が通しで動作(モック外部で可)。

・満たせないTCは原因をIMPLEMENTATION_NOTES.mdに記録し、修正ループに陥らず報告。

■ 7/8. 曖昧さ・禁止事項

・未定義点は設計意図に沿って前提を置き、IMPLEMENTATION_NOTES.mdに記録(勝手な仕様変更禁止)。

・スコープ外(シート02対象外)の追加実装をしない。ID体系(FR/API/SC/TBL/TC)を尊重。

