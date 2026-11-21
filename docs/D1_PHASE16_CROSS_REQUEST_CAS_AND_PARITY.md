# D1第16工程：独立Workerの複数HTTP要求CASと業務仕様互換性ゲート

**後日確定（2026/11/21）**：本書の操作ID対象一致と試合監査失敗時ロールバックについて、ユーザーが**①B・②Bを明示承認**。最新[確定仕様](D1_APPROVED_OPERATION_MATCH_ATOMIC_POLICY.md)を優先。本書の「未承認」は過去時点の記録。

起点：2026/11/21、検証用main `2abaf6392c9656636d4e13427d1045902d665140`、第15工程の実Worker Native batch/rollback 4/4 PASS、`docs/SPEC_PRIORITY_POLICY.md`、`docs/D1_PHASE12_ATOMIC_CANDIDATE_AND_APPROVAL.md`、現行GAS/回帰テスト。

## 目的・既存機能の不変更

前工程では**同じWorkerリクエスト内**のNative batchが原子的であることを確認した。今回は**別々のHTTPリクエストを同時に送信**し、D1に実行される2つの**SQL側CAS**が版数を二重に進めないことを検証する。「Workerで読む→JavaScriptで算出→Workerから別SQLで書く」という非原子的手順を安全だと誤認しない。

- 同一の専用Workerのみ：`zenryoku-smash-d1-atomic-fixture-worker-stage`。CloudflareにWorker/D1を追加作成しない。
- D1 bindingは既に独立している**架空データ専用** `zenryoku-smash-d1-atomic-fixture-stage` のみ。
- **書込対象**：既存の第15工程専用テスト表 `z_native_fixture_probe` の**新しいphase16-接頭辞行**と、新設の**テスト操作ID**表 `z_native_fixture_operation_probe` のみ。ユーザー会員、LINE識別、原本20業務表、既存第14工程の架空会員・収支・試合・監査本文には**SELECT以外禁止**。
- 現行GAS・既存の公開Worker・read-only Worker・旧検証D1（20業務表0行）・Google Sheets/原本非共有コピー・LIFF/LINE、全47業務API GAS_ONLY・本番、ルート・既存環境設定は**変更しない**。
- Free枠の少数リクエストのみ、実行1回の上限18 HTTP・3つの新規架空試験行、操作履歴の最大2追加。秘密値・架空IDは公開GitHub/ログへ書き込まない。新しい行・表を無断削除しない。

## SQL制御・権限

`d1-staging/native-fixture/concurrency.mjs` は、固定SQLのみ。Bearer 32文字以上と既存 `NATIVE_FIXTURE_ENABLED` および独立 `NATIVE_CONCURRENCY_ENABLED=true` による二重有効化。外部CORS/公開業務APIなし。新規ルートはPOSTのみ：

- `/native/concurrent/seed`：元の架空fixture件数を確認し、Worker内でUUID発行、試験表に版数0の行を1つ作る（body不可）。
- `/native/concurrent/cas`：Worker生成した接頭辞に一致するID/操作UUID/expectedVersion=0を厳密に検査。D1 native batchで「最新version=0なら操作IDをINSERT OR IGNORE」「同一操作IDがその対象を指す時だけ版数を0→1」の2つを**同一batch**実行。1件成功、もう一方は変更0。勝った操作を同じ操作IDで再送した時は監査行を照合し**既に受理済みの成功結果を返す**。異なる対象への操作ID再利用は409拒否。
- `/native/concurrent/state`：試験行のversion/該当操作ID数**だけ**を表示（Bearer必須）。
- 複数リクエストのトランザクション外 `read→compute→write` は実装しない。`INSERT 0件/UPDATE 0件` はSQLエラーではなく、結果の `meta.changes` が(0,0)か(1,1)のどちらかであることを**必ず検査**する。混在した状態は成功扱いしない。

