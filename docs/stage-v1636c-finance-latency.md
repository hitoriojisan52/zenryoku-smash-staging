# 全力☆スマッシュ — v0.16.36c 財務集金回帰・低遅延化

更新日: 2026-11-18（JST）、**接続ステージング限定**。本番・別の退会検証Workerには適用しない。

## 顕在化した障害とデータ保全
- 前回修正の同日「前回引継」を先に扱う比較器だけでは不十分だった。
- 1件目の集金保存でGAS `writeLedger_()` の `setValues()` により、Sheets収支表のISO日付文字列がGoogle SheetsのDate数値セルへ変換された。
- 2件目以降は `entries_()` が Date 値を `str_()` で日本語英字日時表現へ変換してしまい、`balanceRecalc_()` の `iso_()` で「収支の日付または行IDが不正です」となる。
- 11/18 02:58JSTの架空一郎 TEST-P001 の集金ONは成功、version=1・600円・操作履歴1件。架空次郎 TEST-P002 のONと一郎OFFは失敗。最終確認の時点では金額600円、支払記録1件を保持。
- **データ側応急復旧済み:** `全体収支管理表!A2:A3` を `userEnteredValue:stringValue` かつ `NumberFormat:TEXT` に修正し、read-backを確認。その他データ不変更。
- 復旧前15シートバックアップ https://docs.google.com/spreadsheets/d/1jbSqWE5LmujQeRw_dlftMx6I8CG-YMuW4Z8Wdb6k0KA/edit

## GAS修正（別途、既存GASプロジェクトのコード.gsを更新する必要あり）
- ソース基準はアップロードされた `コード(5).gs`、v0.16.36bのソート修正も含む。
- `ledgerDate_(Date|string)` でDate/文字列をISO日付へ正規化し、`entries_()` に適用。
- 開始引継優先度0を `0||5` で誤認する比較器も修正。
- `setPayment_()` の台帳読取を2回から1回に削減し、`income` をレスポンスに含める。
- **GASの現行公開デプロイはこのGitHub PRでは更新されない。** 既存デプロイを手動で更新し、読取専用 `checkLedgerConsistencyInNewSystem()` で確認する。

## UI・Worker（このPRで変更）
- `live.js`：支払い・参加区分・当日補正/支出で書込後にもう一度全件 `/api/overview` を待つ設計を廃止。サーバー確定応答からバージョン・残高・金額をUI更新。通信不明時は**絶対に自動再送しない**。
- 自動更新は8秒間隔を維持し、保存中・読み込み中・全画面ロック中の新規更新を抑止。保存前に開始した古いレスポンスは破棄。
- `cloudflare-worker/worker.js`：既存LINE認証・GAS中継・退会条件ガードは維持。認証済みAPIすべてで `Server-Timing` （LINE/GAS/GAS POST/GAS ContentService GETの所要ミリ秒）を追加。個人ID・トークン・Secretsは含めない。
- `/health` は `0.16.36c-stage-gated`。Flagsは `WITHDRAW_ENABLED=false`, `RICH_MENU_SYNC_ENABLED=false` を維持。
- **測定用URLに `perf=1` がある場合のみ**、保存通知で通信全体・LINE・GASの秒数を表示。通常は表示時間も内容も従来と同じ。

## 自動・模擬テスト
- GASメンバー管理・退会・再入会：82/82 PASS。
- finance typed-Date / repeated payments / undo / idempotence / balance / extra ledger reads: 25/25 PASS。
- Worker従来回帰 53/53 PASS。
- UI共通仕様：63/63 PASS。
- 接続ステージング退会分離：34/34 PASS。
- 追加finance回帰：26/26 PASS。
- UI支払い関数模擬実行：14/14 PASS。
- 保存前開始の自動更新応答を破棄：4/4 PASS。
- **実際のネットワーク所要時間は未実測。** GAS書込、LINE検証、Apps ScriptのContentService転送による固有レイテンシーは残るため、UI上の2度目のネットワーク待ちを除去しただけで1秒未満を保証しない。

## 実機試験の順序
1. GASへ修正版コードを適用して既存Webアプリデプロイを更新。GASの既存 `AccessAndGuestV160.gs` / Secret / プロパティは保持。
2. 本PRのマージによるGitHub Pages + Workers Builds成功を確認。Worker `/health` = 0.16.36c。
3. LINE診断URL `https://liff.line.me/2012602642-XBSkXduO?accessUi=v2&perf=1&v=1636c` で2026/11/16検証用体育館を開き、一郎ONの600円と未集金の次郎を確認。
4. 次郎ON→次郎OFF→一郎OFFの順に各1回だけ実行。各操作が成功したら金額1200→600→0円になっていること、および `通信 / LINE / GAS` の秒数をメモ。
5. 異常・未確定時は連打せず、操作履歴・集金記録を読み、必要に応じて `checkLedgerConsistencyInNewSystem()` を再実行。
