# 07 Backlog Roadmap Index

## 1. Purpose

This is the backlog index for trader-agent target-system work.

It consolidates recorded but not-yet-implemented requirements from Agent Core, workflow orchestration, CLI/TUI operator surfaces, and self-learning/model-learning roadmaps.

This file does not replace the source documents. It only answers:

- what should be considered now;
- what comes next;
- what is intentionally later;
- what is blocked until a contract, schema, safety gate, or platform capability exists.

## 2. Status Buckets

| Bucket | Meaning |
|---|---|
| Now | Near-term backlog that can enter spec or implementation planning after current dirty work is reviewed. |
| Next | Important backlog after Now items establish the required data, rule, workflow, or evaluation base. |
| Later | Valid future direction, but not needed to prove the current core loop. |
| Blocked by Contract | Must not start implementation until an upstream contract, schema, gate, or safety policy is defined. |

## 3. Now

| Item | What it does | Source | Entry note |
|---|---|---|---|
| Deterministic signal pipeline | Implement or harden Rule Engine, Scoring Engine, Risk Engine, and Signal Manager so model judgment is constrained by auditable rules and risk gates. | [01-agent-core-development/README.md](./01-agent-core-development/README.md) | Keep deterministic signal processing ahead of heavier model-learning work. |
| Rule Discovery / Lite Backtest Engine | Convert market ideas and model-generated insights into `RuleCandidate`, evidence requirements, and `LiteBacktestReport`. | [01-agent-core-development/21-rule-discovery-lite-backtest-engine.md](./01-agent-core-development/21-rule-discovery-lite-backtest-engine.md) | Required before claiming rule discovery or self-evolution. |
| Candidate family integration | Use the finite `CandidateFamily` taxonomy when creating or validating `InsightCandidate` / `RuleCandidate`. | [01-agent-core-development/21-rule-discovery-lite-backtest-engine.md](./01-agent-core-development/21-rule-discovery-lite-backtest-engine.md) | Keep it as an enum constraint, not a registry or storage framework. |
| AlphaResearchGraph spec | Define the bounded workflow for turning event/context windows into candidate rules and lite backtest reports. | [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md) | Should reuse Rule Discovery instead of inventing a separate validation path. |

## 4. Next

| Item | What it does | Source | Entry note |
|---|---|---|---|
| MarketJudgmentGraph v0 | Produce `MarketRead`, opportunity bias, watchlist, triggers, invalidations, and risk warnings from current market context. | [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md) | Should come after the deterministic signal/risk base is usable. |
| Agent Explanation Service | Translate decisions into conclusion, evidence, missing conditions, risks, and next action for CLI/TUI/chat-like output. | [01-agent-core-development/20-agent-explanation-service.md](./01-agent-core-development/20-agent-explanation-service.md) | It explains existing facts; it must not invent evidence or mutate signal state. |
| Real Run Trace Viewer | Show the real execution chain for one agent run, backed by run metadata and agent events. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Useful before building editable workflow surfaces. |
| Run Monitor | Show active and historical workflow runs, failed nodes, retries, resume state, and audit events. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Needed for long-running graphs such as future model learning runs. |
| Reflection Engine | Run daily/weekly learning summaries, mistake analysis, and rule proposal generation without activating rules. | [01-agent-core-development/18-reflection-engine.md](./01-agent-core-development/18-reflection-engine.md) | Should hand candidates to Rule Discovery instead of changing active policy. |

## 5. Later

| Item | What it does | Source | Entry note |
|---|---|---|---|
| ModelLearningGraph v0 | Orchestrate offline training runs for challenger models, checkpoint evaluation, walk-forward validation, and promotion recommendations. | [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md) | First target should be `opportunity_ranking_model`, not a full trading policy. |
| Model registry | Track model versions, dataset versions, checkpoints, metrics, promotion status, and rollback metadata. | [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md) | Needed before any production model switching is possible. |
| Workflow Draft Review | Let the agent propose workflow candidates while users review them as drafts. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Draft and active workflow must remain separate. |
| Workflow Builder | Let users manually edit workflow drafts. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Should wait until runtime schemas are stable. |
| Agent-generated Workflow Candidate | Let the agent propose new workflow candidates based on learning results. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Agent can propose, but cannot activate. |
| Trade Ticket Generator | Turn a gated opportunity into a reviewable trade-ticket draft with trigger, stop, invalidation, target, and risk notes. | [01-agent-core-development/17-trade-ticket-generator.md](./01-agent-core-development/17-trade-ticket-generator.md) | Does not execute orders or approve itself. |
| Evidence detail operator surface | Let users inspect raw evidence behind decisions, including news, filings, bars, context items, weighted evidence, and tool results. | [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | Re-spec as CLI/TUI or workflow run detail. Old T007 notes are archived history only. |

## 6. Blocked By Contract

| Item | Blocker | Required contract or gate |
|---|---|---|
| Workflow run monitor | No canonical workflow definition and run schema yet. | Shared Platform workflow runtime contract plus Agent Core run lifecycle. |
| Workflow run detail viewer | Run history, node state, retry/resume, and audit event contract are not stable yet. | Workflow run schema and event stream contract. |
| Task scheduling | Scheduler ownership, run durability, failure policy, and retry semantics need a platform contract. | Shared Platform task/runtime contract. |
| Approval workflows | Approval request schema, permission model, capability gate, and audit semantics must exist first. | Shared Platform approval and capability policy. |
| Execution surfaces | Account, order, position, fill, risk, and broker-mirror semantics are not part of current scope. | Separate execution PRD, broker mirror, and risk-control policy. |
| Paper order submit/query/cancel | Requires order state, position state, pre-trade checks, and broker-like mirror even if not live trading. | Paper execution contract and risk policy. |
| Broker mirror | Requires broker account model, order/fill sync, position/PnL state, and permission model. | Broker mirror PRD and integration contract. |
| Automatic model promotion or switching | Stage 1 only allows recommendations; automatic switching is unsafe without a registry and promotion gate. | Model registry, PromotionGate, shadow-mode metrics, rollback policy. |
| Automatic active RulePack mutation | Rule Discovery and Reflection may propose candidates, but cannot activate rules. | Manual approval/versioning contract and active RulePack publish policy. |
| Full reinforcement-learning trading policy | Too much execution and reward-hacking risk for v0. | Offline eval, simulator, risk constraints, shadow mode, and explicit execution safety review. |

## 7. Current Recommended Order

Recommended path from here:

```text
1. deterministic signal pipeline
2. Rule Discovery / Lite Backtest Engine
3. AlphaResearchGraph spec
4. MarketJudgmentGraph v0 spec
5. Agent Explanation Service
6. Real Run Trace Viewer / Run Monitor
7. ModelLearningGraph v0 for opportunity_ranking_model
```

Do not pull execution, workflow builder, or automatic promotion forward before the contract blockers are resolved.

## 8. Maintenance Rules

- If a backlog item becomes an active task, create or update a dedicated spec/plan and link it here.
- If an item changes product scope, architecture, storage, API, workflow semantics, or safety gates, confirm the decision before implementation.
- Do not treat `Non-Goals` in old or superseded specs as backlog unless a current target-system document still records the need.
- Keep this index small. Detailed requirements belong in the owning source document.
