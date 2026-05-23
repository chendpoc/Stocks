# Integration Handoff Checklist

Date: 2026-05-23

Purpose: keep the final integration path explicit before this broad daily-report and research-workbench goal is marked complete.

## Current Rule

Do not mark complete while any item below is unverified.

This checklist is intentionally stricter than local tests. Local tests prove readiness; production completion also requires pushed code, GitHub Actions evidence, public site evidence, WeCom delivery evidence, and agent cleanup.

## Pre-Push Gate

Run from the repository root:

```powershell
npm run release:check
```

Required result:

- Node summary tests pass.
- Python structured-summary tests pass.
- Research console build passes.
- Daily publish dry-run passes.
- Cloudflare deploy dry-run passes.
- Public build audit passes.
- `git diff --check` passes.

## Git State Gate

Before claiming the work is on production `main`, verify:

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
```

Required result:

- `git status --short` is empty.
- Local `HEAD` equals `origin/main`.
- Local `HEAD` equals the SHA returned by `git ls-remote origin refs/heads/main`.

## Post-Push Production Gate

After the push and after GitHub Actions has had time to run:

```powershell
npm run release:verify -- --date YYYY-MM-DD
```

Required result:

- Latest `Daily Summary Publish` run on `main` is completed and successful.
- The run `headSha` equals the pushed commit.
- `Cloudflare Pages` public URL is reachable.
- The daily summary URL for the target date is reachable.

## WeCom Gate

Verify one intentional delivery path after the public cover asset is reachable:

- A real scheduled `Daily Summary Publish` run delivered card and image to WeCom, or
- A manual intentional publish run delivered card and image to WeCom.

Do not use dry-run output as WeCom delivery proof.

## Agent Cleanup Gate

Before closing the development phase:

- Confirm active agent count is `0-2`.
- Close completed agents.
- Do not spawn new agents for audit-only work.
- If agent IDs are unavailable, record that limitation instead of claiming cleanup.

This is required because the session previously reported an excessive agent count. Agent cleanup is operational hygiene, not product functionality, but unresolved agent state increases coordination risk.

## Completion Decision

Only after all gates above are proven:

- update the release completion audit,
- then mark the broader goal complete.

If any gate is missing, do not mark complete.

