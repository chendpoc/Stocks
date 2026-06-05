# AlphaResearchGraph v0

> Source backlog: `project-docs/backlog/now/alpha-research-graph-spec.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: done

## Purpose

Define T013 for AlphaResearchGraph v0. T013 covers M1, M2, and M3, but those
milestones remain strictly gated inside one task:

```text
M1 spec gate
-> M2 backend minimal API slice
-> M3 AlphaResearchGraph v0 implementation
```

v0 is not a research agent. It is a thin, auditable validation chain that turns
an already prepared alpha research input into a backend `RuleCandidate`, runs a
lite backtest through the backend Rule Discovery / Lite Backtest module, and
returns the resulting report and safe state.

## Design Baseline

AlphaResearchGraph v0 should stay smaller than the earlier research-agent idea.

Canonical graph input:

```text
AlphaResearchInput {
  insight_id
  run_id?
  symbol
  thesis
  evidence_refs
  alpha_seed
  backtest_window_start
  backtest_window_end
}
```

`insight_id` is a traceable source reference. The graph does not use it to
hydrate context, fetch snapshots, query outcomes, or run open-ended research.
Any convenience CLI or service path may fetch an `InsightCandidate` and map it
to `AlphaResearchInput`, but that mapping is outside the graph and must not
perform additional context research.

Graph shape:

```text
validate_input
-> create_rule_candidate
-> run_lite_backtest
```

There is no separate load/hydrate node, no normalization node, no LLM wording
node, and no context backfill path in v0.

## Required Alpha Seed

T013 may lightly update `InsightExplorationGraph` output so new
`InsightCandidate.candidate_json` records carry a minimal `alpha_seed` object
(key name `alpha_seed`, not `alpha_seed.v1`).

Canonical shape stored in `candidate_json`:

```text
candidate_json.alpha_seed:
  schema_version: alpha_seed.v1          # required
  candidate_family                    # required; must be in CANDIDATE_FAMILIES
  mechanism                             # required
  trigger_hint                          # required
  entry_condition_hint                  # required
  invalidation_hint                     # required
  required_evidence_hint[]              # required; bounded string hints (metadata)
  risk_notes[]                          # optional
  exit_condition_hint                   # optional; backend default if omitted
