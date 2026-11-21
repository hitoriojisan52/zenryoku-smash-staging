# D1第20工程：確定A仕様に沿った「完全アーカイブ→リンク失効→物理削除」架空D1実証

2026/11/21。最新main `7db8106b2b58c439ec874dcf6e19ad903ebe7f17`、[確定仕様](D1_APPROVED_LEGACY_MATCH_DELETE_POLICY.md)、[第11工程の旧アーカイブ構造](D1_PHASE11_LEGACY_ARCHIVE_RESTORE.md)、[第19工程の論理削除試験](D1_PHASE19_SYNTHETIC_MATCH_LIFECYCLE.md)、現行GASの `matchDeletePlan_` / `matchDeleteExecute_` / `matchDeleteArchiveStatus_` を確認。

## 承認済みAと保護範囲

ユーザーは旧仕様維持の**A**を明示承認。削除前に全試合版、試合セッション、既存試合操作履歴と未失効閲覧リンクを `{rowNumber,cells}` 形式の完全アーカイブに保存し、未失効閲覧リンクの失効後に試合版・操作履歴・セッションを**物理削除**する。復旧は本人識別/管理者認可/確認/証跡が整った将来の**明示的な管理者作業のみ**で、自動復旧APIを作成しない。

旧の多段階GAS操作とは異なり、D1でのアーカイブ確定・リンク失効・物理削除は**Native SQL一括トランザクション**として実験する。これは第17工程の**監査失敗時の全部ロールバックB**と矛盾しない。アーカイブ行が操作IDによる削除結果を保持する。誤って異なる対象に同一操作IDを使った場合は409拒否（第16工程B）。

対象は既に承認されたCloudflare独立Worker `zenryoku-smash-d1-atomic-fixture-worker-stage` と完全架空D1 `zenryoku-smash-d1-atomic-fixture-stage`のみ。新しい`z_native_fixture_match20_`テスト専用5表だけへ書込。その他の20業務表・元検証D1・本番/実データ・Google原本/非共有バックアップ・47 GAS_ONLY API・LINE/LIFF・公開Workerは一切変更しない。**不一致46版は取得・再SHA・移送・補正・削除禁止**。

## テストデータと旧GASとの対応

Worker内部でだけ名前や旧履歴に関連しない完全架空UUIDとJSONを新規発行する。1セッション・2試合版（1+2チャンク）・操作履歴2件・閲覧リンク3件（未失効2、事前失効1）を作成。Active/旧版両方についてUTF-8 SHA-256・連続チャンク・JSON生成フラグを検証し、削除前にSnapshotを作る。

| 旧GASの対象 | この工程の架空モデル |
|---|---|
| `試合セッション` 5列 | `z_native_fixture_match20_session`、架空の `source_order` から `rowNumber` を投影 |
| `試合版管理` 9列、全版・全チャンク | `z_native_fixture_match20_revision`。旧版・現役版ともに原文SHAを検算し、3行の元9列をアーカイブ |
| `試合操作履歴` 7列 | `z_native_fixture_match20_audit` の2行を元7列と位置へ投影 |
| `閲覧リンク` 6列の未失効分 | `z_native_fixture_match20_link` の2行をsnapshotに保存し、物理削除前に失効。他の既失効リンクは維持 |
| `試合削除アーカイブ`（12,000 UTF-16 code unitチャンク） | `z_native_fixture_match20_archive`： `schema:1`、日程ID/両版数、3種の `targets`、`links` をJSON保存、12,000単位・SHA・操作ID・先頭 `completed`。既存GASの `prepared` →多段階処理とは異なり、単一SQL batchのcommit時に初めて全体が完成 |

**元Google Sheetsの物理行番号は架空`source_order`でしか再現できない**。本テストは旧原本の行番号・元閲覧リンクの真正性・旧46版ハッシュの復旧成功を保証しない。完全なD1業務移植に必要な本人認証・会計・権限・リンク送信経路・保管期間/管理責任は未完成。

## 試験と不変条件

1. 全件のアーカイブSnapshotをSQLバッチより前に生成し、旧版/有効版のSHAやチャンクをチェック。SQLバッチ先頭の `archiveSeed` は、トランザクション内でセッションversion・active revision・各記録件数・未失効リンク件数を条件照合し、満たさなければCHECK制約エラーで全体を中止する。D1の本業務で採用する際は内容同値・複数バージョン/同時編集の追加CASも必要。
2. バッチ全体：アーカイブの全チャンク保存、2件のリンク失効、3件の版行物理削除、2件の試合操作履歴物理削除、1件のセッション物理削除。途中失敗は**全処理巻戻し**。最後に意図的CHECK失敗を挿入した場合、アーカイブ0件・旧session/全版/履歴/リンクの状態が元のまま。
3. 成功後はセッション0/試合版本体0/旧操作履歴0/リンク未失効0/リンク既失効3、アーカイブのみをSHA付きで保持。操作IDの同対象再送は無書込で成功を返し、別対象流用は409拒否。
4. `POST /native/match20/preview`は**SHA・チャンク連続性・`schema=1`・3表の `{rowNumber,cells}`・リンク**だけを検証し、JSON本文/個々のリンク情報を公開しない。**復元処理そのものはない**。例外的に過去の架空実験 `/native/match19/restore` は隔離Workerの旧テストとして残存するが、正式業務APIへの採用は明示却下済み。
5. プローブ：Bearerと専用`NATIVE_LEGACY_DELETE20_ENABLED=true`、POSTのみ/厳密Body、固定架空actor。実Worker向け25以下（現在18上限）のHTTP。前工程Phase15～19の実証・旧D1全20業務表0件・別架空D1の既存第14工程fixture件数、デプロイ所有権・Worker単独の設定を維持。
6. `tests/check-d1-phase20-physical-worker.mjs` は厳格SQL allowlist・権限・Bodyチェック・復元ルート不在を確認。`tests/check-d1-phase20-physical-sqlite.py` は**Worker本体から抽出した正確なSQL文字列**をSQLiteインメモリで実行し、アーカイブ完全性と物理削除・失敗巻戻し・別対象操作IDを検証。`scripts/d1-phase20-legacy-physical-probe.cjs` は検証mainでCloudflare D1実トランザクションを検証し、独立の事後読取を行う。

## 移行全体の未完了・次の判断

試合の実46版SHA不一致、旧7列互換の原資料・削除アーカイブのリンク/物理行、本人役割と監査、会計残高・先行未確定行・退会/再入会の同値性、47API D1ルート/Read-shadow、実データ・個人情報・領収書の移送同意・保存/廃棄・復旧責任、実本番切替は**すべてNo-Go**。

第20工程後の優先候補は**試合と会計の連携を含むD1本業務移植のデータ保全/移行基準の確認**。旧46版の移送不可問題と本番/実個人情報を勝手に処理せず、次にユーザー判断が必要な対象・範囲を特定して停止する。性能改善/LINE連携の機能開発はD1移行完了後まで保留。本番はユーザー明示事前承認が必須。

※作成時点のGitHub CI/実Cloudflare試験・デプロイ成否は未確認。成功扱いは実ジョブを確認してから追記する。
