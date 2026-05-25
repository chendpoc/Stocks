# 06 - Playbook Engine

Source module: `01-agent-core-backend-prd.md` module 6.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Turn validated semantic events and outcomes into trader playbooks that can be queried by current market context and used as evidence for Trader Brain and Opportunity Brain.

## Non-Goals

- Does not create trade tickets.
- Does not approve rule changes.
- Does not treat low-confidence events as examples.
- Does not generate predictions without historical evidence.

## Inputs And Outputs

Inputs:

- `trader_semantic_events` with sufficient confidence.
- `market_context_snapshots`.
- `event_outcomes`.
- Human-created playbook definitions.

Outputs:

- `playbooks` rows.
- Playbook example links when implementation adds a join table.
- Updated win rate, MFE, MAE, sample size, confidence.
- Retrieval results for current context.

## Core Tables And Schema

Primary table: `playbooks`.

Required content:

- `name`, `description`, `symbols`, `setup_type`, `required_market_regime`, `required_conditions`, `invalidation_conditions`.
- `preferred_timeframe`, `preferred_instrument`, `historical_win_rate`, `avg_return`, `avg_mfe`, `avg_mae`, `sample_size`, `confidence`, `version`, `status`.

Related tables:

- Reads `trader_semantic_events`, `market_context_snapshots`, `event_outcomes`.
- Reads `human_feedback`.
- Writes `agent_events`.

## API Contract

```text
GET  /api/playbooks
POST /api/playbooks
GET  /api/playbooks/{id}
PATCH /api/playbooks/{id}
POST /api/playbooks/{id}/attach-event
POST /api/playbooks/retrieve
POST /api/playbooks/update-stats
```

Retrieve request:

```json
{
  "symbol": "TSLA",
  "setup_type": "vwap_reclaim",
  "market_context_id": "uuid",
  "limit": 5
}
```

## Dependencies

- Requires modules 1-5.
- Optional Vector Store for semantic retrieval.
- Used by Trader Brain and Opportunity Brain.
- Writes `agent_events` for stats updates and manual edits.
- Does not trigger approval unless playbook status changes are governed by future control rules.
- Does not override Risk Engine.

## Implementation Steps

1. Create manual playbook CRUD with status and version.
2. Attach eligible events to playbooks only when confidence and outcome constraints pass.
3. Compute sample size, win rate, average return, MFE, and MAE from attached examples.
4. Store failure modes from failed and invalidated examples.
5. Implement retrieval by symbol, setup type, market regime, and similarity.
6. Return source event ids and summary evidence, not raw unbounded chat logs.
7. Version updates so Reflection Engine can propose changes without mutating active rules silently.

## Failure Modes

- Low sample size: return playbook with low confidence.
- Low-confidence event attachment: reject attachment.
- Missing outcome: attach only as qualitative example and exclude from numeric stats.
- Retrieval with no match: return empty result with evidence gap.
- Conflicting manual edits: require version match before patch.

## Acceptance Criteria

- At least three initial playbooks can be created.
- Each playbook can associate with historical events.
- Each playbook exposes sample size, win rate, average MFE, and average MAE.
- Current market context can retrieve similar playbooks.
- Playbook output is traceable to historical examples.

## Test Scenarios

- Create TSLA VWAP reclaim playbook.
- Attach three historical events and update stats.
- Attempt to attach low-confidence event and verify rejection.
- Retrieve similar playbook from current TSLA context.
- Update playbook version and confirm event trace is preserved.
