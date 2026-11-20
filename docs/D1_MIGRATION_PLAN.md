# Cloudflare D1 移行基盤（第1工程：検証専用・業務データ移行前）

制定：2026/11/21。対象：`hitoriojisan52/zenryoku-smash-staging`。**本番環境は変更しない**。

## 目的・役割分担

ユーザーは初期設定とLINE実機の確認、重要な移行判断・本番承認のみを行う。ChatGPTはGitHubブランチ/PR、コード、SQLマイグレーション、回帰テスト、検証反映、引継ぎを担当する。外部サービスの認証失効・権限/課金設定など、コネクタで直接操作できない例外に限り、具体的なURLと値・手順を提示する。ユーザーにソース/SQLのコピー、通常のD1スキーマ操作を依頼しない。

現行の`README.md`、`docs/SESSION_HANDOFF.md`、`docs/SPEC_PRIORITY_POLICY.md`、`docs/DEPLOYMENT_AND_USER_ACTIONS.md`、v0.16.94 GAS/財務の安全回帰が移行基準。最新版の証拠と古い引継ぎの冒頭文が矛盾する場合は、最新mainと後続追記を検証して判断する。

## 現行システムと変更境界

- 維持：GitHub Pages / LINE LIFF / 現行Cloudflare Worker（`cloudflare-worker/worker.js` と `wrangler.toml`）/ GAS / Google Sheets / Google Driveの領収書。既存のURL・LIFF ID・Secretは変更しない。
- 今回追加：`d1-staging/migrations/0001_bootstrap_probe.sql` の**空の基盤テーブルのみ**。ユーザー、出欠、会計、収支、試合、監査の実データや複製は作成しない。
- 既存WorkerにD1バインディングを追加すること、LIFFの読取先変更、データ二重書込、バックフィル、個人情報コピーは**次工程の独立レビュー・明示判断まで禁止**。
- 必ず維持：LINE本人認証/権限、運用者ロール、管理者最終一名の保護、退会・再入会と過去履歴、収支残高`前行残金+集金額-支出`、月跨ぎ/同日を含む先行未確定拒否、確定解除の最後の行限定、ScriptLock相当の競合保護、operationId冪等、試合版管理、失敗時の再送禁止。
- D1のトランザクションだけでは既存の業務意味論は再現できない。書込の境界、版数、監査/operationId、競合・失敗時のAPIレスポンスもDB移行設計の対象にする。

## 新規の自動化（初期設定後）

| 契機 | 実行対象 | 振る舞い |
| --- | --- | --- |
| PR（`d1-staging/**` 等を変更） | `.github/workflows/d1-staging-check.yml` | SQLiteメモリDBでSQL検査、保護ワーカーの隔離検査、設定先検証。Cloudflareへの接続・書込なし |
| mainへの対象変更または手動起動 | `.github/workflows/d1-staging-migrate.yml` | GitHub Environment `d1-staging`に登録された資格情報を使用。未設定時は安全にskip |
| 認証情報の存在＋ステージング専用DB照合成功 | 同上 | `wrangler d1 list --json`で期待するCloudflareアカウント・UUID・名前を検証後、`wrangler d1 migrations apply ... --remote`を実行。リードオンリーSQLで構造を検証 |
| 仕様変更・本番移行 | 別工程 | 本番用D1/API/デプロイは本工程では作らない。別資格情報、別環境、手動承認を必須とする |

D1の正式なマイグレーション履歴`d1_migrations`を利用する。同じSQLを二度適用しない。GitHub Actionsの`concurrency`で二重実行を防止。SQL自動変更は当面`CREATE TABLE IF NOT EXISTS`に制限し、破壊的DDL・バックフィルをガードで拒否。将来の変更は影響・可逆性/ロールバック・バックアップ・旧業務回帰を評価したうえで守りを改訂する。

ステージング識別子：
- Cloudflareアカウント：既存検証Workerと同じアカウント（IDはGitHubの既存デプロイ文書から確認）。
- 新規D1の厳密な名前：`zenryoku-smash-staging-d1`
- 新規バインディング名：`ZENRYOKU_STAGE_DB`（**現行Workerには未バインド**）。
- この工程は既存Cloudflare Workerの`wrangler.toml`を変更しない。D1専用のランタイム設定はGitHub Actionsの中だけで生成し`.gitignore`で除外する。

