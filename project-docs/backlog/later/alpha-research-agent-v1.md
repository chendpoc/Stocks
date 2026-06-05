# AlphaResearchAgent v1

Status: Later

## Requirement

Define a future bounded research-agent version of AlphaResearchGraph.

This is not the v0 implementation target. v0 remains a thin validation and
backtest orchestration graph. v1 may add controlled research behavior only after
the v0 path proves that an insight can become a rule candidate and lite backtest
report without bypassing policy boundaries.

## Source

- [AlphaResearchGraph spec](../now/alpha-research-graph-spec.md)
- [Agent engineering principles proposal](../../research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)
- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Intended Shape

AlphaResearchAgent v1 is a bounded research harness, not an open-ended
autonomous agent.

Expected high-level flow:

```text
AlphaResearchRequest
-> validate_research_request
-> draft_research_plan
-> collect_scoped_evidence
-> build_compact_evidence_bundle
-> generate_hypothesis_candidates
-> select_and_shape_alpha_candidate
-> run_policy_checks
-> run_lite_backtest
-> write_alpha_research_report
```

The graph may propose research questions, evidence plans, and hypothesis
candidates. It must still use deterministic evidence adapters, compact evidence
bundles, policy checks, and backend Rule Discovery / Lite Backtest for durable
state transitions.

## Inputs

v1 may accept broader research requests than v0:

```text
source_type: insight_candidate | manual_research_question | market_anomaly
symbols
window
candidate_family_hint?
research_question
budget
allowed_sources
```

## Boundaries

Allowed:

- draft bounded research plans with explicit stop conditions;
- call white-listed read-only evidence adapters;
- build compact evidence bundles and EvidenceRef links;
- generate multiple hypothesis candidates when grounded in evidence;
- hand selected candidates to Rule Discovery / Lite Backtest;
- write an alpha research report.

Forbidden:

- automatic active RulePack mutation;
- automatic model promotion;
- broker, paper, or simulated order submission;
- open-ended web or market-data search without a budget and source whitelist;
- using an LLM to invent missing trigger, invalidation, or evidence;
- direct SQLite writes from the workflow package;
- bypassing backend status transitions, audit events, or approval gates.

## Why Later

The current project needs a reliable validation chain first:

```text
InsightCandidate
-> RuleCandidate
-> LiteBacktestReport
-> safe review state
```

Building a research agent before that chain exists would hide missing contracts
behind agent behavior. v1 should be pulled forward only after T013 demonstrates
the v0 chain end to end.

## Next Action

Do not implement this item in T013. After AlphaResearchGraph v0 is stable,
write a dedicated v1 spec that defines the request schema, evidence budget,
allowed tools, artifact set, LLM boundaries, policy checks, and acceptance
criteria.
