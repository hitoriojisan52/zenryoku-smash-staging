# D1第4工程：独立検証Workerの自動デプロイ準備（本番・現行APIを不変更）

作成：2026-11-21。基準：main `e015d1d8021edf4e3d201c2cbd01a693f2c0c8f6`、`README.md`、`SESSION_HANDOFF.md`、`SPEC_PRIORITY_POLICY.md`、`D1_SCHEMA_DESIGN.md`、`D1_READONLY_PILOT.md`および `cloudflare-worker/worker.js` と現行の`wrangler.toml`。

## 結論と変更境界

現行 Worker `zenryoku-smash-staging-api` のルーティング、LINEトークン検証、GASへの委譲、GAS/Sheetsのデータ正本、画面/LIFF URL、設定済みIDと本番環境を**すべて変更しない**。D1への利用者データ複写や会計書込もまだ禁止する。

代わりに、**別名の専用Worker** `zenryoku-smash-d1-pilot-stage` で、D1ネイティブbinding `ZENRYOKU_STAGE_DB` に対して空テーブルの件数のみを取得する検証を行う。元の`readonly-pilot/worker.mjs`は既存のLINE本人認証/ロール検証を実装していないため、**業務画面のAPIに使わない**。

本PRで作成するのは独立の配布設定、GitHub Actions、強制認可/名前一致と失敗時停止のテスト。**今あるD1 EditのトークンでWorkerはデプロイできない**。現行Cloudflare権限では新規WorkerはAdminを要するため、DashboardでのHello World Worker作成（初回だけ）とWorker単位Editorが必要。初回設定/明示ON完了まではremote Worker deploy **skipped** とする。PR CIが成功しても、Worker公開・実HTTP疎通とは区別する。

## 技術構成

- 独立Workerのソースは`d1-staging/readonly-pilot/worker.mjs`。2 GETのみ。SQLは固定COUNT SELECT、パラメータbind、本人や金額を一切返さず、その他のメソッド、URL、CORSは拒否。無認証時は401、専用Secretなしなら404、DBエラーは汎用503。
- `scripts/d1-stage-worker-config.cjs`は既存のEnvironment variables`D1_STAGE_ACCOUNT_ID`と`D1_STAGE_DATABASE_ID`が合致するときのみ一時的なWrangler JSONを作成する。名前とDB bindingはコード固定で、`cloudflare-worker/wrangler.toml`には一切触れない。
- 一時Wrangler JSONは`d1-staging/readonly-pilot/.wrangler.stage.runtime.json`、gitignore対象。既存`d1-staging`のD1スキーマ用Wranglerとは独立。Workers.devは検証専用で有効、Preview URLs/カスタムドメイン/Routesは無効/未設定。カスタムDNS変更なし。
- `scripts/d1-stage-worker-ownership.cjs`はWorkersのGET Script APIで正確な名前に対する既存内容を確認。HTTP404なら拒否、HTTP200で未変更Hello Worldテンプレートまたは固定所有マーカー `ZENRYOKU_D1_PILOT_STAGE_REPO_20261121` があるものに限り更新可。不明/403/別内容は**停止**。元のWorker名とは厳密に異なる。
- `scripts/d1-stage-worker-probe.cjs`は公開URLを**名前が一致するWorkers.devドメイン**に限定。GitHub Actionsで生成した32ランダムバイトのBearer Secretを`wrangler secret put`で独立Workerのみに設定。Secretはジョブ中の一時ファイルに置き、GitHub Secretsへの追加/チャット提示/ログ出力はしない。デプロイ後は実GETで無認証401、POST拒否405、旧`/api/overview`404、合成された存在しない練習IDの件数0を照合する。ウォームアップ2/HTTP12回のp50/p95を記録。
- Cloudflare上のDBの実名・UUID照合には既存の`D1_STAGE_API_TOKEN`を使用。Workerの作成・編集だけに新しい`D1_WORKER_STAGE_API_TOKEN`を使用して権限を分離する。後者でD1業務レコードのSQL実行をさせない。
- `.github/workflows/d1-stage-worker-deploy.yml`はPRとmainでオフラインテスト。remoteデプロイは**mainだけ**、GitHub Environment `d1-staging`を使用し、Environment variable `D1_WORKER_STAGE_DEPLOY_ENABLED`が文字列`true`の時のみ実施（EnvironmentがRunnerに配置されてからチェック）。その他はskip。既存のmain限定ブランチルール、正常・異常系の旧GAS回帰も実行。

