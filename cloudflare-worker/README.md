# zenryoku-smash-staging-api — GitHub deployment source (v0.16.36)

**Preparation only.** Adding this folder or opening the draft PR does not itself connect Cloudflare Workers Builds.
The Cloudflare Worker has **not** been deployed from this folder yet.

## Worker deployment target
- Existing Cloudflare Worker: `zenryoku-smash-staging-api` (**not** `zenryoku-smash-withdraw-sandbox-api`)
- GitHub repository: `hitoriojisan52/zenryoku-smash-staging`
- GitHub branch: `main` **only after review and merging**
- Root directory (Workers Builds): `cloudflare-worker`
- Worker source: `cloudflare-worker/worker.js`
- Wrangler config: `cloudflare-worker/wrangler.toml`
- Build command: empty (no build step needed)
- Deploy command: `npx wrangler deploy`

## Critical safety and secrets
- The source and config do not contain any LINE ID tokens, Shared Secrets, API tokens or private environment values.
- `keep_vars = true` is intended to preserve existing Cloudflare-dashboard text variables during Wrangler deploy.
- Before connecting Workers Builds, verify that the existing Worker has all runtime variables and secrets, especially `FRONTEND_ORIGIN`, `LINE_LOGIN_CHANNEL_ID`, `GAS_WEB_APP_URL`, `GAS_SHARED_SECRET`. **Never paste secret values into GitHub or chat.**
- Set and keep `WITHDRAW_ENABLED=false`, `RICH_MENU_SYNC_ENABLED=false` in the existing Worker.
- `WITHDRAW_TEST_MEMBER_ID`, `WITHDRAW_STAGE_SPREADSHEET_ID`, `WORKER_PURPOSE` may be unset for this release; do not enable actual withdrawal.
- Do not use this config for the dedicated withdrawal-sandbox Worker; it targets only the existing stage Worker by name.
- Keep old Worker source and current deployment available for rollback.
- After connecting and successful build, verify `GET /health` returns `version: 0.16.36-stage-gated`, `configured: true`, and verify non-destructive member management/match read-only flows.

## Before merging and connecting
- A missing `Git Repository` URL in Cloudflare does not establish linkage. In **Workers & Pages → zenryoku-smash-staging-api → Settings → Builds**, look for `Connect` (no repo connected) or `Git Repository / Manage` (connected).
- If `Connect`, we can connect this existing Worker to the GitHub repository without creating a new Worker. Select `cloudflare-worker` as Root directory and ensure `name` matches the existing Worker.
- **Do not press Connect, Save and Deploy, or merge this PR until the deployment target and variables are confirmed.**
