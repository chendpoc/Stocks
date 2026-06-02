# PRD | Research Console | Gemini Options Agent Architecture | v1.0

Date: 2026-05-24

## Summary

This document decomposes Zhao's Longbridge topic about a "Gemini 2.5 Pro options version" into an implementable research-console architecture.

The product goal is not to imitate a personality or create an automated trading bot. The goal is to turn historical admin theory, options market evidence, opponent behavior, and review records into an auditable research assistant.

Source reference:

- Longbridge topic: `https://longbridge.com/zh-CN/topics/31275690`

## First-Principles Reading

The topic describes five useful system clues:

- Model wrapper: a Gemini 2.5 Pro based options workflow, likely prompt-, tool-, and data-layer adapted for options research.
- Opponent modeling: observation of top contest participants and their traded symbols to infer strategy types.
- Options evidence: Greeks, implied volatility, PCR, order book depth, option volume, dense strike/expiry activity, support and resistance.
- Strategy fusion: statistical, high-frequency, event-driven, and volatility-premium styles are compared and selectively merged.
- Human intervention: AI handles high-frequency data and computation; human judgment remains necessary for macro cycle, sentiment, and risk context.

The essential mechanism is therefore:

```text
historical admin theory
  + opponent behavior
  + options evidence
  + market/news context
  + review feedback
  -> bounded opportunity observation
```

The "personality" effect comes from a stable decision framework and repeated language shape. It should not be treated as model consciousness or independent market intuition.

## Product Context

Authoritative local docs:

- `project-docs/research-agent/trading-workbench-master-plan.md`
- `project-docs/research-agent/tooling.md`
- `project-docs/research-agent/opportunity-reasoning.md`
- `docs/trading-experiences/index.md`
- `project-docs/research-agent/modules/2026-05-23-codex-agent-research-flow-prd.md`
- `project-docs/research-agent/modules/2026-05-23-codex-evidence-tool-layer-prd.md`

Current research-console already has:

- Local daily summary context.
- Opportunity observation files.
- Deterministic opportunity reasoning.
- Evidence needs.
- Policy-gated market tools.
- Agent answer boundary: conclusion, evidence, falsification, next observation, research boundary.

Missing pieces for a Zhao-style options agent:

- A dedicated admin strategy rulebook.
- Options-chain and Greeks evidence.
- Opponent behavior records.
- Review and learning records tied to later outcomes.

## User Value

The user should be able to ask:

"Why does this opportunity look similar to Zhao's options framework, what evidence is missing, and what would invalidate it?"

The assistant should answer:

- Which strategy archetype the observation resembles.
- Which data supports that classification.
- Which evidence is missing.
- Which facts would cancel or downgrade the observation.
- What should be reviewed later.

It must not answer:

- What to buy or sell.
- Which order to place.
- Position size, entry, exit, stop loss, or target price.
- Any deterministic trading instruction.

## Architecture

### 1. Strategy Personality Layer

Purpose:

Represent Zhao's stable trading preferences as explicit rules, not as a vague persona prompt.

Inputs:

- Historical admin summaries.
- `docs/trading-experiences/index.md`.
- Future manually approved rulebook entries.

Core rule families:

- Market regime: passive reduction, holiday window, event window, earnings window, liquidity rotation.
- Signal confirmation: time window, price level, volume support, option-flow confirmation, turning-point behavior.
- Instrument discipline: stock first versus options only after confirmation, long-dated options used for short holding periods, avoid high-IV decay traps.
- Falsification: break previous low, no volume support, IV/volume divergence, news invalidation, strategy window expired.

Output:

`AdminStrategyRule[]` with rule id, source, regime, trigger, required evidence, invalidation, and confidence boundary.

### 2. Opponent Behavior Layer

Purpose:

Model what other strong participants are doing without treating them as truth.

Inputs:

- Contest or leaderboard symbols if available.
- Public posts or manually entered observations.
- Group chat references to other traders.

Strategy archetypes:

- Statistical/quantitative.
- Intraday high-frequency.
- Fundamental/event ambush.
- Volatility-premium anomaly.

Output:

`OpponentObservation[]` with participant type, symbols, instrument type, action timing, inferred strategy, supporting evidence, and uncertainty label.

Rules:

- Opponent behavior can raise research priority.
- It cannot confirm an opportunity by itself.
- It must always pass through independent evidence and falsification.

### 3. Options Evidence Layer

Purpose:

Add the missing options-specific evidence that stock quote tools cannot provide.

Evidence fields:

- Underlying price and volume.
- Option chain by expiry and strike.
- Call/put volume and open interest.
- PCR.
- IV and IV rank where available.
- Delta, gamma, theta, vega.
- Bid/ask spread and liquidity.
- Unusual volume versus baseline.
- Dense strike/expiry concentration.

Potential providers:

- Longbridge option quote and option-chain APIs.
- Other provider only after a separate provider-boundary PRD.
- Manual import if API coverage is insufficient.

Output:

`OptionsEvidenceSnapshot` with normalized metrics only. Raw provider payloads, request headers, and credentials must not reach browser payloads or agent logs.

### 4. Research Agent Layer

Purpose:

Use a model such as Gemini or an OpenAI-compatible provider to synthesize evidence into bounded research observations.

