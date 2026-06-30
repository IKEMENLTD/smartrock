# 23_API詳細仕様

詳細設計｜API詳細仕様

request/response/バリデーション/認証。基本設計のAPI-IDを継承

■ API-001 空き枠検索  GET /api/availability

- 認証 | LIFF(idToken) 任意。公開可。
- クエリ | storeId(必須,int), menuId(必須,int), from(必須,YYYY-MM-DD), to(必須,YYYY-MM-DD, fromから最大31日)
- 処理 | business_hoursを枠展開 → 確定予約(booth占有)とGoogle busyを除外 → 空き枠を返す
- 応答200 | {"slots":[{"boothId":1,"startAt":"2026-07-01T10:00:00+09:00","endAt":"2026-07-01T11:00:00+09:00"}]}
- エラー | 400 バリデーション / 404 store/menu不明
■ API-002 予約作成  POST /api/reservations

- 認証 | 必須(LIFF idToken→customer特定)
- リクエスト | {"storeId":1,"menuId":2,"boothId":1,"startAt":"2026-07-01T10:00:00+09:00","agreeTerms":true}
- 処理 | 重複チェック(FOR UPDATE)→予約INSERT(決済ありはpending/なしはconfirmed)→カレンダーミラー→tasks登録→createKey呼出
- 応答201 | {"id":100,"status":"confirmed","startAt":"...","needsPayment":false}
- エラー | 409 slot_full(枠重複) / 400 バリデーション / 401 未認証 / 422 規約未同意
- バリデーション | startAtは未来・営業時間内・枠境界一致。menu所要からend_at算出。
■ API-004 予約キャンセル  POST /api/reservations/{id}/cancel

- 認証 | 必須(本人 or 管理)
- 処理 | 開始までの猶予(既定24h)判定→status=cancelled→deleteKey(key_idあれば)→カレンダー削除→未実行tasks=cancelled→決済済なら返金ポリシー適用
- 応答200 | {"id":100,"status":"cancelled"}
- エラー | 403 期限切れキャンセル不可 / 404 / 409 既にcancelled/done
■ API-010 SwitchBot Webhook  POST /api/webhooks/switchbot

- 認証 | 署名なし→送信元/想定deviceId許可リスト＋冪等化
- 受信種別 | createKey結果(keyId) / changeReport(施解錠)
- 処理(createKey結果) | name(=r{reservationId})でpasscodes特定→switchbot_key_id保存→status=active→LINEへコード通知(初回のみ)
- 処理(changeReport) | access_logsへINSERT、occurred_atが予約時間帯ならreservation_id推定紐付け
- 応答 | 200即時(処理は非同期化可)
⚠ createKey結果webhookのpayload構造はSwitchBot公式に追従。nameで予約と突合する設計のため、createKey時に name=r{reservationId} 等の一意名を必ず付与する。

■ API-007 LINE Webhook  POST /api/webhooks/line

- 認証 | x-line-signatureをchannel secretでHMAC-SHA256検証
- 処理 | follow=customer作成/挨拶、message/postback=予約導線案内(LIFF URL返却)、冪等化
- 応答 | 200
■ API-015 管理:パスコード再発行  POST /api/admin/reservations/{id}/reissue-passcode

- 認証 | 管理セッション必須
- 処理 | 旧passcodeをdeleteKey→新規createKey→passcodes更新→LINE再通知
- 応答200 | {"reservationId":100,"status":"pending"}
■ 管理系 API-012〜017（共通仕様）

・全て管理セッション必須。未認証は401、権限不足は403。

・一覧系はpage/limit/検索条件をクエリで受け、{items,total,page}で返す。

・API-013 access-logsはCSVエクスポート対応(Acceptで切替)。

・API-014 devicesは電池/最終応答/警告フラグを返す。

・API-017 settingsはGET/PUTで店舗・営業時間・メニューを更新。