※公式D1は `db.batch` を1つのSQLトランザクションとして扱い、失敗時は全体を巻き戻す。ただし「期待したUPDATEが0件だった」だけではSQLエラー/自動rollbackにはならない。[Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)・[Expensive queries / batch](https://developers.cloudflare.com/d1/observability/find-expensive-queries/)参照。

## 実験と合格条件

| テスト | 合格条件 |
| --- | --- |
| 異なる操作ID、独立HTTP同時2件 | 版0から**ちょうど1件**だけ成功、もう一方はversion conflict。最終版1・操作監査1件 |
| 勝者の応答を紛失した想定で同じID再送 | 元成功を再現して返す、**更新0件追加**・操作監査1件のまま |
| 古いexpectedVersionで3番目の操作ID | 更新0、操作監査の追加なし |
| **同じ操作ID**で独立HTTP同時2件 | 最初の成功1件、もう一方は再送成功扱い、最終版1・操作監査1件 |
| 同じ操作IDを別の架空対象へ再利用 | 409拒否、元/別対象の状態は変化なし |
| 不正ID・認証なし、fixture指紋不一致 | HTTP拒否／書込なし |
| native batch途中失敗（オフラインモック） | 試験テーブルのversionと操作監査の両方が巻戻る |
| 実Worker/D1の前後保護 | 旧D1全20表0行、別D1の第14工程業務fixture件数が不変 |

PRはすべてオフラインモックで検証し、Cloudflareへは書込を行わない。既存[第15工程Actions](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44868727688)を改修し、**mainの検証専用push時にのみ**元のPhase15安全ゲート/所有確認/dry-run/deploy/一時Bearer/Native batch検証後にこの試験を追加。最後に第14工程の元D1空/架空fixture件数不変を実GET/SELECTで再検証する。失敗した場合はデプロイ済みのWorker/DBを勝手に削除・本番接続せず、検証結果を正しくBLOCKEDとする。

## 旧GASとD1候補の整合性、次の承認地点

**移行時の重要な仕様差（現時点では候補実装しない）：**

| 保護する旧仕様 | D1設計上の差異 | 対応方針と判断地点 |
|---|---|---|
| `ledgerChronologyCompare_`：日付→opening/practice/reimbursement/other→rowId。以前の未確定行が1つでもあれば、翌月/同日後続の確定禁止 | 0件UPDATEでもbatch自体はコミットできる | 順序をSQLで原子的に照合し、確定行と関連集金/残高/監査を相互矛盾させない本実装は別途詳細設計・検証 |
| `balanceRecalc_`：opening残高起点、前残高+収入−支出、確定済み残高は変えない。負残高は許可 | JSでの多段 read→compute→write は競合リスク | 確定済み保護と複数行CAS、旧料金/当日補正/経費を同値化。実旧データへ未適用 |
| `auditExisting_`：同じ操作IDはop/actorで返却（対象IDチェックはなし） | Phase16実験は**対象ID違いを409拒否**（旧より厳格） | 実業務APIに持ち込む前にユーザーに「旧のまま/安全重視の新規厳格化」の選択を求める |
| 試合 `matchCommit_`：ready→有効ポインタ→監査。監査追記失敗時にコミットを維持することがある | 一括batchなら監査失敗で**版コミットごと巻き戻る**（旧異常系と差異） | **明示判断前に変更しない**。試合SHA不一致46件の原因/復元検証も必要 |
| 本人・役割/退会・LINE user ID | 専用試験の静的Bearerでは本人識別を代替できない | 47業務APIのD1本実装・本番切替は承認前No-Go |

**次にユーザーに確認するべき判断（第16工程完了後）：**
1. 実業務に操作IDの**対象ID一致検証の厳格化**を導入してよいか、それとも旧GASと完全一致させるか。
2. 試合保存後の**監査失敗**で、旧GAS同様に有効版を保持するか、D1の全体ロールバックへ変更してよいか。
3. 46版の試合SHA不一致の扱いを、原本/生成経路再調査（非破壊）と、別の隔離復元（将来追加承認が必要）に分けて判断する。SHA値/JSONを無断で補正しない。

これらの選択が未了でも、Phase16の専用架空Workerに限定した小規模競合実験は、業務仕様を変更しないため実施可能。**性能改善やLINE連携開発はD1移行完了まで中断**する。


## 2026/11/21 実Cloudflare・GitHubの確定結果（第16工程）

- [PR #174](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/174) は独立したWorkerの架空CASルート・前後安全ガード・モック/実HTTP試験と本設計/引継ぎを実装。PR [Native Worker offline #44877447871](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877447871) **success**（deploy stepはPRにつきskipped）、[D1 schema #44877447916](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877447916) **success**、[spec-contract #44877447924](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877447924) **success**。main `05568c4a09c6e5ba66ffcb9183aa60a81f12729c`にsquash統合。
- [第16工程 main Actions #44877501643](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877501643) で、`offline` success、[実Cloudflareジョブ #136765369035](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877501643/job/136765369035) **success**。preflightで**旧検証D1の20業務表0行/独立架空D1の生成業務fixture件数**照合PASS、Worker ownership=ours、Wrangler dry-run・専用Workerのみdeploy・一時Bearer登録PASS。旧Phase15のNative batch/再送/CASも再度PASS。
- **Phase16実HTTP結果** `PHASE16_REAL_CONCURRENT_PASS`：異なる操作IDで並列2要求→**成功1・競合1**、版数1・操作記録1。同じ操作IDの同時2要求→**成功1・再送成功1**、版数1・記録1。失われた応答後の同じ操作IDでの再送は**再更新せず成功結果を再現**。旧版の第三要求と**別対象への操作ID使い回しを拒否**。認証なし401、不正入力400。すべて**新設の架空テスト表だけ**を対象とした実験であり、会計/LINE/会員実APIへの変更ではない。
- 実行後Cloudflare GET/SELECT `FINAL_READ_ONLY_CHECK_PASS: OLD_D1_20_TABLES_ZERO_ROWS; NEW_D1_GENERATED_FIXTURES_ONLY`。旧検証D1の20業務表0行・bootstrap0行と独立架空D1の既存Phase14生成業務fixture件数は**不変**。新たにテスト専用のphase16レコード3ケースとテスト操作記録を保持（無断削除なし）。元Google Sheet/バックアップ/旧Worker/LINE・LIFF・GAS/47業務API・本番は変更なし。
- 同mainの[GitHub Pages #44877501262](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44877501262) build/deploy/report-build-status **all success**、[既存Worker Builds](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/0f5775fb-a405-4c61-800e-770a33f602d8) **success**。既存Workerの業務ソース変更を意味しない。
- **次のユーザー判断前の停止地点**：架空テーブルの実証は完了。旧GASと移行先で「operationIdの対象違いを拒否するか（旧GASと差異）」「試合操作履歴追記失敗で版を保持するか／D1の原子性に統一して全巻戻すか（旧GASと差異）」に業務上の意思決定が必要。試合SHA46/46不一致原因も未解明で、実業務行/会員/領収書のD1移送・旧GASの書込停止や47 API切替は承認していない。**ユーザー承認なしの業務変更・本番反映はNo-Go**。性能改善・LINE連携はマイグレーション完了まで停止。
