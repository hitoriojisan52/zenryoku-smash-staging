# D1第22工程：13シート正本候補・旧3シート参照専用の確定方針と過去会計履歴の差分ゲート

調査日：2026/11/21。基準main：6bc118023949ad169200a9d0cd5b2412bb706cbf。参照：第21工程調査、引継ぎ第112節、SPEC_PRIORITY_POLICY、現行GASのledgerChronologyCompare_ / ledgerPriorPending_ / balanceRecalc_、D1の20業務表候補。

## ユーザー承認済み方針Aと対象

- 「全力☆スマッシュ 運用管理ツール」13シートがD1への移行正本候補。旧形式「運用_全力スマッシュ出欠集金管理表」3シートはREAD ONLY参照・差分確認専用。
- **旧台帳固有の履歴は別途判断**。どちらの台帳も削除しない。旧収支の暗黙の合算、再計算、正本化は禁止。
- 実データの変更・複製・移送、Google ID/氏名/メール/LINE ID/領収書明細・試合SHAのGitHub記録、Cloudflare D1実書込、本番反映は禁止。旧SHA不一致46版を保全。性能改善・LINE連携開発は移行完了後まで保留。

## 旧台帳固有の会計時期をREAD ONLY確認

接続済みGoogle Sheetsの両「全体収支管理表」の先頭列を限定読取し、YYYY/MM/DD相当の日付セルを一時的に比較。**公開GitHubに個々の日付、元行データ、金額、識別情報、ファイルIDを載せない**。全行を原子的スナップショットしたものではない。

| 匿名集計 | 13シート候補 | 旧3シート参照 |
| --- | ---: | ---: |
| A列の年月日入り行 | 6 | 6 |
| ユニーク日付 | 5 | 5 |
| 共通のユニーク日付 | 0 | 0 |
| 旧台帳のうち新候補の全日付範囲より過去の行 | — | 6 |
| 旧台帳の年月日入り行でB:Gにも値がある行 | — | 6 |

**結論：** 旧3シート版には現行候補で直接確認できない**別の時期の会計履歴候補**がある。これを「未反映の実取引6件」と決めつけることはできない。現行候補のopening繰越に既に含まれる可能性、収支確定/未確定、別時期の会計、過去日付重複、元シート数式の意味が未解決。日付が共通しないことは金額が重複しない証明でもない。

現在のGAS確定業務規則は、日付→種別（opening/practice/reimbursement/other）→行IDの順序、先行未確定行の確定禁止、opening一件・前残高＋収入－支出、確定済み残高の変更禁止、マイナス残高許容。過去記録を無条件に現行ledger_rowsへ追加すると、二重計上・確定順序変更・確定済み残高破壊のリスクがある。

## 第22工程実装（すべて架空・オフライン）

- d1-staging/analysis/phase22-canonical-source-policy.mjs：匿名数値だけを受け取り、13シート正本候補・旧3シート参照専用の役割と移行禁止を確定。個人情報/行内容/Google IDを受け付けない。旧資料の自動合算・削除・アーカイブ化は常に未承認とする。
- d1-staging/analysis/phase22-reference-boundary-offline.sql：**SQLiteインメモリ専用の架空2表とトリガー**。旧参照専用履歴が現行収支表へ混入せず、参照履歴の削除/更新を拒否。D1本番migrationの配置先ではなく、Cloudflareには適用しない。
- tests/check-d1-phase22-source-policy.mjs、tests/check-d1-phase22-reference-boundary.py：完全架空の件数・日付・金額だけで、旧会計の無断合算禁止、openingを起点とする収支計算、確定済み残高維持、旧参照履歴の削除不可を検証。
- .github/workflows/d1-phase22-canonical-source.yml：Google/Cloudflare認証やリモート接続のないoffline CIのみ。Google Sheets、D1、Worker、GAS、LINE、実個人情報や本番への書込・コピーは皆無。

## その他の残存問題

