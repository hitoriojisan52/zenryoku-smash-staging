**D1第15工程・Cloudflare独立Worker実デプロイ／Native batch 4/4 PASS（2026/11/21）**：GitHub `d1-staging` の新規個別Worker Editor Secret/variable設定後、[Actions #44868727688 attempt 2](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44868727688/attempts/2)で独立Worker `zenryoku-smash-d1-atomic-fixture-worker-stage` の所有照合→dry-run→専用Binding/ランダムBearer設定→実HTTPを成功。独立架空D1内の**テスト表のみ**への書込でWorkers Native `D1Database.batch()`失敗rollback/成功commit、操作再送冪等性、CAS競合を**4/4 PASS**。実行後Cloudflare GET/SELECTで既存検証D1全20業務表0行、独立D1の第14工程生成架空件数不変を実確認。現行GAS/Worker/LINE/LIFF/47 API（GAS_ONLY）/Google原本・本番は不変更。旧GAS完全同値、試合SHA46版、実データ移行はNo-Go。性能改善・LINE連携はD1移行後まで停止。[第15工程実測と残課題](docs/D1_PHASE15_NATIVE_WORKER_VALIDATION.md)／[引継ぎ第101節](docs/SESSION_HANDOFF.md)。

**D1第15工程（2026/11/21・実装/オフラインCI成功、実Cloudflare Native試験は初期設定待ち）**：ユーザー承認に基づき、既存Worker/GAS/47API・旧0行D1を変更せず、作成済み架空専用D1だけへ接続する**第3の独立Worker** `zenryoku-smash-d1-atomic-fixture-worker-stage` を実装。[PR #170](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/170)を検証mainへ統合。Native `D1Database.batch()` rollback/commit、CAS、操作再送の**mock CI成功**。Cloudflareの第15工程専用Editor Token/Worker作成と有効化フラグがないため、mainのremote Worker実デプロイ/Native SQLは**明示的にskipped**（成功扱いしない）。元GAS/LIFF/Google原本・独立D1/本番無変更。初期設定と次の実試験は[第15工程手順](docs/D1_PHASE15_NATIVE_WORKER_VALIDATION.md)／[最新引継ぎ](docs/SESSION_HANDOFF.md)。性能改善・LINE連携拡張はD1移行完了まで停止。

**D1第14工程・実Cloudflareで別D1 1件と架空REST SQL7/7試験成功（2026/11/21）**：Cloudflare BillingのWorkers Free/Activeをユーザー画面で確認。既存D1 1件から**別名の独立一時D1を1件だけ作成**し、元D1と合計2件。初回はCloudflare管理テーブル1件を含む全21表を20表と誤認してテスト停止（作成済DBの会員0件をGETで確認）。新DBの再作成・削除をせず、業務20表を**名前で照合**して再開。架空会員/日程/集金/収支/試合のみ新D1に投入し、REST SQL 40回で集金CAS・収支確定順/金額・試合CAS・操作ID冪等性・REST batch失敗巻戻し/成功の**7項目すべてPASS**。[証跡・残るWorker Native batchの未検証](docs/D1_PHASE14_ISOLATED_SQL_RESULTS.md)。**47 API GAS_ONLY・元Google原本/非共有コピー・既存検証D1/現行Worker/GAS/LIFF/本番は不変更**。既存D1 0行を再確認する追加読取専用チェックは別途実施/引継ぎ。

**D1第14工程・Workers Freeの確認と一時D1架空SQL検証（2026/11/21）**：ユーザーがCloudflare Billing > Subscriptions画面で「Workers Free / Active」、支払方法未登録を提示。既存D1はCloudflare実GETで1件、検証DBの名前/UUID/サイズを照合済み。承認範囲内で旧D1とは**完全に独立した新規1DB**を1回だけ作成し、コード生成架空会員・日程・会計・試合のREST SQL競合/CAS、収支確定順・操作ID冪等性・batch失敗巻戻しを検証するガードを追加。元Google Sheets/コピー/GAS/Worker/LIFF/本番/47 API GAS_ONLY/旧D1業務0行ガードは不変更。**PR段階ではCloudflareリモート作成を一切実行しない**。検証用mainへの統合後だけ一度実行し、結果を追加引継ぎに記録する。Worker Native `D1Database.batch()`は本工程対象外。[実施範囲・試験表・承認境界](docs/D1_PHASE14_ISOLATED_SQL_RESULTS.md)。

**D1第14工程・独立一時Cloudflare DBの料金・権限チェック（2026/11/21）**：ユーザーは既存検証D1とは別に`zenryoku-smash-d1-atomic-fixture-stage`1DBを作成しプログラム生成した架空値のみで実SQL試験することを承認。ただし**アカウントの無料枠・既存D1数・契約の追加料金がないことを確認してから**実行という条件。新規スクリプトはCloudflare APIへの**GETだけ**で、固定検証アカウントと既存DB UUID/名前、対象DB重複なし、Free枠の10 DB未満・保管サイズの余裕、Workers Free契約の**明示的な証拠**を確認できない場合はBLOCKED。D1専用トークンにBilling Readがない可能性があるため、契約照合を推測で通過させない。今回のPRで新DB作成/SQL書込/WorkerやD1既存設定変更はしない。[料金・権限ゲートとユーザー確認手順](docs/D1_PHASE14_ISOLATED_FIXTURE_PREFLIGHT.md)。第13工程の既存架空試合SHA不一致46/46・業務データ移送No-Go、47 API GAS_ONLY・本番未反映を維持。CI/リモートGET/反映状況は別途引継ぎ。

**D1第13工程・非共有ネイティブバックアップ1件の実行、全21タブ2,641セル完全一致・試合履歴SHA 46件の保全（2026/11/21）**：ユーザーが承認した検証用架空Google Sheetのみを、新規の非共有owner専用フォルダにネイティブ形式で1件コピー。原本と新コピーの21シート/4非表示タブ/元sheetId/書式/数式/型/セル値2,641個、アクセス権と元更新日時を読取専用で照合し差分0。試合削除アーカイブ5/5組（元行81・リンク9件）と日程削除アーカイブ3/3組はメモリ上で構造再構成可。ただし**現行ready版8/8＋削除アーカイブの過去版38/38＝46/46件のSHA不一致**で、正本移行はBLOCKEDのまま。コピーが正確なことは試合状態の真正性を保証しない。架空の匿名件数・booleanのみから「バックアップ検証済」と「D1移行禁止」を分離する安全ゲートとCIを追加。[第13工程の根拠・次の承認境界](docs/D1_PHASE13_PRIVATE_BACKUP_VERIFICATION.md)。実DriveファイルID/PII/個別SHA/JSONはGitHubへ出さず、GAS/Worker/LIFF/実D1/本番を不変更。次の明示承認までは新規Cloudflare D1作成・架空SQL書込も行わない。PR/CI/deployは別途確認。

**D1第12工程・会計/集金/試合の原子的更新候補と事前承認ゲート（2026/11/21）**：GASの本人ロール・収支確定順（日付→区分→行ID）・前行残高+入金-支出・確定済残高保護・操作ID・試合版保存/版数を照合。既存D1候補20テーブルを架空SQLiteメモリDBに作り、集金/収支/操作履歴と試合版/有効ポインタ/試合操作履歴の**失敗時全体ロールバック**を注入試験。GASの試合履歴追記失敗時の挙動とD1候補の操作ID対象一致は**異常系の設計差**として実API変更前にユーザー判断が必要。公式D1 batchは一回分を原子的に扱うが、PythonローカルトランザクションをそのままWorkerに移植できる保証はない。まず**非共有Google Driveに検証用架空ワークブックのネイティブコピー1件**を作成・匿名照合する案をユーザーへ承認依頼する地点で停止（本番ファイル対象外）。[第12工程の設計・承認案](docs/D1_PHASE12_ATOMIC_CANDIDATE_AND_APPROVAL.md)。既存47 API GAS_ONLY・GAS/Worker/LIFF/原本/Cloudflare実データ/Secret/本番は不変更。CI/PR/deployは別途確認。

**D1第11工程・旧7列の試合版と試合削除アーカイブの保全・仮復元試験（2026/11/21）**：現行GASの旧7列読込互換とD1の9列必須制約を照合し、元7列/後ろ2列空の9列を原形保存したまま、分割1/1のD1候補へ**メモリ上だけ**投影する方式を追加。試合削除アーカイブに含まれるセッション・全試合版・操作履歴・閲覧リンクの元行番号・値を保持して、チャンク、UTF-16、SHA、`prepared/completed`、有効版/版数・対象IDを架空データだけで仮復元/不整合拒否。**旧削除アーカイブには元SHAがなく構造正常＝真正性保証ではない**ため、正常候補でも原本バックアップ/事前承認・実データ転送禁止を維持。[第11工程の詳細](docs/D1_PHASE11_LEGACY_ARCHIVE_RESTORE.md)。検証用Sheet原本・D1実データ/スキーマ、GAS/Worker/LIFF/本番不変更。PR/CIの結果は別途記録。

**D1第10工程・試合版の生成経緯再調査と架空データのSHA/有効版ポインタ移行禁止ゲート（2026/11/21）**：現行GASのSHA計算→書込読戻しSHA照合→ready→有効版切替→履歴追記という確定順序と、検証用v0.15シートが架空データを初期配置した資料であることを再照合。SHA不一致8/8を**現行GASの不具合や実運用データ破損と断定せず**、実原本修復/再計算を禁止する。Google Drive版履歴は一部のみ読取専用で確認（以降HTTP 429で停止）。架空版のSHA/UTF-16分割、有効版/履歴版、操作ID、CAS版数、監査追記欠落時の警告を検証する純粋関数とCIを追加し、独立バックアップ/復旧/ユーザー事前承認の実施手順を設計。**47 API GAS_ONLY／実Sheets・D1・Worker・LIFF・本番変更なし**。[第10工程の詳細](docs/D1_PHASE10_MATCH_PROVENANCE_BACKUP.md)。CI・PR反映結果は別途追記。

**D1第9工程・20タブ371行の匿名・読み取り専用監査とバックアップ復元no-go（2026/11/21）**：検証用架空Sheetsの全業務20タブについて元セル型/書式/数式（0）/列外使用（0）/参照整合を集計。**重要な阻害要因：試合版8件の保存SHA-256がJSON原文の再計算値とすべて不一致**（有効版1件を含む。原因未確定、データ修復禁止）。旧削除アーカイブ3/5グループと単一行アーカイブは限定的なJSON構造検査を通過。21タブを対象とする架空値の原本型・日時書式・数式・非表示・行順の保全/メモリ内復元試験と、バックアップ・復旧・SHA・ユーザー承認を要求するBLOCKゲートをCIに追加。**実原本のバックアップ/コピー、D1実データ投入、GAS/Worker/LINE/本番変更は未実施**。[第9工程の監査と安全設計](docs/D1_PHASE9_AUDIT_BACKUP_RESTORE.md)。PR・CI・main反映は別途照合。

**D1第8工程・全20業務タブ154列の静的契約とアーカイブ安全試験（2026/11/21）**：検証用架空Google Sheetの全20業務タブのヘッダーのみ読取専用で確認し、D1空20テーブルの154列との1対1マッピング候補を追加。試合版8行/8組、日程削除アーカイブ3行/3組、試合削除アーカイブ34行/5組の分割数・ready/completed状態を匿名集計し、構造上の不整合0（本文SHA/JSON復元は未検証）。架空のアーカイブチャンク・SHA・UTF-16・prepared拒否試験をCIに追加。**実Sheets/D1データ・旧Worker/GAS/LIFF/本番は変更なし、実データ移行の承認なし**。[詳細](docs/D1_PHASE8_COLUMN_ARCHIVES.md)。PR・CI・main統合の結果は別途記録。

**D1第7工程・架空データの複数テーブル整合/再送/ロールバック試験（2026/11/21）**：既存のD1空20テーブル構造をメモリSQLiteへ適用し、架空会員・権限・日程・出欠・集金・収支・操作履歴を横断して検証。操作ID重複、最後の管理者、退会済みactorの履歴、権限変更と監査の同時ロールバックをCIに追加。**実Sheets/D1/GAS/Worker/LINE・本番の変更なし**。[検証内容](docs/D1_PHASE7_OFFLINE_REPLAY.md)。

**D1第6工程・日時／操作履歴の移行前安全検証（2026/11/21）**：検証用Sheetの**日付・時刻・操作履歴の実セル234個**を読取専用で書式・型・分秒精度を匿名照合（候補条件不適合0、日程正規化後の重複0）。操作履歴210行の重複ID・不正JSON・必須項目欠落も0。Google SheetsのDATE/TIME/DATE_TIME数値シリアルとJST文字列を、型・原文を残して厳密に変換する**非公開・オフライン候補**と、退会済みactorの監査保持・日付境界・操作ID重複拒否の架空回帰を追加。[契約詳細](docs/D1_PHASE6_CIVIL_DATE_CONTRACT.md)。**既存Worker/GAS/LINE/Sheets/実D1スキーマ・レコード・本番は不変更**。

**D1第5工程・「チーム所属」重複の原因再調査（2026/11/21）**：前回の「退会履歴かもしれない／3行を独立した業務履歴として保存必須」という説明を訂正。11/20導入の**検証専用`stage.selfRole`6回**（当番→一般→当番→一般→当番→管理者）で`FALSE/FALSE/TRUE`が生成され、対象memberIdは現在有効・退会履歴に存在しないことを実SheetsとGAS/過去PRで確認。[原因とD1設計候補](docs/D1_TEAM_MEMBERSHIP_ROOT_CAUSE.md)。既存複合PKは現役状態の保持に利用できる可能性があり、元シート行の監査用バックアップと操作履歴の保護を検討。既存アプリ・D1 schema・実データ・本番には**変更なし**。

**D1第5工程・検証シートの読み取り専用監査（2026/11/21）**：架空データの接続検証シート業務20タブを直接参照し、列範囲内の非空行数・キー重複・参照不整合を集計。**チーム所属で同一(teamId,memberId)が3行（有効1／無効2）**あり、現行D1候補の複合PKでは**ロスレス移行不可**。練習日程と収支の日付には数字/文字列の混在を確認。**データ補正やD1への投入は行っていない**。[監査結果](docs/D1_STAGE_SHEET_PREFLIGHT.md)。

**D1第5工程（2026/11/21・既存読取の安全な移行準備）**：GAS実コード上の`overview`は初期読込時に収支行・監査を更新し得るため、単純なD1 SELECT置換を禁止。`attendance.mine`の操作履歴・試合/収支ロック、`schedule.list`の非公開行と重複日付、`ledger.list`の繰越/確定順序を移行判定基準に整理。**全47 APIのD1切替禁止ガード**と架空日程のローカルSQLite等価性テストを追加。[第5工程の詳細](docs/D1_PHASE5_READ_ROUTING.md)。**既存Worker/GAS/LINE/Sheets/実D1データ・本番不変更**。

**D1第4工程（2026/11/21・独立WorkerネイティブD1接続成功）**：ユーザーがEnvironment Secret/Variableを設定したため[GitHub Actions #44808754064](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44808754064)で独立検証用Worker`zenryoku-smash-d1-pilot-stage`の所有・対象D1厳密照合、自動デプロイ、一時Bearer Secret注入、実HTTPの認証・拒否・空データSELECTをすべて検証成功。ネイティブD1 GETの12回HTTP p50 **173.4ms** / p95 **185.5ms**（空テーブル・LINE/GAS/実会計を含まず、旧アプリとの同条件比較不可）。[詳細](docs/D1_WORKER_DEPLOY_PLAN.md)。**既存Worker/GAS/LINE/Sheets・本番は不変更**。

**D1第4工程・実作成Worker名との整合（2026/11/21）**：ユーザーがCloudflareで`zenryoku-smash-d1-pilot-stage`を作成（Ready／Binding 0）。元の予定名は`zenryoku-smash-d1-pilot-stage-20261121`だったため、**作成済みWorkerを活かしてコード・URL検証・所有確認を正しい名前へ更新**。Cloudflare個別Worker Editorの初期トークンとGitHub Environment設定はまだ必要。既存GAS/Worker/Sheetsと本番は不変更。[手順](docs/D1_WORKER_DEPLOY_PLAN.md)。

**D1第4工程・権限方式修正（2026/11/21）**：Cloudflare最新仕様では新規Worker作成に`Workers Admin`が必要。不要に広いアカウント権限を渡さないため、検証用の`Hello World` WorkerをDashboardで最初に1件だけ作り、**Individual Workers → Editor（そのWorkerのみ）**でGitHubから以後の実装を更新する方式へ変更。未変更テンプレートだけを自動引継ぎする安全ガードを追加。**既存Worker/GAS/LINE/Sheets/本番に変更なし**。[初期設定](docs/D1_WORKER_DEPLOY_PLAN.md)。

**D1第4工程（2026/11/21・独立Workerの自動デプロイコード/CI完了、実公開は初期設定待ち）**：[PR #133](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/133)をCI成功後mainへ統合。独立Workerの固定名・D1 binding・所有確認・ランダムBearer・自動GET/p50/p95を実装。検証用main [Actions #44798639824](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44798639824)でoffline-safety成功。**remote deployの全ステップは明示ON未設定によりskipped（Worker未公開）**。既存Pages/Worker Builds成功、GAS/Sheets/LINE/本番不変更。[ユーザーの初回設定](docs/D1_WORKER_DEPLOY_PLAN.md)。\n\n**D1第3工程（2026/11/21・検証用の測定完了）**：[PR #131](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/131)をCI成功後mainへ統合。独立read-only Worker試作は**未デプロイ**。GitHub Actions [#44795116347](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44795116347)でCloudflare D1 RESTの12回測定成功、HTTP p50=227.8ms/p95=250.7ms、DB内部SQL p50=0.1ms/p95=0.2ms（空テーブルcountのみ、LINE/Worker/GASを含まずアプリ改善効果とは比較不可）。既存Workers Builds/Pagesも成功、D1業務20テーブル全件0行維持。**業務データ/本番は不変更**。\n\n**D1第2工程（2026/11/21・検証反映・読み取り確認済み）**：[PR #128](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/128)で21タブ（案内1＋業務20）の棚卸しとD1空20テーブルを実装。旧会計/出欠/退会/試合回帰CI成功、Cloudflareの`0002_business_skeleton.sql`適用成功。[PR #129](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/129)で**実D1リモート20テーブル存在・業務0件・検証0件をread-onlyで確認**。業務データ移行・既存API/WorkerのD1切替は**未実施**。[D1スキーマ設計](docs/D1_SCHEMA_DESIGN.md)。

**D1移行基盤 初期リモート検証成功（2026/11/21）**：GitHub Environment `d1-staging`（mainのみ）にユーザーがD1専用API TokenとAccount/Database IDを登録。既存[Actions #44781121812](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44781121812)をChatGPTが再実行し、CloudflareのDB名・UUID・アカウント一致検査、`0001_bootstrap_probe.sql`のremote適用 ✅、`stage_d1_bootstrap`へのread-only SELECT（0件・success）✅をジョブログで確認。**現行Worker/LIFF/GAS/Sheetsの接続先・機能は不変更。本番未反映**。[移行計画](docs/D1_MIGRATION_PLAN.md)／[引継ぎ](docs/SESSION_HANDOFF.md)。

**D1移行基盤（第1工程・検証限定、2026/11/21）**：[PR #125](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/125)を検証mainへマージ。D1 CI/会計・出欠・退会・対戦表回帰、PagesとWorkers Builds成功。D1 Remote Migrationは初回資格情報未設定により安全にskip（操作なし）。**Cloudflare D1実DB作成、リモート適用・LIFF切替は未実施**。[設計と初回設定手順](docs/D1_MIGRATION_PLAN.md)。

**v0.16.88（登録データ整合性／安全な読込の軽量化・診断）**：検証用Sheetsを読み取り専用で照合し、メンバー・申請のID重複と申請紐付け不一致はいずれも0件。実機で登録済みアカウントの緑「利用登録済みです。」を確認済み。GASの退会履歴チェックを6列読込からmemberIdの1列のみへ限定（ヘッダー・環境・退会ガード維持）、独立利用申請LIFFに `?perf=1` の安全な通信時間内訳を追加。15秒再発の原因断定・効果の実機計測・別LINE申請受入は未完了。本番不変更。[確認記録](docs/stage-v1688-registration-integrity-performance.md)。

**v0.16.87（共通UIメッセージ整理）**：申請・出欠・試合・ビジターの静的説明/0件表示を薄灰の中立色に分離。青は通信中のみ、緑は成功、黄は注意、赤は失敗とする。操作権限、会計処理、API、データを変更せず、回帰テストを追加。専用利用申請LIFFの実機受入は継続。[引継ぎ](docs/SESSION_HANDOFF.md)。

**v0.16.86（利用申請専用LIFF設定）**：ユーザー発行ID `2012602642-lKuGSb43` を検証用 `registrationLiffId` に登録。検証入口は `https://liff.line.me/2012602642-lKuGSb43`。運用管理LIFF/認可・GAS/Workerコード・会計・本番は不変更。LINE実機受入は別途。[引継ぎ](docs/SESSION_HANDOFF.md)。

**v0.16.85（検証用：共通メッセージCSS競合解消／独立利用申請のLIFF誤転用防止）**：青い処理中はCSSスピナー、緑は✓、黄は⚠️、赤は❌。旧CSSの高詳細度ルールが正常／処理中を警告表示に上書きする問題を修正。独立利用申請は専用 `registrationLiffId` 未設定なら管理用LIFFを流用せずエラーにする。GAS/Worker・旧業務処理・本番は変更なし。専用LIFFの実機試験と全画面の青枠案内文監査は継続。[引継ぎ](docs/SESSION_HANDOFF.md)。


**v0.16.82検証反映結果**：PR #98（main `73f20e4f153c3a7747653d2a3628a981fb9fc0df`）の3系統CI成功。GitHub Pages/Cloudflare Workers Builds/公開LINE GET-only成功、GAS既存Webアプリ **@47** 更新・pushソース照合成功。実機15秒通信の再発/復旧・画面内＋ポップアップ・診断時間内訳は未受入。[検証用LIFF](https://liff.line.me/2012602642-XBSkXduO) / [計測](https://liff.line.me/2012602642-XBSkXduO?perf=1)。本番未変更。


**v0.16.82（検証環境・通信エラー統一/性能診断）**：「Failed to fetch」を日本語に統一。全画面の赤枠ポップアップと画面内赤枠を併用。集金ホームの15秒タイムアウト後は更新ボタンを再活性化し、失敗後の自動8秒再通信は停止（手動更新で復帰）。練習日程マスタを管理者メニューへ移動（GAS側の従来認可は不変更）。`?perf=1`でLINE/Worker/GASの安全な時間内訳を表示し、GASロック/残高計算は維持。詳細は[引継ぎ](docs/SESSION_HANDOFF.md)。本番未反映。

# 全力☆スマッシュ｜検証用GitHub Pages

**新しいチャットで開発を再開する場合は、必ず [開始用プロンプト](docs/NEW_CHAT_START_PROMPT.md) を使用し、[開発引継ぎ文書](docs/SESSION_HANDOFF.md) と [仕様優先順位の正式ルール](docs/SPEC_PRIORITY_POLICY.md) を確認する。**
**GAS・Worker・PagesのGitHub経由デプロイとユーザーへの具体的な作業案内**は [DEPLOYMENT_AND_USER_ACTIONS.md](docs/DEPLOYMENT_AND_USER_ACTIONS.md) に従う（Worker v0.16.53の反映確認とGAS/Workerの設定完了報告を記録済み）。
**退会・再入会の確定仕様と接続検証の進捗**：[v0.16.53引継ぎ](docs/stage-v1653-withdraw-rejoin.md)を参照。
**v0.16.80検証反映結果**：PR #94の3系統CI成功、Pages/Workers Builds/公開GET-only成功、GAS既存Webアプリ **@46**。自己権限切換28/28、ビジター審査75/75、旧会計確定順序28/28合格。実機の管理者→当番担当→メンバー→管理者復帰は未受入（[検証用運用管理LIFF](https://liff.line.me/2012602642-XBSkXduO)）。本番不変更。[詳細](docs/stage-v1680-self-role-staging-message-semantics.md)。
**v0.16.80（検証専用の実際の自己権限切換）**：v0.16.79表示プレビューを廃止。ホーム立替精算左の「🧪 権限切換」から、管理者・当番担当・メンバーを本人のみ実際に切替可能（検証用の固定Workbookと別の架空管理者を必須とし、最初に登録した管理者本人だけ復帰可能）。管理用LIFFの一般メンバーは他の全ボタン非活性、別のLINE参加連絡入口は保持。ビジター承認待ちの申請者引き戻しと承認済みの管理者却下のみの削除を確定。青：処理、黄：⚠️警告、赤：エラーを統一。[仕様・安全・実機受入](docs/stage-v1680-self-role-staging-message-semantics.md)。本番禁止。
**v0.16.79検証反映**：PR #92の3系統CI成功、GAS既存デプロイ **@45**、Pages/Worker Builds/公開GET-only成功。新テスト31/31、ビジター審査75/75、旧会計確定順序28/28合格。LINE実機の画面受入は未完了。[検証記録](docs/stage-v1679-role-preview-visitor-deletion.md)。本番未変更。
**v0.16.79（権限別の画面見本・ビジター削除制限）**：検証用の権限別メニュープレビューを管理者/当番担当/メンバー全員が開ける。実際の権限・認証・メンバー/チーム所属・GAS/Workerの認可は変更しない。参加者一覧のビジター削除は非活性、API直接削除も禁止、管理者のビジター管理からの「却下」は維持。未承認申請の本人取下げは別の既存機能として維持し、廃止する場合は別途ユーザー判断。[仕様と影響評価](docs/stage-v1679-role-preview-visitor-deletion.md)。本番未変更。
**v0.16.78検証反映結果**：[PR #90](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/90)のUI/GAS/仕様3CI、GitHub Pages、検証GAS既存Webアプリ **@44**、Workers Builds、公開GET-only疎通がすべて成功。新UI45/45、旧金種87/87、旧会計確定順序28/28合格。[受入記録](docs/stage-v1678-single-cash-read-blank-selects.md)。LINE実機受入は未完了。本番不変更。
**v0.16.78（読込表示・更新操作の統一）**：現金確認の読み込み青枠を1つに集約し、取得・照合の進捗を同じ青枠で更新。取得前の日程プルダウンを空欄に統一し、初回・手動の読込中は該当画面の更新ボタンを非活性化（閉じる有効）。自動ポーリングは従来どおり操作を止めない。会計・権限・GAS・Workerは不変更。[改修と実機確認項目](docs/stage-v1678-single-cash-read-blank-selects.md)。本番未変更。
**v0.16.77検証環境への反映結果**：PR #88 3系統CI成功、GAS既存デプロイ **@43**、GitHub Pages、Workers Builds、公開LIFF/Worker GET-only疎通成功（[記録](docs/stage-v1677-visitor-current-dates-activity.md)）。ビジターの実機UI・確定解除後再表示・性能は未受入、本番変更なし。
**v0.16.77（ビジター日程と青枠スピナー）**：ビジター申請・管理の履歴ボタンを双方撤去。収支確定済みの過去日程だけを候補から除外し、確定解除後に更新すると再表示。読み込み中の日付プルダウン表示と青枠内の小型スピナーを追加。過去データ・収支確定/解除・認証・残高は不変更。[仕様・テスト・実機受入](docs/stage-v1677-visitor-current-dates-activity.md)。本番未変更。
**v0.16.76（閲覧先行・画面内読込）**：現金確認、収支表、練習日程、参加者一覧、ビジター申請/審査、権限管理、本人参加連絡を先に表示し、各データ欄で読込中・エラーを表示。閉じるを有効にし、閉じた画面への古い応答反映を防止。当日補正/当日支出は入力欄だけ保存中、確定/権限/退会等はフルロック維持。その他の収支の日付曜日と『団体戦費用捻出』例、ビジター申請の履歴ボタン削除。**対戦表の反映実行は方式検討のみ**（設定の一括反映と実試合進行の扱いを分離）。[仕様/安全な設計案](docs/stage-v1676-responsive-performance-match-batch-design.md)。本番未変更。
**v0.16.75（集金管理画面起動・性能の一次改善）**：初回の日程選択をGASで実施し、通常時の2回の認証済み集金読込を1回に削減。GASの日程マスタ重複読込を同一リクエストで共用。LINE初期化20秒、読み取り25秒で応答停止を明示エラーに変更、他の管理画面を開いた間は8秒自動更新を停止。`?perf=1`では起動時間をLINE/会員確認/集金読込に分解表示。会計書き込み・本番は不変更。[根拠と実機計測](docs/stage-v1675-startup-performance.md)。
**v0.16.74の接続検証結果**：PR #81の全CI・検証用Pages・GAS@41・Workers Builds成功。続く[公開LINE疎通チェック](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/runs/44567090177)も成功（Worker /health/設定・LIFF配信一致、GETのみ）。一方、**本人LINE参加連絡/修正・Webhook・役割別実機E2Eは未受入**。実機検証後に本番判断。[検証記録](docs/stage-v1674-date-parity-and-line-verification.md)。
**v0.16.74（集金管理・参加者一覧の日付統一／LINE後続検証）**：全未確定・解除済み日程と**確定済み当日の日程**を両方のプルダウンに表示。確定済みの過去・未来日程は除外。初期値は本日以降の直近、参加者一覧の「履歴」ボタンを削除。集金・参加者の確定済み操作ロックを維持。LINE実機/E2Eは別途未受入。[変更とLINE検証計画](docs/stage-v1674-date-parity-and-line-verification.md)。本番未変更。
**v0.16.73（領収書表示UI）**：LINE内の画像/PDFプレビューは維持し、「別画面で開く」「保存する」を撤去。既存の管理画面共通レイアウトで「✕ 閉じる」を右上へ移動。ユーザーの表示成功報告に基づき、この2ボタンと閉じる配置の手動受入は省略。[変更仕様](docs/stage-v1672-finance-receipt-history.md)。本番未変更。
**v0.16.72（検証用次版）**：練習日収支の削除を練習日程マスタに一本化し、旧再登録区分を削除。後続確定行のある確定解除を非活性化、同日最終行のみ可能。収支追加の0/0事前エラー、集金管理の未確定全日程表示・履歴ボタン削除、日程確定時の後日確定チェック、領収書のアプリ内表示、所有者が公開を許容した「全力IT」配下への新規保存。旧証憑は移動しない。[仕様・実機受入](docs/stage-v1672-finance-receipt-history.md)。本番未反映。
**v0.16.69（検証のみ）**：後日確定行がある過去日立替精算の拒否理由を具体化、練習日程追加の開催日を欄内曜日へ、領収書選択ボタンの上下余白調整。Driveの手動OAuth確認用関数を追加。全体収支管理表の練習日行は削除可能なため、再登録区分の削除は保留。[仕様・復旧手順](docs/stage-v1669-ledger-drive-schedule-ui.md)。実機未受入、本番未変更。
**v0.16.68（検証UI調整）**：曜日を日付欄内の年月日直後に配置。約10MBのJPGを元画像として選択し、既存の1.5MB上限へ圧縮保存することを回帰試験で明文化。[詳細](docs/stage-v1668-weekday-jpg10mb.md)。GAS・Workerは変更なし、本番反映なし。実機確認待ち。
**v0.16.67（検証UI改修）：精算日曜日の欄内表示とJPG/HEIC iPhoneカメラ写真の変換**：[差分/実機受入](docs/stage-v1667-inline-weekday-iphone-receipts.md)。原画像が大きい場合は端末内でJPEG1.5MBへ縮小。既存GAS/Workerのサイズ・認証・残高・確定順序は変更しない。実機未受入、本番未変更。
**v0.16.66（履歴・安全復旧の確定済み基準）：履歴照会の明示切替・領収書部分失敗の安全復旧・Drive初回認可**：[承認済み仕様と受入](docs/stage-v1666-history-receipt-recovery.md)を参照。CIと検証GAS/Pages/Cloudflareチェックは成功。LINE実機の領収書実ファイル保存、OAuth認可、公開Worker応答は別途確認。本番変更なし。
**メンバー権限管理と収支ボタンのv0.16.56仕様**：[画面・編集・確定解除の動作](docs/stage-v1656-management-ledger-ui.md)を参照。
**v0.16.57: ユーザー確定A～Eと氏名カナ追加**：[登録・並び順・旧仕様の整合性](docs/stage-v1657-registration-kana.md)を参照。収支の未来月表示・その他の収支・全体収支表限定の確定済み1ボタンを許容し、会計確定順序は変更しない。
仕様はユーザー指定の **「既存業務仕様・動作 → 整合性・安全性 → 協議済み実装ルール → 新機能の実装方法 → 明示的な変更指示」** の順で保護する。
明示的な変更指示が先行仕様に影響する場合は、**懸念・影響をユーザーへ報告するまで既存仕様を上書きしない**。
収支の確定順序（先行未確定行があれば確定不可）は画面とGASの両方で守る。

公開先: https://hitoriojisan52.github.io/zenryoku-smash-staging/

**画面共通仕様（履歴を含む）**：[`docs/ui-standard-v1632.md`](docs/ui-standard-v1632.md) を参照。各版の過去の記載が混在するため、先に仕様優先順位と最新の確定業務動作を照合する。変更前に `node tests/check-ui-standards.cjs` を実行する。

## 接続状況（2026-11-16）
- GAS: 検証用Google Sheetsへの読込・書込・試合5ラウンド保存をGASエディタ上で確認済み
- Worker: https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health で `configured:true` をユーザー確認済み
- GitHub Pages: 公開確認済み。Worker公開URLは `runtime-config.js` に反映済み
- LINEログインとWorker→GASの本人認証付きPOSTはv0.15.12で実機検証済み（起動時間平均約4.19秒）。
- 本番のLINE公式アカウント、GAS、スプレッドシートは未変更

## LIFF設定（LINE Developers）
`https://developers.line.biz/console/` で **Workerの `LINE_LOGIN_CHANNEL_ID` と一致する既存のLINEログインチャネル** を選択し、そのチャネルの LIFF タブから追加する。同じLINEプロバイダーを用いること（プロバイダーが異なるとユーザーIDも異なる）。各アプリのスコープは `openid`、画面サイズは `Full`、検証中は友だち追加オプション `Off` を推奨する。

| アプリ | エンドポイントURL | 公開設定項目 | 検証順 |
|---|---|---|---|
| 対戦表操作（当番・管理者） | https://hitoriojisan52.github.io/zenryoku-smash-staging/match.html | `liffId` | 1 |
| 対戦表閲覧（一般メンバー） | https://hitoriojisan52.github.io/zenryoku-smash-staging/match-view.html | `viewLiffId` | 2 |
| 運用管理（当番・管理者） | https://hitoriojisan52.github.io/zenryoku-smash-staging/live.html | `liveLiffId` | 3 |

1. まず操作用LIFFを1件追加し、発行されたLIFF ID（例: `1234567890-AbcDefGh`）を `runtime-config.js` の `liffId` に設定する。
2. LIFF URL `https://liff.line.me/<LIFF_ID>` でLINEアプリ内から開く（GitHub URLを直接開いての認証試験よりLIFF URLを優先）。
3. 検証用シート `メンバー` の `lineUserId` 列に利用者本人の、`U`から始まるLINEユーザーIDを設定する。未登録ならログイン成功後も `利用登録が確認できません` が返る。
4. `/api/session`（利用者と権限）→`/api/match/practices`（日程）→`/api/match/get`（対戦表）の順に確認する。
5. その後、閲覧用LIFF・運用管理用LIFFのIDを同様に登録する。**それぞれのページと同じURLをLIFFのエンドポイントに設定すること。**

## 公開リポジトリの取り扱い
- `runtime-config.js` には公開可能なLIFF ID・WorkerのURLのみ記載する。
- `BACKEND_SECRET`、`GAS_SHARED_SECRET`、LINEチャネルシークレット、IDトークン、アクセストークン、実利用者のLINEユーザーIDを登録・コミットしない。
- 更新操作の許可はGAS側のLINEユーザーID・当番チーム／管理者ロールで判断する。
- `/health` はWorkerの公開と設定値の存在を示すのみ。GAS通信やLINE認証の成功を意味しない。
- 本番のLINE公式アカウントのリッチメニューは、検証完了まで変更しない。

## 起動速度改善（v0.15.7）
- 操作用 `match.html` の起動で、本人確認（`/api/session`）と練習日程（`/api/match/practices`）を同時に取得する。2件とも読み取り専用であり、GAS・Worker側の認証と権限判定は変更しない。
- 画面上部の「⏱ 起動時間を確認」を開くと、LIFF初期化、本人確認、日程取得、並列実時間、対戦表取得の時間を確認・コピーできる。LINEユーザーID・トークンは計測・送信しない。
- 「ページ表示から」はWeb画面が読み込み開始してからの時間であり、トークURLのタップからLIFFブラウザの起動が始まるまでの時間は含まない。
- 実機での短縮効果は未測定。再起動して数値を確認し、遅い工程を絞り込む。なお、必要な `liff.init()` の省略・トークン検証の省略・対戦表の古いキャッシュ表示はしない。

## v0.16.0 3権限とビジターQR（ステージング実装）
- 権限は `admin`（管理者）、`duty`（当番担当）、`member`（一般メンバー）の3種類。
- 当番担当は開催日によらず試合と集金を操作できる。開催日担当設定は廃止。
- 登録申請は本人がLINEログインで申請し、管理者が画面で承認・却下・権限変更。
- 登録済み一般メンバーも既存 `match.html` LIFFから対戦表の閲覧とQR発行ができる。
- QRリンク先は `guest.html`。友だち追加もLINEログインも不要のブラウザ閲覧専用。期限8時間。URL秘密値はフラグメントで運ぶ。Google SheetsにSHA-256のみ保存。
- 閲覧は氏名相当の表示名、試合、コートのみ。個人ID、集金情報、操作履歴、試合操作APIは公開しない。
- 検証用Sheetsには `登録申請`, `閲覧リンク` の2シートと、権限用 `T-ROLE-DUTY` を追加済み。検証ユーザー `M-TEST-DUTY` は管理者権限に設定（本番変更なし）。
- QRCode.jsはMITライセンス。ライセンス本文は `licenses/QRCodeJS-MIT-LICENSE.txt`。
- **フラグは現在 `accessFeaturesEnabled: true`。** ユーザーがGASとWorker v0.16.0を検証環境にデプロイし、閲覧QRと管理画面の表示を確認済み。
- GAS/Worker/LIFF実環境の新機能の総合テストはまだ未実施。試合進行の実操作テストに進む前に権限・ゲストQRの正常系/異常系を確認する。

## v0.16.2 一般メンバー権限の明確化と管理画面移設準備
- 一般メンバーは対戦表閲覧・更新・閲覧QR発行だけ。対戦表の作成・進行・再生成・各種設定は画面非表示、フロント側でも更新操作を拒否。
- GAS v0.16.0の`matchApiDispatch_`は、参照以外の更新操作で`requireDuty_`を要求。一般メンバーではサーバーが403相当のFORBIDDENを返す。
- 運用管理`live.html`に管理者専用「メンバー・権限管理」UIを配置。`liveLiffId`は`2012602642-XBSkXduO`で設定済み。管理画面の実機確認完了後、対戦表画面の暫定管理機能は撤去済み。
- 運用管理LIFFは実機でホーム表示・管理メニュー・申請/権限一覧の確認済み。対戦表の管理機能は運用管理ツールへ集約済み。
- リッチメニューの役割別切替、現金確認、参加者編集、練習日程CRUDはまだ未完成。
- 詳細：[`docs/implementation-status-v162.md`](docs/implementation-status-v162.md)

## 本番構築開始時の最優先チェック（ユーザーから明示依頼・2026-11-17）

**検証中はURLを変更しない。** 本番移行着手時には、まず GitHub Organization `zensuma`（または利用可能な類似名）の取得を案内し、アカウント名を含まないブランドURL（例：`https://zensuma.github.io/` または `https://zensuma.github.io/<repository>/`）への公開移行を提案する。取得可能性は未確認であり、文字列だけの変更は不可。

本番用のGitHub組織を決めてから、公開リポジトリ、LIFFの各エンドポイント、GASの`SMA16.site`（ビジターQR発行先）、`runtime-config.js`の`guestViewUrl`、Cloudflare Workerの`FRONTEND_ORIGIN`とCORS、CSPや必要なアクセス権を一斉に見直す。検証版のトークン/データを本番へ持ち込まない。変更後はLINE認証、操作権限、QRの閲覧と失効を再検証する。

現行の運用管理LIFF：`2012602642-XBSkXduO`（設定済み、実機動作は未検証）。
エンドポイント：`https://hitoriojisan52.github.io/zenryoku-smash-staging/live.html`
接続確認用LIFF：`https://liff.line.me/2012602642-XBSkXduO?v=164a`

## v0.16.5 管理機能の移設完了・集金非活性表示
- 検証用運用管理LIFFの管理者画面が起動できることをユーザーが確認。登録申請・権限変更を扱うコードは`live-access.js`にある。
- 対戦表`match.html`から暫定管理ボタンと一覧画面、`access-ui.js`から関連処理を削除。登録申請と閲覧QRは維持。
- テスト用スプレッドシートの練習日`2026-11-16`には、`全体収支管理表`に`P-TEST-20261116`行が存在しない。集金ボタンが操作できないのは`ledger===null`による仕様上のロック。
- 集金画面に「この開催日は集金・収支データが未作成のため、集金操作はできません。」の状態説明を追加。データ自動生成や既存データ変更は行っていない。
- 運用管理LIFF: `https://liff.line.me/2012602642-XBSkXduO?v=165a`。対戦表LIFF: `https://liff.line.me/2012602642-3FKiOTVx?v=165a`。
- 本番構築時には専用GitHub Organization（例: `zensuma`）へ移す提案を最初に再案内する。現時点では検証用URLを維持。
- 次の未実装：LINE友だち追加後の「新規登録」、承認/権限変更に応じたユーザー別リッチメニューの自動切り替え、練習日に対応する収支行の作成・編集画面、現金確認/参加者管理/練習日程管理。


**v0.16.75検証反映（2026/11/20）**：[PR #84](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/84) はUI/GAS/仕様CI成功。GAS既存デプロイ`@42`、Pages、Workers Builds、公開LIFF/Workerスモーク成功。集金画面の起動速度および復旧の実機確認はまだ未実施。LINE本人参加連絡E2Eは一時停止し起動復旧を優先。本番未変更。[詳細](docs/stage-v1675-startup-performance.md)。