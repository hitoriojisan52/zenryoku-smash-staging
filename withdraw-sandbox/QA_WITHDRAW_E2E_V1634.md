# 全力☆スマッシュ v0.16.34：架空1630の退会・再入会E2E準備（未デプロイ）

## 現在の状態（重要）
- **この変更はPR（レビュー用ブランチ）で準備中。mainと公開LIFFはv0.16.33のまま。**
- 退会実行は**未実施**。GAS/Workerの `WITHDRAW_ENABLED=false` を維持。
- 退会対象は既存の退会検証専用スプレッドシート内の架空メンバー `M-TEST-WITHDRAW-1630`（表示名 `退会追加検証用（架空1630）`）のみ。
- 本番、元ステージング、運用管理、公式LINEメニュー、他のメンバー、既存の退会履歴は変更しない。
- **退会実行前の15シート全体バックアップ（対象1630が存在する状態で作成済み）**：
  https://docs.google.com/spreadsheets/d/1VlqRWhrRMBBs9wIAnaCfbH27vlcUbtW0TwwdgZPZpVg/edit
- **実データの削除テストは、利用者の明示的な許可と両サーバー設定の確認後のみ実施する。**

## v0.16.34フロントの動作
- 通常の管理者LIFF（`?v=1634e2e`）は従来どおり **画面テストのみ**。退会APIを送信しない。
- 専用オプトインURL（PRがmainに取り込まれた後のみ）：`https://liff.line.me/2012602642-jUN8W2eA?withdrawExec=1630&v=1634e2e`。
- 正しいURLの管理者用ページのみ実行テスト用ボタンを表示（登録申請ページでは不可）。
- 架空1630の `memberId`・名前・一般メンバー権限・有効状態・管理者本人でないことを確認してボタン表示。
- 二段階のアプリ内確認。キャンセルで送信なし。最後の実行確認後、APIで最新一覧を再取得し、変更を検出した場合は停止。
- `/api/member/manage/withdraw` に正確なメンバーID2つとUUIDv4の操作IDを1回だけ送信。**通信エラーや409で自動再送しない。**
- GASからの成功応答に加え、最新一覧でメンバー不在・履歴completedを確認してから成功トースト。
- 従来のスピナー、全画面ロック、表示専用ポップアップの不要文言削除、44px以上のタップ範囲、役割変更ボタンとプルダウン位置合わせを維持。
- **URLパラメータは表示モードの選択であって認可ではない。実行許可はWorkerとGASそれぞれで判定する。**

## 実行前に読み取り・設定値だけ確認（まだtrueへ変えない）

### GAS（既存スクリプト、旧デプロイURLを維持）
- https://script.google.com/home/projects/1JH7dZAHKcRtgdhHl1BpXZ3gVf6UAQf3ISD14FNr6hqMDwQ7cdCx6hrnX/edit
- `SPREADSHEET_ID=1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM`
- `WITHDRAW_TEST_MEMBER_ID=M-TEST-WITHDRAW-1630`
- `WITHDRAW_ENABLED=false`
- `BACKEND_SECRET` 等の秘密値は送信・共有せず変更しない。
- `logAccessReusePreflightV1630` は読取専用で実行可能。初期状態は `sandbox:true`, `readOnly:true`, `configuredWithdrawalEnabled:false`, `targetPresent:true`, `historyExists:false`, `adminCount:1` を期待。

### Cloudflare Worker（既存、別のステージングWorkerを触らない）
- https://dash.cloudflare.com/
- Worker名：`zenryoku-smash-withdraw-sandbox-api`
- `WITHDRAW_ENABLED=false`
- `WITHDRAW_TEST_MEMBER_ID=M-TEST-WITHDRAW-1630`
- `WITHDRAW_SANDBOX_SPREADSHEET_ID=1yCYfmQ73Qnice0g43aad-UB_ceEmkDJN5GbA3qzbLDM`
- `WORKER_PURPOSE=isolated-withdrawal-reuse-v1630`
- `RICH_MENU_SYNC_ENABLED=false`
- `GAS_WEB_APP_URL`, `GAS_SHARED_SECRET`, `LINE_LOGIN_CHANNEL_ID` 等の秘密値・接続先は変更しない。
- 既存のWorkerソースはv0.16.30c（実提供ソース照合済み）であること。/healthのバージョンだけでは設定値の確認にならないため、Dashboardで確認。

## 今後の実行手順（現時点では**実行禁止**）
1. 利用者から明示的な実退会テスト許可を得る。設定値、対象、15シートバックアップ、権限、操作する1名を再確認する。
2. PRをmainへマージして通常LIFFが従来どおり非破壊であることを確認する。
3. **検証専用**GASと**検証専用**Workerだけで、厳密な対象バインド設定を照合して `WITHDRAW_ENABLED=true` に変更。その他のWorker・公式LINE OAの設定は触らない。
4. 既存の管理者LINEで専用オプトインURLを開き、架空1630への2回の確認後、実行ボタンを**1回だけ**押す。
5. まず `WITHDRAW_ENABLED` を**GASとWorkerの両方で即時falseへ戻す**。通信失敗時も自動再送せず、画面の「更新」から結果を調べる。
6. 退会検証専用シートで、1630のメンバー行削除、退会履歴completed、監査記録、リンク失効、チーム所属除去、既存履歴と過去データの保持を確認する。処理中のままなら自動復旧・再実行はしない。
7. その後の再入会は別工程の**架空LINE IDによるGASシミュレーション**で実施する。架空LINE IDは本物のLINEアカウントでないため、未登録ユーザーからのLIFF新規申請E2E成功とは呼ばない。新しいmemberIdが発行され、旧退会履歴が維持されることを検証する。

## やってはいけないこと
- 元ステージング `zenryoku-smash-staging-api`、元ステージングSheet、実運用LINEの権限やRich Menuの変更。
- バックアップをGASの `SPREADSHEET_ID` に設定すること。
- `WITHDRAW_ENABLED` のtrue変更を、PR取り込み前や安全設定未確認で行うこと。
- 失敗やタイムアウト後の退会API再送、旧memberIdでの再実行。
- 秘密値やLINE IDトークンをGitHub/チャットへ送信すること。

## オフラインで行った検証
- GAS v0.16.30a：30/30 PASS（既存検証済み完全版）
- Worker v0.16.30c：17/17 PASS（既存検証済み完全版）
- フロントv0.16.34：APIゲート模擬19/19 PASS、画面操作模擬26/26 PASS。
- 実デプロイしたフロントでの退会API、Cloudflare設定、GAS実実行、再入会は**未実施**。
