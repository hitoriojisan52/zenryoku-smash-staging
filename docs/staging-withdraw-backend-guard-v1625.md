# 全力☆スマッシュ | v0.16.25 退会バックエンド安全ゲート（レビュー用）

## 現状
- v0.16.24のLINE実機確認：二段階確認を最後まで進め「確認できました。退会はしていません。」の表示成功
- ステージングスプレッドシート `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` の有効メンバーは**管理者1名のみ**。退会対象となる一般メンバーなし
- 退会履歴シート読み取りの v0.16.23 はLINE実機で「退会履歴はありません。」表示を確認済み
- 本番・元ステージングの退会削除は実施していない

## 今回の実装候補（**未デプロイ**）
- 会話上でユーザーが現在デプロイしたと報告した `AccessAndGuest` v0.16.23 と同内容の保存済みGASを基準に作成
- `accessManagement16_` の管理者認証直後に `member.manage.withdraw` を**無条件で拒否**するコードを追加
- GASスクリプトプロパティの `WITHDRAW_ENABLED` が誤って `true` でも、削除ルートには入らない
- `accessWithdrawPreflightV1625()` はエディタからのみ起動する読み取り専用の事前点検関数。対象はステージングの指定シートだけ。返す情報は権限別の人数と構成の確認結果だけ
- `member.manage.list`、承認、権限変更、閲覧QR、対戦表、集金・収支のコードは変更なし
- GAS既存ファイルからの差分は安全ゲート挿入＋点検関数追加だけ
- この候補自体には退会レコード削除APIや削除ロジックを含まない
- ZIP: `zenryoku_smash_v1625_safe_backend_review.zip`（GAS全文・元ファイル・差分・20件テスト・手順書）
- オフライン検証 **20/20 PASS**（通常一覧の応答不変、管理者以外の拒否、退会書込ゼロ、別シートID拒否、ヘッダー不整合拒否など）
- ZIPは会話に添付。GitHubにはコードを上げず検証記録のみ追加

## 反映の安全ゲート
1. 現行ステージングWorkerのソースを確認する。古い保存版はデプロイ中のコードとの一致を保証しない
2. 既存 `AccessAndGuest` v0.16.23 と作成候補の差分をユーザーと照合。保存済みv0.16.23を上書きできると確認してから反映する
3. GAS・Workerの `WITHDRAW_ENABLED=false` とWorkerの `RICH_MENU_SYNC_ENABLED=false`を維持。これらの設定を有効化しない
4. GASの現在のデプロイを新バージョンで更新する場合はバックアップ・デプロイID維持・読取機能回帰テストを行う
5. 現行Workerの退会API許可リスト・403拒否条件・LINE本人認証とCORSを確認する。**ソース照合前にWorkerコードを変更しない**
6. 退会が必ず拒否されることを確認する際は、対象メンバーの削除リクエストを実行しない。GASエディタの点検関数かローカルテストを優先する

## 次の依頼
現行ステージングの**Cloudflare Workerソース全文**を、Cloudflareの編集画面から取得して共有してもらう。環境変数の**値**、LINEのアクセストークン、GAS共有秘密値、LINEのIDトークン等は不要。現行Workerが安全に退会要求をブロックできるか、コード差分で確認する。

## 残る実機未検証事項
- ステージングのWorker退会エンドポイントは現行ソース未照合で、実退会のステージングE2Eは未実施
- 既存管理者以外の一般/当番ユーザーの実機権限変更・承認は今回実行しない
- ユーザー別LINEリッチメニュー同期も無効のまま

## v0.16.26 現行Workerソース照合・安全ゲート統合候補（2026-11-17）
- ユーザーからCloudflare `zenryoku-smash-staging-api` の現行Worker全文を受領
- 貼付中のMarkdown装飾により先頭コメントやLINEの `https://` URLがリンク構文に変形していたため、保存済みの **同じv0.16.0元ソース**を基準に復元し、元コードを保持したまま差分を作成
- 現行Worker `VALID_PATHS` に退会APIは未登録（現状は404拒否）
- 新候補 `worker_v1626_WITHDRAW_DISABLED.mjs` の差分は3か所：
  1. `/api/member/manage/withdraw` をAPIルートとして識別
  2. LINE IDトークン検証の直後に **無条件403 `WITHDRAW_DISABLED`** を返し、GASへのPOSTを一切行わない
  3. `/health` に返す公開バージョンだけ `0.16.26` に更新
- `WITHDRAW_ENABLED=true` と誤設定されても Worker が常に拒否。GAS v0.16.25候補も同様に常時拒否。実退会は未実装
- 現行Workerの認証、CORS、ContentServiceのリダイレクト、既存試合/集金/QR/管理APIは変更しない
- ローカル模擬通信テスト **25/25 PASS**（有効LINEトークン相当の認証→403かつGAS未転送、誤った有効フラグ、CORS、既存セッション・ゲストAPI、バージョン確認）
- 前回GAS候補も再テスト **20/20 PASS**
- 追加ファイル一式は会話添付 `zenryoku_smash_v1626_backend_safe_integration.zip`（Worker完成版、差分、模擬テスト、GAS v0.16.25候補、GAS差分とテスト）
- まだGAS・Cloudflareへの**実デプロイなし**。GitHub Pagesのアプリ画面も変更なし

### 安全な手動デプロイ順序
1. 現行のステージングGAS `AccessAndGuest` と Cloudflare Worker のコードを別途保存
2. 先にGASの v0.16.25 無条件拒否版を既存の `AccessAndGuest` へ適用し、既存ウェブアプリのデプロイを更新。既存の履歴表示・試合/集金表示を回帰確認
3. 次にWorkerの v0.16.26 無条件拒否版を既存 `zenryoku-smash-staging-api` へデプロイ（URL・環境変数を維持）
4. `https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health` の `version:0.16.26` を確認。ヘルスチェックは実際の退会可否・GAS連携までは証明しない
5. 既存LINE管理者LIFFで運用管理のメンバー管理・退会履歴（0件）、対戦表、集金画面、QRの表示のみを確認
6. **最後の管理者への退会要求や実メンバーIDを用いた破壊的テストは行わない**。両環境の `WITHDRAW_ENABLED` は false のまま

### 残る工程
- 新規架空メンバーを分離された検証コピーで作成し、Worker/GASの実退会有効版は新たなレビューとユーザーの明示的承認後に作成・検証
- 元ステージングに実退会コードを直接流用しない。現在の安全ゲートを維持する
