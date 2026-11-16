# 全力☆スマッシュ｜GitHub Pages 検証用フロントエンド v0.15.2

## 目的と取り扱い

このリポジトリは**検証用の公開Web画面のみ**です。`gas/`、`worker/`、本番データや秘密キーを含めないでください。**Publicリポジトリでは全ファイルの内容が閲覧可能**です。画面URLを知らなくてもアクセス可能ですが、更新操作はサーバー側のLINE認証＋権限検証が必要です。

## 設定手順

1. GitHubで空の `zenryoku-smash-staging` リポジトリをPublicで作成します。
2. このZIPの内容（ZIPファイル自体ではなく、各ファイル）をリポジトリのルートへ登録します。
3. GitHubのSettings → Pages → Build and deployment → Deploy from a branch、`main` / `/(root)` を選択して保存します。
4. 公開URLの例：`https://GITHUB_USER.github.io/zenryoku-smash-staging/`。トップページの「検証環境」が表示されれば静的配信は正常です。
5. Cloudflare Workerの `FRONTEND_ORIGIN` には **`https://GITHUB_USER.github.io`** のみを設定します（リポジトリ名や末尾の`/`は含めない）。
6. LINE Developersで検証用LIFFを用意します。`openid` scopeを有効にし、エンドポイントと表示対象ページのパスの整合を確認します。
7. `runtime-config.js` の **公開してよい設定** `liffId` と `apiBaseUrl` を検証用の値に変更します。秘密キーは絶対に入力しません。
8. Cloudflare Workerに `GAS_WEB_APP_URL` と `GAS_SHARED_SECRET` を **Secrets** として設定します。前者には今回の検証用GASの `/exec` URL、後者にはGAS `BACKEND_SECRET` と同じ秘密値を登録します。
9. `match.html` が当番担当者／管理者用、`match-view.html` が一般メンバー閲覧用、`live.html` が運用管理試験用です。URLを知っているだけでは更新権限を得られないよう、GAS側でも必ず認可します。

## 未接続・未検証事項

- LINE LoginのIDトークン検証、Cloudflare Worker→GASへの認証付きPOST、メンバーへの実権限の割り当て、LINEリッチメニューへの登録は未実施です。
- `runtime-config.js` のプレースホルダーを置換するまでは画面はAPIへ接続できません。
- 本番のGASや元のスプレッドシートを変更しないでください。

> 本ZIPにはGASとCloudflare Workerのソースコードを含めていません。それらは検証用パッケージの別ファイルで管理します。
