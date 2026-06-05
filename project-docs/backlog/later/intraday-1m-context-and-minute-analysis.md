# Intraday 1m Context and Minute-Level Analysis

Status: Later (unscheduled version)

## Requirement

Support **1-minute (and finer-grained intraday) K-line understanding** as a first-class
analysis input: backend fetches and serves 1m bars aligned to `asof_ts`, workflows expose
**compact, evidence-linked summaries** to LLMs, and minute-level pattern discovery becomes a
durable research path—not a one-off DecisionGraph prompt tweak.

This is a stated **future analysis priority**; version and slice boundaries are TBD.

## System Tendency (recorded decision)

| Topic | Tendency |
|-------|----------|
| **Data source** | **Backend** (`intel` context build / market bar APIs) owns 1m fetch, windowing, and persistence contract. Workflows do not call brokers or raw bar stores directly. |
| **LLM input** | Pass **summaries + `EvidenceRef`**, not full 1m OHLCV series into graph prompts. Large bar arrays stay behind refs (see [Compact evidence summary builder](../now/compact-evidence-summary-builder.md)). |
| **Pattern / “规律” discovery** | Primary home: **deterministic features → signals/patterns** and/or **InsightExplorationGraph** / **AlphaResearchGraph**, with outcomes on short horizons (`30m`, `1h`, etc.). |
| **DecisionGraph** | **Consumer only** after intraday evidence exists in context snapshot. DecisionGraph must **not** become the main pipeline for fetching 1m data or mining minute patterns. |
| **Prompt (Decision)** | Keep “no intraday language without evidence” until snapshot items explicitly cite `1m`/`5m`/`intraday`. Then allow `周期：intraday|mixed` in thesis strings (no envelope schema change required for v1). |

## Current State (2026-06)

- Backend `POST /intel/context/build` loads per symbol:
  - `daily`: `1d` bars (limit 20)
  - `minute`: **`5m`** bars (limit 50)—field name says `minute`, timeframe is 5m
  - See `apps/trader-agent/backend/app/intel/api/context.py`
- Workflows `weightedItemsFromIntelBuild` → `marketBarItems()` uses **`daily` only**;
  `minute` / 5m is not mapped into `WeightedContextItem`.
- DecisionGraph prompt guide assumes **daily-primary** context; intraday thesis tags are deferred
  until evidence items exist (DecisionGraph prompt maturity slice).

## Target Architecture (when scheduled)

```text
Backend (1m bars + optional intraday_summary)
    → Context build API (typed market_data.bars_1m or intraday_summary)
    → Workflows: intradayBarItems / compact summary mapper → WeightedContextItem + EvidenceRef
    → InsightExploration / Alpha / deterministic signal pipeline (pattern discovery)
    → DecisionGraph (optional: cite intraday summary in thesis; action unchanged)
```

### Suggested phases (for version planning)

1. **Backend 1m contract** — Fetch/store 1m (or clarify 5m vs 1m naming); window aligned to
   `asof_ts`; document limits and refresh policy.
2. **Compact intraday summary** — Backend or shared module produces LLM-ready summary
   (structure, VWAP, volume regime, recent HL)—linked by `EvidenceRef`.
3. **Snapshot wiring** — `contextSnapshots.ts` maps intraday summary into weighted items;
   tests for empty/partial bars.
4. **Research loop** — Signals/patterns table + Exploration graph consume intraday evidence;
   outcome labeling uses existing short horizons where applicable.
5. **Decision consumption** — Extend Decision prompt guide with `intraday` period tag only
   when snapshot contains intraday items; no raw 1m in Decision LLM call.

## Non-Goals (for this requirement)

- DecisionGraph as the **primary** 1m ingestion or pattern-mining workflow.
- Streaming full 1m history into a single LLM completion.
- Automatic promotion of minute-level patterns to active RulePack or live execution.
- Envelope schema fields such as `primary_horizon` (optional future API version; not required
  for first intraday slice).

## Dependencies and Related Backlog

| Item | Relationship |
|------|----------------|
| [Compact evidence summary builder](../now/compact-evidence-summary-builder.md) | Intraday summaries should follow the same compact + `EvidenceRef` contract. |
| [Deterministic signal pipeline](../supporting/deterministic-signal-pipeline.md) | Preferred path for repeatable minute-level rules before LLM narration. |
| [Rule Discovery / Lite Backtest Engine](../supporting/rule-discovery-lite-backtest-engine.md) | Validation of intraday pattern candidates. |
| [InsightExplorationGraph T012 evidence](../now/insight-exploration-graph-spec.md) | Later consumer for compact minute-level summaries and candidate proposals, not a new standalone spec. |
| [AlphaResearchGraph spec](../now/alpha-research-graph-spec.md) | Later reuse of mature context + evidence patterns. |
| [DecisionGraph maturity v1](../now/decision-graph-maturity-v1.md) | Daily-primary thesis and timeframe rules; intraday is a **follow-on**, not in v1 scope. |

## Open Questions (for version kickoff)

- **1m vs 5m**: Ship 1m only, both, or 5m aggregate with 1m for last session only?
- **Retention**: How many 1m bars per symbol per `asof_ts` (token vs fidelity tradeoff)?
- **Market session**: US/HK/CN session boundaries for “today intraday” summaries?
- **Which graph owns v0**: InsightExploration-only vs shared `intraday_summary` on every
  Decision snapshot?

## Acceptance Sketch (when implemented)

- Context build returns intraday evidence with stable `ref_id` (e.g. `SYMBOL:1m:summary`).
- Snapshot `items_json` includes at least one intraday item when backend has 1m data.
- Exploration (or signal pipeline) run can reference the same refs; outcomes on `30m`/`1h`
  can be tied back.
- DecisionGraph run **without** intraday items still forbids unsupported intraday claims in
  thesis (regression test).
- DecisionGraph run **with** intraday items may use `周期：intraday|mixed` and tagged facts
  (`1m`/`5m`).

## Source

- Product discussion: minute-level trend understanding as future analysis focus; backend
  should fetch 1m; DecisionGraph is not the right owner for ingestion/discovery.
- Existing code: `context.py` (`minute` = 5m), `contextSnapshots.ts` (`marketBarItems` daily-only),
  `apps/trader-workflows/src/llm/provider.ts` (daily-primary prompt guide).

## Next Action

**Record only.** When prioritizing a version, pick a phase (usually backend 1m + compact
summary + snapshot wiring) and spawn a spec under `.agent-dev/specs/` or move this item to
**Now** with explicit version label.
