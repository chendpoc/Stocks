# Integration Status Command Module

## Goal

Add `npm run integration:status`, a read-only status report for the current integration handoff state.

## Why

The project now has many moving parts: daily publish, Cloudflare Pages, WeCom delivery, local research console, agent cleanup, and production verification. A readable status command reduces reliance on memory after long sessions or context compaction.

## Contract

- Command: `npm run integration:status`.
- Script: `scripts/integration-status.mjs`.
- Read-only only:
  - no `git add`
  - no `git commit`
  - no `git push`
  - no `gh run`
  - no webhook
  - no direct public-site deploy command
- Reads:
  - `git status --short`
  - `git rev-parse HEAD`
  - `git rev-parse origin/main`
  - `git rev-list --left-right --count HEAD...origin/main`
  - `git diff --name-only HEAD..origin/main`
- Path-producing Git commands use `core.quotepath=false` so Chinese Markdown filenames stay readable in JSON.
- Prints:
  - `integration-handoff-checklist.md`
  - `npm run release:check`
  - `npm run release:verify -- --date YYYY-MM-DD`
  - `Daily Summary Publish`
  - `Cloudflare Pages`
  - `WeCom`
  - `agent cleanup`
  - `do not mark complete`
- Supports `--json` for machine-readable status output with:
  - `read_only`
  - `complete`
  - `blockers`
  - `git.changed_entries`
  - `git.head_matches_origin_main`
  - `git.ahead_by`
  - `git.behind_by`
  - `git.diverged`
  - `git.dirty_files`
  - `git.remote_changed_files`
  - `git.overlap_files`
  - `git.overlap_count`
  - `commands.release_check`
  - `commands.release_verify`
  - `gates`
  - `next_action`

## Test

- RED: focused test fails because `scripts/integration-status.mjs` does not exist.
- GREEN: add the script and package command.
- RED: `node scripts/integration-status.mjs --json` initially emits text and fails JSON parsing.
- GREEN: add structured JSON output while preserving the default human-readable report.
- RED: JSON output initially has no `complete` or `blockers`.
- GREEN: add explicit blockers so the command can say why the broader goal still must not be marked complete.
