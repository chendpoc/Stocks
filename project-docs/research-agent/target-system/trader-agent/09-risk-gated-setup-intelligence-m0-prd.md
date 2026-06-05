# PRD | Trader Agent | Risk-Gated Setup Intelligence M0 | v1.0

Status: draft for confirmation
Owner: codex
Created: 2026-06-04

## 1. Purpose

Build the M0 foundation for a small-capital, highly selective, risk-gated US
equity setup intelligence system.

The system direction is:

```text
A small-capital, high-selectivity, high-risk-control AI trading research and
decision system that can continuously identify a small number of high-quality
setups and produce materially higher return elasticity than ordinary quant
products in favorable regimes.
```

M0 does not prove the return target. M0 makes the target testable by freezing
the contracts, gates, evidence boundaries, and outcome ledger needed before
AlphaResearchGraph, MarketJudgmentGraph, paper tracking, or any execution
surface can be trusted.

## 2. Source Of Truth

Primary source-of-truth documents:

- [00-system-overview.md](./00-system-overview.md)
- [00-workflow-router.md](./00-workflow-router.md)
- [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md)
- [08-agent-engineering-principles-proposal.md](./08-agent-engineering-principles-proposal.md)
- [project backlog](../../../backlog/README.md)
- [Ubiquitous language](../../../../UBIQUITOUS_LANGUAGE.md)

Reference-only materials:

- [waylandz-agent-quant-system-design.md](../../../waylandz-agent-quant-system-design.md)
- [docs/trading-experiences/index.md](../../../../docs/trading-experiences/index.md)
- [docs/trading-experiences/optiontrader.md](../../../../docs/trading-experiences/optiontrader.md)
- [docs/summaries/2026-05/2026-05-22-每日总结.md](../../../../docs/summaries/2026-05/2026-05-22-每日总结.md)
- [docs/opportunities/2026-05/2026-05-22-机会观察.md](../../../../docs/opportunities/2026-05/2026-05-22-机会观察.md)

Reference-only means these files can inspire hypotheses, ontology, scenario
examples, and risk-discipline vocabulary. They cannot become runtime authority
or bypass validation.

Web-checked SOTA calibration sources, as of 2026-06-04:

- LangGraph persistence and interrupts:
  https://docs.langchain.com/oss/python/langgraph/persistence and
  https://docs.langchain.com/oss/python/langgraph/interrupts
- OpenAI Agents SDK tracing and guardrails:
  https://openai.github.io/openai-agents-python/tracing/ and
  https://openai.github.io/openai-agents-python/ref/guardrail/
- Anthropic agent workflow guidance:
  https://www.anthropic.com/engineering/building-effective-agents
- Agentic Trading survey snapshot:
  https://arxiv.org/abs/2605.19337
- Look-Ahead-Bench:
  https://arxiv.org/abs/2601.13770
- Finance LLM bias framework:
  https://arxiv.org/abs/2602.14233
- Parametric look-ahead bias mitigation:
  https://arxiv.org/abs/2605.24564
- SEC algorithmic trading risk controls report:
  https://www.sec.gov/files/Algo_Trading_Report_2020.pdf

These sources calibrate engineering and validation gates only. They do not
override the primary target-system documents.

## 3. Confirmed Product Direction

The system should optimize for:

- small fixed universe before explicit expansion;
- high no-trade selectivity;
- setup quality over opportunity quantity;
- deterministic gates before LLM judgment;
- risk veto before scoring or model confidence;
- outcome-based learning instead of reflection-only learning;
- structured decision and candidate artifacts instead of free-form prose.

The system should not optimize for:

- daily prediction of market direction;
- automatic trade execution;
- replication of a named trader persona;
- direct use of historical quotes, tickers, or prices from reference corpus as
  runtime triggers;
- monthly return promises as acceptance criteria;
- broad universe scanning before the M0 contracts are frozen.

## 4. Problem Statement

