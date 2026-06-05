# Project Backlog

## Purpose

This is the project-level backlog index for active product work.

Each future requirement has its own file under this directory. This index keeps
ordering visible without turning the backlog into a second PRD.

Current focus: make `apps/trader-workflows` mature enough to support durable,
auditable, self-improving research loops. Agent Core items are treated as
supporting dependencies unless a workflow slice explicitly needs them.

Archived research-console, trader-cockpit, legacy trader-agent, and old
agent-dev documents are historical evidence only. They are not backlog unless a
current target-system document still records the need.

## Status Buckets

| Bucket | Meaning |
|---|---|
| Now | Near-term backlog that can enter spec or implementation planning after current dirty work is reviewed. |
| Next | Important backlog after Now items establish the required data, rule, workflow, or evaluation base. |
| Later | Valid future direction, but not needed to prove the current core loop. |
| Blocked by Contract | Must not start implementation until an upstream contract, schema, gate, or safety policy is defined. |

## Current Focus

| Roadmap | Purpose |
|---|---|
| [Ubiquitous language](../../UBIQUITOUS_LANGUAGE.md) | Canonical terms for workflow, graph, evidence, candidate, policy, and agent specs. |
| [Workflow maturity roadmap](./workflow-maturity-roadmap.md) | Defines the two-layer milestone path from analysis workflows to execution simulation feedback. |
| [Two-layer market analysis and execution system](./two-layer-market-analysis-and-execution-system.md) | Target architecture for AI analysis, live market facts, paper/shadow execution, and feedback learning. |

## Now

`Now` includes active gates, completed evidence pointers, and valid near-term
backlog. It is not parallel implementation permission; follow
`Current Recommended Order` for the active route.

| Requirement | Primary source |
|---|---|
| [DecisionGraph maturity v1](./now/decision-graph-maturity-v1.md) | workflow maturity roadmap |
| [Workflow runtime run/checkpoint/audit alignment](./now/workflow-runtime-run-checkpoint-audit-alignment.md) | T017 completed runtime observability read-model slice and workflow orchestration roadmap |
| [Alpha run artifact contract](./now/alpha-run-artifact-contract.md) | agent engineering principles proposal and workflow roadmap |
| [Compact evidence summary builder](./now/compact-evidence-summary-builder.md) | agent engineering principles proposal and AI/RAG roadmap |
| [Alpha candidate contract](./now/alpha-candidate-contract.md) | agent engineering principles proposal |
| [Alpha policy check nodes](./now/alpha-policy-check-nodes.md) | agent engineering principles proposal |
| [AlphaResearchGraph spec](./now/alpha-research-graph-spec.md) | trader-agent self-learning roadmap |
| [Workflow feedback loop hardening](./now/workflow-feedback-loop-hardening.md) | trader-workflows runtime and graph docs |
| [Analysis-to-Execution Contract v0](./now/analysis-to-execution-contract-v0.md) | workflow maturity roadmap M1 |
| [LiveMarketDataPlane v0](./now/live-market-data-plane-v0.md) | workflow maturity roadmap M2 |
| [LiveMarketDataPlane implementation decision gate](./now/live-market-data-plane-implementation-decision-gate.md) | workflow maturity roadmap M2 implementation gate |
| [Run Monitor](./now/run-monitor.md) | T017 completed runtime observability read-model slice and workflow orchestration roadmap |
| [Real Run Trace Viewer](./now/real-run-trace-viewer.md) | T017 completed runtime observability read-model slice and workflow orchestration roadmap |

## Next

| Requirement | Primary source |
|---|---|
| None | Current route remains T016 gate -> M2 implementation after confirmation. |

## Later

| Requirement | Primary source |
|---|---|
| [ModelLearningGraph v0](./later/model-learning-graph-v0.md) | trader-agent self-learning roadmap |
| [MarketJudgmentGraph v0](./later/market-judgment-graph-v0.md) | deferred standalone graph; market judgment remains inside DecisionWorkflow unless a split-boundary spec passes |
| [AlphaResearchAgent v1](./later/alpha-research-agent-v1.md) | AlphaResearchGraph v0 follow-up |
| [Model registry](./later/model-registry.md) | trader-agent self-learning roadmap |
| [Workflow Draft Review](./later/workflow-draft-review.md) | workflow orchestration roadmap |
| [Workflow Builder](./later/workflow-builder.md) | workflow orchestration roadmap |
| [Agent-generated Workflow Candidate](./later/agent-generated-workflow-candidate.md) | workflow orchestration roadmap |
| [Trade Ticket Generator](./later/trade-ticket-generator.md) | trader-agent Agent Core development |
| [Evidence detail operator surface](./later/evidence-detail-operator-surface.md) | workflow orchestration roadmap |
| [Intraday 1m context and minute-level analysis](./later/intraday-1m-context-and-minute-analysis.md) | product/architecture discussion (2026-06); future analysis priority |

