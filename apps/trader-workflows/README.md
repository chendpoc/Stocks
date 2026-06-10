# Trader Workflows

中文文档：[README.zh-CN.md](./README.zh-CN.md)

`apps/trader-workflows` is the LangGraph workflow runtime package for the
trader-agent system.

The current product direction is workflow + CLI/TUI + backend/shared contracts.
This package owns graph execution, checkpointable runs, and workflow-level
composition. It does not own backend persistence rules, RulePack activation,
broker execution, or UI surfaces. In the two-layer target architecture, this
package is part of the AI Analysis Layer.

Project-wide agent engineering principles live in
[08-agent-engineering-principles-proposal.md](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md).
Apply them before adding long-running runs, subagents, MCP/tool surfaces, skills,
or alpha research workflow features.

Current backlog focus is workflow maturity:
[project-docs/backlog/workflow-maturity-roadmap.md](../../project-docs/backlog/workflow-maturity-roadmap.md).

## Current Status (2026-06)

| Area | State |
|---|---|
| Native LangGraph graphs | Five graphs in `langgraph.json`: `decision_graph`, `outcome_graph`, `evaluation_graph`, `insight_exploration_graph`, `alpha_research_graph` |
| DecisionGraph maturity v1 | Operator inspection done: `runs show` context summary, `context snapshots list/show`, structured LLM thesis prompts |
| Runtime observability v1 | T017 done: `runs monitor` and `runs trace` bounded read models |
| Feedback loop graphs | [T010–T012](../../.agent-dev/tasks/) maturity v1 **done** (Outcome → Evaluation → Insight) |
| AlphaResearchGraph v0 | Implemented (T013 done) |
| Roadmap target | Two-layer system: AI Analysis Layer now, Execution Simulation Layer later |
| Analysis workflow target | `DecisionWorkflow`, `FeedbackLearningWorkflow`, `AlphaValidationWorkflow` |

**Product north star (this package):** verifiable market reading, repeatable pattern
discovery, and outcome-linked learning—not broker execution or automatic RulePack
promotion. The analysis layer may produce opportunity maps, risk envelopes,
exploration plans, and execution policies, but it must not submit orders.
Execution and approval automation are out of scope for the current phase; see
roadmap non-goals.

## Two-Layer System Target

The broader product target is documented in
[Two-Layer Market Analysis And Execution System](../../project-docs/backlog/two-layer-market-analysis-and-execution-system.md).

| Layer | Core function | Primary artifacts | Boundary |
|---|---|---|---|
| AI Analysis Layer | Interpret market context, monitor compact live state, form judgments, learn from outcomes, and validate rule candidates. | `ContextSnapshot`, `DecisionEnvelope`, `EvaluationReport`, `InsightCandidate`, `RuleCandidate`, `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, `ExecutionPolicy` | No direct order submission. This package owns the LangGraph workflow side. |
| Execution Simulation Layer | Consume quote/depth/trade streams, simulate orders, track fills, positions, PnL, and execution quality. | `QuoteSnapshot`, `OrderBookSnapshot`, `TradeTick`, `MarketStateSnapshot`, `OrderIntent`, `RiskDecision`, `OrderEvent`, `PositionSnapshot`, `ExecutionFeedback` | Deterministic order state machine. Future live broker path requires approval and risk gates. |

Layer handoff:

```text
Analysis Layer
OpportunityMap / RiskEnvelope / ExplorationPlan / ExecutionPolicy
  -> focused paper or shadow exploration
  -> OrderEvent / PositionSnapshot / ExecutionFeedback
  -> FeedbackLearningWorkflow
