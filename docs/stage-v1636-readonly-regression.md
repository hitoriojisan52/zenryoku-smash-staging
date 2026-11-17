# 全力☆スマッシュ v0.16.36 — 接続ステージング読取回帰試験

更新日: 2026-11-18（JST）。**本番・退会検証専用環境と混同しないこと。**

## 実施済み（ChatGPTが読み取り・模擬通信で確認）

1. Cloudflare Worker `zenryoku-smash-staging-api` はGitHub mainの `cloudflare-worker/worker.js` が v0.16.36-stage-gated。利用者は `/health` と `WITHDRAW_ENABLED=false`、`RICH_MENU_SYNC_ENABLED=false` の正常確認を報告した。Cloudflareの現行秘密値やフラグをChatGPT自身で取得したものではない。
2. Workerソースから模擬通信10/10合格：health版数、LINE認証なし401、退会無効403/GAS非転送、目的環境変数未設定403、許可対象外ID403など。
3. ステージング分離テスト `tests/check-stage-withdraw-boundary.cjs` は34/34合格。
4. `tests/check-ui-standards.cjs` の旧 `withdrawUiEnabled: false` 固定条件を、v0.16.34以降の「通常は確認のみ・明示的な架空1630テストのみ実行モード」へ修正。新テスト55/55合格（コード修正はテストのみ）。
5. 既存ステージングSheet `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` の全15シートをv0.16.36適用前バックアップ `1O1q8T7mnGMInq2K8SjNgTXJcW0-i0kZvKFoA6figKxo` と A1:Z120 で比較し、全15シート差分なし。
6. 有効な管理者1名、退会履歴0件、登録申請0件、練習日程・試合セッションは存在。検証専用の旧ID・再入会IDが混入していない。

## 次に管理者LINE実機で確認（すべて読み取り操作のみ）

### A. 通常の運用管理
URL: https://liff.line.me/2012602642-XBSkXduO?accessUi=v2&v=1636

- LINE認証が正常に完了し、運用管理画面に入れる。
- 集金・収支・日程が表示され、操作せず閲覧できる。
- 「メンバー・権限管理」を開き、有効管理者1名、登録申請なし、退会履歴なしを確認。
- 自分自身の役割変更はできない。更新ボタンでは「読み込み中です…」等の短いスピナーのみで全画面ロック、裏の操作不可。背景自動更新では全画面ロックしない。

### B. 退会条件チェック（必ず読み取り専用）
URL: https://liff.line.me/2012602642-XBSkXduO?accessUi=v2&withdrawPreview=1&withdrawCheck=1&v=1636

- 「サーバー側の退会条件を確認」から管理者1名・退会候補0名・処理無効を確認。
- 「退会の確認」2段階を最後まで進めても実データは変わらない（実行API未接続のプレビュー）。
- 前後で有効管理者1名・退会履歴0件を維持。

### C. 対戦表
URL: https://liff.line.me/2012602642-3FKiOTVx?v=1636

- LINE認証・練習日程の取得・対戦表や進行状況の読み込みが正常。
- 試合開始/終了/再生成/コート設定/対戦表変更等の**書き込み操作は実行しない**。

### 異常時
- LINE認証/読み込み/試合表示で問題があれば、エラー全文・画面・実施操作を保存し、さらに更新ボタンを連打しない。
- `WITHDRAW_ENABLED=false` と `RICH_MENU_SYNC_ENABLED=false` を維持。
- この確認ではステージングへのテストメンバー追加・削除をまだ行わない。

## 次工程（実機読取合格後）
- v0.16.37：ステージングSheetを新規バックアップした後、独立した**架空一般メンバー**を安全に登録し、退会確認UIの統合と対象1名だけの退会実行試験を準備。
- 専用検証シートの `M-TEST-WITHDRAW-1630`、`isolated-withdrawal-reuse-v1630`、専用Worker URLをステージングへ持ち込まない。
- Worker/GAS双方の `WITHDRAW_ENABLED=false` を初期状態とし、プレビューと拒否系を確認してから限定有効化する。
