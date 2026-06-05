# Trader Workflows

中文文档：[README.zh-CN.md](./README.zh-CN.md)

`apps/trader-workflows` is the LangGraph workflow runtime package for the
trader-agent system.

The current product direction is workflow + CLI/TUI + backend/shared contracts.
This package owns graph execution, checkpointable runs, and workflow-level
composition. It does not own backend persistence rules, RulePack activation,
broker execution, or UI surfaces.

Project-wide agent engineering principles live in
[08-agent-engineering-principles-proposal.md](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md).
Apply them before adding long-running runs, subagents, MCP/tool surfaces, skills,
or alpha research workflow features.

Current backlog focus is workflow maturity:
[project-docs/backlog/workflow-maturity-roadmap.md](../../project-docs/backlog/workflow-maturity-roadmap.md).

## Current Status (2026-06)

| Area | State |
|---|---|
| Native LangGraph graphs | `DecisionGraph` registered in `langgraph.json` as `decision_graph`; other workflows run via `Stage1Runtime` service wrappers |
| DecisionGraph maturity v1 | Operator inspection done: `runs show` context summary, `context snapshots list/show`, structured LLM thesis prompts |
| Feedback loop graphs | `OutcomeGraph`, `EvaluationGraph`, `InsightExplorationGraph` implemented with tests; maturity hardening in [T010–T012](../../.agent-dev/tasks/) |
| Alpha / judgment / reflection | Planned; see backlog **Now** / **Next** / **Later** |

**Product north star (this package):** verifiable market reading, repeatable pattern
discovery, and outcome-linked learning—not broker execution or automatic RulePack
promotion. Execution and approval automation are out of scope for the current
phase; see roadmap non-goals.

## Quick Start

From repo root (requires `TRADER_API_BASE`, `LLM_API_KEY`, intel backend up):

```bash
cd apps/trader-workflows
npm test
npm run workflows -- decide TSLA.US --json
npm run workflows -- runs show RUN_ID --json
npm run workflows -- context snapshots list --symbol TSLA.US --json
npm run workflows -- outcomes run --due --limit 50 --json
npm run workflows -- eval summary --symbol TSLA.US --json
npm run workflows -- insights explore --symbol TSLA.US --window 30d --json
```

LangGraph Studio (DecisionGraph only):

```bash
cd apps/trader-workflows
npm run studio
```

Studio input must be top-level JSON, for example `{ "symbol": "TSLA.US" }` (not
wrapped in an `input` field). Loads env from repo root via `langgraph.json`.

## Workflow Catalog

Blank doc cells mean the workflow has no standalone development doc yet.

| Workflow | Status | Doc |
|---|---|---|
| `Stage1Runtime` | implemented | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `DecisionGraph` | implemented (maturity v1 operator slice done) | [DecisionGraph maturity v1](../../project-docs/backlog/now/decision-graph-maturity-v1.md) |
| `OutcomeGraph` | implemented | [T010: OutcomeGraph Maturity v1](../../.agent-dev/tasks/T010-outcome-graph-maturity-v1.md) |
| `EvaluationGraph` | implemented | [T011: EvaluationGraph Maturity v1](../../.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md) |
| `InsightExplorationGraph` | implemented | [T012: InsightExplorationGraph Maturity v1](../../.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md) |
| `AlphaResearchGraph` | planned | [AlphaResearchGraph spec](../../project-docs/backlog/now/alpha-research-graph-spec.md) |
| `MarketJudgmentGraph` | planned |  |
| `ModelLearningGraph` | planned |  |
| `ReflectionGraph` | planned | [Reflection Engine](../../project-docs/research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md) |
| `RuntimeOrchestrator` | backend dependency | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Rule Discovery / Lite Backtest` | backend dependency | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Memory Review / Activation` | backend dependency | [alpha research engineering principles](../../project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md) |
| `Audit / Rebuild Workflow` | backend dependency | [workflow runtime run/checkpoint/audit alignment](../../project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md) |
| `Approval / Capability Gate` | backend dependency |  |

## Architecture

