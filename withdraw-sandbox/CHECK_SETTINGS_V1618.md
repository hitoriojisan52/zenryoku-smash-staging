# 退会検証 v0.16.18｜安全設定チェック（実行前）

対象は **退会検証専用** GAS と Cloudflare Worker のみ。
このチェックでは退会APIを呼ばない。リッチメニューも変更しない。

## A. Google Apps Script

検証専用GASを開き、左の歯車アイコン「プロジェクトの設定」→「スクリプト プロパティ」。
次のプロパティ名と値が **完全一致** しているかを確認する。

| プロパティ | 値 |
|---|---|
| `SPREADSHEET_ID` | `1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM` |
| `WITHDRAW_ENABLED` | `false` |
| `WITHDRAW_TEST_MEMBER_ID` | `M-TEST-WITHDRAW-1618` |

なければ追加する。値を変更したら「スクリプト プロパティを保存」。
`SPREADSHEET_ID` が異なる場合、誤ったプロジェクトを開いている可能性があるため **いったん中止する**。元の値を推測して上書きしない。
`BACKEND_SECRET` は変更・公開しない。

## B. Cloudflare

Cloudflare ダッシュボード → **Workers & Pages** → 検証専用Worker
`zenryoku-smash-withdraw-sandbox-api` → **Settings** → **Variables and Secrets**。

| 変数 | 値 |
|---|---|
| `WITHDRAW_ENABLED` | `false` |
| `RICH_MENU_SYNC_ENABLED` | `false` |
| `WITHDRAW_TEST_MEMBER_ID` | `M-TEST-WITHDRAW-1618` |

確認するのは実際にデプロイされるWorkerの設定。欠けている場合は追加、異なる場合は編集し、`Deploy` を押して反映する。
すべて **テキスト文字列**。値に `"`、`'`、空白を付けない。秘密情報は触らない。

Worker名が異なる場合は中止する。Workerの `GAS_WEB_APP_URL`、`GAS_SHARED_SECRET`、`LINE_LOGIN_CHANNEL_ID` などを変更しない。

## C. 結果の連絡

秘密値・LINEユーザーID・IDトークンは送らず、次の記載を返す。

- GAS: 3項目一致 or 不一致（どのプロパティか）
- Worker: 3項目一致 or 不一致（どの変数か）
- 変更後の保存・Worker再デプロイ: 済 / 不要 / 未
- 管理者用LIFF: 一覧表示OK / NG

`WITHDRAW_ENABLED` はGAS・Workerとも **false** のまま。両方の保護が確認できた後に、検証用の退会ボタンを別途準備する。

## こちらで実施・確認済み

- 最新の検証用シートには架空退会対象 `M-TEST-WITHDRAW-1618` が1名だけ存在し、active=true、isAdmin=false。
- 退会試験前のコピーは `109LaHmKjqzsYWnSgHsWR1Z0UqJhm6UL_m3KHTZhyCM8` に保存済み。
- GitHubの検証画面 `withdraw-sandbox/api.js` は退会APIを許可していない。画面に退会ボタンは未実装。
- 反映用コードの追加安全性オフラインテストは、GAS 6件、Worker 5件（11件）合格。実デプロイの変数値を証明するテストではない。
- Workerの `/health` は設定完了フラグのみを返し、`WITHDRAW_ENABLED` と `RICH_MENU_SYNC_ENABLED` の値を証明できない。表示される `version:0.16.10` はソース内の固定表示値なので、v0.16.18のデプロイ検証には使わない。

実際の退会による行削除と、LIFF経由での退会/再入会のE2Eは未実施。
