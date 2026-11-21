# D1第17工程：承認済B/B仕様のWorker-native架空トランザクション実証

対象：2026/11/21、検証main `aa5b785731651814f8facad1e17093e91d511638`、[確定仕様](D1_APPROVED_OPERATION_MATCH_ATOMIC_POLICY.md)、第12・15・16工程成果、GAS `auditExisting_` と `matchCommit_`。

## 開発の境界

新規D1/Workerは作成せず、既存の独立した架空データ専用D1と独立Workerだけを使用する。旧検証用D1（20業務表0行）、旧GAS、元Sheets/承認済非共有コピー、47業務API（GAS_ONLY）、既存Worker/LINE/LIFF、現行環境設定・本番データは不変更。Workerには固定32バイト乱数Bearer/別有効フラグ`NATIVE_APPROVED_MATCH_ENABLED=true`を追加し、匿名のテスト表以外への書込をプログラム構造上禁止する。

追加した専用表：
- `z_native_fixture_match17_pointer`：架空の1試合だけのactive revisionとversion
- `z_native_fixture_match17_revision`：架空の版本文
- `z_native_fixture_match17_audit`：操作ID・対象・架空actor・操作種別・expectedVersion・revision・CHECK制約

元の20業務表は **SELECT fingerprintのみ**。直接の業務テーブル書込み、JOIN経由の実人物情報、LINE ID、実収支行への更新はない。seedは架空fixture件数を先に照合し、Worker内で試験IDを発行する。入力は既生成のphase17 ID/UUID、expectedVersion=0、故障注入フラグのみ。固定架空actorと架空JSONを利用し、**これは実会員認証・実試合保存APIではない**。

## 試験設計

`d1-staging/native-fixture/approved-match17.mjs` は同じネイティブ `D1Database.batch()` に ①最新version=0の時だけ新revision INSERT、②revisionが存在する時だけpointer更新、③pointerが新revisionでversion=1の時だけ操作ID/対象/actor/操作種別のaudit INSERTをまとめる。**監査行CHECKの故障注入を意図的に発生**させると、バッチ全体が失敗し、①②③が全て0件であることを照合する。

`POST /native/match17/seed`、`/save`、`/state` は既存の独立Bearerチェック後にだけ実行。公開CORSや本番UI接続は無し。元の操作IDとtarget+actor+action+expectedVersionが一致する場合、**保存済み結果を無書込みで再現**。違えば409（`OPERATION_ID_REUSED`）。違う対象への同時リクエストで同じoperationIdが使用された場合は、auditの一意制約がバッチ全体を巻戻すことを期待する。同時操作を無条件で成功扱いしない。

| テスト | 合格条件 |
|---|---|
| 初回seed | 版0・有効版なし・版行0・監査0 |
| 監査CHECK失敗 | HTTP503、revision0・pointer.version0・audit0（旧状態保持） |
| 同じ操作IDの正常再試行 | revision1・active1・audit1（全部同時に確定） |
| 成功後の同じID再送 | 受理済み結果、revision/active/auditの追加0 |
| 別対象へ操作ID再利用 | HTTP409、別対象の3状態すべて0 |
| 異なる架空対象に同じ操作IDで並列2要求 | **1件だけ成功・1件409**、勝者だけversion1/audit1 |
| 既に更新済みの対象へ別ID | VERSION_CONFLICT、追加版・監査なし |
| 認証なし・不正Body | 401/400、DB不変更 |
| worker/DB preflight・事後 | 既存Worker/DB所有確認、旧検証D1 20業務表0行、第14工程の架空業務件数不変 |

テストは二重：
1. `tests/check-d1-phase17-approved-sqlite.py` がWorkerの**正確なSQL文字列をNode経由で読み**、純粋メモリSQLiteで原子的失敗/成功・別対象操作ID衝突を検証（実Cloudflare操作なし）。
2. `tests/check-d1-phase17-approved-worker.mjs` がWorker route・Bearer・mock D1 batch・失敗注入・再送・並列を検証。
3. 検証用mainへ統合後の専用Worker GitHub ActionsがPhase15/16実検証を維持し、その後 `scripts/d1-phase17-approved-worker-probe.cjs` で本物のCloudflare D1とWorkerに**限られた合計18回以内のHTTP**を送信。最後に元D1と第14工程既存架空fixtureを別Cloudflare GET/SELECTで照合する。

