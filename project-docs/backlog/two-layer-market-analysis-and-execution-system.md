# Two-Layer Market Analysis And Execution System

Status: architecture note

## Purpose

This note records the target system shape discussed on 2026-06-05.

The system should have two layers:

1. **AI Analysis Layer**: reads bounded market context, monitors real market
   state, forms judgments, evaluates outcomes, and proposes validated research
   candidates.
2. **Execution Simulation Layer**: reads live quote, depth, and trade streams,
   simulates orders under real market constraints, records positions and PnL,
   and returns execution feedback.

The key design rule is simple: AI can guide exploration and define risk
boundaries, but it must not directly submit orders.

## Target Shape

```text
Live Market Data Plane
QuoteSnapshot / OrderBookSnapshot / TradeTick
  -> SecondBar / MinuteBar / MarketMicrostructureFeatures
  -> MarketStateSnapshot

AI Analysis Layer
DecisionWorkflow / FeedbackLearningWorkflow / AlphaValidationWorkflow
  -> OpportunityMap
  -> RiskEnvelope
  -> ExplorationPlan
  -> ExecutionPolicy
  -> RuleCandidate

Execution Simulation Layer
ExecutionPolicy + live market state
  -> OrderIntent
  -> RiskGate
  -> PaperTradingEngine / future BrokerAdapter
  -> OrderEvent
  -> PositionSnapshot / PnL / FillQuality
  -> ExecutionFeedback

Feedback Loop
ExecutionFeedback
  -> FeedbackLearningWorkflow
  -> improved insights and rule candidates
```

## Layer 1: AI Analysis Layer

The analysis layer answers:

- What is the current market structure?
- Which symbols, windows, or patterns deserve attention?
- Where are the risk boundaries?
- Which insights can become validated rule candidates?
- What did prior decisions or candidates teach us?

Current workflow lanes:

| Workflow | Role |
|---|---|
| `DecisionWorkflow` | Current market judgment from bounded context. |
| `FeedbackLearningWorkflow` | Outcome labeling, evaluation, and insight proposal. |
| `AlphaValidationWorkflow` | Rule candidate creation and lite backtest validation. |

Expected outputs:

| Artifact | Meaning |
|---|---|
| `OpportunityMap` | Symbols, time windows, structures, or setups worth focused monitoring. |
| `RiskEnvelope` | Exposure caps, invalidation rules, liquidity constraints, event-risk blocks. |
| `ExplorationPlan` | What the execution layer should watch locally and under which conditions. |
| `ExecutionPolicy` | Deterministic permission boundary for paper trading or shadow tracking. |
| `RuleCandidate` | Backtestable rule candidate created from a selected insight. |

The analysis layer can monitor real market data, but not by sending every tick
to an LLM. The real-time path should be deterministic data processing; AI should
consume compact market state snapshots, anomalies, summaries, and selected
events.

## Layer 2: Execution Simulation Layer

The execution layer answers:

- What is happening in the live order book and trade tape?
- Would the proposed rule be executable under real spread, depth, slippage, and
  fill constraints?
- What orders would be submitted in paper trading?
- Were simulated fills, exits, and risk stops reasonable?
- What execution feedback should be returned to learning?

Expected components:

| Component | Responsibility |
|---|---|
| `LiveMarketDataPlane` | Subscribe to quote, depth, trade, and bar feeds; normalize provider data. |
| `MarketFeatureExtractor` | Build second/minute bars and microstructure features. |
| `RiskGate` | Reject order intents that violate exposure, liquidity, or policy limits. |
| `PaperTradingEngine` | Simulate order lifecycle, fills, slippage, positions, and PnL. |
| `BrokerAdapter` | Future adapter boundary; paper and live paths should share the same order model. |
| `OrderEventStore` | Append-only order events for replay, audit, and reconciliation. |

Expected artifacts:

| Artifact | Meaning |
|---|---|
| `QuoteSnapshot` | Best bid/ask and quote metadata. |
| `OrderBookSnapshot` | Depth levels and book timestamp. |
| `TradeTick` | Executed trade print. |
| `MarketStateSnapshot` | Compact live market state consumed by workflows or operators. |
| `OrderIntent` | Proposed paper/live action before risk approval. |
| `RiskDecision` | Allow/reject/reduce decision with reason codes. |
| `OrderEvent` | Submitted, accepted, filled, canceled, rejected, or expired order event. |
| `PositionSnapshot` | Current position, exposure, realized/unrealized PnL. |
| `ExecutionFeedback` | Fill quality, slippage, rule adherence, stop behavior, and execution outcome. |

## Handoff Contract

Analysis to execution:

```text
OpportunityMap + RiskEnvelope + ExplorationPlan + ExecutionPolicy
  -> local focused monitoring
  -> paper/shadow order simulation only when conditions match
```

Execution to analysis:

```text
OrderEvent + PositionSnapshot + ExecutionFeedback
  -> FeedbackLearningWorkflow
  -> EvaluationReport / InsightCandidate / RuleCandidate improvements
```

The handoff must use typed artifact IDs and stored facts. It must not rely on
chat context or hidden graph state.

## Runtime Boundary

The execution layer must be deterministic and auditable.

- LLMs must not sit in the tick-by-tick order path.
- LLMs must not directly submit, cancel, or amend orders.
- Paper trading and future live trading should share the same order model and
  state transition rules.
- Live broker execution requires an explicit approval/capability gate and a
  reviewed implementation spec.
- Missing required market context, risk context, or execution policy should stop
  the path and surface a warning instead of silently falling through.

## Roadmap Placement

This note does not replace the workflow maturity roadmap. It refines the target
shape:

```text
Layer 1: AI Analysis Layer
  current focus: DecisionWorkflow, FeedbackLearningWorkflow, AlphaValidationWorkflow

Layer 2: Execution Simulation Layer
  future focus: LiveMarketDataPlane, PaperTradingEngine, RiskGate, OrderEventStore
```

Recommended sequence:

| Milestone | Focus |
|---|---|
| M0 Analysis Core Closeout | Close T010-T013 status, review blockers, and analysis-layer doc consistency. |
| M1 Analysis-to-Execution Contract | Define [`OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, and `ExecutionPolicy`](./now/analysis-to-execution-contract-v0.md); forbid order-command semantics. |
| M2 LiveMarketDataPlane v0 | Define [`QuoteSnapshot`, `OrderBookSnapshot`, `TradeTick`, `MarketStateSnapshot`, provider trace, quality flags, and replay](./now/live-market-data-plane-v0.md). |
| M3 PaperTradingEngine v0 | Implement deterministic order events, risk decisions, positions, PnL, slippage, and replay tests. |
| M4 Guided Paper Exploration | Connect `ExecutionPolicy -> RiskGate -> PaperTradingEngine -> ExecutionFeedback`. |
| M5 Execution Feedback Learning | Feed execution feedback into reports, insight improvements, and rule-candidate evaluation. |
| M6 Operator Surface And Approval Gate | Expose inspection, approvals, audit trail, and kill-switch behavior. |
| M7 Shadow / Live Broker Gate | Consider broker adapters only after paper/shadow evidence and approval gates are accepted. |

After [`Analysis-to-Execution Contract v0`](./now/analysis-to-execution-contract-v0.md),
the next design task is [`LiveMarketDataPlane v0`](./now/live-market-data-plane-v0.md).
Implementation should not start until that data-plane contract is reviewed.

## Non-Goals

- No direct AI order submission.
- No live broker execution in the current workflow maturity phase.
- No tick-by-tick LLM loop.
- No hidden promotion from analysis output to active trading policy.
- No fallback that hides missing required context or seed data.
- No separate AI workflow for real-time market data ingestion; that belongs to
  the live data plane.

## Open Decisions Before Implementation

- Which provider and entitlement level will supply quote, depth, and trade
  streams?
- Which symbols and markets are in the first paper-trading scope?
- What is the first supported cadence: seconds, 1m, or 5m?
- What exposure, liquidity, and event-risk limits define the first `RiskGate`?
- Which operator surface should inspect `MarketStateSnapshot`, `OrderEvent`, and
  `ExecutionFeedback` first: CLI, TUI, or cockpit?