```

Real-time market data belongs to `LiveMarketDataPlane`, not to a tick-by-tick
LLM loop. AI nodes should consume compact market state snapshots, anomaly
summaries, and typed evidence.

## Quick Start

From repo root (requires `TRADER_API_BASE`, `LLM_API_KEY`, intel backend up):

```bash
cd apps/trader-workflows
npm test
npm run workflows -- decide TSLA.US --json
npm run workflows -- memory init --json
npm run workflows -- context bootstrap --symbol TSLA --json
npm run workflows -- context latest --symbol TSLA --json
npm run workflows -- decisions list --symbol TSLA --limit 20 --json
npm run workflows -- outcomes list --symbol TSLA --limit 20 --json
npm run workflows -- outcomes run --due --limit 50 --json
npm run workflows -- eval summary --symbol TSLA.US --json
npm run workflows -- insights explore --symbol TSLA.US --window 30d --json
npm run workflows -- insights list --symbol TSLA --json
npm run workflows -- pattern-memory list --symbol TSLA --json
npm run workflows -- pattern-memory promote --pattern-memory-id pm-test --confirm --json
npm run workflows -- pattern-memory degrade --pattern-id p-tsla --json
npm run workflows -- failure-memory list --symbol TSLA --json
npm run workflows -- market-monitor run --symbols TSLA --timeframes 5m --limit 3 --min-required 2 --json
npm run workflows -- market-data fetch --symbol TSLA --timeframe 5m --limit 3 --min-required 2 --json
npm run workflows -- market-data health --symbol TSLA --json
npm run workflows -- market-data quality --symbol TSLA --timeframe 5m --min-required 2 --json
npm run workflows -- runs show RUN_ID --json
npm run workflows -- runs monitor --status interrupted --limit 20 --json
npm run workflows -- runs trace RUN_ID --json
npm run workflows -- context snapshots list --symbol TSLA.US --json
```

LangGraph Studio (all five native graphs):

```bash
cd apps/trader-workflows
npm run studio
```

Studio input must be top-level JSON (not wrapped in an `input` field), for example:

- `decision_graph`: `{ "symbol": "TSLA.US" }`
- `outcome_graph`: `{ "limit": 50, "symbol": "TSLA" }`
- `evaluation_graph`: `{ "symbol": "TSLA", "model_version": "stage1-v0", "limit": 500 }`
- `insight_exploration_graph`: `{ "symbol": "TSLA", "window": "30d" }`
- `alpha_research_graph`: `{ "insight_id": "ins-1", "symbol": "TSLA", "thesis": "sharp drop may stabilize", "evidence_refs": [{ "ref_type": "signal", "ref_id": "sig-1" }], "alpha_seed": { "schema_version": "alpha_seed.v1", "candidate_family": "mean_reversion", "mechanism": "sharp drop may stabilize", "trigger_hint": "sharp adverse move", "entry_condition_hint": "measure_next_bar_after_trigger_2m", "invalidation_hint": "adverse move resumes", "required_evidence_hint": ["market_bars:TSLA"] }, "backtest_window_start": "2026-05-22", "backtest_window_end": "2026-05-22" }`

Loads env from repo root via `langgraph.json`. Alpha research also needs trader-agent backend `POST /api/rule-candidates` (set `TRADER_RULE_CANDIDATES_API_BASE` if not on default `http://127.0.0.1:8000/api/rule-candidates`).

## Workflow Catalog

Blank doc cells mean the workflow has no standalone development doc yet.

Within the AI Analysis Layer, future planning should start from three product
workflow lanes. Existing graph names are implementation artifacts inside those
lanes, not a mandate to keep adding standalone graphs.

| Target workflow | Core function | Core chain | Current implementation artifacts |
|---|---|---|---|
| `DecisionWorkflow` | Make the current market judgment from bounded context. | `context -> decision -> schedule future outcome` | `DecisionGraph`, `Stage1Runtime`, context snapshot inspection |
| `FeedbackLearningWorkflow` | Verify past judgments, summarize what failed or worked, and propose new insight candidates. | `due outcomes -> label results -> evaluate patterns -> propose insights` | `OutcomeGraph`, `EvaluationGraph`, `InsightExplorationGraph` |
| `AlphaValidationWorkflow` | Validate whether an insight can become a rule candidate. | `insight -> rule candidate -> lite backtest -> safe review state` | `AlphaResearchGraph v0`, backend Rule Discovery / Lite Backtest |

