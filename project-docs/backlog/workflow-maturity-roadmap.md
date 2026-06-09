# Workflow Maturity Roadmap

Status: current focus

## Purpose

The next phase is workflow-first. The goal is not to add many graph files, but
to keep a small set of workflows durable, reviewable, and able to improve from
outcomes without bypassing policy gates.

Agent Core work should stay supporting unless a workflow slice needs a concrete
backend/shared capability.

The broader product target is a two-layer market system: an AI analysis layer
that produces judgments, opportunity maps, risk boundaries, and validated rule
candidates; and a separate execution simulation layer that consumes live market
data, simulates orders, records positions/PnL, and returns execution feedback.
See
[Two-Layer Market Analysis And Execution System](./two-layer-market-analysis-and-execution-system.md).

## Terminology Gate

Before writing active specs for this phase, use
[Ubiquitous language](../../UBIQUITOUS_LANGUAGE.md) as the canonical vocabulary
for workflow, graph, evidence, candidate, policy, and agent boundaries.

## Two-Layer System Target

The workflow roadmap belongs to the **AI Analysis Layer**. It can guide the
future execution layer, but it must not become the order-management engine.

| Layer | Core function | Primary artifacts | Boundary |
|---|---|---|---|
| AI Analysis Layer | Interpret market context, monitor compact live state, form judgments, learn from outcomes, and validate rule candidates. | `ContextSnapshot`, `DecisionEnvelope`, `EvaluationReport`, `InsightCandidate`, `RuleCandidate`, `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, `ExecutionPolicy` | No direct order submission; outputs guidance and policy. |
| Execution Simulation Layer | Consume live quote/depth/trade data, simulate orders, track fills, positions, PnL, and execution quality. | `QuoteSnapshot`, `OrderBookSnapshot`, `TradeTick`, `MarketStateSnapshot`, `OrderIntent`, `RiskDecision`, `OrderEvent`, `PositionSnapshot`, `ExecutionFeedback` | Deterministic state machine; future live broker path requires explicit approval/capability gate. |

`LiveMarketDataPlane` is infrastructure for both layers, not a fourth AI
workflow. Real-time data processing should be deterministic; LLM nodes should
consume compact market state snapshots, anomaly summaries, and typed evidence.

## Maturity Target

A workflow is mature enough for this phase when it has:

- stable typed input and output;
- durable `run_id`, checkpoint, artifact, and audit-event semantics;
- compact LLM context using evidence summaries and `EvidenceRef` links;
- replayable or inspectable run history;
- outcome linkage back to prior decisions, candidates, or reports;
- reflection output that creates improvement candidates, not automatic changes;
- explicit policy checks before candidate promotion, model switching, or
  RulePack mutation.

## Target Workflow Model

The analysis-layer target is three product workflows. Existing graph files may
remain as implementation artifacts, but future planning should start from these
lanes instead of creating a new standalone graph for every concept.

| Target workflow | Core function | Core chain | Current implementation artifacts |
|---|---|---|---|
| `DecisionWorkflow` | Make the current market judgment from bounded context. | `context -> decision -> schedule future outcome` | `DecisionGraph`, `Stage1Runtime`, context snapshot inspection |
| `FeedbackLearningWorkflow` | Verify past judgments, summarize what failed or worked, and propose new insight candidates. | `due outcomes -> label results -> evaluate patterns -> propose insights` | `OutcomeGraph`, `EvaluationGraph`, `InsightExplorationGraph` |
| `AlphaValidationWorkflow` | Validate whether an insight can become a rule candidate. | `insight -> rule candidate -> lite backtest -> safe review state` | `AlphaResearchGraph v0`, backend Rule Discovery / Lite Backtest |

`MarketJudgmentGraph`, `ReflectionGraph`, and `ModelLearningGraph` are not the
next default standalone workflow targets. Treat market reads as an operator view
over `DecisionWorkflow` / `FeedbackLearningWorkflow`, reflection as report and
proposal sections inside `FeedbackLearningWorkflow`, and model learning as a
later gated capability that needs mature evidence, approval, and audit
boundaries first.

## Current Workflow Artifacts

| Workflow | Current state | Maturity target |
|---|---|---|
| `Stage1Runtime` | implemented | One canonical run/checkpoint/audit contract for workflow runs. |
| `DecisionGraph` | implemented | Implementation artifact for `DecisionWorkflow`: keep the current graph shape, harden `build_context_snapshot`, and expose context snapshot summaries for CLI and LangGraph Web UI review. |
| `OutcomeGraph` | implemented | Implementation artifact for `FeedbackLearningWorkflow`: reliable feedback labels linked to original decisions/candidates. |
| `EvaluationGraph` | implemented | Implementation artifact for `FeedbackLearningWorkflow`: evaluation reports that feed learning without mutating policy. |
| `InsightExplorationGraph` | implemented | Implementation artifact for `FeedbackLearningWorkflow`: candidate generation constrained by family, evidence, and weight caps. |
| `AlphaResearchGraph` | implemented v0 | Implementation artifact for `AlphaValidationWorkflow`: validate insight-derived rule candidates through backend lite backtest and safe states. |
| `ReflectionGraph` | deferred | Do not implement as a standalone graph until feedback reports prove a separate timing, approval, or source-of-truth boundary is needed. |

## Execution And Management Model

Use the three workflow lanes as an operator routine, not as autonomous trading
automation.

| Workflow lane | When it runs | Trigger | Primary artifacts | Operator use |
|---|---|---|---|---|
| `DecisionWorkflow` | On-demand or scheduled market read windows | CLI/TUI/operator scheduler | `ContextSnapshot`, `DecisionEnvelope`, scheduled future outcomes | Review current judgment, evidence refs, and pending outcomes; no default trade execution |
| `FeedbackLearningWorkflow` | After outcomes are due, plus daily/weekly review windows | scheduler or operator review command | finalized outcome labels, `EvaluationReport`, `InsightCandidate` | Check what worked/failed and select insight candidates for alpha validation |
| `AlphaValidationWorkflow` | Only for selected insight candidates with complete seed/context | operator or approved research queue | `RuleCandidate`, `LiteBacktestReport`, safe review state | Inspect backtest evidence and choose reject / needs more data / shadow track / manual approval |

Management rules:

1. `Stage1Runtime` manages run IDs, checkpoints, resumability, and bounded run
   output across all lanes.
2. Backend APIs own durable domain facts: context snapshots, decisions,
   outcomes, reports, insight candidates, rule candidates, and audit events.
3. CLI/TUI should be a thin operator surface: trigger runs, inspect artifacts,
   and request approvals. It must not own workflow logic.
4. Scheduled runs are allowed for low-risk labeling and reporting. Validation,
   approval, promotion, RulePack mutation, model switching, and execution stay
   manual-gated.
5. Each lane hands off by typed artifact IDs, not by chat context or hidden
   graph state.

Layer handoff rules:

| Direction | Handoff | Meaning |
|---|---|---|
| Analysis -> execution simulation | `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, `ExecutionPolicy` | Focus local monitoring and paper/shadow exploration under explicit constraints. |
| Execution simulation -> analysis | `OrderEvent`, `PositionSnapshot`, `ExecutionFeedback` | Feed realized execution quality, slippage, risk behavior, and rule adherence back into evaluation. |

