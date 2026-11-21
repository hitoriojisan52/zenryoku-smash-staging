# D1第26工程：承認済みAによる現行13シートのフォーム回答・参照専用履歴設計と安全ゲート

設計日：2026/11/21。GitHub確認時点main `6e8878ee3479aa0cf180cdbcb85c901492d4adf0`。[正式に確定した履歴保存A](D1_APPROVED_13TAB_FORM_HISTORY_POLICY.md)、[第25工程の匿名READ ONLY調査](D1_PHASE25_FORM_ANSWER_HISTORY_CONFLICT_AUDIT.md)、[旧3シートのサンプル除外](D1_PHASE24_EXCLUDE_LEGACY_SAMPLE_3TAB.md)、`gas-staging/コード.gs`（練習・参加者・会計の現行ルール）、既存`0002_business_skeleton.sql`（20表候補）を照合。

## 完了/未完了と許可境界

- **確定済み**：ユーザーはA「将来のD1に現行13シートのフォーム回答を、現役データとは完全に分離した参照専用履歴として保存する**設計**」を明示承認。実データ移送と本番は明示的に未承認。
- **今回の設計対象**：データの由来/取得時点/原行の保持、重複を残す複数スナップショット、元の出欠と現在の運用データの分離、上書き防止、閲覧権限の保守的な仮ゲート、完全架空値によるSQL/回帰テスト。
- **変更禁止**：13シート原本・bk・旧3シート・検証用架空21シート・個人情報/メール/領収書実明細・Google Drive権限、Cloudflare D1の実業務表/Worker、GAS/47 GAS_ONLY API、LINE/LIFF、実D1 migrationの適用、本番。古いSHA不一致46版の再ハッシュ・修復/コピーも禁止。
- **本変更は実行可能な本番D1 migrationではない**。SQLは`d1-staging/analysis/phase26-*`へ配置し、`d1-staging/migrations/`の既存定義・Worker binding・CIデプロイから分離。GitHub Pages/Worker自動ビルド成功はD1業務データ切替を意味しない。

## 現行との整合性

- 現13シートの「フォームの回答」はA:Gの7列（タイムスタンプ、メールアドレス、開催日、お名前、出欠、区分、備考）。第25工程READ ONLY時は**115行**、日程マスタ内**42行**、過去の日程**73行**。メール＋開催日反復は**7組計18行、追加11行**。そのうち6組は名前が異なり、残り1組は同名で出欠が違う。**115は固定件数でなく読取時点の観測値**。
- 検証用GASの`出欠回答`は9列の`practiceId/participantId/displayName/nameKana/category/attending/remark/version/registeredBy`。元フォームにはそのID・版がない。現行13シート側はD1候補20表と1対1の対応ではなく、**メールだけでmemberId/LINE IDを生成しない**。
- 旧3シートの会計サンプルと21シートの架空試合版/その他検証用データは正本移行から除外したまま。後者のSHA不一致46版の異常は検証用データの問題として別途保全。現役会計・集金・参加者・試合には履歴の値を再計算入力しない。

## 分離履歴の概念設計

| 候補オブジェクト（**offlineのみ**） | 用途 | ルール |
| --- | --- | --- |
| `phase26_synthetic_form_snapshots` | 取得単位の出典役割、固定フォームタブ、取得日時、想定行数、7列種別、全行マニフェストSHA | 元13シートだけ許容、旧3シート拒否、取得単位をUPDATE/DELETE/REPLACE不可 |
| `phase26_synthetic_form_rows` | `snapshot_id + source_row_number`の複合キー、A:Gの7表示値、行SHA、日付索引、現在マスタ内外の取得時点フラグ | メール/日付/名前にUNIQUEを置かず、行ID衝突・UPDATE/DELETE/REPLACEを拒否 |
| `phase26_synthetic_form_readonly` | 履歴プレビュー候補のSELECTビュー | 本人・集金・収支・練習マスタへの参照/更新/自動名寄せゼロ |
| `phase26-history-read-guard.mjs` | 公開API前の純粋な権限設計テスト | 認証なし拒否、**暫定：サーバー検証済み管理者だけ**許可、一般/当番は拒否。**実APIは存在せず閲覧ロールの本承認ではない** |

**同一snapshot_id内の元行番号は一意**、異なるsnapshot_idの同じ元行番号は別版として並存できる。行番号はGoogleシートの恒久IDではない。後日Google側で行挿入・削除・編集があれば、過去スナップショットと比較して人手・ルールレビューし、最新1行選択や元回答の消去をしない。A:GのJSONには名前・メール・備考が入り得るため、**架空テスト以外の値をGitHubに出さない**。暫定SHAは行単位JSONのUTF-8ダイジェスト例。将来の実移行ではセル型/ネイティブ値/表示値/正規化・時刻と元シートのネイティブバックアップへの忠実性を定義するまで「完全な原本再現」とは宣言しない。

## 安全な検証内容（架空・ローカルSQLiteメモリのみ）

