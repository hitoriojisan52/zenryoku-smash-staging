# D1第24工程：旧3シート版は導入前のサンプル電子会計帳簿、移行対象外（ユーザー確定）

確定日：2026/11/21。正本確認：main `6b8e61d6a2286672c18c5c9e07ccee1b8a3bd276`、[仕様優先順位](SPEC_PRIORITY_POLICY.md)、[13シート版正本候補の既存決定](D1_APPROVED_SOURCE_13TAB_POLICY.md)、[第22工程の読取専用匿名調査](D1_PHASE22_CANONICAL_13TAB_AND_LEGACY_LEDGER_REFERENCE.md)、[第23工程の過去出欠No-Go](D1_PHASE23_HISTORY_MIGRATION_PREFLIGHT.md)。

## ユーザーが新たに確定した事実（以前の仮定を上書き）

- 旧3シート「運用_全力スマッシュ出欠集金管理表」は、運用管理ツール導入**前にテスト的に作成した電子会計帳簿**であり、中身は**サンプルデータ**。
- 運用管理ツール導入に伴ってGoogle Driveの `bk`（バックアップフォルダ）に格納した。**場所はユーザー申告。今回の作業でフォルダ所属の再検証・移動・変更は行わない。**
- この旧ファイルの**3シート全部（出欠集金管理表、全体収支管理表、マスタ）と会計履歴は一切D1へ移行しない**。旧会計を現行残高に合算せず、将来のD1旧会計参照アーカイブも設計不要。
- 過去に示した「旧会計をGoogleでREAD ONLY保管するA、D1に別アーカイブを設計するB」の**選択待ちは解消**した。旧ファイルは現状のbkに残すだけで、READ ONLYへ権限変更する指示でもない。
- 本件の最新ユーザー確認が優先する。第21〜23工程文書の旧「真偽未確認」「別途A/B判断」「旧会計のopeningへの含有不明」は**調査当時の歴史的記述**であり、移行対象としての最新判断ではない。

## 維持する仕様・対象と範囲

1. 現行13シート「全力☆スマッシュ 運用管理ツール」のみが**将来のD1業務データ移行の正本候補**。現時点の運用正本は既存GAS/Sheetsのまま。
2. 現行13シートのフォーム回答115件、うち現在マスタ外の過去日程回答73件、同一メール+日付反復11行は**旧3シートのサンプルデータではないため、今回の除外と混同しない**。これらの履歴・本人ID・受付対象を無断変換/削除/統合せず、別の歴史的出欠移行設計・承認ゲートを継続。
3. 旧試合SHA不一致46版は既存の**架空21タブD1検証用シートの問題**として保持し、勝手に修復/実移送しない。架空21タブも将来の実業務データの移行元ではない。
4. 現行会計のopening残高、過去繰越、確認/確定済み残高・確定順と排他・本人権限・料金等は引き続き同値確認までNo-Go。**サンプル旧3シートとのクロス計算は移行条件から取り除く**。
5. 全47業務API GAS_ONLY、既存GAS、Worker、LINE/LIFF、Google原本/バックアップ、Cloudflare D1、シークレット・本番への今回の書込み/設定変更はゼロ。性能改善とLINE連携拡張はD1移行完了まで保留、本番は事前承認。

## 実装境界・オフライン検証

- `d1-staging/analysis/phase24-approved-source-guard.mjs` が**旧3シート＝sample-only/業務移行除外、検証用21タブ＝架空移行除外、現13タブ＝計画のみ許容**をfail-closedで固定する。実データの移行・Googleコピー・D1書込・本番切替は例外なく別承認が必要。
- `tests/check-d1-phase24-sample-source-exclusion.mjs` と `.github/workflows/d1-phase24-sample-source-exclusion.yml` は**架空のrole文字列のみのオフライン試験**。既存Phase22の匿名差分ゲートは歴史的実行記録として変更せず、実移行の可否には新しいPhase24決定が優先する。
- これは**今後の移行設計で利用する方針ガード**であり、まだ存在しない実移行実装すべてに物理的に接続したと主張しない。実D1や本番の移行準備ができたことの証明にはならない。

## 次の工程

旧3シート会計履歴の移行・旧会計A/B判断は**終了**。次は**現行13シートの過去参加連絡73件と反復11行の意味/無損失表現・D1日程FK/参加者識別**を仕様とD1候補DDLに照らし、運用中の現行13シートに対して読み取り専用/架空テストで設計を続ける。実個人情報コピー・変更/Cloudflare実D1書込・本番切替は新規承認なしには行わない。

PR/CI/main/Pages/既存Worker Buildsは個別に結果確認して引き継ぎへ記録する。記載前に成功扱いしない。


## 第24工程PR・CI・検証用Pagesの実測証跡（2026/11/21）

[PR #189](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/189) を検証用main `91ef9ade71ccf2a88deffcdce87b0f8d34fc0fae` へsquash統合。

- PR [Phase24 #44899439984](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899439984)、[Phase21 #44899439735](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899439735)、[schema #44899439729](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899439729)、[spec #44899439723](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899439723) は全success。
- main [Phase24 #44899503086](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899503086)、[Phase21 #44899503127](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899503127) success。[Pages #44899502470](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44899502470) workflowとbuild/deploy/report-build-statusの全ジョブsuccess。
- Cloudflare Worker Buildsの今回の反映・遠隔D1件数再計測・GAS/LINE実機の今回再確認は未実施。Google原本・bk・個人情報、現行GAS/Worker・D1実データ、本番への変更なし。実データ移行の承認・完了と混同しない。
