# D1第25工程：現行13シートの参加回答115行、過去日程・代理申込候補の無損失保護（READ ONLY）

調査日：2026/11/21。基準main：`90788a0949bc7e63cda9b2e3d440f0c52525a10d`。[最新の正本/サンプル除外確定仕様](D1_PHASE24_EXCLUDE_LEGACY_SAMPLE_3TAB.md)、[仕様優先順位](SPEC_PRIORITY_POLICY.md)、[第21工程調査](D1_PHASE21_LIVE_SOURCE_READONLY_AUDIT.md)、[第23工程FK/PK事前検証](D1_PHASE23_HISTORY_MIGRATION_PREFLIGHT.md)、候補`d1-staging/migrations/0002_business_skeleton.sql`、`gas-staging/コード.gs` の練習/出欠/本人固定・参加者更新/集金保護を再確認した。

## 対象と境界

- **唯一の将来移行元候補**は、現行「全力☆スマッシュ 運用管理ツール」13シートのGoogleフォーム回答。旧3シートのサンプル会計と別。既存21シート架空検証用GAS/Sheet/20表は**移行先候補の仕様参考**であり、実13シートのデータ正本ではない。
- Google Drive/Sheets接続による**READ ONLY**のメタデータ/限定rangeの一時集計だけを行い、**名前・メール・個々の回答・日時・備考・ファイルIDをGitHubへ保管/公開しない**。今回の検証は単一原子的スナップショットではなく、調査時点の観測。シートが更新されれば件数が変動する。
- Google原本/バックアップ/bkとGAS/Worker/LINE/LIFF/Cloudflare D1/本番に**書込・コピー・設定変更なし**。21シートの架空SHA不一致46版を未承認で修復しない。47業務API GAS_ONLY。

## 実13シートの限定匿名調査で分かった事実

- `フォームの回答` はA:Gの**7列**：タイムスタンプ、メールアドレス、開催日、お名前、出欠、区分、備考。H:Mの先頭203行には入力値なし。これは**現行の7列表示値**についての確認であり、シート全メタデータ/セル型の全バックアップではない。
- データ**115行**、日時・メール・名前・開催日が空白の行は今回確認した範囲で**0**。回答日は**5種類**。練習日程マスタ9日程のうち**2日程と一致する42行**、現マスタの外にある**過去3日程の73行**（32、21、20行）。現在の受付対象G列チェックと連動して過去日程を再公開してはいけない。
- `メールアドレス＋開催日`で**7グループ計18行**が複数件、合計**11行は同キー2件目以降**。この「11」は**削除できる重複11行の意味ではない**。
- **7グループ中6グループは名前が異なる**：同一メールで複数参加者を申し込んでいる可能性（※代理・家族と断定しない）。**残り1グループは同じメール・開催日・名前だが出欠が異なる**：修正や別回答の可能性があるが、どちらを有効にするか未確認。全7グループでタイムスタンプは全件同じとはならない。
- `メールアドレス＋開催日＋お名前`まで一致した再出現は**1グループで追加1行**、その出欠は異なる。**メールアドレスは参加者ID/LINE IDとして使用できない**。名前だけでも本人IDは確定しない。
- 区分の表示は**メンバー89、ビジター15、当番担当8、シャトル担当3**、出欠は**参加90、欠席25**。現GASの9列`出欠回答`は`practiceId/participantId/displayName/nameKana/category/attending/remark/version/registeredBy`であり、7列の元フォームには**不変の参加者ID、LINE ID、版番号、登録元IDが存在しない**。9列への直接コピー/メールによる自動マップは不正確。
- サンプル3シートとこれら115行は**別ファイル**。旧3シートの行や収支を今回の判断対象へ戻さない。

## 維持すべき業務ルール

1. 元フォーム行は現在の観測順/タイムスタンプ/全7項目を区別して保護。**同じメール+日付の行を無断削除/上書き/マージしない**。表示時に古い行の参加区分や出欠が自動で最新扱いにならないよう分離。
2. `practices`の現行9日程だけから73過去回答の参照先を勝手に作成すると旧GASの受付/料金/確定/集金・試合条件が変わり得る。**過去日をenabledとして復活させない**。
3. 元回答の「メール・氏名」を現D1 `members.member_id`、`line_user_id`、`attendances.participant_id`と自動結合しない。申込代行や退会/再入会、ビジター登録、操作履歴等の確定仕様は維持。
4. 収支と集金はこの履歴から自動算出しない。収支確定順、opening繰越・確定済み残高の保全と排他、権限を従来どおり優先。
5. **Googleフォームの履歴行が過去に編集/削除されたかどうかは、現時点の115行だけでは復元できない**。タイムスタンプがあっても過去のすべての版が判明するわけではない。最終的な移行では原本のネイティブバックアップ、取得時点、セル型、数式/入力の評価差、行対応・ハッシュ/件数照合と復旧計画を別承認で定める。

## 第25工程の安全な実装（あくまで設計案の架空デモ）

