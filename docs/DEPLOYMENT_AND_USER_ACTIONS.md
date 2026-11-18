# 全力☆スマッシュ — 検証環境のGitHub/GAS/Cloudflare更新とユーザー作業案内ルール

更新日：2026-11-19。**新しいチャットを開始した場合、この文書を最初に読む**。
確認済みの基準：GitHub PR #47、Cloudflare Workers Builds 成功、ユーザー提供の `/health` 応答とGASスクリプトプロパティ設定完了報告。
この文書は`docs/SPEC_PRIORITY_POLICY.md`の5段階優先順位に従う。本番には適用しない。

## 0. 役割分担：ユーザーにコードのコピーを依頼しない

**検証用のソース更新はChatGPTがGitHub連携ツールで自ら実行する。**
- 作業ブランチを作成→変更→回帰テスト→PR→成功確認→`main`へ統合。
- GitHub→検証用GAS：**GitHub Actions + claspによる既存デプロイ更新**。
- GitHub→検証用Worker：**Cloudflare Workers BuildsのGitHub連携**。PR統合後、Cloudflareのチェックと公開`/health`で確認する。
- GitHub→検証用画面：GitHub PagesのデプロイとLINE LIFFの起動確認。
- ユーザーに`worker.js`や`コード.gs`を手作業でコピー／貼り付け／デプロイさせない。**GitHubから実行できない具体的な原因**（権限エラー、連携解除、Cloudflare Builds失敗、GitHub Secrets失効など）がある場合だけ、リンクと正確な手順を提示してユーザー操作を依頼する。
- ChatGPTがCloudflareダッシュボードやGASのスクリプトプロパティを直接操作できるとは想定しない。GitHub更新成功と手動設定の完了は別物。

## 1. 設定・動作の現時点の基準（2026-11-19）

