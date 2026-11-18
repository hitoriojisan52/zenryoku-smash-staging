# v0.16.45 — LINE参加連絡日時とLINE_TOKEN_INVALID対応

検証環境専用。2026-11-18。本番のLINE公式アカウント、リッチメニュー、Webhook、GAS、スプレッドシートは変更しない。

## LINE認証
- 起動URLは https://liff.line.me/2012602642-XBSkXduO 。GitHub Pagesのlive.html直接リンクを通常の認証入口としない。
- 外部ブラウザでのLINEログインをLIFF SDKから自動化。LINE_TOKEN_INVALID時に再起動リンクと診断案内を表示。
- Cloudflare WorkerのLINE_LOGIN_CHANNEL_IDとLIFFチャネル番号は2012602642で一致すること。openidスコープを設定。
- /health に一致判定boolean channelMatchesLiveLiffを追加。チャネルIDの設定値、IDトークン、LINEユーザーIDは公開しない。
- LINEトークンのLINE公式検証、Origin、本人確認は解除しない。

## 参加連絡
- 検証用運用管理LIFFに本人の出欠送信・修正フォームを追加（一般メンバー、当番担当、管理者）。
- 新API: /api/attendance/mine と /api/attendance/submit。会員の認証済みLINEユーザーIDからmemberIdをサーバーで取得。
- 会員名・区分・本人ID・日時はサーバー固定。ユーザーの入力は日程、参加/欠席、備考のみ。ビジター化不可。日程G列enabled、過去日、対戦表、確定済み収支のロックを適用。
- 新規は既存の出欠回答9列に追加。既存行の修正はparticipantChange_を通し、版番号、アーカイブ、集金・収支保護を維持。
- 既存の操作履歴にattendance.submitとしてGASサーバーのJST送信日時を記録（操作ID重複チェック）。
- 参加者一覧には最初の参加連絡日時を「登録日」、最新日時を「最終連絡」として表示。会員申請日時は「利用登録日」として別表示。ビジターの登録日は引き続き承認日時。
- 旧フォーム・LINE v7の記録に実際の送信履歴がない場合、推測せず「未記録」。既存データの一括変更やシート列追加はしない。

## デプロイ上の注意
- GitHub Pagesと検証用GASは検証main統合後の自動デプロイ。
- 検証用Cloudflare WorkerのGitHub Builds接続状態は未確認。/api/attendance/* が動くには同Workerのデプロイが別途必要な場合がある。
- 既存Worker zenryoku-smash-staging-apiのみを更新し、設定・Secretsを維持。/health の version=0.16.45-stage-attendance と channelMatchesLiveLiff=true を確認後、LIFFから参加連絡の送信/修正を実機テストする。