# D1第2工程：v0.15シート実態の棚卸し・20テーブル設計（検証専用）

確認日：2026/11/21。根拠は `main` SHA `f4041bff78de0221fff1167baa76121301264f62`のGAS/Worker、[既存仕様優先順位](SPEC_PRIORITY_POLICY.md)、[直近会計仕様](stage-v1694-ledger-snapshot-performance.md)、[退会/再入会仕様](stage-v1653-withdraw-rejoin.md)、および接続検証用シート **「全力☆スマッシュ 接続検証用 v0.15（架空データ）」**のGoogle Sheets metadataとヘッダーを読み取り専用で確認した結果。**本番原本を全面解析した結果ではない**。

検証用Sheet（読み取り専用）：https://docs.google.com/spreadsheets/d/1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac/edit

## 1. 目的・変更してよいもの

- 目的：初期D1接続実証の次に、シート実態と現行コードに根拠のある**空の業務スキーマ**とオフライン試験を準備する。
- `0002_business_skeleton.sql`：個人名/LINE ID/財務額/履歴を**1行も移し替えない**20テーブル。既存の`0001_bootstrap_probe.sql`を保持。新規列や型は既存の保存値の意味を変える承認ではない。
- 既存`cloudflare-worker/worker.js`・`wrangler.toml`・GAS・LIFF・Sheets・Drive・本番の実物と設定を**変更しない**。現在もGAS+Sheetsが唯一の業務データ正本。D1のデータは空であることが合格条件。
- `D1_STAGE_DATABASE_ID`、Cloudflare Token、LINE User ID、顧客データをコミット/チャットに持ち込まない。コードへのD1バインドも未実施。空テーブルのステージングへの自動migrationのみ実行対象。
- まだ実データの移行や2系統同時書き込みをしない。「D1 schemaが適用された」＝「業務がD1に移った」ではない。

## 2. Google Sheetsの21タブ（内訳：検証ガイド1＋業務20）

現時点のタブ名と**A1ヘッダー**をGoogle Sheetsの直接読取で確認。ヘッダーとD1対応を明示する（UIやGASの`operation`と混同しない）。

| タブ | A1からの現行ヘッダー | 提案テーブル |
|---|---|---|
| 検証ガイド | 全力☆スマッシュ｜v0.15 接続検証専用シート（業務テーブルではない） | なし |
| メンバー | memberId, displayName, lineUserId, active, isAdmin, nameKana | members |
| 当番チーム | teamId, teamName, active | duty_teams |
| チーム所属 | teamId, memberId, active | team_memberships |
| 練習日程 | practiceId, date, place, startTime, endTime, hours, enabled, remark, version | practices |
| 出欠回答 | practiceId, participantId, displayName, nameKana, category, attending, remark, version, registeredBy | attendances |
| 集金記録 | practiceId, participantId, completed, version, updatedBy, updatedAt | payments |
| 全体収支管理表 | 日付, 開催場所・費目名, 集金額, 支出, 残金, 確認者, rowId, kind, practiceId, status, version, 当日補正, 費目, 立替者, receiptFileId, 作成者 | ledger_rows |
| 操作履歴 | operationId, operation, actorMemberId, timestamp, targetId, resultJSON | operation_audit |
| 試合セッション | practiceId, activeRevisionId, sessionVersion, settingsVersion, updatedAt | match_sessions |
| 試合版管理 | revisionId, practiceId, stage, stateJSON, sha256, operationId, createdAt, chunkIndex, chunkTotal | match_revision_chunks |
| 試合操作履歴 | operationId, practiceId, actorMemberId, action, sessionVersion, createdAt, details | match_operation_audit |
| 登録申請 | requestId, lineUserId, displayName, status, requestedAt, decidedBy, decidedAt, memberId, nameKana | registration_requests |
| 閲覧リンク | tokenHash, practiceId, expiresAt, revokedAt, issuedBy, createdAt | guest_links |
| 退会履歴 | memberId, displayName, withdrawnAt, withdrawnBy, state, operationId | withdrawal_history |
| 現金確認記録 | practiceId, auditDate, countsJson, cashTotal, bookBalance, difference, version, updatedBy, updatedAt | cash_audits |
| 日程削除アーカイブ | operationId, practiceId, archivedAt, archivedBy, chunkIndex, chunkCount, snapshotChunk, status | practice_delete_archive_chunks |
| 参加者操作アーカイブ | operationId, practiceId, participantId, action, beforeJson, createdAt, actorMemberId, status | participant_action_archive |
| 試合削除アーカイブ | operationId, practiceId, archivedAt, archivedBy, chunkIndex, chunkCount, snapshotChunk, status | match_delete_archive_chunks |
| ビジター申請 | requestId, practiceId, participantId, name, nameKana, memo, requestedByMemberId, status, version, requestedAt, reviewedAt, reviewedBy, lastOperationId | visitor_requests |
| ビジター審査アーカイブ | operationId, requestId, practiceId, actorMemberId, action, beforeJson, createdAt, status | visitor_decision_archive |

**数式の限定検査**：核心となる10タブ（メンバー/当番チーム/チーム所属/練習日程/出欠回答/集金記録/収支/登録申請/ビジター申請/現金）のA1:P20の現存セルでは、`userEnteredValue.formulaValue`が0件。**全セル／他11タブ／本番の数式なしとは主張しない。** 現行業務演算はGASにあり、後工程で型・物理列・全行・計算の再検査が必要。

## 3. 参照関係と履歴保持

