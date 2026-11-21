# D1第14工程：Cloudflare独立一時DBの費用・権限確認（読み取り専用）

更新：2026/11/21。基準main `c16f2e58cb6398b2a24345d6b3e2702981982f13`、[第13工程](D1_PHASE13_PRIVATE_BACKUP_VERIFICATION.md)、[仕様優先方針](SPEC_PRIORITY_POLICY.md)、[移行計画](D1_MIGRATION_PLAN.md)。

ユーザーは、**既存検証D1とは別のCloudflare一時DBを1件作成し、プログラム生成した架空データだけを使う実SQL検証**を明示承認した。条件は、アカウント/権限・無料利用枠・追加料金の不発生を確認し、確認できない場合や既存環境への影響がある場合は作成前に停止すること。Google原本/承認済コピーからのデータ移送、現行Worker/GAS/LIFF、既存D1の業務行0件ガード、本番を変える承認はない。

## 認証とコストの検証ゲート

- Cloudflare公式D1の無料枠は、**Workers Free：1アカウント10 DB、1 DB 500 MB、合計5 GB**。Workers Paidではデータベース数やストレージの取り扱いが異なり、利用量超過により課金の可能性がある。数の条件を満たすだけで現在契約がFreeとは断定しない。
- GitHub Environment `d1-staging`の既存`D1_STAGE_API_TOKEN` / `D1_STAGE_ACCOUNT_ID` / `D1_STAGE_DATABASE_ID`を使用。**既存の権限を拡大しない**。
- 新規`scripts/d1-atomic-fixture-preflight.cjs`はCloudflare APIへの**GETのみ**。検証アカウントIDをコード上の既存固定値と照合し、既存検証D1 `zenryoku-smash-staging-d1`の名前とUUIDが正確に一致することを確認。一時DB `zenryoku-smash-d1-atomic-fixture-stage`が既に存在したら**再利用も重複新規作成もしないで停止**。
- D1リストの全件確認とFree最大10件を保守的に使い、**既存DB 9件以下のみ**を候補にする。各DBのファイルサイズが不明なら停止、合計ファイルサイズ4GiB以上でも停止（Free合計5GBの余裕を確保）。
- 契約プランは`GET /accounts/{account_id}/subscriptions`をD1トークンで読み取り、**Workers Freeを明示的に証明できた場合のみ**次のDB作成候補とする。Workers PaidまたはBilling Readの権限不足/リスト空/取得不可は**BLOCKED**。空の契約一覧をFreeと推測しない。たとえ成功しても、それだけでは「既存の請求利用量が0」の証明ではないので、別の業務データ移送は認めない。
- 費用/契約・既存D1名/UUID/空行ガードのいずれかが不確定なら、**CloudflareへPOST/PUT/PATCH/DELETEしない**。新しいDB/SQL/Worker/Binding/SecretsはこのPRで一切作成・変更しない。実CloudflareへのGET自体はGitHubの実行ログに記録されるが、応答本文/各D1 UUID/課金情報/トークンは公開しない。Actions Summaryは件数と非機密エラーコードだけ。
- GitHub PRでは架空fixtureの`self-test`のみ、mainへの統合後に`.github/workflows/d1-phase14-account-preflight.yml`が**読み取り専用API事前確認**を行う。新規のリモート作成テストは、成功した事前確認と安全なSQL実装を別PRで照合したうえで実施する。**ユーザーが承認した条件を超える新規許可は取らない**。

## 事前確認でBLOCKEDとなった場合

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)の**対象検証アカウント**を開く。
2. **Workers & Pages → Plans / Billing**（表示名は契約UIに従う）で**Workers FreeかWorkers Paidか**と、D1 Databaseの**現利用量・DB件数・追加料金の有無**をユーザーが確認する。**契約や課金プランを変更しない**。
3. ChatGPTへ「Workers Free / Paidのどちらか」「D1無料枠内で新規1DBを作成しても追加費用なしと確認できたか」の2点だけを共有する。**アカウント番号、カード情報、トークン、個別明細は貼らない**。
4. 料金が未確認・超過可能性があれば作成しない。確認でき次第、テスト用に限定した新規DB作成処理をリポジトリで実装/差分レビュー/CI後に実行する。

## 課金仕様の出典

- [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Subscription API](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/)

## 旧仕様・今後

- 旧47 API `GAS_ONLY`維持、会計確定順・残高・試合SHA・LINE本人認証・権限・監査を変更しない。
- 第13工程の検証コピーは完全一致で保全済みだが、試合ready版46/46の保存SHA不一致で**業務試合データの実D1移行は禁止**。
- リモートCloudflareデータベース作成と架空SQL書込、Cloudflare Worker `D1Database.batch()`動作・競合検証、退会/収支/試合のAPI完全移植、本番/LINE実機はこの工程では未実施。
- PR/CI/事前確認結果と検証環境デプロイを確認した後、成果を`SESSION_HANDOFF.md`へ追記する。


## 2026/11/21 GitHub Actionsの実接続結果（GETのみ）

- [PR #163](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/163)を検証用main `5139ea682e3123d29bf769849c777e3985430ef7` に統合。
- [D1 Phase14 read-only preflight Actions #44857950109](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44857950109)：オフライン契約テスト`offline-contract` **success**、実Cloudflare GET`cloudflare-readonly` **success**。**注意：successはGETワークフローが正常終了した意味。新しいDBの作成許可を意味しない**。
- 実APIの判定：`Existing D1 database count: 1`、`Status codes: WORKERS_FREE_PLAN_NOT_PROVEN`、`D1 read-only billing/capacity preflight: BLOCKED`。既存DBの名前/UUID、作成予定名との衝突なし、Freeの件数・ストレージ余裕は通過したが、**Workers Free契約の明示的なAPI証拠が取得できなかった**。原因（Billing Read権限不足、Subscription APIの仕様、Free契約の列挙方法等）は未確定であり、`403`などの具体的な理由は未確認。
- **停止実施**：Cloudflareの新規D1作成・DDL/架空レコード書込・新Worker Binding/Secret/公開経路、旧検証D1への書込/既存0行ガード変更は**一切実行していない**。既存GAS/Sheets/Drive原本/検証コピー/LIFF/本番にも変更なし。追加請求の有無は未確認のまま。
- [検証環境Pages Actions #44857949495](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44857949495)はbuild/deploy/report-build-status **success**。既存Workerの最終ビルド結論はGitHub Actionsの個別チェックを参照し、未完了であれば未完了扱いとする。
- **次のユーザー確認**：Cloudflare Dashboardで**当該検証アカウントのWorkersプランがFree/Paidのどちらか、D1で新規1DB（架空の少数行）を追加しても追加料金が発生しないことを確認できるか**を共有する。請求情報・カード番号・CloudflareアカウントIDやAPIトークンの提示は不要。確認されるまでは書込ステップを作成・実行しない。
