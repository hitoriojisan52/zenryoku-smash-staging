# D1第5工程：既存API経路・認証／業務副作用の移行ゲートと日程読取の架空データ等価性

作成：2026-11-21。基準：検証main `8ed1241fdc2c37e747597bc491b4fa77829c4df0`。根拠：`README.md`、`SESSION_HANDOFF.md`、`SPEC_PRIORITY_POLICY.md`、`gas-staging/コード.gs`、`cloudflare-worker/worker.js`、[20テーブル設計](D1_SCHEMA_DESIGN.md)、[独立Worker実測](D1_WORKER_DEPLOY_PLAN.md)。
これは**次工程の安全な実装準備**であり、画面/APIのD1切替・個人情報の移転・会計更新・本番反映を許可する設計書ではない。

## 1. 既存実コードから確定できた相違点

| API | GASで実際に行うこと | D1切替を止める理由 |
| --- | --- | --- |
| `/api/overview` → `overview` | `requireDuty_`で当番/管理者を検査。`overview_`内の`ensureCollectionLedger_`が必要時に**P-行を作成し、残高再計算・writeLedger_・audit_**を実行 | **読み取りに見えて書き込み副作用がある。** D1でSELECTだけ置換すると現在の収支・操作履歴が欠落する。2系統書込はしない |
| `/api/attendance/mine` → `attendance.mine` | LINE本人の有効メンバーIDと将来日程、`attendanceAuditDates_`による初回・最終回答日時、`participantMatchLocked_`および収支確定による`locked`、初期`attending=true` | D1の単純な`attendances` SELECTでは旧操作履歴時刻・試合ロック・本人ID束縛・既存出欠修正期限が一致しない |
| `/api/schedule/list` → `schedule.list` | GASの当番/管理者権限、`scheduleRows_`の**全日程ID・日付重複/版番号検査**、当日以降の抽出、日付→開始時刻の昇順、管理用の**enabled=falseを含む**表示 | D1の既存`practices`は`practice_date`がUNIQUEではなく、無条件の抽出ではGASと異なる。不正日付・版数・日時セル正規化も未移植 |
| `/api/ledger` → `ledger.list` | `requireDuty_`、全期間の確定順序を日付→kind重み→rowIdで再計算、月繰越額、`canConfirm`・`canUnlock`・削除監査の確認 | 月内だけの単純SQLでは前月繰越と解除条件/未確定の先行行が失われる |

上記は`gas-staging/コード.gs`の関数本体とWorkerの固定`VALID_PATHS`を確認して得た結果であり、一般論による推測ではない。**D1の20テーブルの存在とWorkers.devのGET p50=173.4msは、アプリ業務等価性の証明ではない。**

## 2. 今回の実装（すべてオフライン）

- `d1-staging/phase5/route-catalog.json`：現行Workerの**47 API経路を1対1に固定**し、`cutoverApproved:false`と`GAS_ONLY`を明示。4つの検討重点、管理外閲覧、混合操作について危険分類を付ける。**本表の分類がD1切替を自動許可することはない**。
- `tests/check-d1-phase5-route-parity.cjs`：Workerの現在の実際の47経路と登録済みAPI名の完全一致、追加/消失/改名を検出。全てのD1切替禁止、`verifyLineToken`・GAS委譲・Origin制限、上記副作用/操作履歴/日程重複/会計条件、既存`wrangler.toml`へのD1・Service binding非追加をCIで確認する。
- `d1-staging/phase5/schedule-list-offline.sql`：**固定SELECT + 日付パラメータのみ**の候補。未公開/無効化された日程を落とさない。これは旧`schedule.list`の単純な投影にすぎず、ServerAuth・全テーブルの妥当性検証・JST・Googleセルの型変換・データ同期が未実装であるため**本番API利用禁止**。
- `tests/check-d1-phase5-schedule.py`：ローカルのSQLiteメモリ上で既存0001/0002 migrationを適用、架空日程だけを挿入。GASの`scheduleList_`に相当する「当日以降・日付/開始時刻順・非公開行を含む・rowNumberは出さない」と等価に見えること、過去行・境界、全表の日付重複の**拒否**、空テーブル、query_only SQLを確認する。全列・数式・Google Date型と実際のSheetを照合した証明ではない。
- `.github/workflows/d1-staging-check.yml`：上記2テストをPRゲートに追加。既存収支・出欠・退会・試合回帰テストは保持。

**一切変更しないもの**：`cloudflare-worker/worker.js`、`cloudflare-worker/wrangler.toml`、`gas-staging/コード.gs`、各LIFFとGitHub Pages、Cloudflare`zenryoku-smash-staging-api`、D1パイロット`zenryoku-smash-d1-pilot-stage`、既存D1の業務データ/Secret/ID/URL、Google Sheets、GAS、Cloudflare本番環境。

## 3. 今後のWorker間接続の設計選択

- **推奨候補：Service Binding**。Cloudflare公式の[Worker Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)は同じアカウント内のWorker同士の内部通信が可能で、[HTTP Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)も利用できる。直接公開`workers.dev`のURLを呼び出す代わりに、既存Gatewayから承認済み読み取り操作だけを内部呼び出しできる構成を検討する。
- **前提条件**：既存Gateway側のWrangler設定にService Bindingを追加する変更が必要。既存WorkerはLINE IDトークンを毎回Verifyし、GASは毎回会員/当番権限を再検証する。**D1に切り替える場合も独立Workerに認可主体が存在しなければ、その責任は消えない。** ブラウザから`PILOT_READ_TOKEN`を送ったり、LINE IDや名前をクエリに含む公開エンドポイントへ転送する構成は採らない。
- **未決定**：旧GASとD1の実データ同期（どちらを権威とするか）、権限確認の単一取引/失効、操作ID・監査ログ、D1内への個人情報保存・保持/削除・バックアップ・復旧の承認、段階ロールバック、同条件での実機応答差。データが空のD1から実データを返すことは既存アプリの互換性違反。
- **移行前のゲート**：検証用Sheetの全20業務タブの実態とセル型/日付、列重複・履歴・孤立参照・監査を読み取り専用で照合→採用する方式とデータ保護を利用者が判断→匿名/架空データで権限・振り分け・監査を二重実行しないfixture検証→GAS/D1の結果一致→指定APIだけ可逆切替。ここまで既存APIの動作を変えない。

## 4. リスク・次の作業

1. **この段階で業務データをD1へ複写しない**。20テーブルの全件0行を維持し、真の会員/財務やLINE IDを移転しない。
2. 全47 APIのうち**レビューが済んでいない経路は切替禁止のまま**。現行`overview`はread-onlyではなく収支更新あり、最優先の衝突候補。
3. 次は読み取り専用の実シート監査とフィールドごとのロスレス変換検査を進める。**既存GASへの書き込み・権限変更を伴う場合は事前に影響報告**し、運用本番の移行は明示承認を受けてから行う。