```text
Operator Surface
apps/trader-cli / future TUI
  |
  v
Workflow Runtime
apps/trader-workflows
  |
  |-- Stage1Runtime                 [implemented]
  |
  |-- DecisionGraph                 [implemented]
  |-- OutcomeGraph                  [implemented]
  |-- EvaluationGraph               [implemented]
  |-- InsightExplorationGraph       [implemented]
  |
  |-- AlphaResearchGraph            [planned: Now]
  |-- MarketJudgmentGraph           [planned: Next]
  |-- ModelLearningGraph            [planned: Later]
  |-- ReflectionGraph               [planned]
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
```

## Implemented Workflows

### Stage1Runtime

`Stage1Runtime` is the workflow runtime foundation. It creates workflow runs,
records checkpoints, supports run inspection, and resumes interrupted runs.

Responsibilities:

- create durable `workflow_runs`;
- write workflow checkpoints;
- expose `runs list`, `runs show`, and `runs resume` primitives;
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

`OutcomeGraph` runs as a **service wrapper** (`outcomes run --due`). It closes
pending decision outcomes and insight candidate outcomes once enough market data
is available.

Responsibilities:

- find due pending decision outcomes and insight candidate outcomes;
- label realized result with normalized labels (`hit`/`miss`/`neutral`/`invalid`/`insufficient_data`);
- when fresh evidence is needed, build compact evidence summaries (capped at 15 lines);
- avoid mutating context snapshots;
- produce counts for finalized, skipped, and failed outcomes, broken down by source type and normalized label.

This graph is the first feedback loop. Without it, the system can make
decisions but cannot learn whether those decisions worked.

### EvaluationGraph

`EvaluationGraph` runs as a **service wrapper** (`eval summary`). It turns
outcomes into evaluation reports.

Responsibilities:

- aggregate outcome and decision performance;
- build evaluation reports;
- evaluate rule or model behavior from recorded facts;
- avoid automatic model promotion or configuration mutation.

The graph can recommend or report. It must not silently promote a model,
change production behavior, or mutate active RulePack policy.

### InsightExplorationGraph

`InsightExplorationGraph` runs as a **service wrapper**
(`insights explore --symbol … --window …`). It explores candidate insights from
snapshots, outcomes, and evidence.

Responsibilities:

- inspect context snapshots and historical outcomes;
- generate bounded `InsightCandidate` records;
- attach evidence references;
- enforce proposal weight caps and forbidden capability boundaries;
- avoid trade execution, model training, promotion, or direct lesson mutation.

This is the implemented entry closest to alpha discovery. It produces candidate
insights, but it does not complete the formal alpha research and lite backtest
chain.

## Planned Workflows

### AlphaResearchGraph

Status: planned, backlog `Now`.

`AlphaResearchGraph` should be the formal alpha-factor research workflow.

Expected responsibilities:

- consume `InsightCandidate`, event windows, context windows, and historical
  outcomes;
- convert hypotheses into structured `RuleCandidate` records;
- define trigger, entry condition, exit condition, invalidation, data
  requirements, and risk notes;
- call or coordinate Rule Discovery / Lite Backtest;
- produce a `LiteBacktestReport`;
- move candidates only to safe review states such as `needs_more_data`,
  `rejected`, `pending_shadow_tracking`, or `pending_manual_approval`.

Safety boundary:

- no active RulePack mutation;
- no automatic trading;
- no automatic universe expansion;
- no promotion without manual approval.

Recommended next implementation direction:

```text
InsightExplorationGraph
  -> AlphaResearchGraph
  -> Rule Discovery / Lite Backtest
  -> pending_shadow_tracking | pending_manual_approval
  -> OutcomeGraph
  -> EvaluationGraph
```

### MarketJudgmentGraph

Status: planned, backlog `Next`.

`MarketJudgmentGraph` should produce the operator-facing market read.

Expected responsibilities:

- summarize current market context;
- produce `MarketRead`;
- identify opportunity bias;
- build watchlists;
- define triggers and invalidations;
- surface risk warnings for CLI/TUI review.

This graph is for market-state judgment and daily operator focus. It is not the
same as alpha discovery.

### ModelLearningGraph

Status: planned, backlog `Later`.

`ModelLearningGraph` should orchestrate offline challenger-model experiments.

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

The first reasonable target is `opportunity_ranking_model`, not a complete
trading-policy model.

### ReflectionGraph

Status: planned; backend module docs are mature, but this is not yet a
standalone LangGraph workflow.

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