Current target-system docs and implementation direction already contain two
different setup vocabularies:

1. Generic market-structure setup families such as VWAP reclaim, relative
   strength pullback, opening range breakout, gap hold / continuation, and
   daily breakout retest.
2. Mechanism-shaped patterns closer to expert-corpus inspiration, such as sharp
   drop plus volume contraction, BTC alert, post-reduction wait, and Friday
   options risk.

Without a two-layer taxonomy, workers can incorrectly hide mechanism patterns
under generic setup names, overfit reference corpus language, or treat a corpus
observation as a runtime trading rule.

M0 must freeze a contract that separates:

```text
setup_family = generic market-structure family
pattern_id   = concrete, testable mechanism hypothesis
```

## 5. M0 Scope

### In Scope

M0 defines contracts and acceptance gates for:

- Reference Corpus Boundary;
- two-layer setup taxonomy;
- AlphaCandidateContract;
- DecisionObject minimum schema;
- RunTrace v2 minimum artifact requirements;
- DataQualityGate minimum rule set;
- RiskGate minimum rule set;
- PaperTradeTracker ledger shape;
- primary return-path metrics and no-trade metrics;
- promotion boundary from candidate to shadow tracking or manual approval.

### Out Of Scope

M0 does not implement:

- automatic live trading;
- broker mirror;
- paper order submit/query/cancel;
- automatic position sizing increase;
- automatic active RulePack mutation;
- automatic model promotion or switching;
- full MarketJudgmentGraph;
- full AlphaResearchGraph implementation;
- custom Web UI;
- universe expansion beyond the current approved MVP universe.

## 6. Reference Corpus Boundary

赵哥 / xiaozhaolucky / 管理员语料是 reference corpus，不是 runtime authority。

The system may use reference corpus to derive:

- market mechanism hypotheses;
- setup taxonomy seeds;
- scenario examples;
- trigger and invalidation vocabulary;
- risk discipline patterns;
- candidate research questions.

The system must not use reference corpus to directly produce:

- active trading rules;
- runtime buy/sell instructions;
- hardcoded ticker, price, or point decisions;
- automatic RulePack mutation;
- author-persona based confidence boosts;
- promotion into active runtime use.

Runtime authority can only come from:

1. current market evidence;
2. validated deterministic rule or candidate contract;
3. lite backtest or shadow tracking evidence;
4. RiskGate result;
5. explicit human approval where required.

Every corpus-derived idea must pass:

```text
Corpus section
  -> EvidenceRef
  -> AlphaCandidate or RuleCandidate draft
  -> Evidence requirements
  -> LiteBacktestPlan
  -> LiteBacktestReport or shadow tracking queue
  -> manual approval where promotion is requested
```

## 7. Core Contracts

### 7.1 AlphaCandidateContract

Every AlphaCandidate must include:

| Field | Requirement |
|---|---|
| `candidate_family` | Finite taxonomy value. Must not be free text. |
| `setup_family` | Generic market-structure family. |
| `pattern_id` | Concrete mechanism identifier. |
| `mechanism` | Why the setup may create edge. |
| `universe_scope` | Explicit symbols or approved universe reference. |
| `horizon` | Expected observation / holding horizon. |
| `point_in_time_scope` | Data availability boundary at decision time. |
| `trigger` | Market condition required before state can advance. |
| `entry_condition` | Entry-ready condition, not a buy instruction. |
| `invalidation` | Condition that marks the candidate wrong or stale. |
| `required_evidence` | EvidenceRefs or evidence requirements needed before use. |
| `risk_budget` | Maximum allowed exposure or loss budget assumption. |
| `backtest_plan` | LiteBacktestPlan, not executed report; must state cost, slippage, out-of-sample, and leakage controls where applicable. |
| `reference_refs` | Optional reference corpus EvidenceRefs. |
| `promotion_boundary` | Maximum allowed lifecycle state after validation. |

