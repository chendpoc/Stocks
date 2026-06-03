# SUPERSEDED Worker Prompt: T006 Model Decision Store

Do not use this worker prompt for implementation. Stage 1 source-of-truth moved to `.agent-dev/specs/self-evolving-agent-stage1/`.

Reason: Stage 1 was redefined as LangGraph minimal durable runtime with DecisionGraph, OutcomeGraph, EvaluationGraph, and InsightExplorationGraph v0. The old T006 plan only covered Decision Store + TUI.

You are implementing T006 for `D:\workspace\01-products\stock-community-summary`.

## Source of Truth

Read first:

1. `.agent-dev/specs/model-decision-store/spec.json`
2. `.agent-dev/specs/model-decision-store/spec.md`
3. `.agent-dev/specs/model-decision-store/decision-record.json`
4. `.agent-dev/tasks/T006.json`
5. `.agent-dev/tasks/T006-slices/README.md`
6. `.agent-dev/context/code_map.md`
7. `project-docs/research-reports/deep-research-report.md`

## Goal

Implement explicit model decision persistence:

```text
trader decide SYMBOL
-> strict JSON DecisionEnvelope
-> Zod validation
-> POST /api/intel/decisions
-> model_decisions + decision_feature_snapshots
-> CLI/TUI read-only browsing
```

## Required Scope

Backend:

- Add `model_decisions` and `decision_feature_snapshots` to `apps/trader-agent/backend/app/intel/db/schema.py`.
- Add `apps/trader-agent/backend/app/intel/api/decisions.py`.
- Mount route in `apps/trader-agent/backend/app/intel/api/__init__.py`.
- Add pytest coverage in `apps/trader-agent/backend/tests/test_intel_decisions_api.py`.

CLI:

- Add `apps/trader-cli/src/llm/decisionEnvelope.ts`.
- Add `apps/trader-cli/src/llm/decisionEnvelope.test.ts`.
- Add `apps/trader-cli/src/services/decisions.ts`.
- Add `apps/trader-cli/src/services/decisions.test.ts`.
- Add `apps/trader-cli/src/commands/decide.ts`.
- Add `apps/trader-cli/src/commands/decisions.ts`.
- Register commands in `apps/trader-cli/src/index.ts`.

TUI:

- Add `apps/trader-cli/src/tui/pages/DecisionsPage.tsx`.
- Wire menu/content/hotkeys only as needed.
- The page is read-only: list, detail, loading, error, empty, refresh.

Docs:

- Update `.agent-dev/context/code_map.md` and `CLAUDE.md` with concise T006 pointers.
- Update `apps/trader-cli/package.json` test script only if explicit file lists require it.

## Hard Boundaries

Do not implement:

- paper execution
- `OrderIntent`
- `PreTradeCheck`
- `RiskSnapshot`
- Broker Mirror
- Outcome Labeling
- Journal writes
- Training Dataset Builder
- Model Registry / Promotion Gate
- writes to `hypotheses` or `predictions`
- Web Cockpit changes
- Longbridge tool gateway changes
- trader-chart changes

## DecisionEnvelope Action Set

Allowed only:

```text
NO_TRADE
WATCH
WAIT_TRIGGER
PAPER_ENTER_CANDIDATE
PAPER_EXIT_CANDIDATE
INVALIDATE
```

`trade_plan` is optional.

## Verification

Run:

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_decisions_api.py -v --tb=short
cd apps/trader-cli && npm test
cd apps/trader-cli && npm test -- src/llm/decisionEnvelope.test.ts
```

Manual/smoke:

```text
cd apps/trader-cli && npx tsx src/index.ts decisions list --symbol TSLA --limit 5
manual: TUI Decisions page list/detail/empty/error states
manual: review diff does not touch forbidden or non-goal modules
```

## Handoff

Return:

- files changed
- verification commands and results
- any known gaps
- confirmation that no hypotheses/predictions dual-write, paper execution, risk, broker mirror, outcome, or journal code was added