- 既存の20業務表候補DDLをインメモリSQLiteへ読み込み、別の架空スナップショット/元回答だけを追加。実際のGoogleフォーム行や実個人情報は使わず、`.invalid`架空メール・架空人物・未来日程で確認。
- 同一メール/同日で異なる名前、同名で反対の出欠、過去日程の原行も**全行**保存され、順序/7列/マニフェストSHAのリードバックが一致すること。
- 元スナップショットのUPDATE/DELETE、同キーの重複INSERT、`INSERT OR REPLACE`と`INSERT OR IGNORE`のサイレント上書き/黙殺が拒否されること（recursive_triggers OFFも試す）。別スナップショットとして再取得しても既存版は変わらないこと。
- 旧3シート役割を拒否し、過去日程を自動的に`practices`へ作成せず、`attendances/payments/ledger_rows`件数と収支、受付enabledを変えないこと。
- 閲覧の純粋関数は、サーバーで検証された仮の管理者コンテキストのみ通過し、一般/当番/未認証/偽装等を拒否する。これは**実LINEトークン検証や実D1の認可実装を代替しない**。

## 本番設計との差と残存懸念

1. **原本取得の同時更新**：Google Sheetsの複数range GETは原子的なバックアップとは限らない。ユーザーによる実データコピー事前承認、Google原本ネイティブバックアップ、取得前後のハッシュ/件数/更新日時の同値、差分があれば中止・再試行が必要。仮SQLでの一括挿入も現実のD1 transaction/認可書込とは違う。
2. **マニフェスト/原本真正性**：SQLの`row_sha256`は64桁文字形だけ検査する（真正なSHA値かどうかは**将来の書込/読戻し検証ロジック**が必要）。形式・時刻・式・型・行番号・本人/LINE連携の正確性は未保証。第25工程の表示7セル配列だけではGoogleネイティブ全セルを復元できない。
3. **参照権限/個人情報**：Google回答のメール、氏名、備考は会員以外のデータを含む可能性もあり、閲覧者を曖昧にしたまま画面/GET APIを作らない。現行フォームの個人情報収集目的・同意、保存期間、退会・削除要請/バックアップからの消去と監査を業務規則と法令の両面で確認。SQLトリガーはデータベース管理権限者の意図的操作を防ぐ完全な技術障壁ではない。
4. **現役の出欠42行**：履歴としての42行保管はAで承認されたが、現役の参加者一覧へどう反映するかは別判断。メール/名前をparticipantIdに使わず、本人識別・代理申請の区別・出欠が異なる2行のどれが正しいかを先に確定する。**履歴の全行保存＝現役参加者の自動登録ではない**。
5. **古い回答73行**：アーカイブには残すが、過去日程を`practices`に増やさず、参加受付/試合/集金対象・確定順と混ぜない。

## 次のユーザー判断地点：**履歴の個人情報を閲覧できる役割**

閲覧対象の新規画面/APIを作る前に、個人情報保護と既存の権限設計との整合について**選択を依頼**する。現在の管理ツールには`member`（一般）、`duty`（当番）、`admin`（管理者）がある。履歴には通常の参加者一覧より詳細な**過去メール・タイムスタンプ・備考**が入り得るため、既存参加者一覧の閲覧許可をそのまま流用しない。

- **A（推奨）：管理者だけ閲覧できる**。当番担当と一般参加者には参照APIを公開しない。データ最小化・管理者監査を優先。将来の新規専用画面を作る場合も管理者用に限定し、本人LINE確認と読み取り監査が必要。
- **B：管理者と当番担当が閲覧できる**。運用上の利便性はあるが、原始フォームに含まれるメール/備考の閲覧範囲が広がる。個人情報の取得目的・当番への開示の許容と監査が確認されるまで実装は停止。
- **一般メンバー/匿名の閲覧**は今回の2案には含めない。

上記のいずれの判断も**設計段階の閲覧ロール方針に限る**。実データのD1保存/閲覧画面・API公開、Google元シート権限変更、本番反映や自動本人紐付けの承認ではない。実データ保持の法的同意/保存期間と復旧・消去条件については別の明示確認が必要。

**参照資料**：Cloudflareの公式説明ではD1はSQLite系のSQL/JSON/トリガー・外部キー制約を利用できるが、マイグレーションは設定済みmigrations_dirなどから適用される。このため今回の試験SQLを`analysis/`に隔離し、本番/検証D1には適用しない。[D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/)・[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。

## PR・CI・Pages・Worker Build結果

記録時点では未確認。実測結果を後から追記し、GitHubオフライン成功を実Cloudflare SQL/実データ移送成功と混同しない。


## 第26工程PR・CI・検証用デプロイ実測（2026/11/21）

[PR #193](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/193) は検証用main `009e4d8c0a972c38056899cda6e478241ae61345` へsquash統合。

- PR [Phase26 #44917139998](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917139998)、[schema #44917139912](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917139912)、[spec #44917139971](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917139971)、[Phase21 #44917139922](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917139922) **すべてsuccess**。
- main [Phase26 #44917199528](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917199528)、[Phase21 #44917199558](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917199558) **success**。[Pages #44917199035](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44917199035) build/deploy/report-build-status job全success。[既存Worker Builds](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/dcc08c49-4f59-4863-ad12-44fac8e32d2e)もGitHub check run **completed/success**。
- **実データ移行・Cloudflare実SQL適用・D1行数新規検査・既存GASの再デプロイ・LINE実機/本番切替は未実施**。Google原本/旧3シートbk/Worker業務API/47 GAS_ONLY API/本番設定の今回の変更なし。Aの履歴保存設計は確定、閲覧ロールA/Bと個人情報の実移送は別途事前承認が必要。
