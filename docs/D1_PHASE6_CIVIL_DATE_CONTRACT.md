# D1第6工程 — JST暦日・Google Sheetsシリアル・操作履歴時刻の変換契約（実データ移行前）

日付：2026/11/21 JST。根拠：現在の `main` `36f4093829f309db164035c981abf30d5334616d`、`gas-staging/コード.gs`、`docs/SPEC_PRIORITY_POLICY.md`、`docs/D1_SCHEMA_DESIGN.md`、[第5工程の実シート監査](D1_STAGE_SHEET_PREFLIGHT.md)、[チーム所属の原因調査](D1_TEAM_MEMBERSHIP_ROOT_CAUSE.md)。

## 1. 変更しない既存仕様と今回の制約

- GASの `today_` と `now_` は `Asia/Tokyo` で `yyyy-MM-dd` と `yyyy-MM-dd HH:mm:ss`。 `ledgerDate_` はSheetの `Date` をJST `yyyy-MM-dd` にし、文字列は `str_` によるtrim以外に変換しない。 `scheduleRows_` はこの結果にISO日付の厳密な妥当性と日付・IDの全体一意性を要求する。
- `scheduleTime_` は `Date` であれば `Asia/Tokyo HH:mm`、文字列であれば `H:mm` を `HH:mm` に揃え、その他は元文字列を返す。
- `audit_`は操作ID／種類／操作したmemberId／JST時刻／対象ID／結果JSONの6列を記録。`attendanceAuditTime_`は日付値をJST `yyyy-MM-dd HH:mm:ss` に変換し、日時文字列も元の形式を尊重する。`attendanceAuditDates_`は `attendance.submit` の`targetId`ごとに初回／最終のJST秒単位文字列を取得。**時間順序・監査原文・操作IDの冪等性を崩さないことが必須**。
- シート原本のタイムゾーン（接続検証用の読み取り専用メタデータ確認）は `Asia/Tokyo`。`UNFORMATTED_VALUE` で数値が返っても、**Google Sheetsの日付シリアルは「1899-12-30を0日とするシート内の暦日・時刻」であってUnix epochやUTCの絶対時刻ではない**。数値 `DATE_TIME` に先にUTCの9時間を足すと日付・操作履歴がずれる。

## 2. 確認できたセルの実態（セルの内容はGitHubに記録しない）

2026/11/21に接続検証用**架空データシート**のCellDataを**読み取り専用**再確認した。書式とeffectiveValueだけを一時集計し、氏名・ID・金額・監査JSONは出力しない。

| 取得範囲 | 型の内訳 | 備考 |
| --- | --- | --- |
| 練習日程 B2:B6 | numberValue 4 (DATE)、stringValue 1 (文字列) | 文字列はISO相当 |
| 練習日程 D2:E6 | numberValue 8 (TIME)、stringValue 2 | 時刻は `H:mm` 系 |
| 全体収支管理表 A2:A12 | numberValue 7 (DATE)、stringValue 2 (TEXT) | 2行は文字列ISO相当 |
| 操作履歴 D2:D26 | numberValue 25 (DATE_TIME) | **直近25行のみ**。全210行の精度・変換の完全一致とは主張しない |

## 3. 実装した非公開・読み取り専用の候補

`d1-staging/phase6/civil_codec.py` は外部依存なしの純粋関数 `project_cell(value, semantic, number_format, spreadsheet_timezone)`。入力はSheets API `effectiveValue` の `numberValue` または `stringValue` を表す値と、`effectiveFormat.numberFormat.type`、明示した業務上の型 `date|time|datetime`、タイムゾーン。

- **DATE**：数値がDATE書式であり日部分以外が0に近いときだけ、`1899-12-30`からJSTの暦日 `YYYY-MM-DD` を得る。文字列は正しいISO日付のみ。1900年より前・不正な日付・混乱した書式は拒否。
- **TIME**：TIME書式の数値0以上1未満について時刻の**分境界**にあることを確認し `HH:mm` を返す。文字列 `H:mm` と `HH:mm` はGASと同じ `HH:mm` にする。微妙な端数、日跨ぎ、未知の書式は拒否。
- **DATE_TIME**：DATE_TIME書式のシリアルの整数日はJST暦日、小数部はローカル時計の秒。GAS `yyyy-MM-dd HH:mm:ss` と同形のJST時刻を返し、必要なときだけ**JSTからUTCへマイナス9時間で**絶対時刻を別フィールドで導出。曖昧な `Z` 付き文字列や有効な秒への丸めでは失われる端数は拒否。
- **精度**：実数表現の細かい誤差のみ（50ms以内）を許容し、秒・分単位から外れる元データは**自動補正しない**。変換後も `source_type`、`source_text`、`number_format` を保持。ただしSheetsのセル書式・数式などを再現する**完全バックアップにはならない**ため、原本の別バックアップは前提。
- `assert_unique_canonical_dates`：練習日程の日付は**過去・非公開を含む全レコード**で正規化後の重複を拒否（数値と文字列の重複も拒否）。実レコードを検索・更新するものではない。
- `tests/check-d1-phase6-civil-codec.py`：**架空データのみ**でJST/UTC日跨ぎ、年跨ぎ、うるう年、DATE/TIME/DATE_TIME、文字列、秒精度、ブール値・NaN/Infinity・無効日付・意図しない書式・入力重複の拒否をチェックし、GASのdate/clock/audit契約と既存47 API `GAS_ONLY` ガードを照合。
- `.github/workflows/d1-staging-check.yml` に新規PRゲートを追加。旧会計・出欠・退会・試合およびD1の第5工程ガードは残す。

## 4. 未完了・移行の受入ゲート

- **今回のコードはGoogle SheetsやCloudflareに接続しない**。GitHub Pages/既存Worker/GAS・D1パイロット・D1スキーマとデータを変更しない。公開APIから参照できるコードでもない。
- 実Sheet全行（最低でも日付B列・時刻D/E列、収支日付A列、操作履歴の日時D列、アーカイブや申請の日時列）を `CellData` 型と表面書式を含めて抽出し、元の日付・時刻に対する正規化の**件数・不一致・重複0件の照合**を実施する。値とIDをPRやActionsへ出さず、会員IDとの関連を検証しても匿名集計のみ出力。閲覧だけでは原本の実バックアップが存在すると見なさない。
- D1 `timestamp_raw` に入れるのは既存GASが使うJST時刻形式を優先。UTCの派生値を作るなら別列とし、原文時刻やGoogleシリアルを暗黙的に上書きしない。退会で過去の操作ID・actorId・氏名/日時を変更しない。
- チーム所属は[原因再調査](D1_TEAM_MEMBERSHIP_ROOT_CAUSE.md)の**現役状態のOR(active)集約＋既存操作履歴の別保存**を候補として継続。退会時の物理削除と再入会の新会員IDを維持。本番で不要な検証専用 `stage.selfRole` は移植しない。
- D1の**実データ投入、バックアップ/復旧構築、二重書込み、API切替、Service Binding追加、本番反映**は今回未実施。元シート、既存会計確定順・残高算出・権限チェック・操作ID/排他制御が同値と確認できるまで実施しない。本番操作は必ずユーザー事前承認制。
