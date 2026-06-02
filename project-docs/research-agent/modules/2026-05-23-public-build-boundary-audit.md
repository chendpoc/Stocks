# Public Build Boundary Audit

## Goal

Add a repeatable JS audit that verifies the public VitePress build output does not leak local-only research, agent, or raw chat audit content.

## Why

The project now has two content surfaces:

- Public Cloudflare Pages site: latest/current-month summaries only.
- Local docs/dev surface: full history, local opportunity observations, research-agent docs, and audit context.

Manual `rg` checks are easy to forget. The release gate should prove this boundary every time before push.

## Contract

- Add `npm run public:build:audit`.
- Implement it as a Node `.mjs` script, not `ps1` or `sh`.
- It must scan `docs/.vitepress/dist` after a public build.
- It must fail if public dist contains local-only markers:
  - `research-agent`
  - `superpowers`
  - `opportunities`
  - `机会观察`
  - `群聊内容记录`
  - `群聊图片记录`
  - `原始发言记录`
  - `本地链接`
  - `chat-images`
- It must fail if public dist contains summary pages outside the latest month.
- It must be included in `npm run release:check`.

## Files

- `package.json`
- `scripts/audit-public-build.mjs`
- `scripts/release-check.mjs`
- `test/daily-summary-assets.test.mjs`
- `project-docs/research-agent/modules/2026-05-23-public-build-boundary-audit.md`
- `project-docs/research-agent/delivery-readiness-audit.md`
- `project-docs/research-agent/release-completion-audit.md`

## Test Plan

- RED: package/script contract test fails before the audit script exists.
- GREEN: add the audit script and package command.
- Run focused public-build audit test.
- Run `npm run public:build:audit` after `npm run pages:build`.
- Run `npm run release:check`.

