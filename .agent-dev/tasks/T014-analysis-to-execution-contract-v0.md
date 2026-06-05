# T014: Analysis-to-Execution Contract v0

Status: done

Spec: `.agent-dev/specs/analysis-to-execution-contract-v0/spec.md`

Depends on: M0 Analysis Core Closeout / T013 review blocker closeout.

## Goal

Create the M1 contract that lets the AI Analysis Layer guide future execution
simulation without producing broker order commands.

```text
DecisionWorkflow / FeedbackLearningWorkflow / AlphaValidationWorkflow
-> OpportunityMap / RiskEnvelope / ExplorationPlan / ExecutionPolicy
-> future LiveMarketDataPlane + RiskGate + PaperTradingEngine
```

T014 is a spec gate only. It does not implement live data ingestion, paper
trading, broker adapters, order storage, or CLI commands.

## Step Map

| Step | Scope | Status |
|---|---|---|
| S1 | Add M1 backlog/source doc and task/spec shell | done |
| S2 | Define artifact contracts and validation semantics | done |
| S3 | Link roadmap, README, backlog index, and Ubiquitous Language | done |
| S4 | Run planning verification commands | done |
| S5 | Plan-review `T014` before M2 implementation starts | done |

## Allowed Files

Create/modify only:

```text
.agent-dev/specs/analysis-to-execution-contract-v0/**
.agent-dev/tasks/T014-analysis-to-execution-contract-v0.md
.agent-dev/tasks/T014-analysis-to-execution-contract-v0.json
.agent-dev/tasks/README.md
project-docs/backlog/README.md
project-docs/backlog/now/analysis-to-execution-contract-v0.md
project-docs/backlog/workflow-maturity-roadmap.md
project-docs/backlog/two-layer-market-analysis-and-execution-system.md
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
UBIQUITOUS_LANGUAGE.md
```

## Forbidden

- No `apps/trader-workflows/src/**` changes.
- No backend API/model/test changes.
- No `apps/trader-cli/**`, cockpit, or research-console changes.
- No live market data provider implementation.
- No order, broker, account, position, PnL, or RiskGate implementation.
- No new LangGraph graph.
- No CLI command.

## Acceptance

- `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, and `ExecutionPolicy`
  are defined with required fields.
- Forbidden broker/order fields are explicit.
- Validation failure semantics use `contract_validation_failed`.
- M2/M3/M4 consumers are named but not implemented.
- Source docs and indexes point to the same M1 contract.

## Verification

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.json | ConvertFrom-Json | Out-Null
rg -n "Analysis-to-Execution Contract|OpportunityMap|RiskEnvelope|ExplorationPlan|ExecutionPolicy|contract_validation_failed" UBIQUITOUS_LANGUAGE.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md .agent-dev/specs/analysis-to-execution-contract-v0 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.md
git diff --check -- .agent-dev/specs/analysis-to-execution-contract-v0 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.json .agent-dev/tasks/T014-analysis-to-execution-contract-v0.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md UBIQUITOUS_LANGUAGE.md
```

## Next Review

Use:

```text
Review task T014
```

The review should check for source-of-truth conflicts, order-command leakage,
scope creep into M2/M3 implementation, missing validation semantics, and weak
acceptance coverage.
