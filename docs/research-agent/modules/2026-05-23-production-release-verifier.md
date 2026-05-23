# Production Release Verifier

## Goal

Add a read-only JS command that verifies a pushed commit is the one currently proven by GitHub Actions and reachable through the public Cloudflare site.

## Why

`npm run release:check` proves local readiness. It does not prove that the current commit has been pushed, that GitHub Actions passed on that commit, or that the public site is reachable after deployment.

The remaining completion gap needs a repeatable post-push verifier.

## Contract

- Add `npm run release:verify`.
- Implement it as `scripts/verify-production-release.mjs`.
- The script must be read-only:
  - no `git add`
  - no `git commit`
  - no `git push`
  - no webhook delivery
  - no deploy command
- Default checks:
  - `git status --short` confirms local working tree is clean
  - `git rev-parse HEAD` equals `git rev-parse origin/main`
  - `git ls-remote origin refs/heads/main` confirms local `origin/main` is not stale
  - `gh run list` finds the latest `Daily Summary Publish` GitHub Actions run on `main`
  - latest run is `completed/success`
  - latest run `headSha` equals local `HEAD`
  - `https://stocks-emw.pages.dev/` returns HTTP 200
- Optional `--date YYYY-MM-DD` checks the public daily summary page for that date.
- `--dry-run` prints the planned read-only checks without touching network or failing on the current dirty tree.

## Files

- `package.json`
- `scripts/verify-production-release.mjs`
- `test/daily-summary-assets.test.mjs`
- `docs/research-agent/modules/2026-05-23-production-release-verifier.md`
- `docs/research-agent/release-completion-audit.md`

## Test Plan

- RED: package/script contract test fails before the script exists.
- GREEN: add the script and package command.
- Run `node scripts/verify-production-release.mjs --dry-run`.
- Run focused test.
- Run `npm run release:check`.
