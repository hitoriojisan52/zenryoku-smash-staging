# D1第4工程：独立検証Workerの自動デプロイ準備（本番・現行APIを不変更）

作成：2026-11-21。基準：main `e015d1d8021edf4e3d201c2cbd01a693f2c0c8f6`、`README.md`、`SESSION_HANDOFF.md`、`SPEC_PRIORITY_POLICY.md`、`D1_SCHEMA_DESIGN.md`、`D1_READONLY_PILOT.md`および `cloudflare-worker/worker.js` と現行の`wrangler.toml`。

## 結論と変更境界

現行 Worker `zenryoku-smash-staging-api` のルーティング、LINEトークン検証、GASへの委譲、GAS/Sheetsのデータ正本、画面/LIFF URL、設定済みIDと本番環境を**すべて変更しない**。D1への利用者データ複写や会計書込もまだ禁止する。

代わりに、**別名の専用Worker** `zenryoku-smash-d1-pilot-stage-20261121` で、D1ネイティブbinding `ZENRYOKU_STAGE_DB` に対して空テーブルの件数のみを取得する検証を行う。元の`readonly-pilot/worker.mjs`は既存のLINE本人認証/ロール検証を実装していないため、**業務画面のAPIに使わない**。

本PRで作成するのは独立の配布設定、GitHub Actions、強制認可/名前一致と失敗時停止のテスト。**今あるD1 EditのトークンでWorkerはデプロイできない**。初回設定/明示ON完了まではremote Worker deploy **skipped** とする。PR CIが成功しても、Worker公開・実HTTP疎通とは区別する。

## 技術構成

- 独立Workerのソースは`d1-staging/readonly-pilot/worker.mjs`。2 GETのみ。SQLは固定COUNT SELECT、パラメータbind、本人や金額を一切返さず、その他のメソッド、URL、CORSは拒否。無認証時は401、専用Secretなしなら404、DBエラーは汎用503。
- `scripts/d1-stage-worker-config.cjs`は既存のEnvironment variables`D1_STAGE_ACCOUNT_ID`と`D1_STAGE_DATABASE_ID`が合致するときのみ一時的なWrangler JSONを作成する。名前とDB bindingはコード固定で、`cloudflare-worker/wrangler.toml`には一切触れない。
- 一時Wrangler JSONは`d1-staging/readonly-pilot/.wrangler.stage.runtime.json`、gitignore対象。既存`d1-staging`のD1スキーマ用Wranglerとは独立。Workers.devは検証専用で有効、Preview URLs/カスタムドメイン/Routesは無効/未設定。カスタムDNS変更なし。
- `scripts/d1-stage-worker-ownership.cjs`はWorkersのGET Script APIで正確な名前に対する既存内容を確認。HTTP404なら新規作成可、HTTP200なら固定所有マーカー `ZENRYOKU_D1_PILOT_STAGE_REPO_20261121` があるものに限り更新可。不明/403/別内容は**停止**。元のWorker名とは厳密に異なる。
- `scripts/d1-stage-worker-probe.cjs`は公開URLを**名前が一致するWorkers.devドメイン**に限定。GitHub Actionsで生成した32ランダムバイトのBearer Secretを`wrangler secret put`で独立Workerのみに設定。Secretはジョブ中の一時ファイルに置き、GitHub Secretsへの追加/チャット提示/ログ出力はしない。デプロイ後は実GETで無認証401、POST拒否405、旧`/api/overview`404、合成された存在しない練習IDの件数0を照合する。ウォームアップ2/HTTP12回のp50/p95を記録。
- Cloudflare上のDBの実名・UUID照合には既存の`D1_STAGE_API_TOKEN`を使用。Workerの作成・編集だけに新しい`D1_WORKER_STAGE_API_TOKEN`を使用して権限を分離する。後者でD1業務レコードのSQL実行をさせない。
- `.github/workflows/d1-stage-worker-deploy.yml`はPRとmainでオフラインテスト。remoteデプロイは**mainだけ**、GitHub Environment `d1-staging`を使用し、Environment variable `D1_WORKER_STAGE_DEPLOY_ENABLED`が文字列`true`の時のみ実施（EnvironmentがRunnerに配置されてからチェック）。その他はskip。既存のmain限定ブランチルール、正常・異常系の旧GAS回帰も実行。