## 一度だけ必要なユーザー初期設定

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages / D1 SQL database** → **Create** で、新規DB名を厳密に `zenryoku-smash-staging-d1` とする。既存Workerと**同一アカウント**を選び、既存のDBがあれば新たに重複作成しない。発行されたデータベースUUIDを控える。作成後はまだWorkerのバインディングを設定しない。
2. 同Dashboardの **My Profile → API Tokens → Create Token → Create Custom Token** で検証用の専用トークンを作る。権限は対象アカウントに限定した `Account > D1 > Edit` を基本とし、有効期限と他権限は最小化。**Worker Edit / アカウント全権限 / 本番用APIトークンの転用は禁止**。このトークンはChatGPTやGitHubコードに貼らない。
3. [GitHub Environments設定](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/environments)で`d1-staging`を作成。Deployment branchesを`main`のみに制限する。Environment **secret**:`D1_STAGE_API_TOKEN` = 作成したAPIトークン。Environment **variables**:`D1_STAGE_ACCOUNT_ID` = `5817f07a73dbb56011012074ce1b11c5`（既存検証WorkerのアカウントID）、`D1_STAGE_DATABASE_ID` = 手順1でCloudflareが表示したUUID。※UUIDはユーザーがCloudflare画面からコピー。推測で生成しない。
4. 「D1データベース、環境変数2件、Secret1件を設定した」とだけチャットで報告。トークンやLINE ID、秘密値は送らない。**初回のリモート試験開始と結果の照合はChatGPT側がGitHubのPR/Actionで進める**。初期設定前でもPRのオフラインCIは可能。

※ GitHubのEnvironment variablesはSecretsとは別の設定欄。設定されたら次のmain対象更新（またはworkflow_dispatch）で自動実行。認証・設定がない状態の既存アプリには一切影響しない。

## 検証と合格条件

- PRオフラインCIがPASS、既存GAS/Worker/Pagesの変更がないこと、GitHub側の履歴が追跡できること。
- 検証専用D1の実UUID照合成功、`d1_migrations`に初期マイグレーションが存在、`stage_d1_bootstrap`が空のまま読取可能。GitHub Actionsのログでremote applyとread-only smokeの成功を別に確認。
- **現段階ではWorker/LINE→D1の接続試験をしていない**。既存GAS/Sheetsの置換もしていない。
- 認証情報の誤設定、Cloudflare上で別名/別UUIDのDBを見つけた場合は、自動中止。手動SQLや既存DBの上書きは禁止。
- 収支/出欠/退会/対戦表の将来の移行はスキーマ設計/移行対象全件照合・権限・冪等・版数・失敗時復旧・履歴を含む回帰テスト合格が前提。
- パフォーマンス目標は同一条件で旧GASと新APIの`overview`/`ledger`等を複数回測定し、p50/p95/トークン照合含む端末総時間を比較。移行完了や高速化を事前に断定しない。
- D1はバックアップとTime Travelだけでは長期監査保全を満たさない。日次の独立バックアップと復旧訓練、保存先/アクセス権/費用と個人情報の移転先を業務データ移行前に決める。

## 残課題・次の工程

1. 初期設定3項目のユーザー完了を受け、GitHub Actionsのリモートマイグレーション・空テーブルSELECTを確認する。
2. GitHub接続権限とActionsのリモート更新を、ChatGPT側で再現可能な手順として引継ぐ。
3. 全シートの型・主キー・参照関係/数式・GAS API・履歴を棚卸しし、**読み取り専用の比較**から移行設計を起こす。
4. 読取系APIを完全に分離してD1で試験実装し、データ正本の二重化・無断書込が起きないことを確認する。
5. 本番移行は業務仕様の影響レビューとユーザー承認後に別PR・別デプロイとして扱う。


## 初回PR統合後の検証記録（2026/11/21）