Failure rule: if `trigger`, `invalidation`, `required_evidence`, or
`backtest_plan` is missing, the candidate cannot enter `waiting_trigger`.
If `point_in_time_scope` is missing, the candidate cannot be promoted beyond
`watch_only`.

### 7.2 DecisionObject

Every research decision output must be a structured DecisionObject.

Minimum required fields:

| Field | Requirement |
|---|---|
| `symbol` | Must be inside approved universe. |
| `direction` | `bullish`, `bearish`, `neutral`, or `watch_only`. |
| `decision_type` | `no_trade`, `observe`, `waiting_trigger`, `triggered`, or `invalidated`. |
| `setup_family` | Generic setup family or `none`. |
| `pattern_id` | Concrete mechanism id or `none`. |
| `entry_condition` | Required for `triggered`; otherwise optional. |
| `invalidation` | Required for all non-`no_trade` decisions. |
| `target_zone` | Optional; must not replace invalidation. |
| `holding_period` | Required for all non-`no_trade` decisions. |
| `confidence` | Numeric or enum confidence with documented ceiling rules. |
| `evidence_refs` | Required EvidenceRefs for the decision. |
| `counter_evidence` | Required for all non-`no_trade` decisions. |
| `risk_flags` | RiskGate-readable flags. |
| `risk_result` | RiskGate result after evaluation. |

If the output lacks invalidation or counter-evidence, it must be rejected or
downgraded to `watch_only`.

### 7.3 RunTrace v2 Minimum Artifact

Every relevant workflow run must persist:

- `run_id`;
- `workflow_name`;
- `workflow_version`;
- `graph_version` where applicable;
- `prompt_version` where applicable;
- `model_name` and model parameters where applicable;
- `input_payload`;
- `processed_context_id`;
- `memory_ids`;
- `tool_calls`;
- `tool_results`;
- `node_inputs`;
- `node_outputs`;
- `decision_object`;
- `policy_check_results`;
- `risk_result`;
- `human_review` if present;
- `token_usage`;
- `latency_ms`;
- `error_events`;
- `created_at`.

M0 only defines the minimum contract. It does not require migration of every
existing workflow in the first slice.

### 7.4 DataQualityGate

The system must not let raw provider data directly drive high-confidence
decisions.

Minimum checks:

- stale timestamp;
- missing price;
- missing volume when required by setup;
- source disagreement where multiple sources exist;
- premarket / after-hours context;
- suspicious price spike;
- API rate limited or partial data;
- insufficient history for the requested horizon;
- missing point-in-time provenance for any historical market, news, or
  fundamentals evidence;
- survivorship-bias exposure in universe construction;
- look-ahead or feature-leakage risk in any derived feature;
- cost or slippage assumptions missing when performance claims are attached.

Minimum result:

```text
PASS
WARN
FAIL
```

If DataQualityGate returns `FAIL`, downstream decision state must be
`watch_only` or `no_trade`.

### 7.5 RiskGate

RiskGate is independent from LLM reasoning and has veto power.

Minimum outputs:

```text
APPROVE
REJECT
REDUCE
WATCH_ONLY
NEEDS_HUMAN_CONFIRMATION
```

Minimum rules:

- DataQualityGate `FAIL` -> `WATCH_ONLY`;
- missing invalidation -> `REJECT`;
- missing counter-evidence -> `REJECT`;
- event-window risk -> `NEEDS_HUMAN_CONFIRMATION` or `WATCH_ONLY`;
- leveraged ETF plus high volatility -> `REDUCE` or `WATCH_ONLY`;
- risk budget exceeded -> `REJECT` or `REDUCE`;
- missing point-in-time provenance -> `WATCH_ONLY`;
- validation claim without out-of-sample split, cost model, or slippage
  assumption -> no promotion beyond `pending_shadow_tracking`;
- consecutive failed outcomes -> lower confidence ceiling;
- requested universe expansion -> require explicit product decision.

RiskGate result must outrank scoring, LLM confidence, playbook match, and
reference corpus similarity.

