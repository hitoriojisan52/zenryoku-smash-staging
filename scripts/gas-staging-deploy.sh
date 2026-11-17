#!/usr/bin/env bash
# Connected staging Google Apps Script only. No new GAS project or deployment.
set -Eeuo pipefail
umask 077
MODE="$GAS_ACTION_MODE"
CONFIRM="$GAS_ACTION_CONFIRMATION"
REPO="$GITHUB_WORKSPACE"
WORK="$RUNNER_TEMP/zensuma-staging-gas-clasp"
if [[ "$GITHUB_REF" != "refs/heads/main" ]]; then
  echo "::error::Deployment is allowed from main only."; exit 2
fi
if [[ "$MODE" != "preflight" && "$MODE" != "deploy" ]]; then
  echo "::error::Mode must be preflight or deploy."; exit 2
fi
if [[ "$MODE" == "deploy" && "$CONFIRM" != "UPDATE_EXISTING_STAGING_GAS" ]]; then
  echo "::error::Explicit staging confirmation missing."; exit 2
fi
if [[ -z "$GAS_STAGE_SCRIPT_ID" || -z "$GAS_STAGE_DEPLOYMENT_ID" || -z "$GAS_STAGE_CLASPRC_JSON" ]]; then
  echo "::error::Missing required GitHub Secrets: GAS_STAGE_SCRIPT_ID, GAS_STAGE_DEPLOYMENT_ID, GAS_STAGE_CLASPRC_JSON."; exit 2
fi
if [[ ! "$GAS_STAGE_SCRIPT_ID" =~ ^[a-zA-Z0-9_-]{30,130}$ ||
      ! "$GAS_STAGE_DEPLOYMENT_ID" =~ ^[a-zA-Z0-9_-]{30,220}$ ||
      "$GAS_STAGE_SCRIPT_ID" == "$GAS_STAGE_DEPLOYMENT_ID" ]]; then
  echo "::error::Script ID / existing deployment ID are missing or invalid."; exit 2
fi
mkdir -p "$HOME" "$WORK"
if [[ -e "$WORK/.clasp.json" ]]; then
  echo "::error::Unexpected project configuration already exists."; exit 2
fi
cleanup() {
  rm -f "$HOME/.clasprc.json"
  rm -rf "$WORK"
}
trap cleanup EXIT
printf '%s' "$GAS_STAGE_CLASPRC_JSON" > "$HOME/.clasprc.json"
node -e "JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8'))" "$HOME/.clasprc.json"
unset GAS_STAGE_CLASPRC_JSON
node -e "
 const fs=require('node:fs');
 fs.writeFileSync(process.argv[1], JSON.stringify({scriptId:process.env.GAS_STAGE_SCRIPT_ID})+'\\n', {mode:0o600});
" "$WORK/.clasp.json"
cd "$WORK"
echo "Pulling existing connected staging GAS (read-only)..."
clasp pull
echo "Running fail-closed drift check..."
node "$REPO/scripts/gas-staging-guard.cjs" "$REPO" "$WORK" "$MODE"
if [[ "$MODE" == "preflight" ]]; then
 echo "PREFLIGHT PASS: remote GAS matches reviewed sources. No changes made."
 exit 0
fi
echo "Pushing reviewed two-file overlay (remote manifest and other files retained)..."
clasp push --force
echo "Verifying pushed sources..."
clasp pull
node "$REPO/scripts/gas-staging-guard.cjs" "$REPO" "$WORK" verify
echo "Updating the EXISTING GAS deployment (never creating a new one)..."
clasp update-deployment "$GAS_STAGE_DEPLOYMENT_ID" --description "staging-gas $(git -C "$REPO" rev-parse --short HEAD)"
echo "GAS staging deployment update completed. Verify original LIFF URL and run read-only consistency check."
