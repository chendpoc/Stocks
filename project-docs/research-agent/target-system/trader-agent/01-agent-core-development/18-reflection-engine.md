# 18 - Reflection Engine

Source module: `01-agent-core-backend-prd.md` module 18.  
Phase: Phase 5 learning layer.  
Domain: Reflection and runtime chain.

## Module Goal

Run controlled daily learning and weekly reflection workflows that update playbook statistics, summarize learning, identify failures, and create rule proposals without activating them automatically.

## Non-Goals

- Does not activate rules.
- Does not mutate Risk Engine policy directly.
- Does not produce black-box strategy changes.
- Does not create tickets.

## Inputs And Outputs

Inputs:

- New raw messages.
- Semantic events.
- Market contexts.
- Event outcomes.
- Signals and ticket outcomes.
- Human feedback.

Outputs:

- Daily learning summary.
- Weekly reflection summary.
- Rule candidates handed off to Rule Discovery / Lite Backtest Engine.
- Reflection summaries that reference lite backtest reports when available.
- Failure case records.

## Core Tables And Schema

Reads:

- `trader_raw_messages`, `trader_semantic_events`, `market_context_snapshots`, `event_outcomes`, `playbooks`, `signals`, `trade_tickets`, `human_feedback`.

Writes:

- `playbooks` stats updates.
- `agent_events`.
- `rule_candidates` through Rule Discovery / Lite Backtest Engine handoff.
- `rule_proposals` only after Rule Discovery / Lite Backtest Engine creates an eligible proposal.
- `agent_rules` only after separate approval flow activates a proposal.

## API Contract

```text
POST /api/reflection/daily
POST /api/reflection/weekly
GET  /api/reflection/summaries
GET  /api/reflection/rule-proposals
```

Daily response:

```json
{
  "run_id": "uuid",
  "summary_id": "uuid",
  "events_processed": 42,
  "playbooks_updated": 3,
  "rule_proposals_created": 0
}
```

## Dependencies

- Requires modules 1-6 for historical learning.
- Requires Outcome Labeling Service.
- Reads Signal Manager and Trade Ticket outcomes when available.
- Uses Rule Discovery / Lite Backtest Engine for v1 candidate verification.
- Uses Rule Engine simulation for deterministic rule impact checks.

## Implementation Steps

1. Daily workflow: import new corpus, extract events, build context, label outcomes, update playbooks, generate summary.
2. Weekly workflow: aggregate setup and ticker performance.
3. Identify failure modes from event outcomes and invalidated signals.
4. Generate rule candidate drafts with evidence, expected impact, and backtest requirement.
5. Hand candidates to Rule Discovery / Lite Backtest Engine.
6. Reference lite backtest reports in weekly reflection when they exist.
7. Queue proposal summaries in draft, rejected, needs_more_data, pending_shadow_tracking, or pending_manual_approval state.
8. Write all workflow steps to `agent_events`.
9. Keep active RulePack unchanged until proposal approval lifecycle completes.

## Failure Modes

- Extraction backlog: summarize processed count and pending count.
- Outcome data insufficient: exclude from numeric stats and record gap.
- Conflicting failure modes: keep proposal draft with evidence conflict.
- Backtest unavailable: candidate remains `backtest_pending` or `needs_more_data` in Rule Discovery / Lite Backtest Engine.
- Lite backtest sample too small: proposal remains needs_more_data.
- Playbook update conflict: retry with version check.

## Acceptance Criteria

- Daily learning summary can be generated.
- Weekly rule proposals can be generated.
- Advancing a proposal beyond draft requires a lite backtest report produced by Rule Discovery / Lite Backtest Engine.
- Rule proposals do not become active rules automatically.
- Failure cases are persisted or referenced.
- Every reflection run has a run timeline.

## Test Scenarios

- Run daily reflection with fixture events and outcomes.
- Run weekly reflection and create one rule proposal.
- Verify the rule proposal references a lite backtest report before shadow tracking.
- Verify proposal is not active in Rule Engine.
- Verify failed events appear in failure summary.
- Verify incomplete outcome data is marked as evidence gap.