## 安全な初期設定（DashboardでWorker名だけ作成し、Worker単位のAPI権限へ限定）

Cloudflare公式の2026年のWorkers権限仕様では、**まだ存在しないWorkerの新規作成にはWorkers product Adminが必要**である。以前記録した「Workers Scripts Editだけで自動新規作成可能」という説明は正しくなかった。Editorはすでに存在するWorkerに対するコード更新・デプロイ・D1 binding設定に使う。したがって、本番Workerがまだ存在しない場合も、既存検証用Worker全体に権限を広げずに済む次の方法を採用する。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)で、**検証D1と既存検証Workerがあるアカウント**を開く。`Workers & Pages`→`Create application`/ `Create Worker`→`Hello World example`を選択。`zenryoku-smash-d1-pilot-stage` と**完全一致**の名前で新規作成する。テンプレートのJavaScriptを編集しない。**既存の`zenryoku-smash-staging-api`に触れない**。D1 binding・Routes・カスタムドメインの手動設定は不要。Workerの初期Hello Worldは公開されるが、個人/業務データを含まない。
2. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)で`zenryoku-smash-d1-worker-staging`という新規トークンを作る。PolicyのScopeを**Individual Workers**、対象Workerを**`zenryoku-smash-d1-pilot-stage`だけ**、Roleを**Editor**として、他のWorkers・D1・Zone・Routesへの権限を付けない。対象Workerが選択できないなら発行せず画面を報告する。トークン自体はチャット・Issue・READMEに絶対貼らない。
3. [GitHub Environment `d1-staging`](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/environments)に**Environment secret**として `D1_WORKER_STAGE_API_TOKEN` = 新トークンを追加（旧`D1_STAGE_API_TOKEN`は維持）。次に**Environment variable** `D1_WORKER_STAGE_DEPLOY_ENABLED` = `true` を追加。既存の`D1_STAGE_ACCOUNT_ID`、`D1_STAGE_DATABASE_ID`、main限定デプロイ規則は変更しない。
4. ユーザーは**「独立Worker作成、Secret/Variable登録完了」だけ**を報告（トークンを送らない）。以後のソース変更とSQL、binding更新はGitHub/ChatGPT側が実施する。次のmain対象更新でWorkflowを起動し、Worker所有チェック→D1照合→dry-run→デプロイ→ランダムBearerの設定→実GET p50/p95の検証を実行し、結果を別々に報告する。

既存スクリプトの保護：初回はCloudflareの**未変更Hello Worldテンプレートだけ**を`scripts/d1-stage-worker-ownership.cjs`が識別して引き継ぐ。該当Workerが404（未作成）、別の実装・大量コード・予期しない権限応答だった場合は**必ず停止**。いったんデプロイに成功すると、そのWorkerに含めた固定の所有マーカーで以後の更新を認識する。Worker単位Editorは、アカウント内の既存検証Workerを更新できない。Cloudflareの権限仕様が変わる場合はその都度再検証する。

外部参照：[Cloudflare Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)、[個別Worker権限の更新情報](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/)、[Dashboardでの最初のWorker作成手順](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/)。

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


## 2026/11/21 権限仕様の追加検証・方針変更

- Cloudflare公式の2026年権限表により、**新規Worker作成＝Workers product Admin、既存個別Worker更新＝Individual Workers Editor**と確認したため、既存の「Account Workers Scripts Edit専用トークンだけで新規自動作成」を撤回。ユーザーに広いAdmin/APIトークンを要求しないよう、最初だけDashboardで空Hello World Workerを作成し、以降は個別WorkerのEditorトークンで自動更新する。
- 自動デプロイのソース・API・D1接続先は変更なし。変更対象は既存Workerの所有確認（未変更Hello Worldテンプレートだけの採用）と設計・初回設定案内のみ。
- 初回GitHub Environment登録前は、実デプロイ/Worker native D1 HTTP検証は依然未実施。空テーブル0件維持、本番未変更。


## 2026/11/21：Dashboard上で実作成したWorker名へ統一

