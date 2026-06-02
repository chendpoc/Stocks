# 06 Self-Learning Market Judgment Model Roadmap

## 1. Decision Summary

The trader-agent system should evolve beyond alpha-factor discovery into a professional market judgment agent.

Accepted direction:

- Keep alpha research as one core loop: discover candidate patterns, validate them, and promote only after evidence.
- Add market judgment as a second core loop: read current market state, form opportunity bias, define triggers and invalidations, and evaluate judgment quality after outcomes arrive.
- Add model learning as a third core loop: run offline training experiments for challenger models over 100, 1000, or N rounds, then evaluate checkpoints before any promotion.
- Use LangGraph for durable workflow orchestration, checkpointing, resume, audit, and human gates.
- Do not use LangGraph as the model training framework. Training jobs should run in Python/PyTorch, LightGBM, XGBoost, sklearn, or another dedicated training runtime.

This document records a future product and architecture direction. It does not change Stage 1 scope, and it does not authorize automatic model promotion, automatic trading, or direct rule activation.

## 2. Three Complementary Loops

### Alpha Research Loop

Purpose: find repeatable alpha or market-structure patterns.

```text
InsightCandidate
-> RuleCandidate
-> LiteBacktestReport
-> ShadowTracking
-> AcceptedLesson
```

Key rule: an insight is not accepted just because a model proposed it. It must pass evidence requirements, lite backtest, and later validation gates.

### Market Judgment Loop

Purpose: make the agent behave more like a professional trader who understands current market conditions, waits for triggers, and controls risk.

```text
MarketRead
-> OpportunityPlan
-> DecisionEnvelope
-> OutcomeLabel / JudgmentEvaluation
-> PlaybookUpdate / MistakePattern
```

The agent should learn:

- current market regime: `risk_on`, `risk_off`, `mixed`, `chop`, event-driven, rotation, or liquidity-led;
- dominant themes and weak areas;
- which opportunities are actionable now versus waiting for trigger;
- what invalidates the current view;
- which risk warnings should reduce exposure or block action;
- which past mistakes are recurring.

### Model Learning Loop

Purpose: train and evaluate challenger models offline before any production use.

```text
DatasetSnapshot
-> TrainingRun
-> TrainingRound
-> ModelCheckpoint
-> ModelEvaluationReport
-> PromotionGate
```

The system may run N rounds of training or self-learning, but evaluation must be independent from training and promotion must remain gated.

## 3. Role Boundaries

| Component | Responsibility | Non-responsibility |
|---|---|---|
| LLM / agent model | Structured synthesis, hypothesis generation, market read explanation, mistake analysis | Direct unrestricted trading, unsupervised promotion, bypassing evidence |
| Deterministic engines | Context building, rules, scoring, risk vetoes, outcome labels, evidence quality | Open-ended strategy invention |
| Deep learning / ML models | Regime classification, opportunity ranking, return/risk prediction, event scoring | Owning the whole trading policy in v0 |
| LangGraph workflow | Orchestration, checkpoints, retries, long-running state, audit, HITL gates | Gradient descent, model fitting, feature computation internals |
| Human / promotion gate | Approve model promotion, active RulePack changes, and risky scope changes | Labeling every routine sample manually |

## 4. First Model Targets

V0 should not start by training a full trading policy. The safer first targets are:

| Model target | Purpose | Why first |
|---|---|---|
| `market_regime_classifier` | Classify market condition from index, sector, volatility, breadth, flow, and event context | Useful for judgment and risk; easier to evaluate |
| `opportunity_ranking_model` | Rank watchlist or SignalCandidate items | Directly improves prioritization without executing trades |
| `setup_success_probability_model` | Estimate probability that a setup reaches target before invalidation | Naturally connects to OutcomeGraph labels |
| `return_risk_predictor` | Predict horizon return, drawdown, MFE, MAE, and benchmark-relative return | Useful for scoring and sizing research |
| `event_impact_scorer` | Score news, filing, earnings, holder change, or policy events | Supports event-driven and market judgment workflows |

Out of v0:

- full reinforcement-learning trading policy;
- direct broker execution;
- automatic production model replacement;
- training directly on unverified model-generated labels;
- any path that allows a model to bypass Rule Engine, Risk Engine, or PromotionGate.

## 5. ModelLearningGraph Sketch

`ModelLearningGraph` should be a future `apps/trader-workflows` graph that orchestrates offline model learning.

Recommended nodes:

```text
build_dataset_snapshot
-> lock_train_validation_test_split
-> train_challenger_model
-> evaluate_checkpoint
-> run_walk_forward_backtest
-> compare_against_baseline
-> detect_overfit_or_leakage
-> decide_next_round
-> write_training_run_report
-> promotion_gate
```

Training command shape:

```text
run model-learning --rounds 1000 --objective market_judgment_v0
```

Expected final output:

```text
TrainingRunReport {
  rounds_completed
  objective
  dataset_version
  best_checkpoint
  baseline_model_version
  challenger_versions
  validation_metrics
  walk_forward_metrics
  regime_breakdown
  strongest_patterns
  failed_patterns
  overfit_warnings
  leakage_warnings
  shadow_mode_recommendation
  promotion_recommendation
}
```

## 6. Evaluation Requirements

Every training run must separate training from evaluation.

Required gates:

- dataset snapshot is immutable for the run;
- train, validation, and test splits are locked before training starts;
- walk-forward validation is used for time-series behavior;
- metrics are broken down by market regime, symbol group, candidate family, and horizon;
- baseline model comparison is required;
- overfit warnings are explicit;
- leakage checks are explicit;
- shadow-mode recommendation is separate from production promotion;
- no production model config changes happen inside the training graph.

Useful metrics:

- benchmark-relative return;
- hit target rate;
- invalidation hit rate;
- MFE / MAE;
- calibration error for probability outputs;
- precision at top K for opportunity ranking;
- regime classification accuracy and confusion matrix;
- human override delta;
- drawdown and tail-risk behavior.

## 7. Relationship To Current Stage 1

Current Stage 1 remains:

```text
DecisionGraph
OutcomeGraph
EvaluationGraph
InsightExplorationGraph
```

Stage 1 explicitly does not include automatic model training, automatic model promotion, broker execution, or full model registry.

The future workflow family becomes:

```text
apps/trader-workflows
  -> DecisionGraph
  -> OutcomeGraph
  -> EvaluationGraph
  -> InsightExplorationGraph
  -> AlphaResearchGraph
  -> MarketJudgmentGraph
  -> ModelLearningGraph
```

This is a superset of the current trader-workflows direction, not a replacement for it.

## 8. Safety Boundary

The system may automatically train and evaluate challenger models, but must not automatically hand them production authority.

Hard boundaries:

- no direct trading from `ModelLearningGraph`;
- no automatic active RulePack mutation;
- no automatic model promotion without gate;
- no training on labels generated only by the same model being trained;
- no promotion based only on in-sample or training metrics;
- no hidden model switch in CLI, Cockpit, scheduler, or runtime;
- every checkpoint, metric, and decision must be auditable.

## 9. Next Spec To Write

When this direction enters implementation planning, write a dedicated `ModelLearningGraph v0` spec that defines:

- `TrainingRun`;
- `DatasetSnapshot`;
- `TrainingRound`;
- `ModelCheckpoint`;
- `ModelEvaluationReport`;
- `PromotionGate`;
- CLI/API entrypoints;
- persistence tables or artifact layout;
- verification commands;
- explicit non-goals.

Recommended first implementation target:

```text
ModelLearningGraph v0 for opportunity_ranking_model
```

Reason: ranking improves trader judgment and watchlist prioritization without granting the model execution authority.
