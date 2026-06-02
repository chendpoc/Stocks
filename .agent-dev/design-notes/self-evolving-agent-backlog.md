# Self-Evolving Agent Backlog

Status: design backlog, not an implementation task
Date: 2026-06-02
Related notes:
- `.agent-dev/design-notes/T006-workflow-design.md`
- `.agent-dev/design-notes/self-evolving-agent-cross-cutting-concerns.md`

## Purpose

This backlog captures future workflows and data-foundation modules discussed during T006 planning.

It is not part of the active T006 slice scope unless explicitly promoted into a task/spec later.

## Priority Map

```text
P0    High-priority backlog foundation for higher-quality single-symbol decisions.
P1.5  First useful expansion after T006 single-symbol flow is stable.
P2    Core follow-up workflows and data foundation after the initial loop works.
P3    Model learning, shadow testing, promotion, and later execution consistency.
P4    Scale/professionalization after strategy quality is proven.
```

Priority boundary:

```text
P0 backlog priority != current T006 blocking prerequisite.
P0 items do not reopen completed T006 scope unless explicitly promoted through a revision gate or new task.
```

## P0: Decision Quality Foundation

### MarketDataService v0

High-priority backlog item because `KLineFeaturePipeline` needs stable input and should not couple directly to provider-specific code.

Scope:

```text
get_bars(symbol, timeframe, window, provider="auto")
get_quote(symbol, provider="auto")
simple provider config
provider_trace
entitlement_status
quality_flags
fallback_reason
```

Provider design:

```text
No complex capability router in v0.
Use provider guidance docs plus simple config.
```

Provider guidance:

```text
Longbridge:
  realtime quote, recent bars, future account/execution path.

yfinance:
  development historical backfill and quick research.

Alpha Vantage:
  fundamentals, news sentiment, indicators, calendar, official REST fallback.

Polygon/Massive or equivalent:
  P4 professional provider after strategy is proven.
```

### KLineFeaturePipeline v0

High-priority P0 backlog capability.

Input:

```text
MarketDataService BarSeries
benchmark BarSeries
asof
source quality metadata
```

Output:

```text
structured kline_feature_context
summarized WeightedContextItem records
```

Initial feature set:

```text
trend
volatility
volume_anomaly
gap
drawdown
runup
relative_strength_vs_benchmark
basic_support_resistance
recent_regime_summary
```

Boundary:

```text
KLineFeaturePipeline consumes standard BarSeries.
It does not know Longbridge/yfinance/Alpha implementation details.
```

### ContextSnapshot K-line Context

K-line features should be first-class context, not only free-text evidence.

Recommended shape:

```text
ContextSnapshot:
  kline_feature_context: structured object
  weighted_context_items: summarized evidence items
```

Reason:

```text
LLM consumption needs concise weighted summaries.
Training/evaluation later needs structured features.
```

### KLinePatternExploration v0

LLM/ReAct-based historical K-line pattern exploration is important, but it must be isolated from production decision weights.

Placement:

```text
T006 S7 InsightExplorationGraph
```

Output only:

```text
InsightCandidate
```

Forbidden:

```text
direct weighting policy edits
direct prompt edits
direct trade decision influence
automatic AcceptedLesson promotion
```

## P1.5: First Workflow Expansion

### WatchlistBatchGraph

First expansion after single-symbol `DecisionGraph(symbol)` is stable.

Scope:

```text
watchlist symbols
-> fan out DecisionGraph(symbol)*
-> collect run summaries
-> rank by urgency / actionability / context quality
```

Output:

```text
batch_run_id
symbol_runs[]
summary
errors
top_watch_items
```

Not in scope:

```text
portfolio risk
execution
broker mirror
```

## P2: Core Follow-Up Workflows And Data Foundation

### EventTriggerGraph

Priority: P2-A.

Runs after watchlist batch because event quality and dedupe must be stable first.

Scope:

```text
event
-> affected_symbols
-> dedupe by symbol/event/window
-> trigger DecisionGraph(symbol)
```

Required supporting capabilities:

```text
event source quality scoring
event dedupe
affected symbol classification
trigger window policy
```

### PaperExecutionGraph

Priority: P2.

Required for the final goal of "virtual account self-verifies", but only after T006 decision/outcome/evaluation loop is stable.

Input:

```text
ExecutionIntent
```

Output:

```text
paper_order
paper_fill
paper_position
```

Boundary:

```text
No live execution.
No automatic real broker order.
```

### LearningDatasetBuilderGraph

Priority: P2 core, before challenger training.

Purpose:

```text
ContextSnapshot
+ DecisionEnvelope
+ ExecutionIntent
+ DecisionOutcome
+ EvaluationReport
-> learning_examples / eval_examples
```

First outputs:

```text
decision_example
outcome_example
failure_case
counterfactual_example
dataset_quality_report
manual_export
```

Boundary:

```text
Build datasets only.
Do not train.
Do not auto-promote.
```

Reason to design early:

```text
If DecisionEnvelope/OutcomeGraph/EvaluationGraph store records loosely,
later training data will be unusable.
```

### Data Foundation Epic

Priority: P2-B / P2-C.

Type:

```text
backend/jobs/services
not LangGraph workflow
primary consumer = ContextGatherGraph
```

Scope:

```text
chunk/FTS hardening
embedding/vector search
image evidence processing
index update jobs
evidence normalization
source quality scoring
cross-provider reconciliation
```

Note:

```text
Existing repo already has chunk + FTS foundations.
Embedding/vector search is useful, but should not distract from P0 K-line/data quality work.
```

### ImageEvidencePipeline v0

Priority: P2-C.

Purpose:

```text
process chart images, screenshots, report images, and social images into structured image context
```

Model:

```text
OpenAI multimodal/VLM in v0
```

Flow:

```text
image input
-> validate/hash/store metadata
-> VLM caption + OCR-like extraction + chart observation
-> normalized image context
-> ContextGatherGraph consumption
```

Structured output:

```text
image_type
visible_symbols
visible_time_range
chart_pattern_observations
notable_price_levels
extracted_text
sentiment_or_claims
uncertainty_notes
evidence_quality
```

Boundary:

```text
VLM does not write DecisionEnvelope.
VLM does not create high-confidence facts by itself.
VLM output is candidate evidence for weighting.
```

## P3: Learning, Shadowing, And Later Consistency

### ChallengerTrainingGraph

Priority: P3.

Only after LearningDatasetBuilderGraph produces enough high-quality samples.

Boundary:

```text
No near-term implementation.
Avoid noisy small-sample overfitting.
```

### ShadowEvaluationGraph

Priority: P3.

Order:

```text
after ChallengerTrainingGraph
before PromotionGateGraph
```

Purpose:

```text
primary_model and challenger_model
use same ContextSnapshot
wait for same OutcomeGraph labels
compare after horizons mature
```

### PromotionGateGraph

Priority: P3.

Boundary:

```text
computes promotion recommendation
checks evidence/sample/risk constraints
requires human approval
does not fully auto-promote
```

### BrokerMirrorGraph

Priority: P2-B / P3, backlog only.

Only meaningful after paper/live execution exists.

Purpose:

```text
broker/paper account state
-> orders/fills/positions/cash mirror
-> mismatch report
-> orphan order detection
```

Not near-term core.

## P4: Scale And Production Upgrade

### PortfolioRiskGraph

Priority: P3/P4.

Trigger:

```text
system stable
paper/live positions exist
multiple active ExecutionIntent records exist
cross-symbol exposure control becomes necessary
```

Scope:

```text
correlation exposure
theme concentration
position overlap
portfolio-level risk limits
```

Current boundary:

```text
Do not build as near-term workflow.
Keep minimal policy checks inside ExecutionIntentBuilder / policy gate.
```

### ProfessionalDataProviderAdapter

Priority: P4.

Candidates:

```text
Polygon/Massive
Databento
Tiingo
Twelve Data
Nasdaq Data Link
```

Trigger:

```text
strategy is proven in simulated/paper evaluation
data quality becomes a measured bottleneck
licensed historical/realtime data cost is justified
provider_trace/reconciliation can measure upgrade benefit
```

Role:

```text
licensed historical/realtime market data backbone
```

## Deferred Or Explicitly Non-Core

These are not near-term workflow priorities:

```text
full portfolio risk system
fully automatic model promotion
live execution
complex provider capability router
professional paid market data
full vector-first knowledge platform
```

## Avoid Self-Built Infrastructure

The project should not self-build mature quant/time-series primitives unless a later review proves the library option is inadequate.

Use mature libraries for:

```text
workflow runtime / checkpoint / HITL:
  LangGraph

exchange calendar / trading sessions / holidays:
  pandas-market-calendars or exchange-calendars

technical indicators / candlestick patterns:
  TA-Lib or another mature indicator library once the feature set grows

historical scans / vectorized strategy exploration:
  vectorbt spike before writing custom historical scan runners

full backtest / matching / execution simulation:
  evaluate NautilusTrader / LEAN / Backtrader before self-building

embedding / vector search:
  use a mature vector index/database extension if FTS5 becomes insufficient

portfolio statistics / long-horizon reports:
  use mature statistics/backtest reporting libraries where appropriate
```

Own only the project-specific semantic layer:

```text
CanonicalBarSeries / CanonicalQuote
provider_trace / quality_flags
ContextSnapshot
DecisionEnvelope
ExecutionIntent
OutcomeGraph label contract
EvaluationGraph path separation
InsightCandidate lifecycle
```

Implication for P0:

```text
KLineFeaturePipeline v0 should own normalization, selected feature mapping,
quality flags, and ContextSnapshot integration.

It should not become a hand-written technical-analysis framework.
```

Implication for exploration:

```text
KLinePatternExploration v0:
  LLM proposes hypotheses.
  Mature scan/backtest tools validate history where useful.
  System persists InsightCandidate only.
```

## Current Next Step

Do not silently promote this backlog into active T006 implementation.

Current T006 task artifacts may already be complete. If the project wants these P0 items next, run a small revision planning gate and choose one of two paths:

```text
Option A:
  T006 revision
  only if the team intentionally reopens the Stage 1 umbrella scope

Option B:
  new follow-up task
  preferred if T006 is complete and these are quality/foundation upgrades
```

Candidate promotion packet:

```text
MarketDataService / KLineFeature task:
  MarketDataService v0
  KLineFeaturePipeline v0
  structured kline_feature_context

Insight exploration task:
  KLinePatternExploration v0 as InsightCandidate-only exploration
```
