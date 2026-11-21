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
