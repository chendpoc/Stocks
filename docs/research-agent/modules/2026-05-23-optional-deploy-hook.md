# Optional Deploy Hook

## Goal

Make `daily:publish` able to explicitly trigger a public-site deployment after committing daily summary assets, instead of relying only on repository push integrations.

## Background

The daily publish chain now:

1. Generates the daily summary, card cover, and image.
2. Commits and pushes public docs/assets.
3. Waits for the public card-cover URL.
4. Sends WeCom template card and image.

The weak point is between step 2 and step 3. A Git push may trigger Cloudflare Pages through the repository integration, but that trigger is outside this script's control. If the integration is delayed or disabled, the wait can time out.

## Contract

- If `SUMMARY_DEPLOY_HOOK_URL` is configured, `daily:publish` should POST it after a successful git publish and before webhook sends.
- The hook is optional; if the env var is absent, behavior stays unchanged.
- The hook must not run in dry-run mode.
- The hook must not run when `--skip-git-push` is used, because there may be no new commit to deploy.
- The hook must mask the URL in logs and must not print secrets.
- A non-2xx hook response should fail the publish before sending WeCom messages.

## Boundaries

- JS publisher only.
- No Cloudflare API SDK.
- No new required secrets.
- No Python summary changes.
- No subagent.

## Test Plan

- RED: `daily-publish.mjs` must define `triggerDeployHook(...)`.
- RED: `runActual(...)` must call `triggerDeployHook()` after `publishWithGit(...)` and before `waitForPublicUrl(...)`.
- RED: `.github/workflows/daily-publish.yml` must inject `SUMMARY_DEPLOY_HOOK_URL` from GitHub Secrets.
- GREEN: implement optional POST with masked logging and non-2xx failure.
- Run focused script contract test, workflow contract test, `npm run test:summary`, `npm run daily:publish:dry`, and `npm run pages:build`.

## Implementation

- Added `SUMMARY_DEPLOY_HOOK_URL` as an optional JS publisher env var.
- Added `triggerDeployHook()` in `scripts/daily-publish.mjs`.
- Added bounded behavior: the hook runs only after `publishWithGit(...)` reports a new publish and before waiting for the public card-cover URL.
- Added URL masking so logs do not print the full hook URL query string.
- Added non-2xx failure handling before WeCom webhook delivery.
- Added GitHub Actions env injection from `secrets.SUMMARY_DEPLOY_HOOK_URL`.

## Verification

- RED verified with `node --test --test-name-pattern "deploy hook" test\daily-summary-assets.test.mjs`.
- RED verified with `node --test --test-name-pattern "GitHub Actions schedules daily publish" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused commands after implementation.
- Full relevant checks required before handoff: `npm run test:summary`, `npm run daily:publish:dry`, `npm run pages:build`, and `git diff --check`.
