# Integration Handoff Checklist Module

## Goal

Add a single handoff document that records the remaining release, production verification, WeCom, and agent cleanup gates before the broader goal can be considered complete.

## Why

The repository has a large dirty worktree and many implemented surfaces. Without a concrete checklist, it is too easy to confuse local readiness with production completion.

## Scope

- Add `project-docs/research-agent/integration-handoff-checklist.md`.
- Cover pre-push verification, Git state, post-push verification, WeCom delivery, and agent cleanup.
- Keep it documentation-only. Do not mutate Git, deploy, or send webhooks.

## Test

- RED: `integration handoff checklist keeps release and agent cleanup gates explicit` fails because the checklist is missing.
- GREEN: add the checklist and verify the focused test passes.