第21工程で確認されたマスタ外の過去フォーム回答73件と同一メール/日程の反復11行は今回の「旧3シートにのみある会計時期」と別問題。いずれも勝手に削除・統合しない。旧SHA不一致46版、本人/権限・退会/再入会・会計の数式との完全同値、領収書・実データ/国外取扱の同意、47 API移行と切替は未承認かつNo-Go。

## 次のユーザー判断：旧3シート版の固有会計履歴の扱い

**A（安全優先）：旧会計履歴は旧Google台帳に読み取り専用で残す。** D1の現役会計に組み込まない。現行13シートのopening繰越との整合性を後工程で検証する。旧Google台帳の保持・参照権限は別に管理する。

**B（履歴をD1からも閲覧する将来案）：旧台帳の会計履歴は現行ledger_rowsと完全分離した「参照専用旧履歴アーカイブ」へ置く設計を開始する。** 二重計上や残高計算に加算しない。元行順・数式・元の正本・閲覧権限/保存期間・監査/復旧条件は別途確認する。**B承認は実個人情報の複製・移送、D1書込、本番反映の許可ではない。**

どちらも旧台帳の削除/自動統合は行わない。未承認の履歴の業務ルート接続、Cloudflare実データ転送、本番反映はしない。

## PR/CI実測記録

このファイルの初版時点ではPR/CI/main結果は未確認。実測確認後に追記する。


## 2026/11/21 検証用mainへの実装・CI実測確定

- [PR #185](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/185) をmain **378b14f7d2e26cff9d2e87d1baf28e9c6587a400**へsquash統合。現13シート正本候補・旧3シートREAD ONLY参照専用を [確定仕様](D1_APPROVED_SOURCE_13TAB_POLICY.md) と仕様優先順位へ反映。公開するのは匿名の差分件数/説明のみ。
- PRの[Phase22 offline #44886028091](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886028091)、[Phase21既存offline #44886028080](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886028080)、[D1 schema #44886028079](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886028079)、[仕様優先順位 #44886028070](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886028070) **すべてsuccess**。完全架空値のメモリSQLite・旧参照の自動合算/更新/削除禁止・現行openingと確定残高保護・匿名数字のみの移行No-Go判定を検証。
- mainの[Phase22 offline #44886073739](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886073739)、[Phase21 offline #44886073738](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886073738) **ともにsuccess**。[GitHub Pages #44886073116](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44886073116) build/deploy/report-build-status **success**。[既存Worker Builds](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/3a885d24-5b41-46e7-80ad-de3e538df597) **success**。これは**現行Worker経路や業務APIのD1切替を示すものではない**。
- 本工程のCloudflare D1 SQL実地書込み／Google実データのコピー・移送・変更は**未実施**。前工程第20工程の旧検証D120業務表0行という証跡を今回の実測と混同しない。旧SHA不一致46版は現状維持・移行禁止。
- **次のユーザー判断地点**：旧3シート版のみの古い日付の収支行を A「旧Google台帳でREAD ONLY保管し、D1の現役会計へ含めない」または B「別途認可の上、将来のD1で閲覧する参照専用履歴アーカイブとして設計（現行収支計算へ一切含めない）」のどちらにするか。いずれも移送/コピー/本番反映の許可ではない。


## 第24工程で旧台帳の種別が確定（2026/11/21・以前のA/B判断を終了）

ユーザーは旧「運用_全力スマッシュ出欠集金管理表」3シートが**運用管理ツール導入前のテスト用電子会計帳簿（中身はサンプル）**で、`bk`フォルダ保管と明示した。したがって旧6行を実取引履歴として取り込む必要はなく、**全3シートをD1移行対象外**とする。本資料の匿名差分・日付集計は履歴的調査結果に限り、現13シートのopening残高との照合のため旧サンプルを合算したり、別D1旧会計参照アーカイブを設計したりしない。旧A/B選択待ちは**解消**。旧ファイルの削除・変更・移動・権限変更は行わない。[最新確定仕様](D1_PHASE24_EXCLUDE_LEGACY_SAMPLE_3TAB.md)。現行13シートの会計と履歴、旧SHA46版ほかの移行No-Goは維持する。