### 7.6 PaperTradeTracker Ledger

Every `triggered` or manually promoted candidate must be trackable without
becoming an order.

Minimum fields:

- `paper_trade_id`;
- `decision_id`;
- `candidate_id`;
- `symbol`;
- `direction`;
- `entry_condition`;
- `entry_triggered`;
- `decision_time`;
- `data_asof_time`;
- `entry_time`;
- `entry_reference_price`;
- `invalidation`;
- `target_zone`;
- `cost_model_version`;
- `slippage_assumption`;
- `benchmark_return`;
- `max_favorable_excursion`;
- `max_adverse_excursion`;
- `invalidation_hit`;
- `target_hit`;
- `holding_period_result`;
- `actual_outcome`;
- `post_mortem_status`;
- `memory_update_status`.

M0 defines the ledger shape. Execution and broker integration remain out of
scope.

## 8. Primary Return-Path Metrics

The system's high-return path must be measured through unit economics, not a
monthly return promise.

Minimum metrics:

- no-trade rate;
- number of A-grade candidate windows;
- trigger rate;
- win rate after costs;
- average and median return;
- average loss;
- MFE;
- MAE;
- expectancy after cost and slippage assumptions;
- benchmark-relative return for the same horizon;
- out-of-sample versus in-sample split;
- Deflated Sharpe Ratio or Probability of Backtest Overfitting note where a
  backtest is used for promotion evidence;
- maximum adverse excursion before success;
- consecutive failed candidates;
- downgrade rate caused by RiskGate;
- rejected opportunity count and reason;
- shadow-tracked candidate outcome distribution.

Acceptance language:

```text
The system is progressing when high-grade candidates show positive expectancy
after cost assumptions, high selectivity, bounded MAE, and enforceable
invalidation. The system is failing when it produces frequent opportunities
without evidence, invalidation, or RiskGate approval.
```

## 9. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-1 | Freeze Reference Corpus Boundary. | PRD states corpus cannot act as runtime authority or direct trigger. |
| FR-2 | Define two-layer setup taxonomy. | `setup_family` and `pattern_id` are both required for AlphaCandidate. |
| FR-3 | Define AlphaCandidateContract. | Candidate cannot advance without trigger, invalidation, evidence, risk budget, and LiteBacktestPlan. |
| FR-4 | Define DecisionObject. | Non-`no_trade` output requires evidence, counter-evidence, invalidation, holding period, and RiskGate result. |
| FR-5 | Define DataQualityGate. | Low-quality data forces `watch_only` or `no_trade`. |
| FR-6 | Define RiskGate. | RiskGate can reject, reduce, or watch-only independent of LLM confidence. |
| FR-7 | Define RunTrace v2 minimum artifact. | Workflow run can be audited through inputs, context, tools, node outputs, decision, gates, and outcome links. |
| FR-8 | Define PaperTradeTracker ledger. | Triggered candidates can be tracked through MFE, MAE, invalidation, target, and post-mortem fields. |
| FR-9 | Define return-path metrics. | System quality is evaluated by selectivity, expectancy, MAE/MFE, and downgrade/reject reasons. |
| FR-10 | Preserve promotion boundary. | Lite backtest cannot automatically mutate active RulePack or enable execution. |
| FR-11 | Define temporal-validity and bias checks. | Historical evidence and LLM-assisted validation must declare point-in-time scope, survivorship-bias exposure, look-ahead risk, and cost/slippage assumptions. |
| FR-12 | Align run artifacts with durable agent workflow SOTA. | Any workflow using model/tool/HITL steps can be audited through checkpoint/resume identity, trace spans, guardrail/policy results, and sensitive-data handling. |

## 10. Non-Negotiable Gates

- Corpus Reference Gate: reference corpus can seed hypotheses only.
- Evidence Gate: no EvidenceRef, no market data, or no invalidation means no
  `waiting_trigger`.
