# 退会実行テスト v0.16.18 — 実行前の安全確認

## 変更内容
- 検証用の管理者LIFFにだけ、`退会実行テスト用（架空）` の行に **「退会する（テスト）」** ボタンを表示
- `memberId=M-TEST-WITHDRAW-1618`、表示名が一致、有効な一般メンバー、本人ではないことをUIで確認
- 確認ダイアログを２回表示し、最後の赤ボタン **「退会を実行」** が押された場合のみAPIを呼ぶ
- API呼出し直前にメンバー一覧を再取得し、同じ1名で有効/一般メンバー/未退会か再検査
- `/api/member/manage/withdraw` のブラウザ呼び出しはこの1名のID、再入力ID、UUID操作IDに限定
- Worker/GASでは `WITHDRAW_TEST_MEMBER_ID` および `WITHDRAW_ENABLED` と検証専用シートIDで保護
- 書込後の再取得で、メンバー一覧からの消失・退会履歴`completed`を確認してから成功通知
- 通信断・タイムアウト時に退会APIを自動再送しない。更新して最新状態を確認する

## 反映時点での安全設定
- ユーザー確認済み: 検証用GAS、Workerとも `WITHDRAW_ENABLED=false`
- Workerの `RICH_MENU_SYNC_ENABLED=false`
- 両方の `WITHDRAW_TEST_MEMBER_ID=M-TEST-WITHDRAW-1618`
- GitHubでのUI反映は、GAS・Workerの設定を変更しない
- **この状態で実行ボタンを押しても、Workerが403で退会を拒否する**
- 退会フラグを有効にする操作は、ユーザーが実行前に両サービスで短時間だけ明示的に行う

## 実行する際の操作
1. 適切な検証用バックアップを確認（`1ZeL4aTIGxvYCQ4x7gtt6B9Is-JxYVxKXYheC3QFlKjI`）
2. 検証専用のGASプロジェクトだけ `WITHDRAW_ENABLED=true` を保存
3. 検証専用Workerだけ `WITHDRAW_ENABLED=true` に変更、保存・デプロイ
4. `RICH_MENU_SYNC_ENABLED=false`、両方の対象ID、`SPREADSHEET_ID` を再確認
5. LINE管理者LIFFで対象者だけに赤い「退会する（テスト）」があることを確認
6. 2回の確認の後、赤い「退会を実行」を1回だけ押す
7. 成功通知またはエラー画面の内容を確認し、**もう一度押さない**
8. GAS・Worker両方の `WITHDRAW_ENABLED=false` に戻して保存・デプロイ
9. 管理者LIFFを「更新」し、退会対象が消え退会履歴に完了記録が出ることを確認
10. ChatGPTに実行結果を知らせる。秘密値・LINEトークンは不要

## 禁止
- 本番・元のステージングの設定変更
- 他のメンバーに対する退会API操作
- リッチメニュー同期の有効化
- 処理失敗時の退会ボタンの連打
- 本番LINEトークン、GAS秘密値の公開

## 失敗時
- 表示されたエラー文言を控え、フラグは**両方falseへ戻す**
- 退会APIの再実行は禁止。次に最新のメンバー・退会履歴を確認
- 不明な結果の場合は、監査の操作ID等を確認してから次の操作を決める