| Workflow | Status | Doc |
|---|---|---|
| `Stage1Runtime` | implemented | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `DecisionGraph` | implemented (maturity v1 operator slice done) | [DecisionGraph maturity v1](../../project-docs/backlog/now/decision-graph-maturity-v1.md) |
| `OutcomeGraph` | implemented artifact of `FeedbackLearningWorkflow` | [T010: OutcomeGraph Maturity v1](../../.agent-dev/tasks/T010-outcome-graph-maturity-v1.md) |
| `EvaluationGraph` | implemented artifact of `FeedbackLearningWorkflow` | [T011: EvaluationGraph Maturity v1](../../.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md) |
| `InsightExplorationGraph` | implemented artifact of `FeedbackLearningWorkflow` | [T012: InsightExplorationGraph Maturity v1](../../.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md) |
| `AlphaResearchGraph` | implemented v0 artifact of `AlphaValidationWorkflow` | [T013: AlphaResearchGraph v0](../../.agent-dev/tasks/T013-alpha-research-graph-v0.md) |
| `MarketJudgmentGraph` | deferred; operator view unless split-boundary test passes |  |
| `ModelLearningGraph` | deferred; later gated capability unless split-boundary test passes |  |
| `ReflectionGraph` | deferred; feedback report/proposal sections unless split-boundary test passes | [Reflection Engine](../../project-docs/research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md) |
| `RuntimeOrchestrator` | backend dependency | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Rule Discovery / Lite Backtest` | backend dependency | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Memory Review / Activation` | backend dependency | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Audit / Rebuild Workflow` | backend dependency | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Approval / Capability Gate` | backend dependency |  |

## Project Milestones And Delivery Plan

The remaining roadmap is dependency-ordered, not table-order driven. Use a
**strict serial gate** while shared contracts are still moving. The target is to
build the full loop from market facts to analysis, paper execution, execution
feedback, and learning.

