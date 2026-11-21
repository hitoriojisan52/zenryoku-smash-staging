# D1第16工程：独立Workerの複数HTTP要求CASと業務仕様互換性ゲート

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