- ユーザー提供のCloudflare Worker Overviewスクリーンショットで、実際に作成した専用検証Workerは`zenryoku-smash-d1-pilot-stage`、公開先は`https://zenryoku-smash-d1-pilot-stage.hitori-ojisan-52.workers.dev`、ステータス`Ready`、Bindings 0件と確認。**以前計画していた末尾`-20261121`付きとは別の名前**。作り直さず、デプロイ用の固定名・ホスト名検証・所有確認を実物に合わせて修正した。
- Overviewの`Production`はCloudflare Worker内の公開環境名であり、全力☆スマッシュの事業用本番システムに反映したことを示さない。
- Workerの初期ソースが未変更Hello Worldかどうかは、デプロイ前の所有確認で厳密に照合する（スクリーンショットからは内容未確認）。ユーザーにはWorkerコードやBindingの手動編集を要求しない。


## 第4工程の最終実証（2026/11/21）：Cloudflare Native D1 binding成功

- ユーザーが[GitHub Environment d1-staging](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/environments)に、**Environment secrets 2件**（既存D1専用`D1_STAGE_API_TOKEN`、個別Worker Editor`D1_WORKER_STAGE_API_TOKEN`）と**variables 3件**（Account/Database ID、`D1_WORKER_STAGE_DEPLOY_ENABLED=true`）、main限定のブランチ規則を設定した画面を提出。GitHub Actionsの認証・有効化の実成功も確認（秘密値は受け取っていない）。
- 既存の[Actions #44804229743](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44804229743) `deploy-native-worker`ジョブをChatGPTから再実行。Workerの初期Hello World所有確認、D1アカウント/名前/UUID、Wrangler dry-runと**独立Workerだけのデプロイ**、一時Bearer Secret導入は成功。最後のHTTP契約が失敗し、成功扱いにせず修正PRと調査を継続。
- [PR #139](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/139)ではGET readinessと不一致HTTPステータスのみを記録（[Actions #44807828712](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44807828712)で一時401）。[PR #140](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/140)では保護されたPOST拒否405/旧API GET拒否404の検査に限り401を短く再確認。計測中に一時401が残り、測定を中止（[Actions #44808223493](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44808223493)）。結果の改ざん・失敗の隠蔽を行わなかった。
- [PR #141](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/141)でWorker secret注入後45秒の安定化、**6回連続認証付きGET**を必須としてから本計測12回を実施。前述の一時的な401はSecretを更新する2回目のデプロイ直後に発生するため、Edge反映差は**原因候補**だが公式に根本原因を特定したわけではない。
- [最終成功したActions #44808754064](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44808754064) `offline-safety` / `deploy-native-worker`ともに**success**。Cloudflare Account+UUID+DB名検証、既存独立Worker ownership `ours`、Wrangler dry-run、`zenryoku-smash-d1-pilot-stage`だけのdeploy、ランダムSecret注入、実GET認証、別Bearer拒否401、POST拒否405、旧API経路404、安定化GET6連続、読取12回のすべてに合格。**HTTP p50 173.4ms／p95 185.5ms**。D1件数は存在しない架空練習IDと検証月に対して0件、個人/会計/試合の業務データはインポートしていない。
- 同main`f52d06342656ec79091152b4265106ddf5752604`でGitHub Pagesと既存`Workers Builds: zenryoku-smash-staging-api`チェックも成功。ただし**既存WorkerにはD1 bindingを追加していない**。GAS、Sheets、LINE/LIFF、旧会計/確定順序/排他処理、本番は変更なし。
- 重要：一時BearerはGitHub Actions実行時にランダム発行してCloudflareへ直接注入し、チャットやリポジトリ/GitHub Secretに残さない。公開されたWorkers.devでBearer無しにD1データの件数を読めない。**現行LINE本人認証/ロールの再実装や実業務APIが完成したわけではない**。アプリ全体の高速化効果や同条件負荷下のp50/p95もまだ未検証。
- 次：旧Workerと独立Workerをどう接続するかは、LINE認証とロール権限の既存制約・CORS・秘密トークン管理・Cloudflare Worker tokenのleast privilegeを踏まえて別設計／PRで段階的に検討。本番アカウントと業務データのD1への切替はユーザー明示承認後。バックアップ/復元・整合性/競合・会計全日付順序・監査・データ移行計画は未完了。
