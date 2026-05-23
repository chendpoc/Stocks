# Cloudflare Deploy PNPM Build

## Goal

Make the local Cloudflare deploy helper use the same pnpm build path as the rest of the repository.

## Why

The repository has moved to a light pnpm monorepo. `package-lock.json` is removed, workflows install with pnpm, and the root `pages:build` script already routes through `scripts/pnpm-workspace.mjs`. If `scripts/deploy-cloudflare-pages.mjs` still shells out to `npm run docs:build`, local deploy behavior can drift from CI and can fail on machines that only installed pnpm dependencies.

## Contract

- `pages:deploy` should build through `scripts/pnpm-workspace.mjs run docs:build` unless `--skip-build` is used.
- The helper should not require a globally installed `pnpm.cmd` on Windows.
- Dry run should still print the deployment plan and site URL.
- The deploy command should continue using `npx wrangler pages deploy ...` for the actual deploy step.
- No changes to daily summary generation, notification, or Cloudflare project defaults.

## Files

- `scripts/deploy-cloudflare-pages.mjs`
- `test/daily-summary-assets.test.mjs`
- `docs/research-agent/modules/2026-05-23-cloudflare-deploy-pnpm-build.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Test Plan

- RED: assert the deploy helper invokes the pnpm workspace wrapper instead of `npm run docs:build` or direct global `pnpm`.
- GREEN: replace the build command with `process.execPath scripts/pnpm-workspace.mjs run docs:build`.
- Run focused deploy test, `npm run pages:deploy:dry`, `npm run test:summary`, and `git diff --check`.

## Implementation

- Updated the deploy helper to call `process.execPath` with `scripts/pnpm-workspace.mjs run docs:build`.
- Kept the actual deploy step on `npx wrangler pages deploy ...`.
- Kept dry-run output unchanged.

## Verification

- RED verified with `node --test --test-name-pattern "cloudflare deploy helper builds" test\daily-summary-assets.test.mjs`.
- GREEN verified with `node --test --test-name-pattern "cloudflare deploy helper builds|cloudflare deploy dry run" test\daily-summary-assets.test.mjs`.
- Real dry-run verified with `npm run pages:deploy:dry`.
- Full relevant checks passed: `npm run test:summary`, `git diff --check`.
