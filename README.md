# 全力☆スマッシュ｜検証用GitHub Pages
公開先: https://hitoriojisan52.github.io/zenryoku-smash-staging/

## 接続状況（2026-11-16）
- GAS: 検証用Google Sheetsへの読込・書込・試合5ラウンド保存をGASエディタ上で確認済み
- Worker: https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health で `configured:true` をユーザー確認済み
- GitHub Pages: 公開確認済み。Worker公開URLは `runtime-config.js` に反映済み
- LINEログインとWorker→GASの本人認証付きPOSTは**未検証**
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
