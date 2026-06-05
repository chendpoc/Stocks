# Analysis-to-Execution Contract v0

> Source backlog: `project-docs/backlog/now/analysis-to-execution-contract-v0.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: done

## Purpose

Define T014 for M1 `Analysis-to-Execution Contract v0`.

M1 creates the contract between the AI Analysis Layer and the future Execution
Simulation Layer. It does not implement live market data ingestion, paper
trading, broker adapters, or a new LangGraph workflow.

The contract answers one question:

```text
How can analysis guide local market exploration without becoming an order?
```

## Source Docs

- `project-docs/backlog/now/analysis-to-execution-contract-v0.md`
- `project-docs/backlog/workflow-maturity-roadmap.md`
- `project-docs/backlog/two-layer-market-analysis-and-execution-system.md`
- `project-docs/research-agent/target-system/trader-agent/09-risk-gated-setup-intelligence-m0-prd.md`
- `UBIQUITOUS_LANGUAGE.md`

## Design Baseline

The system target is two layers:

```text
AI Analysis Layer
  -> OpportunityMap
  -> RiskEnvelope
  -> ExplorationPlan
  -> ExecutionPolicy

Execution Simulation Layer
  -> LiveMarketDataPlane
  -> RiskGate
  -> PaperTradingEngine
  -> OrderEventStore