| 対象 | 確認方法 | 状況 |
| --- | --- | --- |
| Workerコード | [PR #47](https://github.com/hitoriojisan52/zenryoku-smash-staging/pull/47) | `worker.js` v0.16.53をGitHub側で更新し`main`統合済み |
| Worker Git連携 | [Cloudflare Workers Buildsの実行結果](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/7bbd11de-6bc9-4637-b168-940f6d87d985) | **GitHubからCloudflare Workers Buildsへの自動反映に成功**。次回もBuildsの結果を改めて検証 |
| Worker実反映 | [公開/health](https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health) | **ユーザーが実応答を確認**：`ok:true`、`status:"deployed"`、`version:"0.16.53-stage-withdrawal"`、`codeRevision:"stage-v1653-github-sync-20261119"`、`configured:true`、`channelMatchesLiveLiff:true` |
| Worker環境変数 | [Cloudflare設定](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/settings) | **ユーザーがVariables and Secretsの更新完了を報告**。変数値そのものを外部から再読取したわけではない |
| GASソース/デプロイ | [GAS自動デプロイ履歴](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/workflows/gas-staging.yml) | v0.16.53の自動デプロイ成功記録あり。後続の改修時は**その回の**成功を再確認 |
| GASスクリプトプロパティ | [接続検証用スプレッドシート](https://docs.google.com/spreadsheets/d/1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac/edit) | **ユーザーが更新完了を報告**。GASプロパティ画面の値をGitHubから直接検証したわけではない |
| 退会の実機E2E | [運用管理LIFF](https://liff.line.me/2012602642-XBSkXduO) | **未実施**。公開`/health`は退会の両側ゲート成立や実行権限を保証しない |

> 過去の`/health` `0.16.40`や「Worker連携未確認」との記述は**歴史的記録**。上表の2026-11-19実確認済み`0.16.53`が現時点の基準。次のコード改修後は再検証する。

## 2. ChatGPTによるGitHub→検証GASの自動更新

**現行の経路**
- [GitHubリポジトリ](https://github.com/hitoriojisan52/zenryoku-smash-staging)
- GASソース：`gas-staging/コード.gs`、`gas-staging/AccessAndGuestV160.gs`
- ワークフロー：[`.github/workflows/gas-staging.yml`](https://github.com/hitoriojisan52/zenryoku-smash-staging/blob/main/.github/workflows/gas-staging.yml)
- [Actions「Staging GAS - GitHub / clasp」](https://github.com/hitoriojisan52/zenryoku-smash-staging/actions/workflows/gas-staging.yml)
- デプロイスクリプト：`scripts/gas-staging-deploy.sh`、保護検査：`scripts/gas-staging-guard.cjs`

**ChatGPTが行うこと**
1. GitHubソースと旧業務仕様を調査し、既存仕様・安全性・ユーザー変更指示の優先順位を確認。衝突・懸念は先に報告する。
2. ブランチとPRを作成し、GASを含む既存回帰テストに加え今回の試験を通す。
3. `main`にマージする。次のパスの変更だけがGAS自動デプロイを起動：`gas-staging/*.gs`、`scripts/gas-staging-guard.cjs`、`scripts/gas-staging-deploy.sh`、`.github/workflows/gas-staging.yml`。**文書・Workerだけの更新ではGAS自動デプロイは動かない**。
4. GitHub Actionsの対象実行が成功し、既存ステージングデプロイIDが更新されたことをログで確認。ソースドリフト、失効した認証や権限、テスト失敗なら**停止し、強制上書きしない**。
5. 元のGAS WebアプリURL、スプレッドシートの整合性・旧仕様・LIFF動作のうち検証できる範囲を確認。**CIとGAS実反映と実機確認を分けて報告**。

既存のGitHub Actions Secrets名は`GAS_STAGE_SCRIPT_ID`、`GAS_STAGE_DEPLOYMENT_ID`、`GAS_STAGE_CLASPRC_JSON`。値は取得・表示・チャット送信させない。GitHubから利用可能ならユーザーへ再設定を依頼しない。

**万一GitHub Actionsの認証が必要になった場合だけ**：ユーザーに[GitHub Actions Secrets設定](https://github.com/hitoriojisan52/zenryoku-smash-staging/settings/secrets/actions)を提示し、何が不足かを具体的に伝える。機密の`GAS_STAGE_CLASPRC_JSON`やトークン値をチャット・コミットへ貼るよう求めない。詳しい初期設定は [gas-staging/README.md](../gas-staging/README.md) を参照。

## 3. ChatGPTによるGitHub→検証Cloudflare Workerの自動更新

**現行の経路**
- `cloudflare-worker/worker.js`
- `cloudflare-worker/wrangler.toml`：
  - `name = "zenryoku-smash-staging-api"`
  - `main = "worker.js"`
  - `keep_vars = true`
- Cloudflare Workers Builds：GitHubリポジトリ`hitoriojisan52/zenryoku-smash-staging`・`main`、Root directory `cloudflare-worker`、Build command空欄、Deploy command `npx wrangler deploy`。
- [GitHub対象Workerコード](https://github.com/hitoriojisan52/zenryoku-smash-staging/blob/main/cloudflare-worker/worker.js)
- [Cloudflare Workers Builds詳細](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds/7bbd11de-6bc9-4637-b168-940f6d87d985)
- [Worker /health](https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health)

**ChatGPTが行うこと**
1. Workerコードの変更もGitHub PRで行う。ユーザーにCloudflareの「Edit code」へソースを転記させない。
2. `main`マージ後のGitHubコミットに対する **`Workers Builds: zenryoku-smash-staging-api`** のチェックが`success`であることを確認する。GitHub ActionsのPages/GASとは別のチェック。
3. `/health` のバージョン・コード識別子・`configured`・`channelMatchesLiveLiff`を確認する。公開HTTPへのアクセスが使えない場合、ユーザーに[このリンク](https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev/health)の応答JSON（**秘密値を含まない**）だけを共有してもらう。
4. 連携が失敗・解除された場合のみ[Cloudflare管理画面](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/builds)のリンクを示し、具体的な失敗・修正手順を案内する。**正常なWorkers Buildsがある場合は再接続を求めない**。
5. Cloudflare管理画面のVariables and Secretsは、すでにユーザーが設定完了報告済み。**コード更新のたびに再設定させない**。設定変更が必要になったときだけ理由・対象・入力値・保存／再デプロイ要否を案内する。

Workerの`keep_vars = true`は既存のダッシュボード管理設定を保持する意図だが、実際のデプロイ後の動作確認は省略しない。トークン検証、LINEチャネル照合、GAS権限の検査、既存のWorkerルート、リッチメニュー変更禁止を維持する。

## 4. 既存の手動設定（完了報告済み・原則再作業不要）

**検証用Worker** ([Variables and Secrets](https://dash.cloudflare.com/5817f07a73dbb56011012074ce1b11c5/workers/services/view/zenryoku-smash-staging-api/production/settings))：

| 名前 | 設定値 |
| --- | --- |
| `WITHDRAW_ENABLED` | `true` |
| `WORKER_PURPOSE` | `staging-member-withdraw-v1653` |
| `WITHDRAW_STAGE_SPREADSHEET_ID` | `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac` |
| `RICH_MENU_SYNC_ENABLED` | `false`（維持） |

**検証用GAS**（[接続検証用スプレッドシート](https://docs.google.com/spreadsheets/d/1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac/edit) → **拡張機能 → Apps Script → プロジェクトの設定 → スクリプト プロパティ**）：

| 名前 | 設定値 |
| --- | --- |
| `SPREADSHEET_ID` | `1XcsXwrPdRfDSPs8ibD7bfOGBM7zMxeSINFc9YlFBwac`（既存値との一致を確認） |
| `WITHDRAW_ENABLED` | `true` |
| `STAGING_WITHDRAW_PURPOSE` | `staging-member-withdraw-v1653` |

**GASエディタ404への対応**：汎用の`https://script.google.com/home/projects`を再提示しない。上記スプレッドシートを、**GASにアクセス権のあるGoogleアカウントのPCブラウザ**で開いて「拡張機能 → Apps Script」を使う。スマートフォンのSheetsアプリでは拡張機能メニューがない。開けない場合だけ、アカウント・編集権限・ブラウザ・リンク先プロジェクトを切り分け、ユーザーに画面名とエラー内容を尋ねる。**Script IDをスプレッドシートIDから生成・推測しない**。

**注意**：この表はユーザーの「設定した」という報告を記録したもの。スクリプトプロパティやWorkerのSecret値をAPI経由で直接確認したとは主張しない。Workerの`/health`の`configured:true`は主な接続設定の存在のみであり、退会APIの二重許可の実証ではない。

## 5. ユーザーへの作業依頼の**必須フォーマット**

ChatGPTに実施可能な範囲は自分で完了し、**ユーザー操作が避けられない場合だけ**次をセットで伝える。

1. **必要な理由・こちらでできなかった理由**：何の連携・認証・設定が不足しているか、ログや検証結果が根拠か。
2. **作業先の直接リンク**：GitHub、Cloudflare、接続検証用スプレッドシート等。存在を確認できないURLを作らない。
3. **具体的な画面操作**：画面名／メニュー名／入力場所／保存・反映手順を順番に書く。
4. **設定値**：入力するキーと正確な値を表で示し、「既存値を維持」「要確認」を区別する。**SecretやLINE IDトークン、OAuth認証JSON、個人のLINE IDはチャット送信させない**。
5. **確認方法**：どのURLを開き、期待するレスポンス・ボタン状態・成否を確認するか。
6. **報告をお願いする情報**：機密を含まない`/health` JSON、失敗したステップ名／エラー表示、LIFFのボタンの活性／非活性など**最小限だけ**。
7. **作業不要なら明確に明言**：「設定済みなので再入力不要」「GitHub経由でこちらが反映した」と伝え、毎回同じ初期設定を繰り返させない。

**ユーザーが既に実施完了を報告した操作は再要求しない。** ただし検証で不一致が判明した場合だけ具体的根拠とともに再確認する。

## 6. これからの検証作業・完了判定

1. [検証用LIFF](https://liff.line.me/2012602642-XBSkXduO)で管理者として`メンバー権限管理 → 利用者一覧`を開き、検証用メンバーの退会ボタンが有効か確認。もし非活性なら安全性を緩めず、GASとWorkerの`withdrawEnabled`判定と権限を調査。
2. テストデータ（`M-TEST-WITHDRAW-V1653-001`など）のバックアップがあることを確認し、管理者の2段階確認から退会を実行。**検証環境内の退会・再入会試験とデータ作成はユーザー承認済み**。
3. 退会後、メンバー行／LINEの現役紐付け・所属・申請は削除、閲覧リンクは失効、退会履歴は`completed`。出欠・集金・収支・試合・監査の旧行を**保護**する。
4. 同じLINE IDから再申請・承認を実機で試し、新しい`memberId`が発行され、権限が一般メンバーで旧履歴が維持されることを確認する。
5. 途中失敗・`processing`の場合、再送や手動の削除繰返しをせず、バックアップ・ログで原因調査。失敗・未検証は成功と報告しない。

本番GAS・本番Worker・本番LINE・本番Spreadsheetの更新は、従来どおり**個別の事前承認制**。検証向けのGitHub Actions SecretsやWorker設定を本番で流用しない。
