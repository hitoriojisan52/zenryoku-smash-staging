# 全力☆スマッシュ｜検証用GitHub Pages

**新しいチャットで開発を再開する場合は、必ず [開始用プロンプト](docs/NEW_CHAT_START_PROMPT.md) を使用し、[開発引継ぎ文書](docs/SESSION_HANDOFF.md) と [仕様優先順位の正式ルール](docs/SPEC_PRIORITY_POLICY.md) を確認する。**
**GAS・Worker・PagesのGitHub経由デプロイとユーザーへの具体的な作業案内**は [DEPLOYMENT_AND_USER_ACTIONS.md](docs/DEPLOYMENT_AND_USER_ACTIONS.md) に従う（Worker v0.16.53の反映確認とGAS/Workerの設定完了報告を記録済み）。
**退会・再入会の確定仕様と接続検証の進捗**：[v0.16.53引継ぎ](docs/stage-v1653-withdraw-rejoin.md)を参照。
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
