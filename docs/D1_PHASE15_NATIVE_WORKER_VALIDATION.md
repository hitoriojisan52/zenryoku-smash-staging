# D1第15工程：架空データ専用の独立WorkerでNative batch()/CASを検証

作成：2026/11/21。基準：検証main `b32c708ab27d2ede18720d71760a3d31aec7d959`、SESSION_HANDOFF第97節、SPEC_PRIORITY_POLICY、D1_PHASE14_ISOLATED_SQL_RESULTS。

## 承認された範囲と変更してはいけないもの

ユーザーは2026/11/21、「独立Workerの作成・検証環境へのデプロイ・架空データ専用D1への接続」を明示承認。D1移行完了まで性能改善・LINE連携拡張は中断。

第15工程の新規対象:
- 専用Worker名: `zenryoku-smash-d1-atomic-fixture-worker-stage`
- D1 binding: `ZENRYOKU_FIXTURE_DB`
- 接続先DB: 作成済みの別D1 `zenryoku-smash-d1-atomic-fixture-stage`
- 新設のWorker内テスト表のみ: `z_native_fixture_probe`。既存20業務表や現役Phase14架空レコードは一切更新しない。

**不変更**：本番環境、既存Worker `zenryoku-smash-staging-api`、第4工程のread-only `zenryoku-smash-d1-pilot-stage`、元検証D1 `zenryoku-smash-staging-d1`（20業務表0行）、GAS・LIFF・Google Sheets・非共有Driveコピー・領収書、既存47 GAS_ONLY API、URL/LINE ID・Secret。Worker経由の本人認証や本番会計書込は今回実装しない。

## 実装した技術上の安全境界

1. `scripts/d1-phase15-native-worker.cjs prepare`はGitHubの正規repo/main/push/固定アカウントを厳密照合。Cloudflare REST GET/SELECTで旧DB20業務表/業務行0/bootstrap0と、別DBの第14工程架空件数が維持されているときだけ、1個のD1 bindingを持つ一時Wrangler設定を生成。DB UUIDはGitHubに書かない。元検証D1へのbindingは許可しない。
2. `verify-ownership`は新Workerの正確な名前をCloudflare API GETし、未変更の小さなHello World starterまたはこのrepoの固定owner markerだけを許可。404/403/他のWorkerコードは拒否。Workerの新規作成/置換/権限の自動拡大を禁止。
3. `d1-staging/native-fixture/worker.mjs`はCORSなし、専用32バイト乱数Bearer、明示フラグ必須、非公開SQL/内部エラー非返却。業務APIなし。POST `/native/run`のみが実行可能。実行前に架空fixture指紋を読み、D1 ネイティブ `db.batch([prepared statements])`で制約違反→全巻戻し、2行コミット、INSERT OR IGNORE再送0件、version CASで1勝1敗を検査。書込はテスト表のみで、既存業務表はSELECTだけ。
4. 本番Worker/旧read-only Worker用のデプロイ設定、Cloudflare Routes、カスタムドメインや現行D1 UUIDは変更しない。ジョブは第15工程専用のflagがない限り**remote stepsはSKIPPED**。PRにはCloudflareリモート処理はなく、Node mock/業務回帰のみ。
5. main＋明示ONの場合、所有確認→dry-run→専用Worker deploy→専用一時Bearer secret→Workers.devの401/404/405→実Workerネイティブbatch/CAS→**元D1空/既存架空fixture値不変**を再検証する。異常時は成功扱いせず停止、DB/Workerを自動削除しない。

**限定事項**：このネイティブテストの成功は、複数リクエストread→compute→writeの整合、実GASの会計/本人認証/試合履歴復元、47APIの同値や正本移行を保証しない。第13工程の架空シート試合版SHA 46/46不一致を勝手に修復しない。

## 初回のみ必要なユーザー設定（上記の承認範囲）

