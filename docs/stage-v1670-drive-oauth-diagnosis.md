# v0.16.70 — Drive OAuth宣言の読み取り専用診断

作成日: 2026-11-19。ユーザーからApps Scriptエディタで `authorizeStagingReceiptDriveV1669` を実行しても `stageReceiptFolder_` の `DriveApp.createFolder` が失敗する事実を受領。

## 確認できた事実

- 検証用GASの `stageReceiptFolder_` は対象スプレッドシートIDの厳密チェック後、 `RECEIPT_FOLDER_ID` が空の場合のみ `DriveApp.createFolder('全力☆スマッシュ_検証用領収書')` を実行する。
- Google側の元エラーは既存GASの `catch(e)` で共通SETUPメッセージへ置換されるため、今回提示された実行ログだけでは正確な例外原因を特定できない。
- Google公式仕様による `DriveApp.createFolder` の必要スコープは **`https://www.googleapis.com/auth/drive`**。既存GitHub自動デプロイは `clasp pull` で取得したマニフェストを保持するため、GASソース更新だけでは明示 `oauthScopes` の不足を補わない。

## 追加した安全診断

- `scripts/gas-staging-guard.cjs` の `clasp pull` 直後に、**ローカルに取得したマニフェストを読むだけ**の `STAGING_DRIVE_CREATEFOLDER_SCOPE=...` を出力する。
- `declared`：明示スコープに Driveが記載されている。**OAuth同意済みとは断定できない**。
- `missing-required-drive-scope`： `oauthScopes` が明示設定されているが `https://www.googleapis.com/auth/drive` がない。`DriveApp.createFolder` に必要なスコープが不足している。
- `auto-detection`： `oauthScopes` 自体の設定がない。Apps Scriptの自動推定を使っているため、このログだけでは承認状況を判別できない。
- マニフェストの中身、Script ID、Googleアカウント、アクセストークンはログに出さない。スコープ追加・権限付与・マニフェスト上書き・本番変更は行わない。

## 解消の判断

1. CI合格→検証用main統合時の「Staging GAS auto-deploy」ログで `STAGING_DRIVE_CREATEFOLDER_SCOPE` を読む。
2. `missing-required-drive-scope` なら、既存GASマニフェスト（ユーザーの所有データ）の `oauthScopes` にDrive完全スコープを追加する提案をユーザーに提示し、**広いDriveアクセス権の承認を得るまで自動変更しない**。
3. `declared` ならGASエディタ側のOAuth同意とWebアプリの実行アカウントを確認し、権限・管理者ポリシー・容量制限を切り分ける。
4. `auto-detection` ならGAS実行アカウントに対するDrive権限要求/同意状況、管理者制限を確認する。共通SETUPメッセージから原因を決めつけない。
5. 収支行は既に保存されているため、Drive復旧後は同一収支の『修正』から再添付。二重登録・確定済み収支の勝手な解除はしない。

回帰: `tests/check-gas-staging-guard.cjs` で3状態の判別とマニフェスト完全保持を検証。全体収支の残高・時系列確定・Driveの公開リンク禁止・GASの固定ID保護を変更しない。

## v0.16.71 — Google Drive権限の手動同意導線

- 実際のclasp pull診断でSTAGING_DRIVE_CREATEFOLDER_SCOPE=auto-detectionを確認。oauthScopesは明示設定されておらず、マニフェスト宣言漏れとは断定できない。
- Apps Scriptエディタの既存関数authorizeStagingReceiptDriveV1669にScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/drive'])を追加した。Googleの許可画面で実行アカウント本人がDrive権限を承認するまでフォルダ作成へ進まない。自動的な権限付与ではない。
- 検証用SPREADSHEET_ID以外ではスコープ要求前に拒否する。既存ScriptLock、非公開Drive、収支行の二重登録防止、会計の残高・確定順序、Workerルート、本番設定は変更しない。
- 同意済みでもcreateFolderが失敗する場合、Google Workspaceポリシー、Drive容量、実行アカウント等を別途調査。元の例外を隠す共通メッセージだけでは確定できない。
- テストはスコープ未承認・誤環境・認可済みの3状態をモックで検証。OAuth画面とDrive実保存は実機受入待ち。