1. 現役のみ：`team_memberships`→`members`/`duty_teams`、`attendances`→`practices`、`payments`→出欠の`(practice_id, participant_id)`。練習日の物理削除は、従来同様にアーカイブと関連レコードを整合順に処理する。DB外の直接更新・CAS失敗は不可。
2. 会計`ledger_rows`の練習日参照は`practice_id`がある行のみ。確定・立替・その他・繰越があるため、全会計行を練習日へ必須紐付けしない。領収書IDもGAS/Driveの権限制御を保持する。
3. `operation_audit`・`match_operation_audit`・`withdrawal_history`・各アーカイブの`actor_member_id`、`withdrawn_by`など**過去の人物IDは、現役membersへFKを張らない**。退会で現役メンバー行を物理削除しても過去のIDと証跡を変更しない。
4. `registration_requests`で承認時に新しいmemberIdを採番。LINE IDを再利用した退会後の再申請に対し、旧memberIdは復活させず旧履歴を残す。
5. `match_revision_chunks`は現行の最大30チャンク×30,000 UTF-16文字の復元・sha256整合性を保護。複合キー`(revision_id, chunk_index)`。D1側でも全チャンク検証後、sessionのactive_revision_idを版番号検証とともに1トランザクションで変更する（次工程）。
6. `guest_links`はハッシュだけを保存し、原文トークンを保存しない。失効/期限のサーバー照合を維持する。

## 4. 会計の最優先の確定順序

現行`gas-staging/コード.gs`の`ledgerChronologyCompare_`と`balanceRecalc_`を読んで確認した確定順は、日付の昇順、同日`opening=0, practice=1, reimbursement=2, other=3`、同一kind内はrowId辞書順。**単純にD1の`ORDER BY date, kind`を使うと結果が違う**。D1側の将来のクエリでは`ORDER BY ledger_date, CASE kind WHEN 'opening' THEN 0 WHEN 'practice' THEN 1 WHEN 'reimbursement' THEN 2 WHEN 'other' THEN 3 ELSE 5 END, row_id`を使う。

- 残高：OPENINGの確定済み残金を初期値に、後続行の`前の残金 + 集金額 - 支出`。JPY整数、小数不可、負残高可。後日の確定済み行の残金を変える修正は禁止。
- 確定：古い未確定行（同日順も含む）がある限り拒否。未来日とopeningも確定不可。画面とサーバーの両方でガード。
- 確定解除：管理者だけ。時系列で後続の確定行が残る場合は解除不可。
- 同時処理：GAS ScriptLockを抜く際は、1トランザクション内で権限都度照合、`operationId`重複照合、期待version比較更新（CAS）、再計算、監査・結果保存を一括実行し、409なら書き込まず自動再送しない。D1のスキーマ制約単独では実現できないため**本段階では会計APIを作らない**。

## 5. 型・性能・移行の残リスク

- 日付/日時は現行シート上でISO型・文字列・Google Date表現が混在。スキーマでは`*_raw TEXT`として欠落なく受け取る候補とした。実データ移行までに原本形式と日本時間境界を固定し、検証できない日時を勝手に変換しない。
- `line_user_id`は現役メンバーに限りUNIQUE。氏名/カナ/個人情報は現時点ではD1へ転送しない。D1を含む第三者へのデータ保管・削除/保持・バックアップ権限は本番移行前に明文化する。
- `ledger_rows`の金額はINTEGER円、版番号は0以上整数。現行帳簿の`opening`行の一意性、`P-<practiceId>`対応の重複禁止・欠落検知、月次の繰越、時系列確定はサービスロジック側が追加で保証する。Sqlite FK/チェックだけでは保証されない。
- 移行前に全20業務タブの実データを**読み取り専用**でスナップショットと集計照合し、複合キーの重複・孤立・空欄・時刻・JSONチャンク整合性を調べる。型変換が未確定な行を無断で補正しない。D1初期テーブルへ個人データを仮投入しない。
- インデックスは`practice_date`、参加/集金のpracticeId、ledgerのdate/kind/rowId、operationId PK、試合版・閲覧リンク・ビジター審査を優先。実際のD1`rows_read`とパフォーマンスp50/p95で改善効果を判断。
- バックアップを未構築のまま会計/履歴を移行しない。D1 Time Travelだけを永続監査の代替としない。

## 6. CIと段階受入

- `tests/check-d1-business-schema.py`：D1と互換のSQLite in-memoryに0001/0002を実行、20テーブル/必要列、過去ID保護、重複LINE ID拒否、退会→再入会、孤立集金拒否、CAS、トランザクションロールバック、**現行GASと同一の時系列ソート**を架空値で検査。現行会計/出欠/退会/試合のGAS既存テストも継続。
- `.github/workflows/d1-staging-check.yml`（PR）と`d1-staging-migrate.yml`（mainの検証用D1）にスキーマ試験を追加。Cloudflareのアカウント/DB UUID・名前一致の既存ガードを維持。schema migrationは**非破壊CREATE TABLE / INDEXのみ**。
- 次にスキーマをD1へ適用したとしても、まだサービスAPIは存在しない。現行運用画面は一切変わらず、既存データをD1へコピーもしない。
- その後の別PRで**D1読み取り専用API（架空fixtureだけ）**を分離実装し、本人認証・ロール・CORSの安全性を検証。必要な外部Workerの新規作成や認証の手動設定があれば、ユーザー初期設定必須条件との兼ね合いを先に報告する。
- 本番D1本格導入は、この段階の「テーブル構造」をそのまま本番確定スキーマと見なさず、業務ロジックのパリティ・全データ照合・実機確認と明示承認後に判断。
