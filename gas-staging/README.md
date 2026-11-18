# 接続ステージングGAS — GitHub Actions + clasp（v0.16.36c）

> **2026/11/19 現在の補足（v0.16.53）**：本書のv0.16.36c時点の手動`preflight`・`WITHDRAW_ENABLED=false`などは**初期構築時の履歴**です。現行の検証GASはGitHub`main`へGSソースを統合すると既存デプロイへ**自動反映**されます。ユーザーは退会検証用の`WITHDRAW_ENABLED=true`、`STAGING_WITHDRAW_PURPOSE=staging-member-withdraw-v1653`を**設定済みと報告**しています。新チャットでは[統合運用手順](../docs/DEPLOYMENT_AND_USER_ACTIONS.md)および[引継ぎ文書](../docs/SESSION_HANDOFF.md)を正本として参照してください。GitHub Actionsに接続・認証できる限り、ユーザーへのソースの手動コピーやGASの再デプロイを求めません。本番環境は別承認制です。

**対象は架空データだけの接続ステージング**です。既存のGoogle Sheetsに紐づくApps Scriptプロジェクトを更新します。本番GAS・本番Spreadsheet・専用退会Sandboxには適用しません。

## 今回GitHubに管理するファイル

- `gas-staging/コード.gs` — 既存結合GAS、集金日付型修正・二重読込削減を含むv0.16.36c
- `gas-staging/AccessAndGuestV160.gs` — 退会テストの安全ガードを含む既存v0.16.36
- `.github/workflows/gas-staging.yml` — `preflight` / `deploy`、デフォルトは読み取り
- `scripts/gas-staging-deploy.sh` — 既存GASを取得、ガード、更新、検証、既存Webアプリを更新
- `scripts/gas-staging-guard.cjs` — 未承認の手動変更や別環境への誤反映を停止
- `tests/check-gas-staging-ci.cjs` — ソース・デプロイ手順の安全検査

**重要:** マニフェスト `appsscript.json` や現在のGAS内のその他のファイルは、GitHubの内容で新規作成せず、`clasp pull` によって取得・維持します。実際の `SPREADSHEET_ID`、LINE ID/Secret、GAS Shared Secretなどのスクリプトプロパティは変更しません。

## 初回の必要設定（GASはこの段階では変更されません）

### 1. 接続ステージングのScript IDと既存デプロイIDを確認

1. 接続検証用スプレッドシート `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` を開く
2. **拡張機能 → Apps Script → プロジェクトの設定**で `スクリプト ID` を確認
3. Apps Scriptの **デプロイ → デプロイを管理** で現在運用中の「Webアプリ」の**デプロイ ID**を確認
4. **スプレッドシート ID と Script ID は別物**です。異なるIDを混同しない
5. GAS所有者のGoogleアカウントで https://script.google.com/home/usersettings を開き、**Google Apps Script API** をONにする

### 2. Google認証の初回セットアップ

信頼できるローカルPC等で、対象Googleアカウントを使用:

```bash
npm install -g @google/clasp@3.4.1
clasp login
```

`~/.clasprc.json` が作成されます。これには**長期間のGoogleアクセストークン再発行に使うrefresh token**が含まれます。**チャット、Issue、公開リポジトリ、commit、スクリーンショットには絶対に貼らない**でください。

### 3. GitHub Secrets登録

GitHub `hitoriojisan52/zenryoku-smash-staging` → **Settings → Secrets and variables → Actions → Repository secrets** に以下を設定します。

| 名前 | 値 |
|---|---|
| `GAS_STAGE_SCRIPT_ID` | 接続ステージングGASの「スクリプト ID」 |
| `GAS_STAGE_DEPLOYMENT_ID` | **既存**ステージングWebアプリの「デプロイ ID」 |
| `GAS_STAGE_CLASPRC_JSON` | 信頼できるPCの `~/.clasprc.json` ファイル**全体**のJSON |

別の環境や秘密情報を共有する必要はありません。スクリプトID・デプロイIDもできればチャットではなくGitHub Secretsに直接登録してください。

Github Secretsは名前だけがActionsに渡され、値はGitHubのログに出力しません。Actionsで実行中の認証情報は一時ランナーの `~/.clasprc.json` にだけ復元し、終了時に消去します。

### 4. GitHub Actions の読み取り事前チェック

GitHub **Actions → Staging GAS - GitHub / clasp → Run workflow**

- Branch：`main`
- mode：`preflight`
- confirmation：空欄

ここでは **GASのソースもWebアプリも変更しません**。既存GASをダウンロードし、ソース差分・マニフェスト保全・一致したステージング環境を検証します。

- 成功なら、過去に合格した `コード.gs` と `AccessAndGuestV160.gs` に一致しています
- `Remote GAS was edited outside reviewed Git history` の場合は**実行停止**。別の手動編集があるので内容を比較してください。失敗時に強制上書きしないこと
- 認証エラーの場合、Script IDが合っているか、GAS APIが有効か、Google OAuth JSONを正しく登録したかを確認してください

