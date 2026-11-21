# D1第13工程：検証専用ネイティブバックアップの実行結果・46試合版SHA不一致と隔離D1実験の次承認

実施日：2026/11/21。基準：検証用main `f3faff86235466d4f76b4e48d808dd5c7fdb0bbc`、`README.md`、`docs/SESSION_HANDOFF.md`第90節、`docs/SPEC_PRIORITY_POLICY.md`、`docs/D1_PHASE12_ATOMIC_CANDIDATE_AND_APPROVAL.md`、`gas-staging/コード.gs`の `matchHash_`/`matchLoad_`/`matchCommit_`、`d1-staging/migrations/0002_business_skeleton.sql`、`scripts/d1-staging-remote-smoke.cjs`。

**ユーザー承認**：このチャットで、検証用の架空スプレッドシート1件を非共有の新規フォルダへGoogleネイティブ形式でコピーし、**原本不変更・読取専用照合とメモリ内仮復元**に限り明示承認。**本番原本・領収書・実D1テーブルへのデータ投入・Worker/LIFF/GASの更新・SHA修正・本番反映の承認ではない。**

この文書には**Drive/SheetsのファイルID、フォルダID、実会員/LINEユーザーID、JSON本文、個別のハッシュ・秘密値を記載しない**。検証用コピーと保管先の実URLは承認したユーザーに限りチャットで提示し、public GitHub/CIへ転記しない。

## 1. 承認範囲の実施（実Google Drive、原本は読取のみ）

1. 接続済み元ワークブック `全力☆スマッシュ 接続検証用 v0.15（架空データ）` を事前にGoogle Driveメタデータで同定。ネイティブGoogle Sheets、shared=false、permissionsは単一の所有者ユーザー。
2. 個人マイドライブのルートに**専用フォルダ** `全力☆スマッシュ D1移行検証バックアップ（架空データ専用）` を**新規1件**作成。コピー前にGoogle Driveメタデータを再取得し、shared=false、permissionsは単一の所有者user、共有Drive所属なしを検証。
3. そのフォルダへ**GoogleネイティブSheetsコピーを新規1件**作成。コピーのMimeType、所有者1件、shared=false、親が承認済フォルダであることを事後読取確認。これらは確認した時点のDrive共有設定であり、他サービスにおける「すべての管理者を排除できた」保証ではない。
4. Sheets APIで**元とコピーの両方**のmetadataを読取。**21タブ**の順、名前、元sheetId、非表示（4シート）、格納行列数・ヘッダー固定、locale=`ja_JP`、timezone=`Asia/Tokyo`が同一。
5. 全21タブの既存物理グリッドを範囲を指定して読取。元とコピーの**入力セル2,641件、値/元型/effectiveValue/数値日時書式の差分0件**。続けて`userEnteredValue,userEnteredFormat,note,dataValidation,textFormatRuns,hyperlink`を比較し**差分0件**。確認範囲に入力セルの数式は0件、ノート/入力規則はAPIが返す範囲で0件。これは`SpreadsheetApp.getValues()`のnative DateクラスやDrive添付ファイル・Apps Scriptプロパティを復元した証拠ではない。
6. 元Driveの`modifiedTime`は**コピー前後と照合完了後まで不変**。原本に対するSheets update、Drive move/share、GAS実行、Worker設定変更、D1書込は実施していない。メタデータの不変は各API読取の完全に原子的な一時点証明ではない。

**実施結果：コピーそのものの整合性は確認済み**。Google Driveのフォルダおよびコピーは無断削除しない。コピーは検証終了後30日を目安に保持継続/削除をユーザーと再判断し、自動削除はしない。原本コピーが増えたことでアクセス管理/保存期間の責任は存続する。

## 2. コピーのメモリ内仮復元とSHA検証（原本/コピーとも無書込）

コピーの試合削除アーカイブ全34チャンク/5グループは、分割連番・`completed`・`schema=1`・JSON解析・元行番号/セル配列をメモリ上で構成できた（**5/5**）。内部`試合セッション`/`試合版管理`/`試合操作履歴`の**元行81件**と、削除前未失効の`閲覧リンク`**9件**をメモリ上に保持。日程削除アーカイブ全3グループは同様に**3/3**解析成功。試合版のチャンク数/順序/JSON構文の異常は、今回確認した範囲でなし。

SHA-256を自前のUTF-8実装で再計算する際には、まず`abc`、空文字列、`hello world`の公開既知ベクトル3件で検算し、**個々のSHAや試合本文・操作IDはログ出力していない**。

| 試合版 | ready版数 | SHA一致 | SHA不一致 | そのうち有効版のSHA不一致 |
| --- | ---: | ---: | ---: | ---: |
| 現役`試合版管理` | 8 | 0 | **8** | 1 |
| 過去の`試合削除アーカイブ`5組内 | 38 | 0 | **38** | 5 |
| **計** | **46** | **0** | **46** | **6** |

**結論**：現役の8件だけでなく過去の38件も同様に不一致。これらは架空初期データや別の作成処理に起因し得るが**原因未確定**。全件一律の不一致は現行GASの不具合や原本の破損を確定させる証拠ではない。旧削除アーカイブのJSON本文には独立の原文SHAがないため、JSON解析成功だけで原本の真正性は証明できない。

