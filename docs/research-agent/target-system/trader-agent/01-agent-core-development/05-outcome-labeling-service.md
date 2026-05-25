# 05 - Outcome Labeling Service

Source module: `01-agent-core-backend-prd.md` module 5.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Calculate post-event or post-signal market performance using only data after the anchor timestamp, then persist outcome labels for playbook statistics and reflection.

## Non-Goals

- Does not change the original semantic event.
- Does not decide whether a current signal is tradable.
- Does not perform backtests beyond event or signal outcome labeling.
- Does not use outcome data in context building.

## Inputs And Outputs

Inputs:

- `trader_semantic_events` event id or `signals` signal id.
- Anchor timestamp and symbol.
- Stop and target when available.
- Historical bars after anchor timestamp.

Outputs:

- `event_outcomes` row for historical semantic events.
- Signal outcome record when signal labeling is requested.
- `agent_events` for labeling runs and data gaps.

## Core Tables And Schema

Primary table: `event_outcomes`.

Fields:

- `return_30m`, `return_1h`, `return_eod`, `return_1d`, `return_3d`, `return_5d`, `return_10d`.
- `mfe`, `mae`, `outperformed_qqq`, `hit_stop`, `hit_target`, `final_label`, `notes`.

Related tables:

- Reads `trader_semantic_events`.
- Reads `signals`.
- Feeds Playbook Engine and Reflection Engine.

## API Contract

```text
POST /api/outcomes/label-event/{event_id}
POST /api/outcomes/label-signal/{signal_id}
POST /api/outcomes/batch
GET  /api/outcomes/event/{event_id}
GET  /api/outcomes/signal/{signal_id}
```

Label response:

```json
{
  "object_type": "event",
  "object_id": "uuid",
  "outcome_id": "uuid",
  "final_label": "worked",
  "missing_fields": []
}
```

## Dependencies

- Requires Semantic Extraction Service for event anchors.
- Requires Market Snapshot or historical data provider.
- Uses Tool Gateway for data fetches in Phase 2.
- Writes `agent_events`.
- Does not trigger approval for low-cost historical bars.
- Does not affect RulePack directly.

## Implementation Steps

1. Load event or signal and validate symbol plus anchor timestamp.
2. Fetch post-anchor bars for every configured horizon.
3. Calculate returns and benchmark-relative performance.
4. Calculate MFE and MAE from the post-anchor path.
5. Evaluate stop and target hit when stop and target are parseable.
6. Assign `final_label` from deterministic rules.
7. Persist outcome with calculation timestamp.

## Failure Modes

- Non-trade signal: label as `not_trade_signal`.
- Insufficient future bars: label as `insufficient_data`.
- Missing benchmark data: compute absolute returns and mark benchmark fields missing.
- Unparseable stop or target: leave hit fields null and add notes.
- Provider timeout: write run failure and avoid partial misleading label.

## Acceptance Criteria

- Uses only data after event or signal timestamp.
- Calculates MFE and MAE.
- Determines whether the symbol outperformed QQQ when benchmark data exists.
- Handles non-trade events.
- Supports batch labeling for historical events.

## Test Scenarios

- Label a worked event with positive MFE and QQQ outperformance.
- Label a failed event that hits stop before target.
- Label a recap as `not_trade_signal`.
- Label an event with missing bars as `insufficient_data`.
- Verify no pre-anchor bars are used in calculations.
