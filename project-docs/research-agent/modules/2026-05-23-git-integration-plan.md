# Git Integration Plan Module

## Goal

Document the safe integration strategy for the current state where local work is dirty, `HEAD` is behind `origin/main by 1 commit`, and the only overlapping file is `docs/search_index.json`.

## Why

`docs/search_index.json` is a generated artifact. Manual conflict resolution in this file is a high-risk, low-value activity because the correct final state should be regenerated from source Markdown and public build rules.

## Scope

- Add `project-docs/research-agent/git-integration-plan.md`.
- State that remote daily publish artifacts should be preserved.
- State that `docs/search_index.json` must be regenerated, not hand-edited.
- Keep the plan read-only; do not run Git mutation.

## Test

- RED: focused test fails because `project-docs/research-agent/git-integration-plan.md` is missing.
- GREEN: add the plan with the generated-index strategy and release verification gates.