**46件のSHAを「修正」する操作、現実の本番試合データに同様の状態があるという断定、SHA無視での実D1への移送は引き続き禁止。** コピーと原本が同じであることは、その内容が既存GASの読み出し整合性を満たすという意味ではない。

## 3. 新規のオフラインゲートとCI

- `d1-staging/phase13/backup_readiness_gate.py`は架空の**数値・boolean・件数のみ**を受理する純粋関数。実ID/PII/ハッシュ/本文が入力に含まれないよう厳格なキー/型制約を適用。
- `backup_verification`と`match_import`を独立判定。元シート・新規フォルダ・コピーの非共有/別ID/親・シート/セル/書式一致を満たした場合、**COPY_VERIFIED**は可。しかし現役8+過去38の不一致が残れば`match_import=BLOCKED`。すべてのハッシュが仮に一致しても独立した原本由来と別途ユーザー承認が欠けるため`ADDITIONAL_PROVENANCE_AND_APPROVAL_REQUIRED`のみ。
- `tests/check-d1-phase13-backup-readiness.py`では今回の**匿名件数**を使い、権限/コピー同値/ハッシュ/履歴グループ数の欠陥を意図的に作って拒否し、全て合格でもremote synthetic test、実ビジネスデータの移送、Read Shadow、切替、本番の`authorized=false`を回帰。
- **旧業務API47件=GAS_ONLY、既存GAS/Worker/LIFF/Cloudflare D1スキーマ・実レコード/本番不変更**。

## 4. 次のユーザー承認地点：既存D1と分離した架空専用の実SQL検証

**推奨案：** ユーザーの**別の明示承認**を得た後、既存の`zenryoku-smash-staging-d1`とは異なる、検証専用一時Cloudflare D1 `zenryoku-smash-d1-atomic-fixture-stage` を**1 DBだけ**作成して、実SQL上で整合性/競合・障害注入・操作ID/認証境界を検証する。**このDBにはプログラムで新規生成した架空会員/日程/金額/試合データのみを投入する。Google Driveコピー・元Sheetsの実レコード（架空の既存記録を含む）を複製/アップロードしない。**

これは第12工程のSQLiteメモリ内試験をCloudflare環境に近づけるため。CloudflareのD1 `batch()`は一呼び出し内の複数文についてトランザクション扱いになるが、複数Worker通信間のread→compute→writeを一体で扱うことは保証しないので、その境界も明確に測定する。

**厳守する実施条件：**

1. GitHub Environment `d1-staging`の既存D1専用権限/アカウントを再照合し、テスト用DBは厳密な新しい名前を使用。クラウドのFree枠・既存DB件数と課金を確認し、追加課金の可能性があれば作成前停止。**ユーザーに課金設定を勝手に要求・変更しない。**
2. 今ある検証用D1は既存`scripts/d1-staging-remote-smoke.cjs`が**20テーブル/全業務行0**を要求している。従ってこのDBにテスト行を追加する/設定を緩める/既存Worker Bindingを変更することは**禁止**。
3. 一時DBの作成・DDL・試験レコードはそのDBに限り、変更差分/失敗時の巻戻し/再送冪等性をGitHub CI上の架空値だけで記録する。ID/Secrets/原本値をpublic logsへ出さない。
4. 次段のWorker Native D1 `batch()`実測には別WorkerやBinding設定が必要な場合がある。**現行Workerも既存read-only pilot Workerも無断変更せず**、実際の変更/権限拡大が必要になったらその手前でユーザーに報告して承認を得る。
5. 新しい一時DBと試験データは無断削除しない。試験後の維持/削除を報告し、期限をユーザーと定める。本番・既存シート・LIFFに一切影響させない。

**代替**：Cloudflare上の新規DBを作らずオフライン回帰のみ続行する。無料枠/権限や可用性が不明の状態で既存D1にテストレコードを投入する代替案は採用しない。

**別途の将来判断**：既存架空シートのSHA不一致46件をどう扱うか（独立した純粋な架空fixtureを新規生成して旧値を保全する／不一致版を隔離してRead Shadow範囲を限定する等）は、実GoogleコピーまたはD1の正本を**無断補正しない**条件で別レビュー。会計/認証/退会の移行と本番切替も独立承認。

## 5. 既存仕様への影響・未完了

既存仕様/優先順位1～2：収支確定の古い順序、残高、当番・管理者の操作権限、メンバー退会/再入会と過去操作ID、試合状態のrevision/CAS、GASとGoogle Sheetsが正本。**本工程で変更なし**。

新しい一時Cloudflare DBによって、アカウント資源/請求、機微情報の持込み、誤ったDB UUIDの操作のリスクがある。各ガードで既存DBの名前/UUIDと区別し、リソース使用・費用を事前確認。ユーザーがCloudflare実書込を認めない場合は作成しない。

未実施・未検証：**本番原本の保全**、旧SheetのGASネイティブDate/数式/添付領収書/スクリプト設定の完全復元、Googleコピーへの書込復旧、現実のD1データ移行・read shadow、47業務APIのD1実装/本人認証、チーム所属重複へのlossless設計、試合46版のSHA生成経緯、Cloudflare `batch`実接続、すべての本番反映。

PR/CI検証、main統合、Pages/既存Worker Buildが完了した結果は別途ハンドオフへ追記する。
