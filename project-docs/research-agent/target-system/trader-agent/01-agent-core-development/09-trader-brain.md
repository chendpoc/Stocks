# 09 - Trader Brain

Source module: `01-agent-core-backend-prd.md` module 9.  
Phase: Phase 1.5 after Playbook Engine is stable.  
Domain: Market and opportunity chain.

## Module Goal

Answer whether the current context resembles the trader's historical playbooks, how similar cases behaved, and whether trader language implies observation, waiting, risk warning, recap, or explicit trade language.

## Non-Goals

- Does not make final trade decisions.
- Does not bypass Rule Engine or Risk Engine.
- Does not use raw chat as unbounded prompt context.
- Does not generate tickets.

## Inputs And Outputs

Inputs:

- Current symbol and setup type.
- Market context or market snapshot.
- Playbooks and playbook examples.
- Semantic events and human feedback.

Outputs:

- `playbook_match`.
- `similar_cases`.
- `trader_language_interpretation`.
- `historical_stats`.
- `failure_modes`.

## Core Tables And Schema

Reads:

- `playbooks`.
- `trader_semantic_events`.
- `market_context_snapshots`.
- `event_outcomes`.
- `human_feedback`.

Writes:

- `agent_events` for match runs when invoked by runtime.
- Does not write `signals` directly.

## API Contract

```text
POST /api/trader-brain/match
POST /api/trader-brain/interpret-message
GET  /api/trader-brain/profile
```

Match response:

```json
{
  "symbol": "TSLA",
  "playbook_match": {
    "playbook_id": "uuid",
    "score": 0.78,
    "matched_conditions": ["vwap reclaim", "market gate pass"]
  },
  "similar_cases": ["event_uuid"],
  "historical_stats": {
    "sample_size": 12,
    "win_rate": 0.58
  },
  "failure_modes": ["failed when QQQ rolled over"]
}
```

## Dependencies

- Requires Semantic Extraction, Market Context Builder, Outcome Labeling, and Playbook Engine.
- Optional Vector Store for retrieval.
- Feeds Opportunity Brain and Agent Explanation Service.
- Does not call high-cost tools by default.
- Does not trigger approval.
- Does not affect RulePack directly.

## Implementation Steps

1. Retrieve candidate playbooks by symbol, setup type, and market regime.
2. Retrieve bounded similar cases with source event ids.
3. Compute match score from deterministic feature overlap before any LLM summary.
4. Summarize language interpretation using schema-constrained output.
5. Include historical stats and failure modes.
6. Return evidence references instead of long raw transcript blocks.
7. Write a runtime event when invoked inside an agent run.

## Failure Modes

- No playbook match: return `playbook_match` null and evidence gap.
- Low sample size: return match with low confidence marker.
- Ambiguous trader language: return `ambiguous` and require review.
- Vector store unavailable: fall back to structured filters.
- Contradictory examples: include failure modes and lower confidence.

## Acceptance Criteria

- Returns playbook match for a current signal when evidence exists.
- Explains similar historical handling.
- Distinguishes `conditional_watch` from `explicit_trade`.
- Output is traceable to historical cases.
- Does not create or mutate signal state.

## Test Scenarios

- Match TSLA VWAP context to a TSLA playbook.
- Interpret a wait message as `conditional_watch`.
- Return no match for unsupported setup.
- Verify similar cases include event ids.
- Verify low sample size lowers confidence.
