# IMPLEMENTATION_NOTES

設計書 (`design-docs/`) に対して実装時に置いた前提・判断・既知の制約を記録する。
(design-docs/07, 40 の指示に従う)

## 確定した既定値 (要確認事項 / design-docs/07 AS-01〜08)

| 項目 | 採用した既定値 | 根拠 |
|------|----------------|------|
| 前払い決済 (AS-07) | 既定 OFF (`PAYMENTS_ENABLED=false`)。Stripe モジュールは分離し差し替え可能。 | MVP は決済なしで成立 (スコープ02) |
| キャンセル期限 (AS-06) | 開始 24h 前まで (`CANCEL_DEADLINE_HOURS=24`) | AS-06 既定 |
| ブース数 (AS-02) | 1 店舗 1 ブース | AS-02 既定 |
| パスコード有効範囲 (AS-03) | 開始 -10分 〜 終了 +15分 | AS-03 既定 |
| パスコード桁数 (AS-04) | 6桁 | AS-04 |
| 録画保持 (AS-05) | 30日 (Frigate 側 `record.retain.days`) | AS-05 |
| 店舗数 | 初期1店舗。データモデルはマルチ店舗対応 (NFR-007) | — |
| 言語 (AS-08) | 日本語のみ | AS-08 |

## 設計書からの意図的な逸脱

- **PK/FK 型**: 設計書(22)は `BIGINT` を指定しているが、JSON シリアライズの容易さと
  アプリ/テスト全体の取り回しを優先し Prisma の `Int`(autoincrement) を採用。
  サロン規模では桁数は十分。将来必要なら `BigInt` へ移行可能。
- **enum 列**: 設計書は `TEXT` + 許容値列挙。Prisma スキーマでは `String` 列とし、
  アプリ層で `src/types/domain.ts` のユニオン型で型安全を確保。

## 環境・ビルドに関する注意 (この実行環境固有)

- 本環境ではアウトバウンドがプロキシ経由。Prisma エンジンの自動ダウンロードが
  ECONNRESET で失敗するため、`curl` でエンジン
  (`libquery_engine-debian-openssl-3.0.x.so.node` / `schema-engine-...`) を取得し
  `node_modules/@prisma/engines/` に配置した。`prisma generate/migrate` 実行時は
  `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY` を指す。
- ローカル Postgres は docker 不可のため `initdb` で 5433 ポートに起動
  (DB: `sds`, `sds_test`)。テストは `.env.test` の `sds_test` を使用。

## SwitchBot 連携の肝 (design-docs/16, 25 — 必読の落とし穴)

1. `createKey` は**非同期**。同期応答に passcode id を含まない。id は
   **createKey 結果 webhook** でのみ取得でき、`passcodes.switchbot_key_id` に保存する。
   id が無いと `deleteKey` できず期限切れコードが蓄積する。
2. 施解錠 webhook (`changeReport`) は解錠者を特定できない。予約時間帯から
   `access_logs.reservation_id` を**推定紐付け**する。本人証跡は入口カメラ録画で補完。
3. パスコードはキーパッドにローカル保存されるため通信断でも解錠可 (NFR-001 締め出し回避)。
   反面、保存件数に上限があるため終了済コードの `deleteKey` クリーンアップを確実に回す。
4. `revoke_passcode` タスクは `switchbot_key_id` 依存。webhook 未達で id が NULL の
   ままなら削除不能 → リトライしても埋まらない場合は管理者へ手動削除を通知 (運用フォールバック)。

## 未対応 / 残課題

- (Phase B 実装中に追記)
