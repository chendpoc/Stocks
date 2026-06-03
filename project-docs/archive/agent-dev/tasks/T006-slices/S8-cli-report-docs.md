# S8 CLI/Report/Docs/Verification

## Goal

Wire Stage 1 CLI commands and documentation after S1-S7 are implemented.

## Scope

- Update `.agent-dev/context/code_map.md`.
- Update `CLAUDE.md`.
- Update `apps/trader-cli/package.json` and root `package.json` scripts if needed.
- Ensure `apps/trader-cli` commands remain thin wrappers over `apps/trader-workflows`.
- Collect markdown/json report artifacts for Stage 1 runs.

## CLI Smoke Commands

Run after S1-S7:

```text
npm run trader-cli -- runs list --json
npm run trader-cli -- decide TSLA.US --json
npm run trader-cli -- runs show <RUN_ID_FROM_DECIDE> --json
npm run trader-cli -- outcomes run --due --json
npm run trader-cli -- eval summary --json
npm run trader-cli -- insights explore --symbol TSLA.US --window 30d --json
```

Expected:

- Each command returns the workflow JSON envelope.
- `RUN_ID_FROM_DECIDE` comes from the preceding `decide` JSON envelope.
- `apps/trader-cli` wrappers do not import `apps/trader-workflows/src/**`.
- Workflow app commands can also run through `npm --prefix apps/trader-workflows run workflows -- <command> --json`.
- Non-zero workflow exits are passed through by CLI wrappers.

## Exit Criteria

- CLI smoke covers `decide`, `runs`, `outcomes`, `eval`, and `insights`.
- Documentation clearly states app boundaries:
  - `apps/trader-workflows`: runtime and graphs.
  - `apps/trader-agent/backend`: domain API.
  - `apps/trader-cli`: thin wrappers.
- Scope audit confirms no self-built TUI, paper execution, broker mirror, auto-training, auto-promotion, or legacy dual-write.

## Verification

Run `V208` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No new UI page.
- No new product scope.
