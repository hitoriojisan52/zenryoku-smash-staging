# 全力☆スマッシュ v0.16.29｜独立退会E2E検証の準備

## 現状（2026-11-17）
- v0.16.27のステージング読取APIはユーザー実機で合格済み。元ステージングの退会実行は引き続き無条件403
- **新独立コピー**: `1H491pOU_HrI5TDxFtjPZli9YMf8Zwld6U6n8BX1frjw`
- **変更前バックアップ**: `1-SEK5HBOcaGXTJH2AfXxPN1oCbG--A2b9KDzDA4J_TQ`
- 以前の退会検証専用コピー（15シート）を新しく複製。管理者LINE IDは架空値に置換。両コピーとも非共有をGoogle Driveの権限メタデータで確認
- 今回の**指定架空対象**: `M-TEST-WITHDRAW-1629` / `退会E2E対象（架空1629）`
- 新コピーに架空の登録申請・当番チーム所属・出欠・集金・QRハッシュ記録を作成。旧履歴0ではなく過去の架空退会履歴を保持。今回の指定対象の履歴はまだなし
- 元ステージング、旧退会検証専用コピー、本番、既存Worker、既存LIFF、LINEメニューへの変更なし

## GitHub Pagesでの準備
- 新フォルダー `withdraw-v1629/` に、専用管理者UI・登録申請UI・共通ポップアップ、APIクライアントを配置
- **Worker URLとLIFF IDは未設定のプレースホルダー**。既存LIFF IDは引き継がない
- `api.js` の `withdrawUiEnabled:false` は変更していない。管理画面では退会ボタン非表示、APIクライアントも実行を拒否
- 管理者・その他メンバーは退会ターゲットとして非表示。1名の架空対象だけロジック上候補にできる
- `withdraw-v1629/manage.html` / `withdraw-v1629/register.html` は新LIFFのエンドポイントとして用意（まだLIFF登録は実施していない）

## 専用ソース（チャットのZIPに格納、公開GitHubには置かない）
- GAS：`Code_v1629_ISOLATED_ONLY.gs`、`AccessAndGuest_v1629_ISOLATED_DISABLED.gs`
- Worker：`worker_v1629_ISOLATED_DISABLED.mjs`
- 新コピーIDと指定対象IDを**コード側にも固定**。GASの `WITHDRAW_ENABLED` と `WITHDRAW_TEST_MEMBER_ID`、Workerの `WITHDRAW_ENABLED`、`WITHDRAW_TEST_MEMBER_ID`、`WORKER_PURPOSE`、`WITHDRAW_SANDBOX_SPREADSHEET_ID` を照合
- **初期フラグはすべて無効**。独立GAS/Workerプロジェクトは未作成、未デプロイ
- Code.gsの認証で`processing`履歴が残る有効ユーザーを拒否し、登録申請もブロック
- 今回の専用Workerはメンバー/権限管理以外のAPIを閉鎖（QR新規発行・試合操作・集金操作なし）
- 既存の退会検証用 v0.16.18 とステージング v0.16.27 を参照。**元環境へは移植しない**

## オフラインテスト結果
- GAS退会・履歴・再入会関連：**54/54**
- Workerの本人認証・二重ゲート・CORS・ルート制限：**27/27**
- GASコアの `processing` 認証拒否：**8/8**
- GitHub検証用UIの分離・未設定安全性：**15/15**
- 合計 **104/104 PASS**。Google Sheets/LINE/Workerの実E2Eはまだ行っていない

## 次の手動作業（実退会はしない）
1. 新コピーから**新規の**GASプロジェクトを用意。新しいWebアプリURLでデプロイし、ZIPの独立GASコードと `SPREADSHEET_ID` を新コピーIDに指定
2. **新規の**Cloudflare Workerを作成。既存ステージング・旧退会Workerとは別名。まず `WITHDRAW_ENABLED=false`、`RICH_MENU_SYNC_ENABLED=false` のままデプロイ
3. LINE Developersで**新しい2件のLIFF**を作成し、今回のHTMLエンドポイントを設定
4. 新Worker URLとLIFF IDだけを `withdraw-v1629/config.js` と `withdraw-v1629/api.js` のプレースホルダーへ設定
5. LINE本人認証の実機検証には、架空のU文字列ではなく、**テスト専用LINEアカウント**を新コピーの管理者行に紐づける必要がある。再入会まで実機で行うには別のテスト専用アカウントが必要。IDはチャットや公開GitHubで共有しない
6. 管理画面の一覧と登録画面を読み取り確認。未設定・無効の間は実際の退会操作を要求しない
7. 架空メンバー1名を実退会させる破壊的試験は、前述が完了した後、**ユーザーの個別の明示的な了承**を受けてから

## 安全性
- **元ステージング** : `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` は触れていない。GAS/Worker v0.16.27の無条件403を維持
- **以前の退会検証専用コピー** : `1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM` は触れていない
- **新コピー** だけに6シート分の架空検証行を書き込んだ
- **新独立Worker/GAS/LIFF** は未デプロイ。今回のコードパッケージを既存環境に貼り付けない

全手順書・変更差分・テストは `zenryoku_smash_v1629_isolated_e2e_preparation.zip`（会話添付）を参照。