- PR [#125](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/125)、main `1001f2035342f513c6078706a610533c708fb6e7`。PRのD1スキーマ安全/旧会計・出欠・退会・試合回帰と仕様契約CIはすべてsuccess。
- [D1 Actions](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44781121812)はローカル試験success。Remote関連の検証/適用/読取は環境変数等の未設定により明示的にskipped。リモートDB実体・性能は**未確認**。
- [GitHub Pages](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44781120608)、Cloudflare Workers Buildsともにsuccess。既存Workerの公開GETは当該コミットでは未確認。Worker/GASのソースと本番は不変更。
- ユーザーの初期設定完了までCloudflareへのD1作成・SQL実行・LIFF切換は実施しない。


## 実環境での初期D1マイグレーション成功（2026/11/21）

- 利用者がCloudflare上の検証用DB作成とGitHub Environmentの初回設定（mainのみ、D1 Edit権限のAPI tokenをEnvironment secret、Account/DB IDをVariables）を完了した。Secretの値はChatGPTが取得・表示しない。
- ChatGPTはPR変更なしに、[既存 GitHub Actions #44781121812](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44781121812)の`migrate-stage`を再実行（新ジョブ`136469472361`）。`Safely check one-time staging setup`、`Verify remote D1 target UUID and exact staging name`、`Apply versioned SQL ONLY to the named staging D1`、`Read-only smoke`の全4ステップがsuccess。
- Wrangler CLI v4.165.0の実ログで`0001_bootstrap_probe.sql`が✅ applied、`SELECT COUNT(*) AS probe_count FROM stage_d1_bootstrap`が`0`件 / `success: true`。未設定時の最初の`skipped`ログと区別する。該当DBの名前・UUIDが照合成功したこと以外に、構成・秘密値の開示はしない。
- **第1工程の実DB/初期スキーマ接続検証は完了**。既存Workerへのバインド、利用者データ移行、LINE LIFFとD1の直接通信、API業務仕様の等価性検査、D1バックアップ自動化は未実施。GAS/Sheetsの正本は維持し、本番変更なし。
- 後続はデータベーステーブル設計へ進む前に、最新mainのGAS/テストと現行ワークブックの全シートを読み取り専用で棚卸しし、ID参照、最新値の競合、残高・確定順序、履歴移行、PII移転・復旧を正式レビューする。適切な判断なしに既存データをコピーしない。


## 第2工程（2026/11/21）：業務20テーブルの空スキーマ設計

- [21タブ棚卸しと業務20テーブル設計](D1_SCHEMA_DESIGN.md)を参照。現行の確定業務仕様を優先し、**データ移転と認可/会計API切替は未実施**。
- 新規`0002_business_skeleton.sql`と`tests/check-d1-business-schema.py`は、SQLの追加構造と残高/時系列、退会履歴、複合キー、競合バージョンなどを**オフライン架空値**で確認する。SQL内に実名、LINE ID、架空データの本体値を持たない。
- D1へ空テーブルを追加しても既存GAS/Sheetsは唯一の正本。業務上の完了扱いとしない。将来の実データ移行は同時書込み禁止・スナップショット照合・バックアップ/ロールバック・アクセス制御・本人認証の等価性・本番承認が前提。


## 第2工程の確定検証結果（2026/11/21）

- [D1スキーマ設計](D1_SCHEMA_DESIGN.md)、[PR #128](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/128)（スキーマ）、[PR #129](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/129)（read-only現物チェック）。Cloudflare側で`0002_business_skeleton.sql`適用済み。SQLの空テーブル20件の存在と全件ゼロをremote SELECTで確定。
- GitHub CIで旧GAS会計確定順序、本人出欠、退会・再入会、試合作成、SQL FK/UNIQUE/CAS/時系列の契約を確認。旧GAS/Worker/LIFF/Google Sheetsの業務コードと原本の書込なし。
- **次工程**：既存GAS/Workerの認証・権限を維持した読み取り専用パイロット設計と、テストデータの匿名/架空fixtureだけによる同条件の性能比較。既存WorkerにD1バインドを追加するか、独立Workerを設けるかは、権限/トークンの重複・公開CORS/本番干渉を評価し、設計/仕様の承認後に実装する。
- **保留**：業務データのD1移行・正本切替、現金/会計保存・試合進行などの書込API、バックアップ/復旧/監査長期保存と本番承認。本段階ではユーザーの追加初期設定は不要。
