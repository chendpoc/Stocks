# 21 - Rule Discovery / Lite Backtest Engine

Source decision: `00-rule-discovery-lite-backtest-decision.md`.  
Phase: Phase 1.5 v1 self-learning gate.  
Domain: Rule discovery and controlled research chain.

## Module Goal

Turn new market ideas, Zhao-style rules, market-structure changes, news patterns, and anomaly observations into auditable `RuleCandidate` records, validate them with evidence requirements and a lite backtest, and decide whether they should be rejected, watched in shadow mode, or sent for manual approval.

This module is the v1 boundary for "agent self-evolution". It proves that the agent can discover and test candidate rules without automatically activating them.

## Non-Goals

- Does not activate rules.
- Does not write directly to active RulePack.
- Does not produce trade tickets.
- Does not execute trades.
- Does not claim institutional-grade statistical significance.
- Does not treat one successful example as a durable edge.

## Inputs And Outputs

Inputs:

- Zhao corpus insights from Semantic Extraction Service and Playbook Engine.
- Market structure changes from news, filings, broker or exchange documentation, and manual notes.
- Market anomalies from Market Snapshot Service and Setup Detection Engine.
- Historical bars, options summaries, news timestamps, filings, and event calendars through LocalToolAdapter or Tool Gateway.
- Human feedback and rejected signal history.

Outputs:

- `rule_candidates`.
- `rule_candidate_evidence_requirements`.
- `lite_backtest_reports`.
- `rule_proposals` in non-active states.
- `agent_events` for candidate creation, evidence collection, backtest run, decision, and approval handoff.

## Core Tables And Schema

Reads:

- `trader_semantic_events`, `market_context_snapshots`, `event_outcomes`, `playbooks`, `signals`, `human_feedback`, `agent_rules`, `agent_events`.

Phase 1.5 reads signal outcomes through `event_outcomes` and `signals`. A dedicated `signal_outcomes` table is not part of the Phase 0 executable schema because `03-shared-platform-roadmap-prd.md` lists it only as a future logical table name and does not define its fields in Part 5.

Writes:

- `rule_candidates`.
- `rule_candidate_evidence_requirements`.
- `lite_backtest_reports`.
- `rule_proposals`.
- `agent_events`.
- `approval_requests` only when the decision is `pending_manual_approval`.

Required status enums:

```text
rule_candidate.status:
draft
evidence_required
backtest_pending
backtested
needs_more_data
rejected
pending_shadow_tracking
pending_manual_approval
manually_approved
versioned
archived
```

Allowed v1 terminal states:

```text
rejected
needs_more_data
pending_shadow_tracking
pending_manual_approval
```

Only a separate manual approval and versioning action can move a candidate to `manually_approved` or `versioned`.

## API Contract

```text
POST /api/rule-candidates
GET  /api/rule-candidates
GET  /api/rule-candidates/{id}
POST /api/rule-candidates/{id}/evidence-requirements
POST /api/rule-candidates/{id}/lite-backtest
GET  /api/rule-candidates/{id}/lite-backtest-report
POST /api/rule-candidates/{id}/submit-approval
```

Create candidate request:

```json
{
  "source": "zhao_corpus",
  "hypothesis": "After negative holder reduction news, wait three trading days before considering a setup.",
  "symbols": ["TSLA", "NVDA"],
  "trigger_definition": "holder reduction filing or verified news item",
  "entry_condition": "price stabilizes after three trading days with volume contraction",
  "exit_condition": "not applicable for v1 signal research",
  "invalidation": "continued distribution, broader market risk-off, or new negative filing",
  "data_requirements": ["filings", "daily_bars", "volume", "market_gate"],
  "risk_notes": ["event_gap", "news_follow_through"]
}
```

Lite backtest response:

```json
{
  "candidate_id": "uuid",
  "report_id": "uuid",
  "status": "pending_shadow_tracking",
  "sample_size": 18,
  "decision": "The candidate has enough signal quality for paper tracking, not active use.",
  "evidence_gaps": ["small sample size", "filing timestamp normalization needs review"]
}
```

## Dependencies

- Requires RulePack loader and Configuration Service from Phase 0.
- Requires LocalToolAdapter in Phase 0/1 for historical bars, basic news or filing fixtures, and market calendars.
- Uses Market Snapshot Service and Setup Detection Engine for market state features.
- Uses Outcome Labeling Service for post-event returns, MFE, and MAE.
- Feeds Reflection Engine, Rule Engine simulation, Learning Center, and Rule Studio.
- May create approval requests, but does not approve them.

## Implementation Steps

1. Define `RuleCandidate` input schema with source, hypothesis, symbols, trigger, entry condition, exit condition, invalidation, data requirements, and risk notes.
2. Persist candidate in `rule_candidates` with status `draft`.
3. Normalize required data into `rule_candidate_evidence_requirements`.
4. Validate that every evidence requirement has a LocalToolAdapter or Tool Gateway capability.
5. Move candidate to `evidence_required` or `backtest_pending`.
6. Run lite backtest with no future data, explicit sample window, cost assumptions, and spread or slippage assumptions.
7. Write `lite_backtest_reports` with metrics, evidence gaps, and decision.
8. Move candidate to `needs_more_data`, `rejected`, `pending_shadow_tracking`, or `pending_manual_approval`.
9. Create `rule_proposals` only for candidates that reach `pending_shadow_tracking` or `pending_manual_approval`.
10. Write every transition to `agent_events`.

## Failure Modes

- Evidence source missing: status becomes `needs_more_data`.
- Sample size below minimum: status becomes `needs_more_data`.
- Trigger definition cannot be evaluated deterministically: status remains `evidence_required`.
- Cost model missing for options or extended-hours data: lite backtest is blocked.
- Backtest uses future data: report is rejected and agent event logs `lookahead_detected`.
- Candidate implies automatic trading or automatic rule activation: candidate is rejected by policy.
- Tool data inconsistent across providers: report records evidence conflict and requires manual review.

## Acceptance Criteria

- A candidate can be created from corpus, market structure, news, filing, or anomaly source.
- Every candidate has trigger, entry condition, invalidation, and evidence requirements.
- Every candidate that advances beyond `draft` has at least one evidence requirement.
- Every candidate that advances to `pending_shadow_tracking` or `pending_manual_approval` has one `LiteBacktestReport`.
- Lite backtest report includes sample window, sample size, win rate, average return, median return, MFE, MAE, cost assumptions, evidence gaps, and decision.
- No API path can set a candidate directly to `versioned` or active RulePack.
- Every status transition writes `agent_events`.

## Test Scenarios

- Create candidate from Zhao three-day bad-news digestion theory.
- Create candidate from SPY options market-structure change and require formal-source evidence.
- Reject candidate that lacks invalidation.
- Block lite backtest when historical data capability is missing.
- Run lite backtest fixture and produce `pending_shadow_tracking`.
- Verify candidate cannot be activated without manual approval and versioning.
- Verify all transitions are logged in `agent_events`.

## Phase Marker

Phase 1.5 is required before claiming Agent Core v1 has self-learning capability. Phase 1 deterministic Signal MVP can begin before this module, but the system cannot claim rule discovery or self-evolution until this module passes acceptance.
