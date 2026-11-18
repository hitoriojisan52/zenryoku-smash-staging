# v0.16.53 — 利用者一覧からの退会・再入会（接続検証用）

日付: 2026/11/19。**既存アプリの確定済み退会仕様を踏襲**。
根拠: 2026/11/16–17の旧チャット、および保存済み
`zenryoku_smash_v169_integration_guide.md`、
`zenryoku_smash_v167_withdraw_review.md`、
`README_FIRST.md`、
`docs/withdraw-rejoin-e2e-audit-v1635.md`、
`withdraw-sandbox/REJOIN_QA_V1618.md`。

## 確定した旧仕様（変更しない）

1. 管理者が他の有効な一般メンバー／当番担当を対象に退会させる。**管理者（人数問わず）・本人・停止中アカウントは退会不可**。
2. 退会で`メンバー`行＝LINEユーザーIDの現役紐付けを物理削除。`チーム所属`・旧`登録申請`を削除し、発行済み`閲覧リンク`を失効する。
3. `出欠回答`、`集金記録`、`全体収支管理表`、`試合版管理`、`試合操作履歴`、`試合セッション`および過去`操作履歴`を削除・書換えしない。履歴に旧`memberId`／旧氏名を保持。現在の会員マスタと履歴のIDを混ぜない。
4. `退会履歴`は`memberId, displayName, withdrawnAt, withdrawnBy, state, operationId`。**LINE IDは記録しない**。
5. 非トランザクション処理。最初に退会履歴`processing`、次に`メンバー.active=false`でアクセス停止し、関連情報整理後`completed`・メンバー行削除・監査書込。失敗時は自動再送せず管理者による状況確認。
6. 退会完了後、**同じLINE IDで新規申請**が可能。承認は**旧IDとは異なる新しい`M-<UUID>`**を発行。`active=true`、`isAdmin=false`、当番所属なし。旧退会履歴と過去の出欠・会計・試合を維持。

## 2026/11/19のユーザー追加許可

- **接続検証環境のメンバー・データはすべてテスト用**。退会・再入会試験、新規検証データ作成を都度承認なしで実施してよい。
- 本番は従来どおり承認制。既存の「架空テストメンバー1名だけ」の暫定制限は、接続検証用ワークブックと明示ゲートを維持したまま、**有効な管理者以外の検証メンバー**に拡大。
- 優先順位2・3への懸念には、**検証用スプレッドシートIDの厳密固定・管理者認可・操作ID・二段階確認・GAS/Worker双方のオプトイン**で対処。安全のため新ゲートは旧v1636のPurposeと一致しない。

## 実装（PR #46）

- 管理者LIFFの`メンバー権限管理`→`利用者一覧`に`退会`。サーバーが`withdrawEnabled=true`を返すときのみ有効。確認ポップアップは`【退会確認（1/2）】`→`【退会確認（2/2）】`。既存の保存中全画面ロック、通信エラー時の非再送、成功後の一覧再読込を維持。
- GAS`accessStageWithdrawalV1636_`は登録行・LINE ID・閲覧リンク・監査を規定順に処理。退会可否は`WITHDRAW_ENABLED=true`、`STAGING_WITHDRAW_PURPOSE=staging-member-withdraw-v1653`、`SPREADSHEET_ID`＝**既存の接続検証専用ワークブックID**という3条件でチェック。GAS内の管理者チェックはLockService取得後にも再確認。
- Workerは認証トークンの公式照合を維持し、`WITHDRAW_ENABLED=true`、`WITHDRAW_STAGE_SPREADSHEET_ID`＝接続検証専用ワークブックID、`WORKER_PURPOSE=staging-member-withdraw-v1653`を要求。`member.manage.list`の`withdrawEnabled`はGASとWorkerの両方が許可した場合にだけtrue。
- IDトークン、LINE ID、GAS共有SecretをGitHubリポジトリに記載しない。`RICH_MENU_SYNC_ENABLED=false`を維持。

## テストと検証用データ

- 既存の接続検証用ワークブック（名前は「接続検証用 v0.15（架空データ）」）を、検証データ追加前に新規バックアップとして丸ごとコピー済み。
- 退会試験用の**架空当番担当** `M-TEST-WITHDRAW-V1653-001` を同ワークブックに追加済み。付随するチーム所属、承認済み旧申請、過去の欠席回答、未集金記録、既に期限切れのゲスト閲覧リンクも追加。過去の収支行・既存の他ユーザーデータは変更していない。
- `tests/check-stage-withdraw-rejoin-v1653.cjs` はGAS本体関数をモックSheetsで実行し、本人・非管理者・ステージング外・フラグなし拒否、退会後の関連データ掃除、旧履歴の完全保持、同じLINE IDで再申請→新ID・一般メンバー、途中失敗`processing`と再試行拒否を検証。
- `tests/check-stage-withdraw-boundary.cjs` は旧専用サンドボックスのID混入を禁止し、検証Worker＋GASの二重許可条件とUI二段階確認を検査。

## 実機の未完了事項（区別が必要）

- GitHub上のWorkerソース更新と**Cloudflareに現在デプロイされているWorkerのバージョン**は別。過去の`/health`は`0.16.40`だった。GitHubでPRがマージされてもWorkerが自動デプロイされたことにはならない。
- GAS・Workerの現在のスクリプトプロパティ／環境変数は、このGitHubのみからは参照・編集できない。**両側のPurposeとONフラグが設定済みか確認できるまで、退会ボタンは非活性**。
- 検証用スプレッドシートへの架空データ追加は成功したが、**本バージョンのLINE経由実退会・再入会E2Eは未実施**。Worker実反映・二重ゲート有効化の確認後に実施し、退会前後の全関連データ・`退会履歴`・`操作履歴`を照合する。障害時に自動再送しない。
- 本番、旧退会検証専用ワークブック、本番LINEリッチメニューの変更は行わない。