- Data Quality Gate: unusable data downgrades the decision.
- Risk Gate: RiskGate outranks LLM, scoring, and playbook match.
- Temporal Validity Gate: historical evidence without point-in-time provenance
  cannot support promotion.
- Bias Gate: look-ahead, survivorship, narrative, objective, and cost-bias
  exposure must be explicitly diagnosed before validation claims are used.
- Promotion Gate: validation can at most enter `pending_shadow_tracking` or
  `pending_manual_approval`.
- Universe Gate: symbol expansion requires explicit product decision.
- No Execution Gate: M0 does not create orders, paper orders, broker mirrors, or
  automatic position changes.
- Selectivity Gate: high no-trade rate is allowed and expected. Forced daily
  opportunity generation is a failure.

## 11. M0 Verification Plan

M0 is a contract/specification milestone. Verification is document and contract
review, not code execution.

Required checks before implementation planning:

1. Reviewer can point to the Reference Corpus Boundary and confirm it blocks
   runtime authority from corpus.
2. Reviewer can identify the two-layer taxonomy fields in AlphaCandidate.
3. Reviewer can map each FR to at least one future schema, policy check, or test.
4. Reviewer can confirm M0 does not pull MarketJudgmentGraph, execution surfaces,
   paper orders, or broker mirror forward.
5. Reviewer can confirm the PRD aligns with backlog order:
   Alpha candidate contract -> policy checks -> AlphaResearchGraph -> later
   MarketJudgmentGraph.
6. Reviewer can confirm web-checked SOTA sources are used only to strengthen
   validation, trace, and risk gates, not to add execution, broad scanning, or
   model-version-specific dependencies.

## 12. First Implementation Planning Slice After Confirmation

After this PRD is confirmed, the next artifact should be a module spec for:

```text
M0-S1: AlphaCandidateContract + Reference Corpus Boundary
```

Allowed focus:

- shared contract shape;
- deterministic validation;
- policy-check assertions;
- tests proving corpus-derived text cannot be accepted as a runtime trigger.

Forbidden focus:

- live trading;
- paper order execution;
- broker integration;
- automatic RulePack mutation;
- full MarketJudgmentGraph;
- broad universe expansion.

## 13. Open Decisions

No blocking decision is required before confirming this PRD as the M0 contract.

Future implementation plans must ask for confirmation if they change:

- approved universe;
- promotion boundary;
- execution or paper-order scope;
- RiskGate policy;
- storage schema beyond the M0 contract;
- CLI/operator surface behavior.

## 14. 2026-06-04 SOTA Calibration Conclusion

Current SOTA strengthens this PRD's conservative direction:

- Agent engineering has moved toward durable workflow state, checkpoint/resume,
  trace spans, guardrails, and explicit human interrupts. This supports
  RunTrace v2 and policy-check artifacts before larger graphs are trusted.
- LLM trading research increasingly treats trading agents as auditable
  decision pipelines, not price-prediction or order-execution oracles. This
  supports DecisionObject, independent RiskGate, and no automatic execution.
- Finance-specific LLM evaluation now highlights look-ahead, survivorship,
  narrative, objective, and cost bias. This requires a temporal-validity gate
  before any historical result can support promotion.
- Backtest and shadow-tracking evidence must include realistic costs,
  slippage, out-of-sample separation, and multiple-testing caution. A strong
  in-sample result is not promotion evidence by itself.
- Regulatory and industry risk-control guidance for algorithmic trading
  reinforces pre-set limits, erroneous-order prevention, supervisory review,
  and annual effectiveness review. M0 remains research-only; if execution is
  proposed later, it must become a separate product decision and PRD.

Therefore the M0 contract should be confirmed only as:

```text
source-bounded setup intelligence
+ point-in-time evidence discipline
+ deterministic validation gates
+ auditable workflow traces
+ shadow/outcome learning ledger
- live order authority
- automatic RulePack mutation
- return promises
```
