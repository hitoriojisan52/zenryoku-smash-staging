# 全力☆スマッシュ v0.16.23｜ステージングの退会履歴（読み取り専用）連携準備

## 作業状況（2026-11-17）
- 運用管理画面と対戦表の表示改善 v0.16.22 はユーザーのLINE実機確認を通過済み
- 退会・再入会は専用コピーと専用Workerで正常終了を確認済み。ただし、元のステージングでの実削除は禁止
- 元のステージングスプレッドシート `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` には `退会履歴` がなかった
- **事前バックアップ作成済み**: `1Ykfu0PhIkjJCMyCEAphiPTk8LUsHMQpvEWBp8yRxtaQ`（14シートがコピーされたことを確認）
- **新規シート `退会履歴` 作成済み**。ヘッダー: `memberId, displayName, withdrawnAt, withdrawnBy, state, operationId`。現時点で記録行0
- 既存14シートのデータ、登録メンバーの権限、Worker、LINEリッチメニュー、GASデプロイは変更していない
- `live-access-v2.js` は既に `member.manage.list` 応答に `withdrawn` 配列がある場合だけ「退会履歴を見る」を表示する（新しいUI変更不要）

## この工程で追加準備したもの
- 過去に保存された `AccessAndGuestV160.gs` を基準にした **履歴読取だけ** のGAS候補 `AccessAndGuestV1623_READ_ONLY_CANDIDATE.gs`
- `ONLY_CHANGES.diff`（追加した履歴読取の差分）
- `AccessAndGuestV160_ORIGINAL_REFERENCE.gs`（比較用の元コード）
- `test_history_readonly_v1623.cjs`（オフライン安全性テスト）
- `README_FIRST.md`（適用前条件と実機確認）
- **オフライン模擬テスト 12/12 PASS**。管理者権限、API応答、履歴にLINE IDが含まれないこと、現在登録中のメンバーは退会完了と表示しないこと、ヘッダー不一致時の拒否、書き込みゼロなどを確認
- `member.manage.withdraw` ルートはこの候補に存在しない。Worker変更も必要ない

## 重要：デプロイはまだ行わない
この候補は保存済みの旧ソースを基準としたため、**ユーザーの現在のGASエディタ内 `AccessAndGuest` ファイルと一致することを確認できていない**。
実際に今使われているGASは、途中でユーザーが変更した版の可能性がある。

したがって、ソースを全文上書きしない。
- 現行 `AccessAndGuest` を取得・照合し、履歴読み取りの差分だけを統合した新しい完全版を準備する
- 変更前のGASバージョンを保存
- テスト段階では `WITHDRAW_ENABLED=false` および `RICH_MENU_SYNC_ENABLED=false` を維持
- 既存Workerと元の本番GAS・本番スプレッドシートを変更しない

## GAS反映後の期待結果
1. ステージングLIFF `https://liff.line.me/2012602642-XBSkXduO?accessUi=v2` の「メンバー・権限管理」を開く
2. 承認待ち／役割一覧は以前のまま表示される
3. 新たに「退会履歴を見る」の欄が表示され、現在は「退会履歴はありません。」と表示される
4. 履歴の確認だけで、退会ボタンや削除処理は出ない
5. 操作権限のないアカウントからは管理履歴を取得できない（APIで判定）
6. 通信・権限・データのエラー時も既存の共通UIを使う

## 次の後続
- 現行デプロイ中GASの `AccessAndGuest` 全文と候補との差分照合
- 照合結果に合わせて差分だけを適用し、GASの新しいバージョンを発行（作業はユーザー側）
- 退会履歴の読み取り実機検証（既存実メンバー退会は行わない）
- その後で、退会API本体の安全な移植を別工程で検討。架空テスト用固定IDを本番相当のロジックにコピーしない

## 現行ソースの照合完了（2026-11-17）
- ユーザーからGASエディタの現在の `AccessAndGuest` v0.16.0全文を受領。以前保存されたv0.16.0の関数構成と一致した
- 既存159行を保存し、履歴取得専用ヘルパー追加と `member.manage.list` 応答拡張のみを施した **v0.16.23全文置換用ソース**を会話に添付
- 既存 `member.manage.decide`、`member.manage.role`、QR発行・失効・ゲスト閲覧のコードは不変
- 新しい退会APIはなし。GAS/Worker/LINEメニューへのデプロイ・更新はまだ実施していない
- GAS ECMAScript構文検査 PASS、履歴読み取り模擬テスト **12/12 PASS**
- ステージングの「退会履歴」シートは見出し6列が一致し、履歴0件を再確認
- 次の手順は、**元のGASファイルを必ずバックアップ**したうえで全文を置換、既存Webアプリを新しいバージョンで更新すること。ユーザー操作完了後にLIFF実機確認へ進む
- 試験URL: `https://liff.line.me/2012602642-XBSkXduO?accessUi=v2&v=1623a`

## v0.16.23 実機確認合格
- 管理者用LIFFで「退会履歴はありません。」が表示されたことをユーザーが確認。読み取り専用GASの連携は合格。
- 元のステージングは管理者1名だけ。削除できる検証対象はいない。

## v0.16.24 画面確認だけを段階導入
- `https://liff.line.me/2012602642-XBSkXduO?accessUi=v2&withdrawPreview=1&v=1624a` のときだけ、二段階の退会確認画面テストを表示
- 架空の「表示例のメンバー」を使ったUIテスト。メンバー削除、ロール変更、履歴更新、Workerの退会API呼び出しは一切しない
- 通常の `accessUi=v2` と従来画面には試験用UIを表示しない
- 本番・元のステージングGAS/Worker/LINEリッチメニューは変更しない。退会APIは接続しない
- GAS/Workerの`WITHDRAW_ENABLED=false`、`RICH_MENU_SYNC_ENABLED=false`を維持
- 実退会の統合は、最新のWorkerコードの照合と専用コピーでの許可対象1名に限定した再検証の後、別途承認を得る

## v0.16.24 模擬テスト結果
- LIFF URLの直接指定、`liff.state`、試験用パラメータの欠落時に試験UIを非表示にする検査: **6/6 PASS**
- JS構文、退会API未接続、HTMLの試験用表示、キャッシュ更新などの静的検査: **8/8 PASS**
- 管理者本人は対象外の説明表示、1段目キャンセル、2段目キャンセル、完了通知、通信が読取APIだけであることの模擬操作: **8/8 PASS**
- 計 **22/22 PASS**（LINE実機での試験画面操作は未実施）
- GitHubの変更ファイルは `access-v2-mode.js`、`live-access-v2.js`、`live-access-v2.css`、`live.html`、このドキュメントのみ
- 実サーバーやスプレッドシートへの書き込みはない。退会APIのエンドポイント追加もない
