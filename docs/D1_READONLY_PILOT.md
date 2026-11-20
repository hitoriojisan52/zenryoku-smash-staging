# D1 第3工程：読取専用APIの隔離試作・REST性能ベースライン

作成：2026/11/21。対象：検証用。基準となるmain：`9aab68a8796a18b55a43d61c545a4a5e99baddc4`。
根拠：[D1スキーマ設計](D1_SCHEMA_DESIGN.md)、[D1移行計画](D1_MIGRATION_PLAN.md)、[仕様優先](SPEC_PRIORITY_POLICY.md)、既存`cloudflare-worker/worker.js`と`wrangler.toml`、直近のGAS v0.16.94性能記録。

## 構築範囲と未実施事項

- **構築したもの**：`d1-staging/readonly-pilot/worker.mjs`（D1の`ZENRYOKU_STAGE_DB`バインディングを使う、*未デプロイ*の独立read-only Workerプロトタイプ）、`tests/check-d1-readonly-pilot.mjs`（架空のmock D1で認証/SQL/エラーをオフライン検証）、`scripts/d1-staging-http-bench.cjs`、`.github/workflows/d1-staging-http-bench.yml`。
- **まだ接続・デプロイしていないもの**：既存のLINE LIFF、既存Worker`zenryoku-smash-staging-api`、既存GAS、Google Sheetsの運用画面、Cloudflare上の新しい独立Worker。既存WorkerへのD1バインドも追加していない。
- **データを変えない**：検証D1に存在する20テーブルの**0行を維持**。Cloudflareへの実行は読み取り専用SQLの`COUNT(*)`のみ。本番D1は存在・設定とも作成せず、本番アプリ変更なし。LINEユーザーID・氏名・財務明細・試合データをコピー/ログ表示しない。
- 新Workerは別の独立認可ゲート（`D1_PILOT_ENABLED=true` と32字以上の`PILOT_READ_TOKEN`）を意図的に要求する。**LINE本人認証を代替するものではなく、公開利用禁止**。トークン未設定・無効なら404、認証不正なら401、書込HTTPは405で拒否、CSRF/CORSを無効化、静的SELECTとパラメータバインドの`COUNT(*)`のみ。予期しないDBエラーの詳細は返信しない。
- エンドポイント（**未デプロイ**）：`GET /pilot/overview-counts?practiceId=<id>`＝練習日・参加者・集金記録の件数。 `GET /pilot/ledger-counts?month=YYYY-MM`＝収支の対象月件数。金銭額や個人名は返さない。これらは本番`/api/overview`／`/api/ledger`のデータ・権限・業務上のレスポンス契約と**異なる**。互換APIとしては利用できない。
- `tests/check-d1-readonly-pilot.mjs`は架空レコード数（例:参加者8件）を模したmockで動かす。実D1に架空でも会員レコードを投入しない。現行GAS+Sheetsの個人情報・金額・LINE認証のテストを代替しない。

## 追加資格情報とデプロイ境界

現在GitHub Environment`d1-staging`のAPIトークンは**Account > D1 > Editのみ**（ユーザーが2026/11/21に作成）。この権限ではCloudflare **Workerの新規作成/更新はできない**。この事実を理由に既存Workerへ無断バインドを追加したり、権限の大きいトークンへ置き換えたりしない。

**今回ユーザーによる操作は不要**。Workerを公開する後続の工程では、既存Workerを変更しない独立名の検証専用Workerと独立デプロイ権限を安全に設計・レビューし、必要になれば限定権限の初回設定をURLとともに案内する。その前に認可/閲覧範囲・ブラウザOrigin・CORS・ログと監査・D1バインディングの安全性についてユーザー判断を得る。未承認の新Workerデプロイは行わない。

## D1 HTTP性能ベースライン（GitHub Actions内のみ）

[Cloudflare D1公式REST Query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)の**固定SELECT**で、GitHub ActionsのランナーからCloudflare APIまでの読み取り専用往復時間を計測する。