- `d1-staging/analysis/phase25-form-answer-history-offline.sql` に**SQLiteメモリ内専用**の仮テーブル`phase25_synthetic_form_response_history`を作成。元シートの**物理行番号 + A:Gの7表示値を丸ごとJSONの順序つき配列**として保持し、過去/現マスタ一致を補助フラグとして別管理する。メール・日付・氏名はユニークキーにしない。旧日程のFK無し、現役`attendances/payments/ledger_rows`との無接続、元行の更新/削除トリガーで禁止。**このテーブルの新規設置はまだD1 migration実装でもユーザー承認済みデータ保存方式でもない**。
- `tests/check-d1-phase25-form-answer-history-sqlite.py`は**公開Google実データなし**の架空メール`.invalid`/架空氏名・未来開催日だけを使い、既存`0002_business_skeleton.sql`と仮SQLを**SQLite :memory:**に適用。同一メール・異なる氏名・同一名出欠変更の全行保持、過去日程を作らず実業務出欠/集金/収支に混入しない、行番号衝突・更新/削除拒否、元候補FK違反を検証。
- `.github/workflows/d1-phase25-form-history-offline.yml`は認証・ネットワーク/Cloudflare操作・Googleコピー無しのoffline-only CI。Python SQLiteのローカル成功はCloudflare Native D1/実個人情報移送・排他動作を証明しない。
- **注意**：仮表のJSONは7セルの**表示値**を忠実に分ける最小候補。Googleネイティブ値・時刻の型・セルフォーマット/数式・正式な原本監査を再現する保証ではなく、移行時に入力型の無損失性検証が必要。トリガー/SQLの存在だけでは実D1の認可と削除防止を保証しない。

## 次に必要なユーザー判断：現行13シートの過去回答をどこまでD1に保管するか

ここまでの匿名READ ONLY調査と**架空オフライン案の作成のみ**は実施可能だが、実際の13シートフォーム履歴をD1へどう移すかは既存仕様/個人情報の保持に影響するためユーザー承認なしに確定しない。

**A（推奨：履歴重視）**：将来のD1に**フォーム回答全115行を別の参照専用履歴として保持する設計**を承認する。過去73行、メール＋日付反復11追加行、出欠が異なる同名1組を**別行のまま維持**。現行9日程の`attendances`や収支/集金と分離し、参加者ID/LINE ID紐づけは別途検証/承認。元Googleシートも保全。**Aは設計承認だけで、実PIIコピーやD1書込、本番反映の承認ではない**。

**B（Google参照保全）**：過去73行を含む現フォーム回答履歴は**元Googleシートで保全し、D1に新しい個別回答履歴テーブルを設けない**。必要な現役出欠レコードだけを本人・同日複数申込/衝突の確認後に別設計で取り込む。過去データ閲覧はGoogleのアクセス/保持に依存する。**元Google削除/変更や現役データ自動作成を承認する選択肢ではない**。

いずれも現行フォーム回答**115行**の勝手な「最新行化」・削除・自動名寄せを禁止し、Google原本と実出欠を維持、旧3タブ完全除外、現行収支・集金・会員認証は変更せず、実データ移送と本番は別事前承認。次工程で本人識別/同一人名異出欠の最終状態、日程マスタとの履歴連携、閲覧権限/同意・保持期間・バックアップの安全設計を行う。

## 実行結果（PR・CI・Pages・Worker）

本資料作成時点で**未確認**。PRとCIを実測後に追記する。確認したことだけを成功として記録する。


## 第25工程のPR/CI/Pages/Worker Buildsの実測確定（2026/11/21）

[PR #191](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/191) を検証用main `ef2e78b797f20dc9ff49fd80ba266b9abdd4f4c7` にsquash統合。実データ・現役GAS/Worker/Cloudflare D1/LINE/LIFFは変更なし。

- PR [Phase25 #44900365556](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900365556)、[schema #44900365474](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900365474)、[Phase21 #44900365471](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900365471)、[spec #44900365480](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900365480) **全success**。
- main [Phase25 #44900411604](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900411604)、[Phase21 #44900411637](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900411637) **全success**。[Pages #44900411242](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44900411242) build/deploy/report-build-status含むworkflow **全success**。[既存Worker Builds](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/3402cdf4-d557-4f7c-946f-2575f0af2867) **success**。
- 実データのGoogle/Cloudflare D1への書込・コピー、既存D1業務表のリモート件数再測定、GAS再配備、LINE実機・本番切替は**未実施**。ユーザーA/B待ちを維持する。


## 第26工程でユーザーがAを正式承認（2026/11/21）

本資料の末尾より前に示した「履歴をD1に分離保存するA、Googleにのみ保管するB」は**ユーザーがAを明示承認したため選択済み**。現行13シートのフォーム回答全行を将来のD1に参照専用として**現役業務データから完全に分離する設計**を進める。Bは採用しない。実データ移送・本番反映はユーザーが明示的に不承認。**次のユーザー判断地点は閲覧権限（管理者だけ／管理者＋当番担当）**。新しい確定仕様は[第26工程承認済み方針](D1_APPROVED_13TAB_FORM_HISTORY_POLICY.md)と[第26工程設計](D1_PHASE26_APPROVED_HISTORY_DESIGN.md)を優先し、旧選択待ちは歴史的記録としてのみ残す。
