# Cloudflare Worker — 検証環境のGitHub連携・デプロイ (v0.16.53)

対象：**既存の** `zenryoku-smash-staging-api`。本番・専用退会サンドボックスには適用しない。

## 正本とGitHubからの反映

- GitHubリポジトリ：`hitoriojisan52/zenryoku-smash-staging`
- 対象ブランチ：`main`
- Cloudflare Workers Buildsの Root directory：`cloudflare-worker`
- ソース：`worker.js`
- 設定：`wrangler.toml`（name は `zenryoku-smash-staging-api`、`keep_vars = true`）
- Build command：空欄（ビルド工程なし）
- Deploy command：`npx wrangler deploy`

Cloudflare側でWorkers BuildsのGit Repository接続が済んでいれば、GitHubの`main`で`cloudflare-worker/worker.js`が変更されると自動デプロイされます。**GitHubの更新・GitHub Actions成功だけではWorkerデプロイ成功と判定できません**。CloudflareのBuilds・Deploymentsと実際のヘルスチェックで確認します。

Git連携は `https://dash.cloudflare.com/` → Workers & Pages → `zenryoku-smash-staging-api` → Settings → Builds → Git Repository で確認・接続する。未接続なら「Connect」でGitHubを承認し、**新規Workerを作らず既存Workerに接続**する。Worker名とWranglerのnameが同じであることを確認する。

## 環境変数・シークレット（Cloudflare管理画面）

退会機能の検証用設定（ダッシュボードでユーザーが設定済みと報告）：

| Name | Value |
| --- | --- |
| `WITHDRAW_ENABLED` | `true` |
| `WORKER_PURPOSE` | `staging-member-withdraw-v1653` |
| `WITHDRAW_STAGE_SPREADSHEET_ID` | `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` |
| `RICH_MENU_SYNC_ENABLED` | `false`（維持） |

既存の `FRONTEND_ORIGIN`, `LINE_LOGIN_CHANNEL_ID`, `GAS_WEB_APP_URL`, `GAS_SHARED_SECRET` などの設定は保持し、値をGitHubやチャットに書き込まない。GAS側では別に `WITHDRAW_ENABLED=true` と `STAGING_WITHDRAW_PURPOSE=staging-member-withdraw-v1653` が必要。

## デプロイの確認

ヘルスチェック：`https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health`

GitHub同期済みWorkerの期待レスポンス（主要部分）：

```json
{
  "ok": true,
  "status": "deployed",
  "version": "0.16.53-stage-withdrawal",
  "codeRevision": "stage-v1653-github-sync-20261119",
  "configured": true,
  "channelMatchesLiveLiff": true
}
```

`configured` は既存の主な設定値が存在するかだけの判定。**退会の2重許可が有効になった証拠ではありません。** Worker側とGAS側の両方で `withdrawEnabled` が成立し、管理者LIFFの利用者カードで退会ボタンが有効になることを確認します。古い`0.16.40`や`codeRevision`がないレスポンスなら旧Workerが稼働中です。

## GASを開く（404回避）

GASのプロジェクト一覧リンクが404になる場合、以下の**接続検証用スプレッドシート**を開く：

`https://docs.google.com/spreadsheets/d/1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac/edit`

GoogleアカウントでPCブラウザから開き、**拡張機能 → Apps Script → プロジェクトの設定（歯車） → スクリプト プロパティ**。Webアプリ実行URLはプロジェクト編集画面の代用にはならない。AndroidのSheetsアプリには「拡張機能」がないため、PCブラウザが確実。

## 安全境界

検証用だけ。管理者認証・会員の個別識別・監査ID・退会中断時の再試行禁止・履歴保持・新IDでの再入会を維持する。本番への反映や本番用のCloudflare資格情報の転用は禁止。
