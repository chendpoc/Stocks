# 02 - Semantic Extraction Service

Source module: `01-agent-core-backend-prd.md` module 2.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Convert `trader_raw_messages.raw_text` into validated `trader_semantic_events` so downstream modules can reason over structured trading observations, waits, risk warnings, recaps, and explicit trade language.

## Non-Goals

- Does not decide whether a setup is currently valid.
- Does not create signals or tickets.
- Does not promote low-confidence events into playbooks.
- Does not use future market data.

## Inputs And Outputs

Inputs:

- `trader_raw_messages` rows.
- Optional alias context from Ticker Alias Resolver.
- Optional human correction records from `human_feedback`.

Outputs:

- 0-N `trader_semantic_events` per raw message.
- Review queue marker for confidence below `0.65`.
- `agent_events` entries for extraction runs and schema failures.

## Core Tables And Schema

Primary table: `trader_semantic_events`.

Fields:

- `symbol`, `aliases`, `asset_class`, `action`, `direction`, `timeframe`, `instrument`.
- `setup_hint`, `entry_condition`, `invalidation`, `target`, `stop`.
- `thesis`, `catalyst`, `risk_notes`, `language_strength`, `confidence`, `extractor_version`.

Related tables:

- Reads `trader_raw_messages`.
- Reads and writes `human_feedback` for corrections.
- Writes `agent_events`.

## API Contract

```text
POST /api/extraction/run
POST /api/extraction/run/{message_id}
GET  /api/extraction/events
GET  /api/extraction/events/{id}
```

`POST /api/extraction/run/{message_id}` response:

```json
{
  "message_id": "uuid",
  "created_event_ids": ["uuid"],
  "review_required": false,
  "extractor_version": "semantic-extractor-v0.1"
}
```

## Dependencies

- Requires Corpus Ingestion Service.
- Uses Ticker Alias Resolver before finalizing `symbol`.
- Uses Pydantic schema validation before persistence.
- Does not call external market tools directly.
- Does not trigger approval.
- Does not affect RulePack or Risk Engine.

## Implementation Steps

1. Fetch raw messages by id, source, or date range.
2. Run language extraction with deterministic schema constraints.
3. Resolve ticker candidates through Ticker Alias Resolver.
4. Validate action against the allowed action enum.
5. Validate language strength against the allowed language strength enum.
6. Store high-confidence events as eligible for downstream playbook work.
7. Mark events below `0.65` confidence for human review.
8. Store schema failures as run errors without dropping the source message.

## Failure Modes

- Ambiguous ticker: store event with null `symbol`, ambiguity notes inside `aliases`, and block playbook eligibility.
- Multiple tickers in one message: split into multiple events when action context is separable.
- Unsupported action: store `unknown` with confidence and explanation.
- Schema validation failure: reject event and write failure to `agent_events`.
- Provider output missing required fields: retry once, then mark extraction failed for that message.

## Acceptance Criteria

- Golden dataset ticker extraction reaches initial 85% accuracy.
- Golden dataset action extraction reaches initial 75% accuracy.
- All stored outputs pass schema validation.
- Ambiguous content is marked and does not enter playbook generation.
- Human feedback can correct extracted fields and create a traceable revision.

## Test Scenarios

- Extract the PRD example: TSLA, wait, bullish, intraday, `vwap_reclaim`.
- Extract a risk-warning message with no actionable ticker.
- Extract one raw message into two semantic events.
- Verify confidence below `0.65` sets review-required state.
- Verify invalid action text is normalized to `unknown`.
