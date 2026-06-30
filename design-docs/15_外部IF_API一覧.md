# 15_外部IF_API一覧

基本設計｜外部インターフェース (API一覧)

概要レベル。詳細は23で確定

- API ID | 概要 | メソッド/パス | 関連画面/機能
- API-001 | 空き枠検索 | GET /api/availability | SC-002/F-001
- API-002 | 予約作成 | POST /api/reservations | SC-003/F-002
- API-003 | 予約詳細取得 | GET /api/reservations/{id} | SC-004/F-003
- API-004 | 予約キャンセル | POST /api/reservations/{id}/cancel | SC-005/F-003
- API-005 | 自分の予約一覧 | GET /api/me/reservations | SC-005/F-003
- API-006 | LIFF設定取得 | GET /api/liff/config | SC-001
- API-007 | LINE Webhook | POST /api/webhooks/line | F-008
- API-008 | 決済セッション作成(任意) | POST /api/payments/checkout | SC-003/F-011
- API-009 | Stripe Webhook(任意) | POST /api/webhooks/stripe | F-011
- API-010 | SwitchBot Webhook | POST /api/webhooks/switchbot | F-005,F-007
- API-011 | 管理ログイン | POST /api/admin/auth (Auth.js) | SC-101
- API-012 | 管理:予約一覧 | GET /api/admin/reservations | SC-103
- API-013 | 管理:入退室ログ | GET /api/admin/access-logs | SC-105
- API-014 | 管理:デバイス状態 | GET /api/admin/devices | SC-106
- API-015 | 管理:パスコード再発行 | POST /api/admin/reservations/{id}/reissue-passcode | SC-104/F-004
- API-016 | 管理:ダッシュボード | GET /api/admin/dashboard | SC-102
- API-017 | 管理:店舗/営業/メニュー設定 | GET/PUT /api/admin/settings/* | SC-107
