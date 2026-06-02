# 03 - Ticker Alias Resolver

Source module: `01-agent-core-backend-prd.md` module 3.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Resolve non-standard ticker expressions, aliases, option shorthand, and contextual references into explicit symbol and instrument metadata with confidence and ambiguity notes.

## Non-Goals

- Does not judge trade quality.
- Does not price options.
- Does not create signals.
- Does not silently invent symbols outside the configured universe.

## Inputs And Outputs

Inputs:

- Raw text span.
- Surrounding message context.
- Configured MVP universe: SPY, QQQ, TSLA, NVDA, AAPL, COIN, BMNR.
- Alias map and user corrections.

Outputs:

- `resolved_symbol`, `instrument_type`, `option_type`, `strike`, `expiry`, `confidence`, `ambiguity_notes`.
- Alias additions when user correction is explicit.
- `agent_events` for resolver run failures and alias map changes.

## Core Tables And Schema

Primary persisted objects:

- Alias map stored through Configuration Service or a dedicated alias table when added by migration.
- `human_feedback` for user corrections.
- `trader_semantic_events.aliases` for extraction-time resolution detail.

Shared tables touched indirectly:

- `trader_raw_messages` for context.
- `trader_semantic_events` for normalized event symbols.

## API Contract

```text
POST /api/ticker-resolver/resolve
GET  /api/ticker-resolver/aliases
POST /api/ticker-resolver/aliases
```

Resolve request:

```json
{
  "text": "tsla 260c",
  "timestamp": "2026-05-25T09:45:00-04:00",
  "context_message_ids": ["uuid"],
  "allowed_universe_only": true
}
```

Resolve response:

```json
{
  "resolved_symbol": "TSLA",
  "instrument_type": "option",
  "option_type": "call",
  "strike": 260,
  "expiry": null,
  "confidence": 0.86,
  "ambiguity_notes": []
}
```

## Dependencies

- Reads configured universe from Configuration Service.
- Reads prior messages through Corpus Ingestion data.
- Used by Semantic Extraction Service before event persistence.
- Does not call external tools.
- Alias updates write audit events.
- Does not affect Risk Engine directly.

## Implementation Steps

1. Normalize casing and punctuation while preserving numbers.
2. Match standard ticker symbols against the configured universe.
3. Match known aliases such as leveraged ETF references and Chinese nicknames.
4. Parse option shorthand like `260c`, `puts`, `calls`, strike values, and expiry hints.
5. Use nearby messages only as context, not as proof when confidence remains low.
6. Return ambiguity instead of guessing when a number can be strike, price, date, or target.
7. Persist user-approved alias corrections with version and audit event.

## Failure Modes

- Symbol outside universe: return unresolved unless explicit config allows expansion.
- Numeric ambiguity: return lower confidence and ambiguity note.
- Alias collision: return candidates and require user correction.
- Context unavailable: resolve from current text only and note missing context.
- Invalid alias creation: reject write and preserve reason.

## Acceptance Criteria

- Correctly resolves common TSLA, TSLL, QQQ, NVDA, COIN, and BMNR expressions.
- Flags ambiguous expressions without creating downstream trade events.
- User correction can update alias map.
- Option shorthand returns instrument metadata separate from symbol.
- Resolver output is deterministic for identical input and alias version.

## Test Scenarios

- Resolve `tsll 15` as leveraged TSLA-related expression with ambiguity around the number.
- Resolve `tsla 260c` as TSLA call option strike 260.
- Resolve `qqq puts` as QQQ put instrument.
- Resolve a Chinese nickname alias from configured alias map.
- Reject a ticker outside the configured MVP universe.
