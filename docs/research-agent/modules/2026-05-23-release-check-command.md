# Release Check Command

## Goal

Add one JS-driven command that runs the core pre-release verification gates before pushing the current integration branch.

## Why

The current worktree spans daily publishing, Cloudflare deployment, VitePress, React research-console, Python summary rendering, and GitHub Actions. Running these checks manually is error-prone. A single JS command gives a repeatable local gate without adding PowerShell or shell scripts.

## Contract

- Add `npm run release:check`.
- The command must be implemented as a Node `.mjs` script, not `ps1` or `sh`.
- On Windows, npm/pnpm/npx command shims must be invoked through `cmd.exe /d /s /c ...` with `shell: false`; do not use `shell: true` with argument arrays because Node reports `DEP0190` and treats that path as security-sensitive.
- It should run:
  - `npm run test:summary`
  - `npm run console:build`
  - `npm run daily:publish:dry`
  - `npm run public:build:audit`
  - `git diff --check`
- It should fail on the first failed gate.
- It should print the command being run so failures are easy to locate.
- It should not push, commit, send webhooks, or deploy.

## Files

- `package.json`
- `scripts/release-check.mjs`
- `test/daily-summary-assets.test.mjs`
- `docs/research-agent/modules/2026-05-23-release-check-command.md`
- `docs/research-agent/delivery-readiness-audit.md`

## Test Plan

- RED: package and script contract test fails before the script exists.
- GREEN: add the script and package command.
- HARDEN: assert the script does not use `shell: true` or `shell: useShell`.
- Run focused release-check contract test, then `npm run release:check`.