## Supporting Dependencies

These are valid requirements, but they are not the current mainline. Pull them
forward only when a workflow maturity slice needs the dependency.

| Requirement | Primary source |
|---|---|
| [Deterministic signal pipeline](./supporting/deterministic-signal-pipeline.md) | trader-agent Agent Core development |
| [Rule Discovery / Lite Backtest Engine](./supporting/rule-discovery-lite-backtest-engine.md) | trader-agent Rule Discovery module |
| [Candidate family integration](./supporting/candidate-family-integration.md) | trader-agent Rule Discovery module |
| [Agent Explanation Service](./supporting/agent-explanation-service.md) | trader-agent Agent Core development |
| [Reflection Engine](./supporting/reflection-engine.md) | backend learning capability; reflection stays inside FeedbackLearningWorkflow reports/proposals unless a split-boundary spec passes |

## Blocked By Contract

| Requirement | Required contract or gate |
|---|---|
| [Cross-system workflow run monitor](./blocked-by-contract/workflow-run-monitor.md) | Shared Platform workflow runtime contract plus Agent Core run lifecycle. |
| [Cross-system workflow run detail viewer](./blocked-by-contract/workflow-run-detail-viewer.md) | Cross-system run schema, backend event stream, and control boundary. |
| [Task scheduling](./blocked-by-contract/task-scheduling.md) | Shared Platform task/runtime contract. |
| [Approval workflows](./blocked-by-contract/approval-workflows.md) | Shared Platform approval and capability policy. |
| [Execution surfaces](./blocked-by-contract/execution-surfaces.md) | Separate execution PRD, broker mirror, and risk-control policy. |
| [Paper order submit/query/cancel](./blocked-by-contract/paper-order-submit-query-cancel.md) | Paper execution contract and risk policy. |
| [Broker mirror](./blocked-by-contract/broker-mirror.md) | Broker mirror PRD and integration contract. |
| [Automatic model promotion or switching](./blocked-by-contract/automatic-model-promotion-or-switching.md) | Model registry, PromotionGate, shadow-mode metrics, rollback policy. |
| [Automatic active RulePack mutation](./blocked-by-contract/automatic-active-rulepack-mutation.md) | Manual approval/versioning contract and active RulePack publish policy. |
| [Full reinforcement-learning trading policy](./blocked-by-contract/full-reinforcement-learning-trading-policy.md) | Offline eval, simulator, risk constraints, shadow mode, and explicit execution safety review. |

## Current Recommended Order

Recommended path from here:

```text
M0. Analysis Core Closeout
    - done: T010-T013 status/review/doc drift closed
M1. Analysis-to-Execution Contract v0
    - done: T014 contract for OpportunityMap / RiskEnvelope / ExplorationPlan / ExecutionPolicy
M2. LiveMarketDataPlane v0
    - done: T015 contract for read-only quote/depth/trade facts, provider trace, quality flags, replay
    - current gate: T016 provider/entitlement/scope/storage/retention/inspection/readiness/fallback/execution boundary
M3. PaperTradingEngine v0
    - deterministic order events, positions, PnL, slippage, replay
M4. Guided Paper Exploration
    - ExecutionPolicy -> RiskGate -> PaperTradingEngine -> ExecutionFeedback
M5. Execution Feedback Learning
    - feed execution feedback into evaluation and insight/rule-candidate improvement
M6. Operator Surface And Approval Gate
    - inspection, approval, audit trail, kill switch
M7. Shadow / Live Broker Gate
    - broker adapter only after accepted paper/shadow evidence and approval gate
```

Do not pull `LiveMarketDataPlane` implementation, paper trading, broker
adapters, workflow builder, or automatic promotion forward before the relevant
contract and decision blockers are resolved.

## Maintenance Rules

- If a backlog item becomes active, create or update a dedicated
  `.agent-dev/specs/<feature>/` spec or implementation plan and link it from the
  requirement file.
- If an item changes product scope, architecture, storage, API, workflow
  semantics, or safety gates, confirm the decision before implementation.
- Use [Ubiquitous language](../../UBIQUITOUS_LANGUAGE.md) terms before adding
  new workflow, graph, evidence, candidate, policy, or agent vocabulary.
- Do not treat `Non-Goals` in old or superseded specs as backlog unless a
  current target-system document still records the need.
- Keep requirement files compact. Detailed product or architecture design
  belongs in the owning source document.