Cloudflareに新たな課金設定、Secretsの公開、追加DB/Worker作成、テスト行の自動削除はしない。失敗すれば安全停止・No-Go。原本/本番/業務表の変更は承認されていない。

## 確定仕様とは別に残る制約

- D1 Worker nativeバッチの失敗巻戻しは**架空版/監査テーブルの技術的検証**。実アプリの複数試合版チャンク/有効版SHA/試合履歴の時系列、操作本人ロール、外部ドメイン認証、会計の多行計算とは別。
- 前工程までに判明した**架空Sheet試合ready版46/46 SHA不一致**は原因未解明。勝手に再計算して移送を強行しない。
- 旧GASと移行先D1のアプリ同値、収支計算/確定順/再入会/権限/バックアップ/復旧および実利用者のPII/領収書の移送先・許諾・保存期間は引き続き検証・明示判断が必要。
- 本番移行・切替は今回の承認範囲外。実47業務APIはGAS_ONLYを維持し、性能改善とLINE連携開発はD1移行完了まで停止。

## 判定・次工程

GitHub CI/実Cloudflare結果とPages/既存Worker Buildsを別途確認し、未実施の試験をPASS扱いしない。架空版の原子的更新PASS後は、**本番相当の会計一括CAS/収支順序/残高と試合SHA問題の解析・移行可否**を別に検討し、実データに触れる前の次のユーザー判断地点で停止する。


## 2026/11/21 実Cloudflare第17工程の実測・確定結果

- [PR #176](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/176) で確定仕様B/B・第17工程の独立試験Worker/SQL・オフライン SQLite/mock/旧GAS回帰を実装。[初回CI #44879946818](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44879946818)は**試験Python側のSQL bind数誤り**で失敗し、SQL/業務データは変更せず引数を修正。[再実行後PR Actions #44879991875](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44879991875)、[D1 schema #44879991821](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44879991821)、[spec-contract #44879991837](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44879991837)はすべて**success**。PRは検証main `2bc56a7a36cc8e76ddb0a3006336791497c79b09` へsquash統合。
- [main実Cloudflare Actions #44880055446](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44880055446)でoffline job success、[独立Worker deploy/probe job #136773177759](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44880055446/job/136773177759) **success**。元検証D1全20表0行・別D1の架空業務fixture件数をpreflightで照合し、既存専用Worker（ownership ours）のみdry-run/deploy/一時Bearer設定。旧Phase15 native batchとPhase16同時HTTP CASもそれぞれ再試験PASS。
- 実HTTPログ `PHASE17_APPROVED_BB_REAL_PASS`：架空試合で**監査CHECK違反 → Native batch全体巻戻し → version0/revision0/audit0**。正常時はversion1/revision1/audit1（有効版あり）を同時に保存。同じ操作IDの再送は無書込みで成功、**別対象へのID再利用は409拒否**、別対象で同じIDの**並列2リクエストは1成功/1拒否**（敗者に孤立した版/ポインタ/監査は残らない）。401/400のアクセス制御も確認。リモート第17工程の追加書込は**新設テスト用3表だけ**。現行業務20表/旧試合版/実運用原本には一切書かない。
- **独立の事後読み取り** `FINAL_READ_ONLY_CHECK_PASS: OLD_D1_20_TABLES_ZERO_ROWS; NEW_D1_GENERATED_FIXTURES_ONLY`。元検証D1全業務20表0行/bootstrap0行、独立架空D1の第14工程で投入した業務fixture件数が不変。実証用のテスト表/架空行は自動削除しない。
- 同main [GitHub Pages #44880054870](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44880054870) build/deploy/report-build-status **success**、[既存Worker Builds](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/d5e54581-92fb-4b5c-a18e-5a86ac98cc70) **success**。これらは業務APIの移行や本番Worker変更を意味しない。
- **成果範囲**：第17工程の承認B/B仕様をWorker-native架空トランザクションで技術的に実証。**未完成**：本人/権限、実試合版JSON/SHA/UTF-16チャンク、操作IDの全業務API適用、会計の多行残高/確定順/監査、46版の旧架空SHA不一致、実データ安全な移送・復旧。本番/既存47 GAS_ONLY APIへの反映は行わない。性能改善とLINE機能開発もD1完了まで保留。
