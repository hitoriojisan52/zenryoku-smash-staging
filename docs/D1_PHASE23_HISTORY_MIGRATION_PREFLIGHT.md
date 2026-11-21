# D1第23工程（事前準備）：旧会計保管方式の判断待ちと、過去出欠の無損失移行ゲート

確認日：2026/11/21。基準：main `252595d6808247a94cd85dde89c06f3122e73052`、[引継ぎ第114節](SESSION_HANDOFF.md)、[第22工程](D1_PHASE22_CANONICAL_13TAB_AND_LEGACY_LEDGER_REFERENCE.md)、[13シート正本候補の確定仕様](D1_APPROVED_SOURCE_13TAB_POLICY.md)、`d1-staging/migrations/0002_business_skeleton.sql`。本資料は**実データ・本番・既存業務コードへの変更を含まない安全な事前調査・オフライン検証**。

## 現時点で確定したこと

- 将来のD1移行元候補は現行13シート管理台帳のみ。旧3シートはREAD ONLY参照・差分専用。Google/GASの実業務正本はまだ移動しない。
- 旧台帳のみに観測された過去会計日付は現在opening残高に含まれる可能性があり、旧会計の収支合算・正本化・自動移動/削除は禁止。
- 現在の参加連絡履歴の一部は現在日程マスタにない過去日程。メール+日程の反復も観測された。これらは**出欠改変の証拠ではなく、履歴のバージョン・同一人識別の確定でもない**。
- 旧試合SHA不一致46版、会計確定順と残高、本人権限、領収書、同意/復旧/バックアップ、47 GAS_ONLY APIは従来のNo-Goを維持。

## 新規の非破壊オフライン確認（GitHubの候補DDLを直接使用）

`tests/check-d1-phase23-history-preflight.py` は既存の `0002_business_skeleton.sql` をSQLiteの**メモリ内のみ**に適用し、完全に架空の開催日・人物IDで次を証明する。

1. `attendances.practice_id` には `practices.practice_id` への外部キーがあり、現行マスタにない過去日程を無断で取り込めない。
2. `attendances` の `(practice_id, participant_id)` は複合主キーであり、同一IDへの履歴版再投入はそのままでは一件ずつ保持できない。**実データのメール+開催日反復が必ずこの主キーと衝突する、という意味ではない**。
3. 衝突行の上書き/自動集約/無断`INSERT OR IGNORE`等ではなく、元の候補データを保持したまま明示拒否する。
4. 別の参加者IDは同日でも共存し、メールだけを使ってD1本人IDやLINE IDを自動推定しない。

この検証は**今ある20表候補の不足/制約を再現するものであり、実データの移行、移送計画の承認、残高計算、履歴保存方式の決定ではない**。過去回答を保持する方式（読取専用の履歴テーブル、元Sheet参照、その他）は会員/日程/履歴/復旧への影響をレビューし、ユーザー判断後に別PRで設計する。受付可能日を過去へ自動追加しない。

## 次のユーザー判断：旧3シート会計履歴

引継ぎ第114節の**未決定の選択**を継続する。

- **A（現行推奨）**：旧3シートGoogle台帳をREAD ONLYで保全し、D1の現役会計には含めない。
- **B**：後日のD1参照専用アーカイブ（現役 `ledger_rows` から完全分離）を**設計することだけ**承認する。**Googleからの個人情報/会計履歴コピー、D1実書込、本番反映の承認にはならない。**

どちらも旧Google原本の削除はせず、会計opening繰越/確定済み残高の照合・旧資料の保持/閲覧権限・保存期間/復旧は別ゲートとする。未選択のままBを既定値にせず、D1アーカイブテーブルや本番・既存APIを新規作成しない。

## 変更と検証の境界

- 変更対象：この資料、架空のin-memory SQLite試験、GitHub Actionsのoffline専用ジョブ、引継ぎ。
- 変更禁止：Google Sheets/Driveの現物・コピー・権限・数式、実D1/Cloudflare Worker/Binding/GAS/LIFF/LINE/Secrets/本番、既存47業務APIのルーティングとデータ。
- 実行後はPR/CI、main、Pages、Workers Buildの事実を区別して記録。オフライン合格を実データ移行可とみなさない。
- 性能改善とLINE連携の追加開発はD1マイグレーション完了まで保留。

## 残存No-Go

旧会計履歴A/B未選択。現行openingへの旧収支含有の有無。過去日程の出欠履歴73件と反復11行の無損失取り扱い。試合SHA不一致46版。実会計・本人認証/権限・監査・退会履歴・本人同意・領収書の同値と復旧。本番切替の明示承認。**実データ/Cloudflareの業務行への書込みは行わない**。


## 第23工程PR/main 実行確認（2026/11/21）

[PR #187](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/187) をmain `e4c318e5c04e1ac9390fe73030548e5af805ed2f` にsquash統合。変更ファイル5件は架空in-memory SQLiteテスト、offline CI、本報告、README、SESSION_HANDOFFのみ。

- PR [Phase23 offline #44898368110](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44898368110) **success**：候補0002 DDLのFK/PK実行、過去日程欠落時拒否、同一仮IDの二重insert拒否、異なる仮IDの共存、SQLite integrity_check、外部接続禁止ASTガード。
- PR [spec priority #44898368035](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44898368035) **success**。
- main [Phase23 offline #44898407884](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44898407884) **success**。
- main [GitHub Pages #44898407172](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44898407172) **build/deploy/report-build-status 全success**。今回のCloudflare Worker BuildsとリモートD1行数の再照合は未実施・未確認。元Google・実D1/Worker/GAS/LIFF/LINE・本番/実会計・実出欠へのアクセス/書込/複製なし。

旧会計A/Bは未選択、実データ/会計/権限・履歴同値・同意/復旧/本番はNo-Goを維持。ユーザー選択後に別段階の設計を進める。
