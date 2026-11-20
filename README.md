
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