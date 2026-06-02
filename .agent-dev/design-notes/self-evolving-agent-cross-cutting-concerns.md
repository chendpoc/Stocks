# Self-Evolving Agent Cross-Cutting Concerns

Status: design note, not an implementation task
Date: 2026-06-02
Related notes:
- `.agent-dev/design-notes/T006-workflow-design.md`
- `.agent-dev/design-notes/self-evolving-agent-backlog.md`

## Purpose

This note captures system-level rules that cut across workflows. These are not separate product features, but they must shape future specs, worker prompts, review gates, and tests.

## 1. Canonical Market Data And Quality

The system should normalize provider data before it reaches decision, outcome, or dataset logic.

Use lightweight canonical outputs:

```text
CanonicalBarSeries
CanonicalQuote
```

Required metadata:

```text
symbol
timeframe
bars[]
provider_trace
entitlement_status
quality_flags
fallback_reason
adjusted_policy
session_policy
data_available_at
```

Stage 1 should not build a full market-data master system.

Avoid in P0:

```text
full symbol master
corporate action adjustment engine
survivorship-bias-free universe
multi-provider reconciliation engine
complex provider capability router
```

But every downstream record must carry enough metadata to audit data quality later.

## 2. Adjustment And Session Policy

Do not hide K-line policy assumptions.

First version:

```text
adjusted_policy = provider_adjusted | raw | unknown
session_policy = regular | premarket | postmarket | extended | unknown
```

Rules:

```text
unknown adjusted_policy lowers source quality.
unknown session_policy lowers source quality.
OutcomeGraph must not compare bars from incompatible session policies without marking degradation.
```

Do not self-build a corporate action adjustment engine in P0. If more complete adjustment becomes necessary, evaluate mature data providers or quant libraries first.

## 3. Library-First Quant Primitives

Do not hand-write mature quant/time-series primitives unless a later review proves existing libraries are inadequate.

Preferred direction:

```text
workflow runtime / checkpoint / HITL:
  LangGraph

exchange calendars / holidays / trading sessions:
  pandas-market-calendars or exchange-calendars

technical indicators / candlestick patterns:
  TA-Lib or another mature indicator library once feature set grows

historical scans / vectorized strategy exploration:
  vectorbt spike before custom runners

full backtest / matching / execution simulation:
  evaluate NautilusTrader / LEAN / Backtrader first

embedding / vector search:
  use a mature vector index/database extension if FTS5 becomes insufficient
```

The project owns the semantic integration layer, not the generic quant primitive layer.

## 4. Replay And Deterministic Test Harness

Every workflow that affects learning must eventually be replayable.

Replay inputs should be fixed:

```text
market data fixture
provider metadata fixture
ContextSnapshot fixture
model mock or recorded model output
tool trace fixture
outcome horizon fixture
clock/asof fixture
```

Replay goals:

```text
same input -> same ContextSnapshot
same ContextSnapshot + same model output -> same DecisionEnvelope
same market path -> same Outcome labels
same outcomes -> same EvaluationReport metrics
```

Review implication:

```text
Do not accept workflow code that can only be validated live against remote providers or live model calls.
```

## 5. Run Governance

Every long-running workflow should have explicit runtime governance.

Required fields:

```text
run_id
graph_name
symbol or symbol_set
asof
status
started_at
updated_at
completed_at
budget_profile
tool_budget
model_budget
vlm_budget
retry_count
error_code
resume_token or checkpoint_ref
```

Statuses should be explicit:

```text
queued
running
interrupted
waiting_for_human
succeeded
failed
cancelled
skipped
```

Do not silently downgrade failures into partial success. Partial results must be marked with quality flags and error metadata.

## 6. HITL Gates

Human-in-the-loop should be explicit and auditable.

Confirmed gates:

```text
deep mode approval
rerun request approval
future broker execution approval
future promotion approval
```

If the `ExecutionIntent` candidate is promoted while execution remains simulation-only, proposed config is:

```text
require_human_approval_for_execution_intent = false
broker_execution_enabled = false
```

Even when approval is disabled in that future contract, records must show:

```text
approval_required = false
human_gate_status = not_required_by_config
execution_mode = simulation_only
broker_execution_enabled = false
```

Future broker order creation must require:

```text
broker_execution_enabled == true
human_gate_status == approved
```

## 7. Dataset Hygiene And Leakage Control

Learning data must preserve time boundaries.

Every training/evaluation example should carry:

```text
asof
data_available_at
label_maturity_time
context_snapshot_id
decision_id
outcome_id
model_role
model_profile
context_quality
provider_quality_flags
```

Leakage rules:

```text
DecisionGraph can only consume evidence available at or before asof.
Outcome labels must not be visible to DecisionGraph.
Evaluation summaries must not rewrite historical ContextSnapshot weights.
LearningDatasetBuilderGraph must separate input context from future labels.
```

If an input item was ingested after `asof`, it cannot be used as decision context for that run.

## 8. Evaluation Integrity

Evaluation must keep paths separate.

Paths:

```text
market_judgment_path
trade_action_path
execution_intent_path
human_override_path
policy_override_path
```

Do not aggregate these into a single "model performance" score too early.

Evaluation reports can recommend policy changes, but cannot automatically:

```text
edit weighting policy
edit benchmark policy
train challenger model
promote model
```

## 9. Trace Policy

Trace is audit evidence, not primary decision context.

DecisionGraph consumes:

```text
final_weighted_context
context_quality_summary
```

DecisionGraph should not consume the full:

```text
gather_trace
tool_trace
model_call_trace
```

Those traces are stored for review, replay, debugging, and dataset audit.

## Review Checklist

Future specs and code-task prompts should verify:

```text
Does this change preserve asof/data_available_at boundaries?
Does this change make provider quality visible?
Does this change avoid hand-writing mature quant primitives?
Can this workflow be tested with fixtures/mocks?
Are HITL gates explicit and auditable?
Are evaluation paths separated?
Are traces stored without polluting the final decision context?
```