The analysis layer may say where focused exploration is safer or more promising.
The execution layer decides whether a specific paper/live order intent passes
deterministic risk and market-state checks.

## Milestone Plan

Development should follow the system feedback loop:

```text
market facts
-> analysis judgment
-> execution policy
-> paper/shadow execution
-> execution feedback
-> learning
```

Do not return to the old pattern of creating one milestone per graph. Each
milestone below should close a product capability boundary.

| Milestone | Goal | Deliverable | Exit criteria |
|---|---|---|---|
| M0 Analysis Core Closeout | Close the current analysis-layer work and lay the permanent memory foundation before adding execution scope. | T010-T013 status alignment, review blocker closeout, workflow README/roadmap consistency, `pattern_memories` + `failure_memories` + `session_context_packs` tables as analysis-layer permanent memory base. | `DecisionWorkflow -> FeedbackLearningWorkflow -> AlphaValidationWorkflow` is inspectable, documented, and not drifting across task/spec/README; pattern lifecycle (candidate→active→degraded→retired) and failure memory are durable. |
| M1 Analysis-to-Execution Contract | Define how analysis can guide execution without becoming order control. | [`OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, `ExecutionPolicy` spec](./now/analysis-to-execution-contract-v0.md) with forbidden fields and validation rules. | AI outputs opportunity/risk/constraints only; no artifact can be interpreted as a broker order command. |
| M2 LiveMarketDataPlane v0 | Establish the real-market fact inlet. | [`QuoteSnapshot`, `OrderBookSnapshot`, `TradeTick`, `MarketStateSnapshot`, provider trace, quality flags, replay/inspection contract](./now/live-market-data-plane-v0.md). | Read-only quote/depth/trade data can be normalized, inspected, and replayed without involving order execution. |
| M3 PaperTradingEngine v0 | Build the deterministic simulated order core. | `OrderIntent`, `RiskDecision`, `OrderEvent`, `PositionSnapshot`, PnL/slippage model, replay tests. | Given market state plus policy, order state, fills, position, and PnL are reproducible. |
| M4 Guided Paper Exploration | Let analysis focus local paper/shadow exploration. | `ExecutionPolicy -> RiskGate -> PaperTradingEngine -> ExecutionFeedback` path. | Paper/shadow exploration runs only inside approved opportunity/risk boundaries and produces execution feedback. |
| M5 Execution Feedback Learning | Feed execution reality back into analysis. | `ExecutionFeedback` evaluation inputs, report sections, insight/rule-candidate improvement handoff. | Reports can distinguish judgment quality, rule edge, execution feasibility, slippage, and risk behavior. |
| M6 Operator Surface And Approval Gate | Make risk boundaries operable by a human. | CLI/TUI/cockpit inspection, approval requests, kill switch, audit trail. | High-risk actions are inspectable, rejectable, and auditable before activation or execution. |
| M7 Shadow / Live Broker Gate | Consider real broker integration only after paper evidence matures. | Broker adapter spec, minimal shadow/live pilot plan, capability policy. | No live path exists unless M1-M6 evidence is accepted and an explicit approval gate is implemented. |

Current milestone state: M0–M3 v0 slices are implemented on branch
(`T014`–`T019`). M2 uses Longbridge/fixture quote ingest with
`MarketStateSnapshot` + CLI/API inspection. M3 adds deterministic
`PaperTradingEngine` with idempotent replay. M4+ (guided exploration, feedback
learning, operator gates) remain backlog.

## Non-Goals

- No broker execution in the analysis-layer workflow phase.
- No direct AI order submission.
- No tick-by-tick LLM loop.
- No automatic RulePack mutation.
- No automatic model promotion or switching.
- No workflow builder or agent-generated workflow activation.
- No new standalone workflow for market judgment, reflection, or model learning
  unless it passes the split-boundary test above.
- No live market data ingestion as a standalone AI graph; it belongs to the
  live data plane.
- No broad Agent Core completion unless it directly unblocks the workflow slice.

## Next Action

Resolve the
[`LiveMarketDataPlane Implementation Decision Gate`](./now/live-market-data-plane-implementation-decision-gate.md)
before writing provider adapters, storage, stream handlers, paper trading, or
broker-facing code.