| Milestone | Goal | Deliverable | Exit Criteria |
|---|---|---|---|
| M0 Analysis Core Closeout | Close the current analysis-layer work and lay the permanent memory foundation before adding execution scope | T010-T013 status alignment, review blocker closeout, workflow README/roadmap consistency, `pattern_memories` + `failure_memories` + `session_context_packs` tables as analysis-layer permanent memory base | `DecisionWorkflow -> FeedbackLearningWorkflow -> AlphaValidationWorkflow` is inspectable, documented, and not drifting; pattern lifecycle (candidate→active→degraded→retired) and failure memory are durable |
| M1 Analysis-to-Execution Contract | Define how analysis can guide execution without becoming order control | [`OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, `ExecutionPolicy` spec](../../project-docs/backlog/now/analysis-to-execution-contract-v0.md) | AI outputs opportunity/risk/constraints only; no artifact can be interpreted as a broker order command |
| M2 LiveMarketDataPlane v0 | Establish the real-market fact inlet | [`QuoteSnapshot`, `OrderBookSnapshot`, `TradeTick`, `MarketStateSnapshot`, provider trace, quality flags, replay/inspection contract](../../project-docs/backlog/now/live-market-data-plane-v0.md) | Read-only quote/depth/trade data can be normalized, inspected, and replayed without order execution |
| M3 PaperTradingEngine v0 | Build the deterministic simulated order core | `OrderIntent`, `RiskDecision`, `OrderEvent`, `PositionSnapshot`, PnL/slippage model, replay tests | Given market state plus policy, order state, fills, position, and PnL are reproducible |
| M4 Guided Paper Exploration | Let analysis focus local paper/shadow exploration | `ExecutionPolicy -> RiskGate -> PaperTradingEngine -> ExecutionFeedback` path | Paper/shadow exploration runs only inside approved opportunity/risk boundaries and produces execution feedback |
| M5 Execution Feedback Learning | Feed execution reality back into analysis | `ExecutionFeedback` evaluation inputs, report sections, insight/rule-candidate improvement handoff | Reports can distinguish judgment quality, rule edge, execution feasibility, slippage, and risk behavior |
| M6 Operator Surface And Approval Gate | Make risk boundaries operable by a human | CLI/TUI/cockpit inspection, approval requests, kill switch, audit trail | High-risk actions are inspectable, rejectable, and auditable before activation or execution |
| M7 Shadow / Live Broker Gate | Consider real broker integration only after paper evidence matures | Broker adapter spec, minimal shadow/live pilot plan, capability policy | No live path exists unless M1-M6 evidence is accepted and an explicit approval gate is implemented |

Delivery policy:

1. M0 closes the current analysis layer with permanent memory infrastructure.
   T010-T013 are aligned across task/spec/README; `pattern_memories`,
   `failure_memories`, and `session_context_packs` tables provide the durable
   memory foundation used by `FeedbackLearningWorkflow` and future
   `SessionContextBootstrap`. Do not reopen graph splits without a reviewed
   boundary.
2. M1 is the first new design slice. It must define `OpportunityMap`,
   `RiskEnvelope`, `ExplorationPlan`, and `ExecutionPolicy` before execution
   simulation work starts.
3. `LiveMarketDataPlane` contract work is done, but implementation must first
   pass the M2
   [implementation decision gate](../../project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md)
   before `PaperTradingEngine` depends on it.
4. Paper/shadow execution must use deterministic state transitions; LLMs must
   not sit in the tick-by-tick order path.
5. Do not split `MarketJudgmentGraph`, `ReflectionGraph`, or
   `ModelLearningGraph` into standalone implementation work unless a reviewed
   spec proves a distinct timing, risk, approval, source-of-truth, or recovery
   boundary.
6. Backend work is not a separate last phase. Each milestone may add
   the smallest backend slice required by that workflow's acceptance criteria.
7. Broker adapter work is M7 only. It requires accepted paper/shadow evidence,
   an approval gate, and a reviewed implementation spec.

## Execution And Management Model

Use the three workflow lanes as an operator routine and analysis layer, not as
autonomous trading automation.

| Workflow lane | When it runs | Who/what triggers it | Primary artifacts | How operators use it |
|---|---|---|---|---|
| `DecisionWorkflow` | On-demand or scheduled market read windows | CLI/TUI/operator scheduler | `ContextSnapshot`, `DecisionEnvelope`, scheduled future outcomes | Review the current judgment, evidence refs, and pending outcomes; no trade execution by default |
| `FeedbackLearningWorkflow` | After outcomes are due, plus daily/weekly review windows | scheduler or operator review command | finalized outcome labels, `EvaluationReport`, `InsightCandidate` | Check what worked/failed and decide which insight candidates deserve alpha validation |
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
6. Execution guidance must be expressed as `OpportunityMap`, `RiskEnvelope`,
   `ExplorationPlan`, or `ExecutionPolicy`; workflows must not emit broker order
   commands.

## Architecture

```text
Operator Surface
apps/trader-cli / future TUI
  |
  v
AI Analysis Layer
Workflow Runtime
apps/trader-workflows
  |
  |-- Stage1Runtime                 [implemented]
  |
  |-- DecisionWorkflow
  |   `-- DecisionGraph             [implemented]
  |
  |-- FeedbackLearningWorkflow
  |   |-- OutcomeGraph              [implemented artifact]
  |   |-- EvaluationGraph           [implemented artifact]
  |   `-- InsightExplorationGraph   [implemented artifact]
  |
  |-- AlphaValidationWorkflow
  |   `-- AlphaResearchGraph        [implemented artifact: v0]
  |
  |-- Market / Reflection / Model views
      `-- deferred unless a split-boundary spec proves they need standalone workflows
  |
  v
Backend / Shared Platform
apps/trader-agent/backend
apps/trader-agent/shared
  |
  |-- RuntimeOrchestrator           [implemented, non-LangGraph]
  |-- Rule Discovery / Lite Backtest [implemented / partial]
  |-- Memory Review / Activation    [implemented / partial]
  |-- Audit / Rebuild Workflow      [implemented]
  |-- Approval / Capability Gate    [partial schema, workflow pending]
  |
  v
Execution Simulation Layer          [future spec track]
  |-- LiveMarketDataPlane
  |-- PaperTradingEngine
  |-- RiskGate
  |-- OrderEventStore
  `-- BrokerAdapter                 [future, approval-gated]
```

## Implemented Workflows

### Stage1Runtime

`Stage1Runtime` is the workflow runtime foundation. It creates workflow runs,
records checkpoints, supports run inspection, and resumes interrupted runs.

Responsibilities:

- create durable `workflow_runs`;
- write workflow checkpoints;
- expose `runs list`, `runs show`, `runs resume`, `runs monitor`, and
  `runs trace` primitives;
- connect native LangGraph checkpointing to the local runtime store;
- keep graph execution observable without pushing execution logic into CLI/TUI.

#### CLI: `runs show`

Use `npm run workflows -- runs show RUN_ID --json` (or `trader-workflows`). The
envelope is `{ ok, command, run_id, status, data: { run } }`.

For **DecisionGraph** runs, `data.run.output` is bounded and includes
`context_snapshot`:

```json
{
  "snapshot_id": "snap-…",
  "decision_id": "dec-…",
  "action": "NO_TRADE",
  "scheduled_outcome_count": 5,
  "paper_execution_submitted": false,
  "context_snapshot": {
    "snapshot_id": "snap-…",
    "context_hash": "…",
    "context_version": "stage1-context-v0",
    "item_count": 12,
    "evidence_ref_count": 10,
    "source_type_counts": { "signal": 2, "event": 1 }
  }
}
```

Other graphs keep their own bounded `output` shapes.

#### CLI: `runs monitor` and `runs trace`

Use `npm run workflows -- runs monitor [--status STATUS] [--graph-name NAME]
[--limit N] --json` to list bounded run-monitor summaries (`limit` max 200). Each
`data.runs[]` item includes run identity, status, current node, timestamps,
`duration_ms`, `checkpoint_count`, `latest_checkpoint_ref`, `has_error`,
`latest_error`, and `resumable`; it does not expose raw input or output.

Use `npm run workflows -- runs trace RUN_ID --json` to inspect one run's
execution chain. The envelope is
`{ ok, command, run_id, status, data: { run, checkpoints, output_summary,
resume_hint } }`. Checkpoints are ordered by `seq` and contain compact
`state_summary` metadata, not raw checkpoint state. This command is read-only:
it does not retry, replay, cancel, approve, or edit workflow execution.

### DecisionGraph

`DecisionGraph` is a **native LangGraph** workflow (`decision_graph` in
`langgraph.json`). It is the structured decision entry point for Stage1.

Graph shape:

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

Responsibilities:

- normalize `symbol`, `asof_ts`, and `run_id` on input;
- build or fetch a weighted **context snapshot** (top items sent to the LLM);
- call the bounded LLM path (`createWorkflowLlmProvider` in `src/llm/provider.ts`);
- validate the **DecisionEnvelope** (`src/llm/decisionEnvelope.ts`);
- persist the model decision with **`decision_id` derived from `snapshot_id`**
  (idempotent replay for the same snapshot);
- schedule **five** model-path outcomes (`30m`, `1h`, `EOD`, `1d`, `3d`);
- return evidence references for downstream review and evaluation.

`paper_execution_submitted` is always `false` in the current slice (no order
submission).

It is a decision workflow, not the full alpha-discovery workflow. It decides
from available context; it does not discover, validate, and promote new factors.

#### LLM prompts and thesis format

Default thesis style is **structured** (fixed Chinese line labels:
`时点` / `周期` / `事实` / `判断` / optional `风险`), aligned with snapshot
`asof_ts` and daily-primary context rules. A legacy **one-paragraph** prompt is
retained in code but not enabled unless
`DECISION_THESIS_PROMPT=v0_paragraph` is set (dev/rollback only).

Relevant environment variables (see repo `.env.example`):

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | Provider (default DeepSeek-compatible chat completions) |
| `DECISION_PROMPT_TZ` | Decision clock in prompts (default `Asia/Shanghai`, US fallback on format error) |
| `DECISION_THESIS_PROMPT` | `v0_paragraph` to use legacy thesis guide |
| `DECISION_LLM_THINKING` | Set `1` to enable DeepSeek V4 thinking mode (default off for JSON stability) |

DeepSeek V4 responses may place JSON in `reasoning_content`; the provider reads
`content` first, then `reasoning_content`, and retries once on empty content.

#### CLI: `decide` and `context snapshots`

`decide SYMBOL [--json]` — runs DecisionGraph via `Stage1Runtime`, returns
`snapshot_id`, `decision_id`, `action`, `scheduled_outcome_count`, and
`paper_execution_submitted`.

#### CLI: `context snapshots` (read-only)

Inspect persisted context snapshots without loading full raw payloads.

`context snapshots list --symbol SYMBOL [--limit N] --json` — lists recent
snapshots for a symbol (default `limit` 20). Each `data.snapshots[]` entry:

```json
{
  "snapshot_id": "snap-…",
  "symbol": "TSLA",
  "asof_ts": "2026-06-01T12:00:00.000Z",
  "context_hash": "…",
  "context_version": "stage1-context-v0",
  "item_count": 12,
  "evidence_ref_count": 10,
  "source_type_counts": { "signal": 2 }
}
```

`context snapshots show SNAPSHOT_ID --json` — one summary (same fields as list)
plus `data.top_items` (up to 5 items by `composite_weight`):

```json
{
  "item_id": "signal:sig-1",
  "source_type": "signal",
  "summary": "Breakout signal",
  "composite_weight": 0.7,
  "evidence_ref": { "ref_type": "intel_signal", "ref_id": "sig-1", "symbol": "TSLA" }
}
```

### OutcomeGraph

`OutcomeGraph` is a **native LangGraph** workflow (`outcome_graph` in
`langgraph.json`). It also runs via CLI (`outcomes run --due`). It closes
pending decision outcomes and insight candidate outcomes once enough market data
is available.

Graph shape:

```text
normalize_input
-> fetch_due_outcomes
-> label_decision_outcomes
-> label_insight_outcomes
-> final_output
```

Responsibilities:

- find due pending decision outcomes and insight candidate outcomes;
- label realized result with normalized labels (`hit`/`miss`/`neutral`/`invalid`/`insufficient_data`);
- when fresh evidence is needed, build compact evidence summaries (capped at 15 lines);
- avoid mutating context snapshots;
- produce counts for finalized, skipped, and failed outcomes, broken down by source type and normalized label.

This graph is the first feedback loop. Without it, the system can make
decisions but cannot learn whether those decisions worked.

### EvaluationGraph

`EvaluationGraph` is a **native LangGraph** workflow (`evaluation_graph` in
`langgraph.json`). It also runs via CLI (`eval summary`).

Graph shape:

```text
normalize_input
-> build_evaluation_report
-> persist_evaluation_report
-> final_output
```

Responsibilities:

- aggregate decision outcome and insight candidate outcome performance;
- build evaluation reports with structured sections (decision_performance,
  insight_candidate_performance, top_positive_patterns, top_negative_patterns,
  failure_modes, data_gaps, evidence_refs);
- evaluate rule or model behavior from recorded facts;
- avoid automatic model promotion or configuration mutation.

The graph can recommend `hold` or `needs_more_data`. It must not silently
promote a model, change production behavior, or mutate active RulePack policy.

#### CLI: `eval summary`

Use `npm run workflows -- eval summary --symbol TSLA.US --json`. The envelope is
`{ ok, command, run_id, status, data }` where `data` includes bounded report
fields plus structured `sections` (decision_performance,
insight_candidate_performance, top_positive_patterns, top_negative_patterns,
failure_modes, data_gaps, evidence_refs).

### InsightExplorationGraph

`InsightExplorationGraph` is a **native LangGraph** workflow
(`insight_exploration_graph` in `langgraph.json`). It also runs via CLI
(`insights explore --symbol … --window …`).

Graph shape:

```text
normalize_input
-> fetch_exploration_inputs
-> run_insight_react
-> build_insight_payload
-> persist_insight_candidate  (persist + schedule outcome)
-> final_output
```

Responsibilities:

- inspect context snapshots and historical outcomes (evaluation-driven
  exploration; never reads raw market/news data directly);
- generate bounded `InsightCandidate` records;
- attach evidence references;
- schedule an `InsightCandidateOutcome` after each candidate is persisted
  (`POST /insight-candidate-outcomes/schedule`), enabling downstream
  `OutcomeGraph` to label the insight once due;
- enforce horizon whitelist constraint (`1m`/`2m`/`5m`/`30m`/`1h`/`2h`/`4h`;
  default `2m` when semantics are ambiguous);
- enforce proposal weight caps and forbidden capability boundaries;
- avoid trade execution, model training, promotion, RuleCandidate generation,
  RulePack mutation, lesson activation, or direct lesson mutation.

Stage1 API contracts (workflow client in `insightCandidates.ts` / `outcomes.ts`):

- **Persist** (`POST /insight-candidates`): top-level fields match backend
  `InsightCandidateInput` (`insight_id`, `run_id`, `symbols_json`, window bounds,
  `thesis`, `evidence_refs_json`, `verification_status`, `weight_cap`,
  `candidate_json`). Exploration metadata (`origin_category`, `horizon`,
  `horizon_source`) lives inside `candidate_json`, not as extra top-level
  columns.
- **Schedule** (`POST /insight-candidate-outcomes/schedule`): request body is
  `{ outcomes: [{ insight_id, symbol, horizon, evidence_refs_json,
  reason_codes_json, outcome_json? }] }`; response is
  `{ items: [...], count }`. Backend derives `due_at`; this graph only schedules.

Partial-failure semantics: `persist_insight_candidate` always persists first,
then schedules. If scheduling fails after a successful persist, the node throws
`InsightSchedulingError` (`insight_id`, `horizon`, `persisted: true`,
`schedulePayload`, `cause`). Recovery is an idempotent retry of schedule with
the same `insight_id` + `horizon`—no silent downgrade.

Optional graph input: `evaluation_report_id` loads a bounded `EvaluationReport`
to derive `origin_category` and exploration context; fetch failure is non-fatal.

#### CLI: `insights explore`

Use `npm run workflows -- insights explore --symbol TSLA.US --window 30d --json`.
The envelope is `{ ok, command, run_id, status, data }` where `data` includes
`insight_id`, window bounds, `react_step_count`, `thesis`, `verification_status`,
`weight_cap`, `evidence_ref_count`, `persisted_candidate`, `scheduled_outcome_id`,
and `scheduled_outcome_horizon`.

This is the implemented entry closest to alpha discovery. It produces candidate
insights, but it does not complete the formal alpha research and lite backtest
chain.

### AlphaResearchGraph

Status: implemented (v0), task [T013](../../.agent-dev/tasks/T013-alpha-research-graph-v0.md).

`AlphaResearchGraph v0` is the formal alpha validation workflow, not the full
research-agent harness. Run via LangGraph Studio (`alpha_research_graph`) or
`runAlphaResearchGraph()`; **no CLI subcommand in v0**.

v0 responsibilities:

- accept a standard `AlphaResearchInput` that already carries `insight_id`,
  `symbol`, `thesis`, `evidence_refs`, `alpha_seed`, and a backtest window;
- validate the input and stop as `input_validation_failed` when required fields
  are missing (distinct from backend `needs_more_data`);
- create a structured `RuleCandidate` through `POST /api/rule-candidates`;
- orchestrate evidence validation, lite backtest, advance, and report fetch inside
  the `run_lite_backtest` node;
- return `rule_candidate_id`, `lite_backtest_report_id`, final candidate status,
  and safety flags.

v0 graph shape:

```text
validate_input
-> create_rule_candidate
-> run_lite_backtest
```

Not in v0:

- no context hydrate node;
- no open-ended research loop;
- no LLM wording or normalization node;
- no missing-field backfill flow;
- no CLI wrapper.

The research-agent version is tracked separately as
[AlphaResearchAgent v1](../../project-docs/backlog/later/alpha-research-agent-v1.md).

## Deferred Split Candidates

### MarketJudgmentGraph

Status: deferred as a standalone workflow.

Market judgment should first be modeled as an operator-facing view over
`DecisionWorkflow` and `FeedbackLearningWorkflow` artifacts.

Expected responsibilities:

- summarize current market context;
- produce `MarketRead`;
- identify opportunity bias;
- build watchlists;
- define triggers and invalidations;
- surface risk warnings for CLI/TUI review.

Only split it into `MarketJudgmentGraph` if a reviewed spec proves a distinct
timing, risk, source-of-truth, recovery, or approval boundary. It must not become
an alternate alpha discovery path.

### ModelLearningGraph

Status: deferred as a standalone workflow.

Model learning is a later gated capability, not the next workflow target.

Expected responsibilities:

- run offline training jobs for a bounded model target;
- track checkpoints;
- run walk-forward validation;
- evaluate challenger models out of sample;
- emit promotion recommendations.

Safety boundary:

- no direct trading;
- no automatic model promotion;
- no hidden model switch in CLI, backend API, workflow scheduler, or runtime;
- every checkpoint, metric, and recommendation must be auditable.

The first reasonable target remains `opportunity_ranking_model`, not a complete
trading-policy model. Do not split this into a standalone workflow until
approval, audit, dataset, checkpoint, and promotion boundaries are explicit.

### ReflectionGraph

Status: deferred as a standalone workflow; backend module docs are mature, but
reflection should first live as report and proposal sections inside
`FeedbackLearningWorkflow`.

Expected responsibilities:

- run daily learning summaries;
- run weekly reflection;
- aggregate setup and ticker performance;
- analyze mistakes and missing evidence;
- create rule proposal drafts;
- hand candidates to Rule Discovery / Lite Backtest.

Safety boundary:

- no automatic rule activation;
- no direct Risk Engine policy mutation;
- no black-box strategy changes.

Only split reflection into its own workflow if it needs a separate cadence,
approval gate, recovery semantics, or source-of-truth ownership.

## Backend Workflows This Package Depends On

### RuntimeOrchestrator

Status: implemented in `apps/trader-agent/backend`, not as LangGraph.

It runs backend scan pipelines with `run_id` and `agent_events`.

Responsibilities:

- run symbol or universe scans;
- call market snapshot, setup detection, rule/scoring/risk, and signal modules;
- write step-level `agent_events`;
- provide run list and run detail APIs.

Future work should align `RuntimeOrchestrator` run/event semantics with
`Stage1Runtime` so CLI/TUI does not see two incompatible run worlds.

### Rule Discovery / Lite Backtest

Status: implemented / partial in backend.

It is the validation boundary for alpha research.

Responsibilities:

- create `RuleCandidate`;
- record evidence requirements;
- run lite backtests;
- write `LiteBacktestReport`;
- block candidate activation without manual approval and versioning.

`AlphaResearchGraph` should reuse this backend capability instead of rebuilding
rule validation inside the workflow package.

### Memory Review / Activation

Status: implemented / partial in backend.

It manages long-term financial memory.

Responsibilities:

- create memory candidates;
- support human review;
- activate, reject, merge, or mark conflicts;
- block silent agent updates to active memory;
- record audit events.

Workflow graphs may consume active memory, but they must not silently activate
or overwrite memory.

### Audit / Rebuild Workflow

Status: implemented in backend.

It keeps artifact indexes and memory evidence references rebuildable.

Responsibilities:

- incremental rebuild;
- targeted artifact rebuild;
- FTS and section index maintenance;
- stale or unresolved evidence reference detection;
- rebuild status reporting.

### Approval / Capability Gate

Status: partial schema exists; complete workflow pending.

Expected responsibilities:

- approve high-risk tool calls;
- approve RulePack publication;
- approve model promotion;
- approve workflow candidate activation;
- record approver, timestamp, request payload, decision, and risk notes.

This gate must exist before workflow builder, agent-generated workflow
activation, broker-like execution, or automatic promotion work is pulled forward.

## Composition Rule

Future workflows should be composed as small graphs with typed boundaries, not
as one large mutable graph.

Preferred pattern:

```text
Parent runtime graph
  -> wrapper node maps parent state into subgraph input
  -> subgraph runs with its own internal state
  -> wrapper node maps typed output back to parent state
  -> audit event records the handoff
```

Parent state should stay small and stable:

```text
run_id
symbol / universe / window
context_snapshot_id
evidence_refs
signal_ids
insight_candidate_ids
rule_candidate_ids
report_ids
approval_request_ids
audit_event_ids
capability_scope
```

Subgraphs may have richer internal state, but their public output should be
bounded and typed.

## Safety Rules

- Agents can propose workflow candidates, but cannot silently activate them.
- Active workflows require explicit user confirmation.
- Tool calls must pass capability policy.
- Model learning can train and evaluate challenger models, but cannot promote
  them automatically.
- Rule discovery and reflection can propose candidates, but cannot write active
  RulePack entries without manual approval.
- Workflows cannot bypass Rule Engine, Risk Engine, readonly boundaries, or
  audit logging.
- Long-running workflow runs must leave typed artifacts and audit events, not
  rely on chat context for continuity.
- LLM nodes should consume compact evidence summaries and `EvidenceRef` links,
  not raw market datasets or large tool payloads.

## Verification

```bash
cd apps/trader-workflows && npm test
```

Focused LLM prompt tests: `src/llm/provider.test.ts`. Backend intel APIs must
be running for live `decide` / `context snapshots` commands against
`TRADER_API_BASE`.

## Related Backlog

- [Workflow feedback loop hardening](../../project-docs/backlog/now/workflow-feedback-loop-hardening.md) — Outcome / Evaluation / Insight handoff
- [Intraday 1m context (Later)](../../project-docs/backlog/later/intraday-1m-context-and-minute-analysis.md) — minute-level evidence; not owned by DecisionGraph ingestion
