# 01 - Corpus Ingestion Service

Source module: `01-agent-core-backend-prd.md` module 1.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Import trader historical material into `trader_raw_messages` with normalized timestamps, stable source metadata, content hash deduplication, and traceable failures.

## Non-Goals

- Does not extract trade semantics.
- Does not resolve tickers or options expressions.
- Does not call market-data tools.
- Does not create playbooks or signals.

## Inputs And Outputs

Inputs:

- CSV, JSON, TXT, HTML, Markdown, manual entry payloads, API pull results.
- Required fields after adapter normalization: `source`, `timestamp`, `raw_text`.

Outputs:

- `trader_raw_messages` rows.
- Import summary with `created_count`, `duplicate_count`, `failed_count`, and failure reasons.
- `agent_events` entries for import start, import finish, and import failure batches.

## Core Tables And Schema

Primary table: `trader_raw_messages`.

Required fields:

- `id`, `source`, `source_url`, `author`, `timestamp`, `raw_text`, `attachments`, `reply_to`, `imported_at`, `content_hash`.

Shared platform dependencies:

- Database Layer for inserts and unique `content_hash`.
- Audit Logging Service for import runs.
- Scheduler & Worker Queue for large batch imports.

## API Contract

```text
POST /api/corpus/import
GET  /api/corpus/messages
GET  /api/corpus/messages/{id}
```

`POST /api/corpus/import` request:

```json
{
  "source": "whop",
  "source_url": "https://example.com/thread/1",
  "items": [
    {
      "author": "trader",
      "timestamp": "2026-05-25T09:30:00-04:00",
      "raw_text": "TSLA wait for VWAP reclaim",
      "attachments": [],
      "reply_to": null
    }
  ],
  "import_mode": "append"
}
```

Response:

```json
{
  "run_id": "uuid",
  "created_count": 1,
  "duplicate_count": 0,
  "failed_count": 0,
  "message_ids": ["uuid"]
}
```

## Dependencies

- Requires Phase 0 database migrations.
- Uses `agent_events` for run trace.
- Can run synchronously for small imports and through Worker Queue for large imports.
- Does not require Tool Gateway.
- Does not trigger approval.
- Does not affect RulePack or Risk Engine.

## Implementation Steps

1. Create source adapters that convert every input type into `TraderRawMessageInput`.
2. Normalize timestamps to `TIMESTAMPTZ` and preserve original source URL.
3. Clean `raw_text` only enough to remove transport noise; preserve trader wording.
4. Compute `content_hash` from `source`, normalized timestamp bucket, author, and cleaned text.
5. Insert rows with unique conflict handling on `content_hash`.
6. Record batch-level and item-level failure summaries.
7. Add pagination and filters for `source`, `author`, and date range.

## Failure Modes

- Missing timestamp: reject item and include field-level error.
- Empty text after cleaning: reject item and preserve failure in import summary.
- Duplicate hash: skip row and count as duplicate.
- Invalid attachment metadata: import message with attachment error in failure detail.
- Database conflict outside `content_hash`: fail batch safely and write `agent_events`.

## Acceptance Criteria

- Imports at least 10,000 raw messages without duplicate rows.
- Every stored message has `source`, `timestamp`, `raw_text`, and `content_hash`.
- Failed rows are visible in the import summary.
- Messages can be queried by `source`, `author`, and date range.
- Import run writes `agent_events` with `run_id`.

## Test Scenarios

- Import two identical messages and verify one stored row plus one duplicate count.
- Import mixed valid and invalid rows and verify partial success.
- Query by source and date range.
- Verify timestamp normalization does not change event ordering.
- Verify raw text is not over-normalized in a Chinese and English mixed message.
