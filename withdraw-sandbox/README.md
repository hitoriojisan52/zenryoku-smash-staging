# 全力☆スマッシュ｜退会検証専用画面（v0.16.11）

このフォルダだけを GitHub Pages の既存 main に追加。既存ページ・Worker・Webhook・リッチメニューは変更しない。

## 公開URL / LIFFエンドポイント

- 登録申請: https://hitoriojisan52.github.io/zenryoku-smash-staging/withdraw-sandbox/register.html
- 管理者: https://hitoriojisan52.github.io/zenryoku-smash-staging/withdraw-sandbox/manage.html
- 案内ページ: https://hitoriojisan52.github.io/zenryoku-smash-staging/withdraw-sandbox/

LINE Developers で**既存ログインチャネルと同じチャネル**に新規LIFFを2件作る。サイズ Full、scope openid を許可。
取得した公開 LIFF ID をこのフォルダの config.js の registerLiffId と manageLiffId に設定する。元のLIFFエンドポイントを変更しない。
LINEログインチャネルIDが専用Workerの LINE_LOGIN_CHANNEL_ID と一致すること。

## 実装

- API通信先は退会検証専用Workerにハードコードしており、既存Workerに自動的にフォールバックしない。
- access-ui.js は改修ブランチ feature/member-withdraw-v167 からコピー。
- live-access.js は同ブランチを基に退会ボタンの表示条件だけ検証用に無効化。
- api.js は退会APIを呼び出せない許可リストを持つ。フロントで退会機能を有効化しない。
- Workerの WITHDRAW_ENABLED=false、RICH_MENU_SYNC_ENABLED=false を維持する。
- 登録申請、承認、権限変更は検証専用コピーの実データを変更するため、必ず架空のテスト用アカウントで実施。
- LINE IDトークンはメモリー上で保持するだけで console / localStorage / GitHub には出力しない。
- いずれのファイルにも BACKEND_SECRET や GAS_SHARED_SECRET、LINEチャネルシークレットを置かない。

## 検証前の確認

1. 各URLでHTMLが配信される（LIFF ID未登録の表示は正常）。
2. 同じLINE Loginチャネルに新規LIFFを2件作り、config.jsのみ更新。
3. LIFF URLから起動し、管理者画面の読取を確認する。
4. 新規登録の申請は未登録の別LINEアカウントが必要。既存の管理者アカウントでは「登録済み」と表示される。
5. 退会API、リッチメニュー同期は別途ユーザー承認後に段階的にテストする。