### 5. 既存GASを初回更新（事前チェック合格後のみ）

同じGitHub Actions画面からもう一度 **Run workflow**:

- Branch：`main`
- mode：`deploy`
- confirmation：`UPDATE_EXISTING_STAGING_GAS`（完全一致）

処理手順:

1. GASの現在のソースとマニフェストを `clasp pull`
2. GitHubで承認済みの過去バージョンとの一致を確認。未承認なら中断
3. **2つのGSソースだけ**を上書き。その他のGS・HTML・`appsscript.json` はそのまま
4. `clasp push --force`、その後に再pullして2ソースが意図した内容か検証
5. `clasp update-deployment <既存デプロイID>` で**同じWebアプリのデプロイ**を更新。新規デプロイを作らない

注意：`clasp push` はリモートのコードを更新する強力な操作です。そのため未承認ソースはこのワークフローで停止させます。

### 6. GAS更新後の確認

- 既存WebアプリURLが変わらないこと
- GASエディタ `checkLedgerConsistencyInNewSystem()` の読み取り検査が `整合性チェックOK`
- Worker `WITHDRAW_ENABLED=false` と GAS `WITHDRAW_ENABLED=false`
- 対象の架空一郎・架空次郎の集金状態が意図どおり
- その後で診断用LIFF（`?accessUi=v2&perf=1&v=1636c`）で一人ずつON→OFFして所要時間を測定。異常時の連打・自動再送をしない

## 自動デプロイ：検証環境はChatGPTが反映・結果確認

2026-11-18のユーザー承認により、**検証環境に限りGitHub Actionsの自動デプロイを有効化**。
初回のpreflight・手動deployは成功済み。通常、ユーザーのRun workflow操作は不要。

1. ChatGPTが変更を検証し、GitHubの作業ブランチ・PRを作成する。
2. 検証テスト合格後、ChatGPTがPRを`main`へマージする。
3. `gas-staging/*.gs`、GAS用デプロイスクリプト、またはこのワークフローの更新によりGitHub Actionsが**既存ステージングGASへ自動デプロイ**する。
4. ChatGPTがGitHub Actionsの成功/失敗ログ、GASへのソース照合、Google Sheetの保全状態を確認し、結果・確認用LIFFリンクを報告する。実機でしか確認できない操作だけユーザーが行う。

GitHub Actionsは既存の`GAS_STAGE_SCRIPT_ID` / `GAS_STAGE_DEPLOYMENT_ID` / `GAS_STAGE_CLASPRC_JSON` Secretsを使用し、`clasp pull` → ドリフト検査 → 二つのGASファイルの上書き → `clasp push` → 再取得・一致検査 → **既存のデプロイIDを更新**の順で処理する。
スプレッドシートのバックアップや整合性検証は必要に応じて実施する。

**本番環境は別管理・別承認制**とし、ステージングのSecretsとデプロイワークフローを本番に再利用してはいけない。
本番への変更は、ユーザーが対象版と変更内容を明示的に承認し、手動起動・GitHub EnvironmentのRequired reviewersにより承認されてから反映する。
本リポジトリには本番用デプロイ処理を設けない。

`gas-staging/README.md` などのドキュメントだけの変更では自動デプロイされません。

## 2026-11-18 preflight初回実行で見つかったclaspのファイル拡張子差異

GitHub Actions実行ID `44205829733` は **preflightとして正常に起動し、clasp pullで既存GASの5ファイル取得まで成功**しましたが、当初の安全チェックが `コード.gs` を探したために失敗しました。実際の`clasp pull`はGASコードを `コード.js` / `AccessAndGuestV160.js` として保存します。

修正版ガードは、GitHub上の `gas-staging/*.gs` を、取得先の同名 `*.js` に厳密に対応付け、同名のGSを追加して二重ファイルを作らないようにしています。未承認の手動編集検出、マニフェスト・他の3ファイルの保持、`preflight`読み取り専用は維持します。確認操作はSecretsを再登録せず、`preflight` を再実行するだけです。

## 保護・注意点

- 本番Script IDを設定しないこと。最初は必ず `preflight`
- PublicリポジトリにOAuth認証情報を書かないこと。GitHub Actions実行者・リポジトリ書き込み権限を制限する
- ソースの検証が失敗したときは、手動GAS変更を保持したまま停止（強制上書きしない）
- Google Apps Scriptの**プロジェクト版数**と**既存デプロイ**は異なります。既存WebアプリのURL維持には `update-deployment` が必要
- GitHub Actionsが失敗した場合、既存Webアプリデプロイの版数は更新されないことがあります。更新直後は必ず `/health`、LIFF、GASの整合性を確認
- 回復時はApps Script「デプロイを管理」で以前の**正常版数**へ戻すか、GitHubの前バージョンを復元して同じ既存デプロイを更新する

※ `gas-staging/README.md` の説明文だけの修正ではGASは自動デプロイされません。