- 実行前に既存の`d1-staging-config.cjs`でアカウント・DBのUUID・名前が**完全一致**することを検証。mainのみ・Environment Secret/Variables経由。
- SQLは4テーブル `practices` / `attendances` / `payments` / `ledger_rows` の`COUNT(*)`だけ。未承認のデータ投入があれば件数が0でなくなるため **FAIL CLOSED**。返却からPIIやデータ行を出力しない。
- ウォームアップ2回、測定12回を逐次実行。再送なし。各リクエストでAPI `success`、DB結果1件、`rows_written=0`、`changed_db != true`、件数0をチェック。p50 / p95、最小/最大、D1内部`meta.timings.sql_duration_ms`をActions Summaryに記録する。
- これは **Cloudflare REST HTTPを含むDB集約の性能**であり、Cloudflare WorkerのネイティブD1 binding・LINE認証・GAS経由・ブラウザからの経過時間を**含まない**。現行GASの`overview` 4.54–7.13秒、`ledger`2.51–6.06秒（v0.16.94変更前実測）と並べても同条件ではない。速さの大小をもってD1切替効果を断定しない。
- 現行のGAS/SheetsとD1のデータ量が異なる（D1は空）ため、この実測からスケーリングや実機時の待ち時間は推定しない。
- [GitHub Actionsワークフロー](../.github/workflows/d1-staging-http-bench.yml)：`main`へ該当ファイルが統合された時に**自動で1回**実行、必要なら`workflow_dispatch`で再計測。認証資格情報を更新したりUIを変更したりしない。
- 失敗した時はログにステータスコード等だけ表示し、Cloudflare APIトークンや応答JSONをログ表示しない。自動リトライはしない。

## 次の段階（別PRと明示レビュー）

1. D1 RESTのp50/p95、SQLエンジンp50/p95を確認し、上記測定境界を守って引継ぎへ記録する。
2. **Cloudflare Worker実接続**は、既存WorkerのLINE認証ロジックを再実装せず、そのまま使えるかを先に評価する。独立検証Workerの新規作成には現在のD1専用トークンだけでは不可。権限追加・利用者への設定依頼はこの段階で初めて判断する。
3. 個人情報の転送・権限/会計の統合トランザクション・日次バックアップ/復元・試合履歴のハッシュ・本番切り替えはすべて別工程。既存確定仕様に影響する箇所はユーザー判断前に変更しない。


## 実測とCI/デプロイの最終検証結果（2026/11/21）

- [PR #131](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/131)：`schema-safety`、`spec-contract`ともに**success**を確認して検証main `b26ce8d496ad8eb3591f253162fc4de4b8f1dda1`へマージ。
- PR CIの`Validate independent D1 Worker read-only pilot with mock binding`と`Validate direct D1 REST benchmark and response fail-closed guard`に加え、既存の会計確定順序・本人出欠・退会再入会・試合作成の回帰が**success**。
- [Cloudflare D1 REST測定 Actions #44795116347](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44795116347) `benchmark` success。GitHub Actionsランナー→Cloudflare REST D1 Query の空4テーブル固定SELECT、ウォームアップ2＋実測12回：**HTTP p50 227.8ms／p95 250.7ms、最小209.4ms／最大250.7ms、SQL engine p50 0.1ms／p95 0.2ms**。ステージングAccount/DB UUID/名前を事前照合、空データ・無書込の応答を全回確認。シークレットや実業務行はログ出力なし。秒数を旧GASのAPI合計と単純比較しない。
- [D1 migration Actions #44795116430](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44795116430) `migrate-stage` success。再適用 `No migrations to apply!`、Remote `business table count=20; all business rows=0; probe rows=0; PASS`。無断のデータ投入なし。
- 同コミットの[GitHub Pages](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44795115476) build/deploy/report-build-status成功、Cloudflare Workers Builds `zenryoku-smash-staging-api`もsuccess（既存Workerソースとbindingは**変更なし**）。
- **実施済みなのはD1 REST空表クエリ測定と未デプロイWorkerのmockテスト**。新Worker公開、LIFF→D1認証/権限/会計処理、GAS/Sheets移行、ユーザー端末性能、バックアップ復旧は未実施。D1専用トークンをWorkers Editへ勝手に拡大しない。


## 第4工程の安全な独立Worker実接続準備（2026/11/21）

- [独立WorkerのGitHub Actions自動デプロイ方針](D1_WORKER_DEPLOY_PLAN.md)参照。`scripts/d1-stage-worker-config.cjs`が独立名`zenryoku-smash-d1-pilot-stage`と検証D1のbindingのみを生成。`scripts/d1-stage-worker-ownership.cjs`で衝突する既存Workerは上書きせず失敗扱い。未公開状態で他機能と連携しない。
- `scripts/d1-stage-worker-probe.cjs`がシークレット作成後の実GET認証/POST拒否/業務APIの404/空件数/p50-p95を検査。業務データ移行・現行LINE/Worker/GASの認可変更ではない。
- 現在のD1トークンではWorker deployができないため、GitHub Environment`d1-staging`に別の最小権限Secrets`D1_WORKER_STAGE_API_TOKEN`、variable`D1_WORKER_STAGE_DEPLOY_ENABLED=true`の初回登録が**必要**。本番・旧Workerは変更しない。発行手順はD1_WORKER_DEPLOY_PLANに記載。