```

v0 generates `alpha_seed` deterministically inside `buildInsightCandidatePayload`
(heuristic from `origin_category`, `thesis`, `horizon`, `symbol`). No new
InsightExploration graph node.

The seed is still an `InsightCandidate` field. It does not make
`InsightExplorationGraph` responsible for `RuleCandidate` generation, lite
backtesting, RulePack mutation, or promotion.

Broader backlog contracts (`alpha-candidate-contract.md`) converge in a later
milestone; v0 uses `alpha_seed.v1` as the source of truth.

## Node Contracts

### validate_input

Checks the canonical input and emits an `AlphaInputValidationReport`.

Blocking failures include:

```text
missing insight_id
missing symbol
missing thesis
missing evidence_refs
missing alpha_seed
invalid alpha_seed.schema_version
missing candidate_family
missing mechanism
missing trigger_hint
missing entry_condition_hint
missing invalidation_hint
missing required_evidence_hint
missing backtest window
```

If validation fails, the graph ends with:

```text
status: input_validation_failed
rule_candidate_id: null
lite_backtest_report_id: null
```

This is not a `needs_more_data` business state. It is a visible input contract
problem. The graph must not proceed to candidate creation or backtesting.

### create_rule_candidate

Builds the minimal backend request from validated input and calls the Rule
Candidate API.

Mapping:

```text
source: insight_candidate
source_ref: { insight_id, run_id? }
hypothesis: thesis or alpha_seed.mechanism
symbols: [symbol]
trigger_definition: alpha_seed.trigger_hint
entry_condition: alpha_seed.entry_condition_hint
exit_condition: alpha_seed.exit_condition_hint? or backend default
invalidation: alpha_seed.invalidation_hint
data_requirements: DEFAULT_DATA_REQUIREMENTS (backend rule_discovery)
risk_notes: alpha_seed.risk_notes
```

`required_evidence_hint[]` is audit/metadata only in v0. The backend always
receives `DEFAULT_DATA_REQUIREMENTS` from `rule_discovery.py` until a later
milestone maps hints to provider capabilities.

The node must not write SQLite directly and must not invent missing fields.

### run_lite_backtest

Single graph node that orchestrates the backend Rule Discovery state machine for
the created candidate and requested backtest window. Still one node; multiple
HTTP calls inside.

Orchestration (in order):

```text
POST /api/rule-candidates/{candidate_id}/evidence-requirements
POST /api/rule-candidates/{candidate_id}/lite-backtest { start, end }
POST /api/rule-candidates/{candidate_id}/advance { decision: report.decision }
GET  /api/rule-candidates/{candidate_id}/lite-backtest-report
```

Backend state progression:

```text
draft -> evidence_required -> backtest_pending -> backtested -> terminal_review_state
```

`run_lite_backtest()` requires `backtest_pending`; evidence validation must run
first.

Status semantics:

- `input_validation_failed` — graph input contract problem; no candidate created.
- `needs_more_data`, `rejected`, `pending_shadow_tracking`, `pending_manual_approval`
  — backend lite-backtest / advance business outcomes after a candidate exists.

The graph may return backend terminal review states but must not add a separate
recovery workflow for those states. Advance uses `decision` from the lite backtest
report response.

## Backend Minimal API Slice

M2 should expose only what AlphaResearchGraph v0 needs:

```text
POST /api/rule-candidates
GET  /api/rule-candidates/{candidate_id}
POST /api/rule-candidates/{candidate_id}/evidence-requirements
POST /api/rule-candidates/{candidate_id}/lite-backtest
POST /api/rule-candidates/{candidate_id}/advance
GET  /api/rule-candidates/{candidate_id}/lite-backtest-report
```

Mount a new FastAPI router at `prefix="/api/rule-candidates"` in `main.py`
(alongside existing `/api/intel` routes).

The API wraps the existing backend Rule Discovery / Lite Backtest module. It
must preserve backend status-machine checks and `agent_events`. Workflow code
must not read or write Rule Discovery tables directly.

Allowed terminal review states for v0:

```text
needs_more_data
rejected
pending_shadow_tracking
pending_manual_approval
```

Forbidden terminal states for v0:

```text
manually_approved
versioned
active
```

If the existing backend creation helper can only persist `source: manual`, M2
may minimally generalize it so AlphaResearchGraph can persist
`source: insight_candidate` with `source_ref.insight_id`.

## Non-Goals

- No AlphaResearchAgent v1 research harness.
- No open-ended evidence search.
- No context snapshot, outcome, or evaluation report hydration inside the graph.
- No LLM wording, normalization, or field backfill node.
- No direct SQLite access from `apps/trader-workflows`.
- No active RulePack mutation.
- No automatic approval, promotion, or versioning.
- No broker, paper, or simulated order submission.
- No workflow builder or UI.

## Acceptance

1. The spec and task artifacts define T013 as one task with M1, M2, and M3
   strictly gated.
2. `InsightCandidate.candidate_json.alpha_seed` (`schema_version: alpha_seed.v1`)
   is generated for new insight candidates without producing `RuleCandidate` in
   `InsightExplorationGraph`.
3. Backend exposes the minimal Rule Candidate / Lite Backtest API and preserves
   Rule Discovery state-machine checks and audit events.
4. AlphaResearchGraph v0 uses only the three-node shape:
   `validate_input -> create_rule_candidate -> run_lite_backtest`.
5. Input validation failure ends as `input_validation_failed` and does not
   create a rule candidate or run a lite backtest.
6. Workflow code calls backend APIs only; it does not import backend modules or
   read/write Rule Discovery tables.
7. The final output includes `insight_id`, `rule_candidate_id`,
   `lite_backtest_report_id`, final candidate status, validation report, and
   safety flags.

## Verification

Planning gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/alpha-research-graph/clarification-questions.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T013-alpha-research-graph-v0.json | ConvertFrom-Json | Out-Null
git diff --check -- .agent-dev/specs/alpha-research-graph .agent-dev/tasks/T013-alpha-research-graph-v0.json .agent-dev/tasks/T013-alpha-research-graph-v0.md project-docs/backlog
```

Implementation gates are listed in `spec.json` and the T013 task.