Cloudflare公式Workers権限上、**新規Worker作成にはWorkers product Admin**が必要。第4工程で登録したトークンは**既存のread-only Workerだけ**の Individual Workers Editor なので、別名のWorkerを作成/更新する権限はない。管理者トークンの権限拡大は提案しない。ChatGPTがGitHubソース、検証、デプロイを担当し、ユーザーは**新規空Workerと個別トークンの初期設定のみ**実施する。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)の、現在の検証D1があるアカウントを開く。Workers & Pages → Create Worker → Hello Worldテンプレートを選び、**`zenryoku-smash-d1-atomic-fixture-worker-stage`**という正確な名前で新規作成する。最初は空のHello Worldのまま保存する。既存の `zenryoku-smash-staging-api` と `zenryoku-smash-d1-pilot-stage` を選ばない。ここではBindingやSecret、Routesは設定不要。
2. **重要：アカウント所有（account-owned）APIトークンを使用する。** [Cloudflare Dashboard](https://dash.cloudflare.com/) → 対象アカウント → **Manage Account → Account API Tokens** → Create Token。**My Profile → API Tokens は今回の案内として誤り**（ユーザー所有トークンの画面であり、この細粒度スコープの公式作成経路と異なる）。Token name `zenryoku-smash-d1-native-worker-stage`。新規policyのスコープは **Specified Workers**、選択Workerは **`zenryoku-smash-d1-atomic-fixture-worker-stage` 1件だけ**、roleは **Editor**。他Worker/全Worker/Workers product Adminの権限を付けない。Expirationは継続開発用にNo expiration（後日適宜ローテーション）、Client IP filteringはGitHub-hosted runnerの送信元IPが固定でないため空欄とする。Continue to summary等で対象Worker1件とEditorを確認してから作成。必要なAccount API Tokensメニューや権限が見えなければ発行せず停止し、トークン自体をチャットに共有しない。Cloudflare公式：[Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)／[2026-09-15 granular permissions](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/)／[Account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)。
3. [GitHub Environment d1-staging](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/environments)で新規 **Environment secret** `D1_NATIVE_WORKER_STAGE_API_TOKEN` = 手順2のトークン。新規 **Environment variable** `D1_NATIVE_WORKER_DEPLOY_ENABLED` = `true`。設定済みの`D1_STAGE_API_TOKEN`、`D1_STAGE_ACCOUNT_ID`、`D1_STAGE_DATABASE_ID`、旧Worker変数/secret、branch制限は変更しない。
4. チャットへ「新規Worker作成・トークン/フラグ設定完了」と連絡する。**トークン値/DB UUIDをチャットへ送らない**。ChatGPT側が検証用mainの変更とActionsで自動デプロイ/実HTTP証跡/引継ぎを確認する。環境設定未完了ならremoteは一切実行されない。

無料プランとアクセスの前提：Cloudflare Workers Free利用を前工程で画面確認。作成前に既存Worker数と現在の無料枠/権限に矛盾があれば停止し、勝手に課金プランへ切り替えない。ユーザーの本番承認なしに本番コード/データは触らない。

## CI / remote の判定・次の作業

- **PR**：Node mock（正/異常のbatch、CAS、再送、誤binding/Worker所有権）、D1旧テーブル契約、旧収支・LINE出欠・退会/再入会・対戦表の回帰をPASSにする。既存GAS/Workerソース変更なしを差分レビュー。
- **main**：第15工程flag未設定ならremote `SKIPPED`。設定済の場合のみ、実Cloudflareの旧D1/新D1照合、専用Workerのみdeployed、Native SQL rollback/commit/CAS/idempotencyのHTTP PASS、旧DB空維持・第14工程fixture件数不変をそれぞれ確認する。
- 何らかの障害で初回Workerが作成済み、しかしデプロイ失敗した場合も**無断で削除・再作成せず**修正PR/ログ診断。独立Worker/新D1の保管/削除はユーザー判断待ち。
- 次の開発候補は「複数Workerリクエスト間CAS、収支同日/月跨ぎの確定・解除、旧GASの監査追記失敗とD1原子的挙動の差異整理」。旧仕様と衝突する変更は適用前にレビュー・承認。
