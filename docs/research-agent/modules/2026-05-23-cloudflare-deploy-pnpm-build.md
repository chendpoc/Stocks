# Cloudflare Pages Git Integration Boundary

## Goal

Supersede the old local Pages upload helper and keep public-site publishing on Cloudflare Pages Git integration.

## Why

The public site is a static VitePress output. The only local contract needed is a reproducible build plus a public-build audit. Keeping a second local upload path creates drift against the Dashboard configuration and adds a tool dependency that is not needed for daily use.

## Contract

- `pages:build` remains the local static build command.
- `public:build:audit` remains the local leakage/month-scope gate.
- Cloudflare Pages project settings own the real deploy configuration:
  - Build command: `npm run docs:build`
  - Build output directory: `docs/.vitepress/dist`
  - Root directory: repository root
- No local Pages upload helper, Pages deploy script, or standalone Pages config file.
- No changes to daily summary generation, WeCom notification, or research-console local-only boundaries.

## Files

- `package.json`
- `scripts/release-check.mjs`
- `test/daily-summary-assets.test.mjs`
- `docs/research-agent/modules/2026-05-23-cloudflare-deploy-pnpm-build.md`
- `CLOUDFLARE_PAGES.md`
- `docs/research-agent/delivery-readiness-audit.md`

## Test Plan

- RED: assert the package and release check no longer expose local Pages deploy commands.
- RED: assert the public guide documents Git integration and no local direct-upload path.
- GREEN: remove obsolete scripts/config and update current docs.
- Run focused boundary tests, `npm run pages:build`, `npm run public:build:audit`, and `git diff --check`.

## Implementation

- Removed the obsolete local Pages upload helper and standalone Pages config.
- Removed local Pages deploy scripts from `package.json`.
- Removed the deploy dry-run gate from `release:check`.
- Kept `pages:build` as the static build contract.

## Verification

- Focused tests:
  - `node --test --test-name-pattern "static Cloudflare Pages build|Cloudflare Pages guide|delivery readiness audit|release check command|deployment boundary document" test\daily-summary-assets.test.mjs`
- Static site checks:
  - `npm run pages:build`
  - `npm run public:build:audit`
  - `git diff --check`