Required visible structure:

- Conclusion.
- Evidence.
- Falsification.
- Next observation.
- Research boundary.

Hidden/private surfaces:

- Raw prompt.
- Raw chain-of-thought.
- Provider payload.
- Credentials.
- Absolute local paths.

Model duties:

- Classify the observation by strategy archetype.
- Compare current data against admin strategy rules.
- Identify missing evidence.
- Prioritize falsification.
- Produce a bounded next-watch plan.

Model non-duties:

- No autonomous order execution.
- No portfolio allocation.
- No deterministic buy/sell instructions.
- No confidence upgrade without evidence.

### 5. Review And Learning Layer

Purpose:

Convert later outcomes into a searchable learning record.

Record fields:

- Observation id.
- Source day.
- Symbols and option contracts if applicable.
- Strategy archetype.
- Evidence used.
- Missing evidence at decision time.
- Invalidation conditions.
- Later outcome.
- Failure mode.
- Lesson.

This is the layer that makes the agent improve. Without it, the system only creates plausible commentary.

## Data Flow

```text
daily summary + admin history
  -> strategy rule extraction
  -> opportunity board
  -> selected Research Inspector
  -> evidence needs
  -> stock/options/news evidence refresh
  -> opponent behavior comparison
  -> agent synthesis
  -> review record after outcome
```

## Functional Requirements

### FR1: Admin Strategy Rulebook

Create a local strategy rulebook from historical Zhao summaries.

Acceptance criteria:

- Rules include source references.
- Rules are grouped by regime, signal, instrument discipline, and invalidation.
- The rulebook uses research language, not trade instruction language.
- The agent can cite rule ids, not raw full chat text.

### FR2: Opponent Observation Contract

Add a contract for opponent/contest behavior observations.

Acceptance criteria:

- Each observation carries uncertainty.
- Inferred strategy type is explicit.
- The browser sees bounded summaries only.
- No single opponent observation can become a confirmation signal.

### FR3: Options Evidence Needs

Extend evidence needs beyond quote/history/news/fundamental into options-specific needs.

Acceptance criteria:

- New evidence kinds cover option chain, Greeks, IV, PCR, spread/liquidity, and unusual volume.
- Evidence needs can be displayed before execution.
- Evidence execution remains policy-gated.

### FR4: Options Evidence Tool Boundary

Before implementing any provider, define normalized cache and browser-facing contracts.

Acceptance criteria:

- No raw option-chain payload reaches UI or agent logs.
- Cache stores normalized metrics only.
- Provider credentials stay server-side.
- Missing provider coverage is shown as blocked or unavailable, not silently fabricated.

### FR5: Research-Only Model Output

Model-backed and local-deterministic outputs must keep the same visible answer shape.

Acceptance criteria:

- The model output includes evidence and falsification.
- The answer cannot include buy, sell, long, short, entry, exit, stop loss, target price, position sizing, or order language.
- Provider failure falls back to deterministic local output.

### FR6: Review Records

Create later-outcome records for opportunity observations.

Acceptance criteria:

- Records capture observed result, failure mode, and learning note.
- Records are local-first and separate from public daily summaries.
- Future agent runs can retrieve compact lessons without exposing raw records.

## Out Of Scope

- Autonomous trading.
- Broker order execution.
- Position sizing.
- Real-time high-frequency infrastructure.
- Microsecond latency optimization.
- Training a custom neural network.
- Public deployment.
- Copying Longbridge topic content into public docs.

## Implementation Sequence

### Phase A: Rulebook Before Data

Build `AdminStrategyRule` and extract Zhao rule families from local summaries.

Reason:

Without a rulebook, the model will only produce fluent market commentary.

### Phase B: Options Evidence Contract

Add type contracts and tests for options-specific evidence needs before connecting a provider.

Reason:

Provider APIs tend to return large raw payloads. The boundary must exist before the first fetch.

### Phase C: Manual Opponent Records

Start with manual opponent observations instead of automatic scraping.

Reason:

Contest and social data are incomplete and noisy. Manual records make the first version auditable.

### Phase D: Provider Tool Spike

Prototype one Longbridge options evidence action after contract tests exist.

Reason:

Longbridge is the most context-aligned source, but credentials, endpoint coverage, and data shape must be verified live.

### Phase E: Review Records

Attach later outcomes to prior observations.

Reason:

This is the only mechanism that can separate repeatable signal from hindsight storytelling.

## Risks

- Persona trap: making the assistant sound like Zhao instead of making evidence better.
- Overfitting trap: treating top-contest behavior as predictive without independent confirmation.
- Data leakage: exposing raw option-chain payloads, credentials, or model prompts.
- Trading-instruction drift: model language can quietly turn observation into advice.
- False precision: Greeks and IV can create confidence even when liquidity or spread quality is poor.
- No-review failure: without outcome records, the system cannot learn which observations were useful.

## Recommended Next Step

Do not start with Gemini prompt tuning.

Start with a local module:

`project-docs/research-agent/modules/YYYY-MM-DD-admin-strategy-rulebook-prd.md`

That module should define `AdminStrategyRule`, extract the first rule set from `docs/trading-experiences/index.md` and recent summaries, then feed those rules into existing opportunity reasoning.

Only after that should the system add options-specific evidence tools.
