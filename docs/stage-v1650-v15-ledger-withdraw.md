# v0.16.50 — v15収支管理表復元・退会履歴復元・実退会フロー準備

## 添付画像（zenryoku_smash_poc_v15）に合わせたレイアウト

2026年11月19日。画像：全体収支管理表（2026年11月、黄色の前月繰越、確定済み行、立替精算行、練習日行）。

- 最大約1500pxの横長モーダル。テーブルは1020px以上でスマートフォンでは横スクロール。
- 左上にタイトル。淡いグレーの月ナビゲーションに対象月・前月・翌月・右端「＋追加」。下部右側に青い「閉じる」。
- 黄色の「前月繰越（表示用）」、淡いグレーの確定済み行、残金は青字・右寄せ、集金額/支出の0円は「—」。確定済み行のラベルと領収書マーク。
- 操作は左寄せ。「修正」（青）・「削除」（グレー）・「確定」（緑）を未確定行に常時表示。練習日行の「修正」は非活性。未来日の操作も非活性だがボタン自体は削除しない。確定済み行は「確定済み」（非活性）を表示し、管理者の確定解除は維持。
- 役割（デモ）は実認証の検証画面で非表示を維持。元v15画像のデモ用切替を再導入しない。
- このユーザー確定レイアウトは共通の「右上閉じる」配置規則より優先。ほかの画面は変更しない。

## 退会履歴：ユーザーが確定した①～⑤・⑦

- `<details>` / `<summary>退会履歴を見る</summary>` で初期折りたたみ、利用者が展開。
- 履歴0件なら「退会履歴はありません。」。APIに `withdrawn` 配列が存在しない場合はセクション全体を非表示（0件との区別）。
- 氏名＋状態＋（存在する場合のみ）退会日時の簡潔な行。参加者カード表示は廃止。時刻なしの場合は「未記録」のダミー行を出さない。
- ⑥の状態の意味（completed/processing）は変更しない。過去の収支・試合・参加履歴やLINEユーザーIDの扱いも維持。

## 利用者一覧から退会（実装済みだが実行は初期無効）

- 管理者が有効な一般メンバー・当番担当を選ぶ。「退会」ボタンは対象のカードの操作欄に表示し、サーバーの新しい `withdrawMemberEnabled` がfalseの間は**非活性**。
- 操作には２回の確認があり、最後は対象の氏名と同じ文字列を入力する。管理者本人・管理者・停止中会員は対象外。
- API `/api/member/manage/withdraw-member` → Worker op `member.manage.withdraw.member` → GAS `accessMemberWithdrawalV1650_`。v0.16.36架空対象専用の`member.manage.withdraw`を変更しない。
- GASは管理者本人LINE識別・一意なmemberId・LINE ID重複・有効/管理者・氏名・操作ID・退会履歴の重複を検査。専用シートID一致を要求。
- `退会履歴` に processing を先行追記→対象をactive=false→flush→当番チームの所属・承認時の登録申請を削除、本人発行のQR閲覧リンクを失効→completed→旧メンバー行を削除→操作履歴。
- 出欠・集金・全体収支・試合・既存監査の過去記録は変更しない。退会後の再申請で新memberIdを発行できる。
- 途中失敗時はprocessingで重複退会を阻止。**自動再送なし**。管理者が状況確認するまで手動再実行禁止。

## 実行までの必須設定（初期値は全てOFF）

**本PRのマージだけで実退会はできない。** 現在報告された検証用Cloudflare Workerの /health は `0.16.40-stage-visitor-approval` で、GitHub上のWorkerソースと実デプロイが異なる。

1. 現行の接続検証用GASとCloudflare Workerの現行デプロイ版・設定を照合し、事前バックアップを作成。過去の架空メンバー専用の環境と混同しない。
2. GitHubの `cloudflare-worker/worker.js` を既存の検証用Worker `zenryoku-smash-staging-api` のみにデプロイ。既存Cloudflare変数・Secrets・許可Origin・LINEチャネルを維持し、/healthが `version=0.16.50-stage-member-withdraw-ready` であることを確認。
3. まずGAS `WITHDRAW_MEMBER_ENABLED=false`、Worker `WITHDRAW_MEMBER_ENABLED=false` のまま、管理者と一般メンバーの権限別表示、二段階確認、失敗時UIを実機検証。
4. 破壊的な操作の対象は最初は**接続検証環境内に追加した架空の一般メンバー１名だけ**に限定。実装済みの `WITHDRAW_MEMBER_SCOPE=single` と `WITHDRAW_MEMBER_TARGET_ID` に両サービスで同じ架空メンバーIDを設定してから実行します。実機試験は未実施。
5. 有効化設定（運用開始時にのみ実施）:
   - Worker vars: `WITHDRAW_MEMBER_ENABLED=true`, `WITHDRAW_MEMBER_PURPOSE=staging-member-withdraw-v1650`, `WITHDRAW_STAGE_SPREADSHEET_ID` を接続検証用スプレッドシートIDに設定。
   - GAS script properties: `WITHDRAW_MEMBER_ENABLED=true`, `STAGING_WITHDRAW_MEMBER_PURPOSE=staging-member-withdraw-v1650`, `SPREADSHEET_ID` を接続検証用スプレッドシートIDに設定。
   - `RICH_MENU_SYNC_ENABLED=false` を維持し、本番用の秘密値やトークンをチャットやGitHubコードに記載しない。
6. 既存の対象ID限定ゲートを使って架空1名の退会・再登録を実機で確認し、履歴の保全・管理者/本人拒否を確認してから通常メンバー向けに `WITHDRAW_MEMBER_SCOPE=all` を別途承認する。
7. 実行後にフラグをfalseへ戻して履歴と書込差分を確認する。通信断時に同じ退会操作を再送しない。

**既存本番環境、本番LINEメニュー、本番GAS・Workerは変更しない。** 今回の実装変更はGitHubの検証用ソースとGASの自動デプロイだけ。Cloudflare Workerの実デプロイやvars変更は、接続・権限の設定を確認できるまで実施しない。

### 追加の必須スコープ設定
- Worker/GASとも `WITHDRAW_MEMBER_SCOPE=single` と `WITHDRAW_MEMBER_TARGET_ID`（同じ架空対象memberId）を指定する。違う対象には退会ボタンを有効にせず、サーバー側も拒否。
- 実試験に合格し、通常メンバーの退会を許可する段階でのみ両方を `WITHDRAW_MEMBER_SCOPE=all` に変更する。
- 設定が未指定なら、`WITHDRAW_MEMBER_ENABLED=true` であってもサーバーは拒否。