```

M1 owns only the first four artifacts. The execution layer may consume these
artifacts later, but this task must not create order, broker, account, position,
or paper-trading behavior.

The first principle is:

```text
AI outputs opportunity, risk, and constraints.
Deterministic execution systems decide whether an order intent may exist.
```

## Confirmed Decisions

| Decision | Chosen rule | Why |
|---|---|---|
| D301 | M1 is contract-only. | Live data and paper trading need this handoff before implementation. |
| D302 | Analysis outputs are guidance, not orders. | Keeps LLM judgment out of the order path. |
| D303 | `ExecutionPolicy` may permit future paper/shadow exploration but must not include broker order commands. | Prevents semantic drift from policy into execution. |
| D304 | Missing required handoff fields produce `contract_validation_failed`. | Missing context should surface design/data problems instead of falling through. |
| D305 | Later `RiskGate` owns deterministic allow/reject/reduce decisions. | Risk cannot be a prompt reminder or an LLM-owned veto. |
| D306 | Handoffs use typed artifact IDs and stored facts. | Avoids hidden graph state or chat context as system memory. |
| D307 | M1 does not create a new LangGraph graph. | The contract is cross-layer schema and validation, not workflow topology. |

## Contract Principles

1. **No order semantics**: analysis artifacts must not contain direct buy/sell,
   order type, price, quantity, account, broker, or time-in-force instructions.
2. **Bounded validity**: every artifact has `created_at`, `valid_from`, and
   `expires_at` or an explicit invalidation condition.
3. **Evidence-linked**: every positive opportunity, risk override, or policy
   allowance must reference `EvidenceRef` values.
4. **Deterministic validation**: missing required fields stop the path as
   `contract_validation_failed`.
5. **Execution-gated**: future order simulation requires `ExecutionPolicy` plus
   `RiskGate`; `ExecutionPolicy` alone never creates an `OrderIntent`.
6. **Replayable**: artifact IDs and source run IDs are durable enough to replay
   why a later paper/shadow action was allowed.

## Artifact Contracts

### OpportunityMap

Purpose: identify where focused monitoring or later paper/shadow exploration is
worth attention.

Required fields:

```text
schema_version: analysis_to_execution_contract.v0
opportunity_map_id
source_workflow: decision | feedback_learning | alpha_validation | manual_review
source_run_id
created_at
valid_from
expires_at
focus_regions[]
evidence_refs[]
```

`focus_regions[]` required fields:

```text
region_id
symbol
market
timeframe
setup_family
direction_bias: long | short | neutral | avoid
priority: 0..100
reason_codes[]
evidence_refs[]
invalidation_hint
```

Allowed optional fields:

```text
watch_window
trigger_hint
liquidity_hint
notes
```

Forbidden fields:

```text
side
order_side
quantity
shares
contracts
notional
position_size
order_type
limit_price
entry_price
target_price
take_profit
stop_price
stop_loss
time_in_force
account_id
broker_order_id
live_execution
submit_order
cancel_order
replace_order
```

The forbidden list is semantic, not only exact-key matching. Any field, nested
field, enum value, or instruction that acts as executable side, size, order
type, price, broker/account, submit/cancel/replace, or live-trading intent must
be rejected even if it uses a synonym not listed above.

Allowed analysis-only fields such as `direction_bias`, `trigger_hint`,
`invalidation_hint`, and `stop_conditions` remain valid only while they describe
market conditions or invalidation logic, not executable order parameters.

### RiskEnvelope

Purpose: define the risk boundary for future observation, paper/shadow
exploration, or operator review.

Required fields:

```text
schema_version: analysis_to_execution_contract.v0
risk_envelope_id
source_run_id
created_at
valid_from
expires_at
scope
risk_limits
liquidity_constraints
event_blocks[]
invalidation_rules[]
evidence_refs[]
```

`scope` required fields:

```text
symbols[]
markets[]
timeframes[]
allowed_sessions[]
```

`risk_limits` may include bounded numeric fields such as:

```text
max_total_notional
max_symbol_notional
max_position_count
max_loss_per_intent_pct
max_daily_loss_pct
cooldown_seconds
```

`liquidity_constraints` may include:

```text
max_spread_bps
min_depth_notional
min_avg_volume
allow_outside_rth: false by default
```

`event_blocks[]` should use reason codes such as:

```text
earnings_window
halt_risk
news_pending
data_quality_gap
market_closed
provider_delay
```

### ExplorationPlan

Purpose: tell the execution simulation layer what to observe locally and which
conditions would make a paper/shadow path eligible for later risk checks.

Required fields:

```text
schema_version: analysis_to_execution_contract.v0
exploration_plan_id
opportunity_map_id
risk_envelope_id
created_at
valid_from
expires_at
target_symbols[]
observation_cadence
feature_requests[]
trigger_conditions[]
stop_conditions[]
evidence_refs[]
```

Allowed `observation_cadence` values for v0:

```text
1s
5s
1m
5m
```

Allowed `feature_requests[]` values for v0:

```text
quote
depth
trade
second_bar
minute_bar
spread
depth_imbalance
volume_burst
```

`ExplorationPlan` may request observation and may describe eligibility
conditions. It must not request order submission.

### ExecutionPolicy

Purpose: define the deterministic permission boundary that future execution
simulation must satisfy before paper/shadow exploration can occur.

Required fields:

```text
schema_version: analysis_to_execution_contract.v0
execution_policy_id
opportunity_map_id
risk_envelope_id
exploration_plan_id
created_at
valid_from
expires_at
allowed_modes[]
preconditions[]
risk_gate_requirements[]
operator_gate
audit_requirements[]
forbidden_actions[]
```

Allowed `allowed_modes[]` values for v0:

```text
observe_only
paper_simulation
shadow_tracking
```

Forbidden `allowed_modes[]` values for v0:

```text
live_trading
broker_submit
broker_cancel
broker_replace
```

`operator_gate` required fields:

```text
approval_required: boolean
approval_reason_codes[]
kill_switch_required: boolean
```

`audit_requirements[]` should require artifact refs for:

```text
source_run_id
opportunity_map_id
risk_envelope_id
exploration_plan_id
execution_policy_id
future_risk_decision_id
future_order_event_ids
```

`ExecutionPolicy` can permit future paper/shadow exploration only after all
preconditions and risk-gate checks pass. It cannot create `OrderIntent` by
itself.

## Validation Contract

M1 validation should be specified before implementation:

```text
validate OpportunityMap
validate RiskEnvelope
validate ExplorationPlan
validate ExecutionPolicy
validate cross-artifact references
reject forbidden order fields
emit AnalysisExecutionContractValidationReport
```

Validation failure status:

```text
contract_validation_failed
```

Validation failures must include:

```text
artifact_type
artifact_id?
field_path
reason_code
severity: error | warning
message
```

Blocking failures:

- missing required artifact ID;
- missing source run ID;
- missing validity window;
- missing evidence refs for opportunity or risk claims;
- `ExecutionPolicy` references missing `OpportunityMap`, `RiskEnvelope`, or
  `ExplorationPlan`;
- any forbidden order field is present;
- any semantic order command or order-field alias is present;
- `allowed_modes` contains live/broker modes;
- `expires_at <= valid_from`;
- no stop or invalidation condition is defined.

Warnings:

- low evidence count;
- broad symbol scope;
- unusually long validity window;
- permissive liquidity constraint;
- no operator approval despite high-risk reason code.

## Allowed Files

T014 may create or modify only documentation and spec artifacts:

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

Readonly context:

```text
.agent-dev/specs/alpha-research-graph/**
.agent-dev/specs/workflow-feedback-loop-maturity-v1/**
.agent-dev/tasks/T010-outcome-graph-maturity-v1.*
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.*
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.*
.agent-dev/tasks/T013-alpha-research-graph-v0.*
```

Forbidden:

```text
apps/trader-workflows/src/**
apps/trader-agent/backend/app/**
apps/trader-agent/backend/tests/**
apps/trader-cli/**
apps/trader-cockpit/**
apps/research-console/**
data/**
```

## Non-Goals

- No live market data provider implementation.
- No quote/depth/trade subscription code.
- No `PaperTradingEngine`.
- No `OrderIntent` implementation.
- No `RiskGate` implementation.
- No broker adapter.
- No account, position, order, or PnL storage.
- No new LangGraph graph.
- No CLI command.
- No LLM prompt changes.
- No automatic RulePack mutation, model promotion, or execution.

## Acceptance

1. The spec defines `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, and
   `ExecutionPolicy` with required fields, forbidden fields, and validation
   semantics.
2. The spec makes direct order semantics impossible in analysis artifacts.
3. `ExecutionPolicy` explicitly permits only observe-only, paper simulation, or
   shadow tracking modes in v0.
4. Missing required handoff context fails as `contract_validation_failed` and
   does not fall through to execution.
5. M2 `LiveMarketDataPlane` and M3 `PaperTradingEngine` are listed as future
   consumers, not as T014 implementation scope.
6. Backlog, roadmap, workflow README, task index, and Ubiquitous Language link
   to the same M1 contract.

## Verification

Planning/document gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/analysis-to-execution-contract-v0/clarification-questions.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.json | ConvertFrom-Json | Out-Null
rg -n "Analysis-to-Execution Contract|OpportunityMap|RiskEnvelope|ExplorationPlan|ExecutionPolicy" UBIQUITOUS_LANGUAGE.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md .agent-dev/specs/analysis-to-execution-contract-v0 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.md
git diff --check -- .agent-dev/specs/analysis-to-execution-contract-v0 .agent-dev/tasks/T014-analysis-to-execution-contract-v0.json .agent-dev/tasks/T014-analysis-to-execution-contract-v0.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md UBIQUITOUS_LANGUAGE.md
```

No implementation tests are required for T014 because it is a spec gate.
