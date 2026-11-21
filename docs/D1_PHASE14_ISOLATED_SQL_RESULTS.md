# D1第14工程：Workers Free確認後の独立D1架空実SQL検証

基準：2026/11/21、main `278613b7637edfc60dca5899308a1600fc7a26ac`、`docs/D1_PHASE14_ISOLATED_FIXTURE_PREFLIGHT.md`、`docs/SPEC_PRIORITY_POLICY.md`、`docs/D1_PHASE12_ATOMIC_CANDIDATE_AND_APPROVAL.md`。

## 利用者が証拠を提示した承認条件

- 2026/11/21、ユーザー提示のCloudflare管理画面 `Billing > Subscriptions` に **Workers Free / Active** と **No payment method on file** が明示された。画像に表示されたメールアドレスや個人情報、画像自体をGitHubには転載しない。
- 既存の[Phase14 GET-only Actions](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44857950109) は現在の検証Cloudflareアカウントに **D1 1DB** を検出し、既存検証D1のUUID/名前・新規名前重複なし・ファイルサイズの事前ガードを通過。契約プランのAPI立証のみ権限/返却値不足で BLOCKED だったが、ユーザー画面による手動立証が揃った。
- Cloudflareの[公式D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) と [Pricing](https://developers.cloudflare.com/d1/platform/pricing/) では、Workers Freeは10 DB / 1 DB 500MB / アカウント5GB。無料の行読書き上限到達でクエリが拒否され、追加従量課金は発生しない。
- したがって、**別の新規一時D1一件のみを作成し、少数の架空データだけを入れて試す**という既存のユーザー明示承認内の作業を許可条件付きで続行。Worker配備、元D1の実業務データ、現在のGAS/Worker/LIFF、Google Sheets原本/バックアップ、本番は対象外。

## 安全な実装

- 一時DB名は必ず `zenryoku-smash-d1-atomic-fixture-stage` の1件。 `scripts/d1-phase14-isolated-sql-fixture.cjs` は既存`d1-staging` GitHub Environmentでしか動作しない。GitHub repository / main / push /固定検証アカウントID / 旧D1 UUIDを厳密照合。
- 実Cloudflare GETで既存DBが**1〜9件**、元の検証D1 UUID/名前一致、同名一時DBなし、重複UUIDなし、現存DB合計サイズ4GiB未満を再確認するまでPOSTしない。
- `POST /accounts/{account_id}/d1/database` を**最大1回**だけ実行。失敗・タイムアウト・曖昧な結果のとき無条件リトライしない。新規UUIDが旧D1でないことを確認し、`GET`で新規DBの同定・増加DB数=+1を照合。再実行時には同名存在で停止し、既存作成済みDBを黙って再利用しない。
- それ以降のSQLリクエストは**新規DB UUIDに限定**。`DELETE /d1/database`、元D1へのSQL、Worker経路変更はコード上禁止。Cloudflareの生レスポンス/トークン/UUID/個人情報・架空ID・JSON本文はPublic GitHubログへ出さない。
- 既存の空の**20業務テーブルのDDL候補**を、作成した**別DB**にのみ作成。Google Sheetの本文や既存D1のレコードは読まず、新しく`crypto.randomBytes()`から生成したIDと2099年の架空日程・収支/集金/試合状態だけを投入する。実データの移行やSHA補正は一切しない。
- プログラムの上限：SQL APIを70コール未満、一時DB実サイズ2MiB未満。作成DBは自動削除しない。保存/削除はユーザーと別途判断。
- PRでは`self-test`（外部I/Oなし）と既存会計確定順・本人/退会・試合・旧47 API GAS_ONLYの回帰テストのみ。mainマージ後の`push`条件で初回だけCloudflare実SQLを動かす。Workflow手動`workflow_dispatch`は定義せず、同名DB存在時は再実行を拒否する。

## 実SQL試験の期待結果と対象範囲

| 試験 | 実施する対象 | 期待 |
|---|---|---|
| 空スキーマ | 元の20業務テーブルDDL、全業務行0 | 表が20件、既存レコードなし |
| 集金の競合/CAS | 同じversion=0から2つのSQL更新 | 1成功・1更新なし、version=1 |
| 収支確定順 | 日付の古い未確定行がある間は後続確定拒否 | 後続0・先行1・後続1・再送0 |
| 金額 | 架空の旧残高10,000円＋収入2,400円－支出300円 | 最終12,100円のケースを数値的に保持（**実GAS全計算同値の保証ではない**） |
| 試合版CAS | version=0から2つの別改訂版を同時に指す | 1成功・1更新なし、選ばれた有効版がready |
| 操作ID冪等性 | UNIQUE操作IDに同じ値を再INSERT | 初回1・再送0 |
| REST SQL batch失敗 | 操作履歴INSERT後に負金額CHECK制約違反を注入 | DBが取引を巻戻し、履歴も収支も残らない |
| REST SQL batch成功 | 監査行と試合操作履歴を同一batchでINSERT | 双方1件 |
| Worker native `D1Database.batch()` | **対象外** | 専用Worker/binding新規承認が必要 |

**注意**：この工程のREST API `{batch: [...]}` のテストと、実運用候補Workerの `D1Database.batch()` は同一と断定しない。D1のデータ操作・認可/本人権限・収支残高の完全整合・試合SHA46件・退会履歴を本番に移す承認は存在しない。競合に対するread→compute→writeが1リクエストをまたぐ整合性も未検証。

## 実行結果を追記すべき証拠

GitHub PR、main commit、offline Checks、**isolated-cloudflare-d1** のActions結果、Cloudflare D1新規DB作成の成否、REST SQL別試験結果、Pages/Worker Buildsの別々の反映を確認して、実際の結果だけ `docs/SESSION_HANDOFF.md` に追記する。**テスト失敗は合格扱いせず、作成成功/SQL失敗のときDBを勝手に削除しない**。失敗後の修正コードも既存D1へ動くことのないよう検証する。


## 2026/11/21 実施結果：Cloudflare新規D1 1件、既存D1とは完全に分離、架空REST SQL全7試験成功

1. [PR #165](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/165)を検証main`19fe60894ad6b7d3dbb4074f3c04880ed778fd7f`にsquash統合。offline-safety / spec-contractは**成功**。[初回のmain SQL Actions #44859726039](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44859726039)では**独立D1 CREATE 1回が成功**（`ONE_ISOLATED_DB_CREATED`）。ただしスキーマ作成後の `sqlite_master`テーブル合計を**20ちょうどと誤認して検査失敗**、`SQL NOT_VERIFIED`で停止。失敗を成功として扱わず、二重CREATEもDB削除も実施せず。
2. [PR #166](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/166)で、Cloudflare **GET / SELECTのみ**を使う別の診断を追加。[read-only Actions #44859931553](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44859931553)は**成功**。CloudflareアカウントにD1は**計2件**、元検証D1とは名前/UUIDが別の新D1を1件確認。新DB内はSQLiteカタログ**計21テーブル**、`members`は**0行**。20業務テーブル以外のCloudflare側管理テーブルが1件追加される環境差が直接原因と判断。初回は架空レコード投入前に停止。
3. [PR #167](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/167)を検証main`7b05404ee3783090326aff9737c598ecc4f11788`に統合。CREATE API呼び出しを**完全に禁止**した回復用コードで、**元の新規DB 1件だけを作成日時/UUID/名前・20業務表の全テーブル名・9関連テーブル0行**を再検証。Cloudflare独自1テーブルを除く20表を名前で検証してから、コード生成架空データのみ投入。[再開用REST SQL Actions #44860162654](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44860162654)は**offline-contract success / isolated-sql-resume success**。Cloudflare実SQL API 40コール、結果は`PASS`。**追加DB作成なし**。
4. 実REST SQLの結果：`PAYMENT_CAS`（集金更新競合1勝1敗）、`LEDGER_CONFIRM_ORDER`（古い行優先・二重確定拒否）、`LEDGER_MONEY`（架空金額の整合）、`MATCH_CAS`（試合有効版・version更新1勝1敗）、`OPERATION_IDEMPOTENT`（操作ID初回1/再送0）、`REST_BATCH_ROLLBACK`（制約違反後に監査行も無書込）、`REST_BATCH_COMMIT`（監査と試合履歴の2表同時書込）、**計7/7 PASS**。
5. 一時D1は無料のWorkers Freeアカウント内に作成され、**自動削除を行っていない**。GitHubにはDB UUID/APIトークン、LINE/会員の実ID、元Sheets/バックアップの値、個々の架空IDやSQL結果本文は保存しない。元Sheet/非共有コピー/領収書・GAS/Worker/LIFF/本番の変更なし。旧検証D1へのSQL書込はコード上禁止、旧47 APIはGAS_ONLY。
6. **今回の成功判定に含まれない事項**：Cloudflare Workerからのネイティブ`D1Database.batch()`、アプリ業務APIのD1本実装、権限/LINE認証/本人識別、本物の金銭残高計算完全一致、試合の既存SHA不一致46件、実運用データの移行/戻し、本番切替。実REST batchだけの成功をこれらの完了と誤認しない。

### 追加の読取専用・元D1無変更回帰

`scripts/d1-phase14-readonly-postcheck.cjs`と`.github/workflows/d1-phase14-readonly-postcheck.yml`は、新規DBと既存DBの名前/UUIDが2件で分離していることを確認したあと、**SELECTだけ**で元D1の既存20業務表/業務データ0行/Bootstrap0行、および一時DBの架空会員1/日程1/出欠1/集金済1/確定収支2/試合セッション1/readyチャンク3/監査2/試合監査1を検証する。ユーザー個人情報や行本文は出力しない。PR時はモックのみ、main統合後のクラウド結果を追加引継ぎ節へ記録する。これはあくまで**既存D1は旧0行仕様を維持している**という最後の確認であり、本番D1正本移行の承認ではない。


## 最終読み取り専用チェック・検証mainへの反映（2026/11/21）

[PR #168](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/168)をmain `fe6fb9279d8e67f87eb79e8c94639ee692eb92f3` へ統合。PR offline/spec安全回帰全て成功。Cloudflare本番データを一切更新しない独立[Actions #44860501021](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44860501021)は **READ ONLY PASS**：

- 既存検証D1：業務用**20テーブル**、全業務行**0**、bootstrap行**0**。
- 新規一時D1（Cloudflareアカウントに1件だけ作成済み、追加CREATEなし）：架空会員1、練習日程1、出欠1、集金済1、確定収支2、試合セッション1、ready試合チャンク3、操作監査2、試合操作監査1。すべて新規プログラム生成した架空値のみ。
- DB間をまたぐ実本人データ/LINE ID/スプレッドシート原本/バックアップは**1行も移送せず**、旧検証D1の業務データ0行を実確認した。
- 同mainの[Pages Actions #44860500389](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44860500389) build/deploy/report-build-status **all success**、[既存Worker Build](https://github.com/hitoriojisan52/zenryoku-smash-staging/runs/136712763744) **success**。既存Worker/GAS/LIFFの機能コード・バインディング/設定は変更なし。

**完了範囲**：CloudflareのWorkers Freeアカウント内に独立したD1を**1 DBのみ**作り、生成架空データでREST SQL集金CAS/収支順/金額/試合CAS/再送冪等性/REST batch失敗巻戻し・成功を**7/7 PASS**し、旧DB0行と新DBの架空件数を実検証した。

**次工程の承認が必要**：これ以上のD1 Worker Native `D1Database.batch()`実測には、作成済み架空D1専用の**別の小型Worker**、その専用Binding、GitHub Actionsによる限定デプロイが必要。既存のWorkerや旧検証D1の設定変更、本番への反映は禁止。作成/デプロイ前にユーザーの明示承認を得てFree枠と権限を再照合する。独立D1の保管/削除も別途ユーザーが判断する。既存架空Sheetの試合SHA46版不一致・旧GAS実業務同値・本番移行は引き続き未完了。