## 必要な最初の1回だけのユーザー設定（**開発用Secretをチャットに送らない**）

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)で`zenryoku-smash-d1-worker-staging`という新規Custom tokenを作成する。**Account policy**で現在の検証用Worker/D1と同一アカウントに限定。**Developer Platform → Workers Scripts → Edit**（UIによってはWorkers Editor）を指定し、D1 Editなどは追加しない。必要とCloudflareに明示された場合だけ`Account Settings → Read`を最小限に追加する。Zone/DNS/Workers Routes/本番用トークン権限は付けない。トークン名と権限を作成前に再確認する。
2. [GitHub Environment `d1-staging`](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/environments)でEnvironment secretに`D1_WORKER_STAGE_API_TOKEN`として登録する。既存`D1_STAGE_API_TOKEN`は**編集/削除しない**。本Secretはチャットやプログラム中には絶対貼らない。
3. 同じEnvironmentのvariableに`D1_WORKER_STAGE_DEPLOY_ENABLED` = `true`を登録する。既存`D1_STAGE_ACCOUNT_ID`、`D1_STAGE_DATABASE_ID`の2件と`main`限定Ruleはそのまま。
4. 「Secret 1件とVariable 1件の初期設定完了」とだけ報告する。Workerを管理画面で新規作成したりSQL/JSを貼り付けたりする**作業は不要**。ChatGPT側で次のGitHub main変更でWorkflowを起動し、Wrangler dry-run→独立Worker deploy→Secret注入→実GET→ログ/引き継ぎ照合まで行う。

**セキュリティ上の制限・検討事項**：Workers Scripts Editは対象アカウントの他のWorkerも技術的には編集可能なため、漏洩リスクがD1専用トークンより大きい。アカウント制限・Environment Secret・mainブランチ制限・厳密なWorker名の固定・既存スクリプト所有確認・非デプロイ時の明示的停止で緩和する。初回作成後、Cloudflareが個別Worker Editorトークンをサポートする場合は、将来そのWorkerのみに限定したトークンへのローテーションを検討する。これらを踏まえユーザーが初回発行を判断する。**本番環境への権限やデプロイは許可しない**。

## 合格条件・未実施事項

- PRで`offline-safety`成功。既存会計・参加者・退会・試合の回帰成功。Cloudflare以外の既存コードは不変更。
- GitHub Environmentのフラグ未登録なら`deploy-native-worker`は**remote未実施**で終了したと確認する。単にActions successとなっただけではWorkerが公開済みとは扱わない。
- 初期設定完了後に本人からの連絡とGitHub上の新規commitで、Workers Script GETの所有照合、D1 UUID/名前一致、dry-run、Worker deploy、シークレット注入、Workers.devへの認可・無認可テスト、全テーブル0件を確認する。
- 残課題：現行LINE認証/権限の再利用、D1実データへの段階移行とデータパリティ、会計書込の排他・操作ID冪等・監査、復旧用の独立バックアップ、本番承認と本番反映。ユーザーの承認なしに本番へ影響する変更は行わない。


## 2026/11/21 実装・オフライン検証結果（検証main）

- [PR #133](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/133) に`d1-stage-worker-deploy.yml`、D1 binding設定ジェネレータ、既存Workerの名前衝突ガード、Bearer付きGET/無認証・POST拒否とHTTP p50/p95、所有マーカー、退避対象gitignoreを実装。
- PRの初回CIではURLパーサが `workers.dev.evil.example` のような不正ホスト名の先頭だけを拾う問題を検出。完全なホスト名を検証するよう修正し、PR [Actions #44798531767](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44798531767)で`offline-safety`成功。既存D1 schema, 会計, 本人出欠, 退会再入会, 試合の安全回帰と仕様優先チェックも成功。
- 検証main SHA `99d7f0d362cea1054270832072c3080955504bde`で[Actions #44798639824](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44798639824) `offline-safety`成功。`deploy-native-worker`ジョブは外形上successだが、明示有効化フラグ未設定のため**remote deployment、D1 binding接続、Secret投入、実HTTP GET、Worker経由p50/p95の全ステップはskipped**。単にワークフローの緑色チェックをWorker公開成功と誤認しない。
- 同mainの既存[GitHub Pages #44798638771](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44798638771) build/deploy/report成功、`Workers Builds: zenryoku-smash-staging-api`成功（Workerソース/設定変更なし）。[D1 RESTベンチ #44798639958](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44798639958)成功：空4テーブルの12測定のGitHubランナー→D1 REST HTTP p50 **139.7ms** / p95 **173.9ms**、D1 SQL p50 **0.1ms** / p95 **0.2ms**。これは**独立Workerのネイティブbinding性能ではない**。
- **未完了 / ユーザー初期設定待ち**：Workers Scripts Edit専用の別トークンとEnvironment `D1_WORKER_STAGE_API_TOKEN`、`D1_WORKER_STAGE_DEPLOY_ENABLED=true`が必要。既存のD1 API Token、Account/DB UUID、旧Worker、GAS/Sheets、LINE、本番は変更しない。設定が済んだ後、ChatGPTは新main更新/Actions実行を通して新Workerのデプロイ・HTTPスモーク・p50/p95を検証し、引継ぎを更新する。承認なく本番を反映しない。
