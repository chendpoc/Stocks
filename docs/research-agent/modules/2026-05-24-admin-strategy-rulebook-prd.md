# PRD | Research Console | AdminStrategyRule v1 | v1.0

Date: 2026-05-24

## Summary

This module establishes `AdminStrategyRule v1`, a local Zhao strategy rulebook for the research console.

The rulebook turns recurring admin theory into explicit, source-referenced research rules. It is not a trading strategy engine, not a prompt persona, and not an order-generation layer.

## Product Context

Authoritative docs:

- `docs/research-agent/trading-workbench-master-plan.md`
- `docs/research-agent/opportunity-reasoning.md`
- `docs/research-agent/tooling.md`
- `docs/research-agent/modules/2026-05-24-gemini-options-agent-architecture.md`
- `docs/trading-experiences/index.md`
- `docs/opportunities/2026-05/2026-05-22-机会观察.md`
- `docs/index.md`

Current implementation surfaces:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/admin-strategy-rulebook.ts`
- `apps/research-console/lib/opportunity-reasoning.ts`
- `test/opportunity-reasoning.test.mjs`

## User Value

The user should see opportunity reasoning tied to named Zhao-style rules instead of vague "admin theory" prose.

The agent should be able to answer:

- Which admin strategy rules matched this observation?
- What evidence does each rule require?
- What would invalidate the observation?
- Which source docs support the rule?

It must not answer:

- What to trade.
- How much to allocate.
- Which order to place.
- A deterministic market prediction.

## Functional Requirements

### FR1: Shared Contract

`summary-core` must expose stable rulebook types:

- `AdminStrategyRuleFamily`
- `AdminStrategyRule`
- `AdminStrategyRuleMatch`
- `OpportunityReasoningResult.matchedAdminRules`

Acceptance criteria:

- Rule families include market regime, signal confirmation, instrument discipline, and falsification.
- Rule matches expose bounded summaries, not raw chat logs.
- `matchedAdminRules` is present in every opportunity reasoning result.

### FR2: Version 1 Rulebook

The local rulebook must include the first set of Zhao-style rules.

Required rule categories:

- Passive reduction and time-window regime.
- Turning-point and volume confirmation.
- Weekend/event cash discipline.
- BTC or crypto leading signal.
- Liquidity rotation.
- Three-day bad-news digestion.
- Options time-decay discipline.
- Historical half-rebound reference.
- Key-symbol focus.
- Falsification before escalation.

Acceptance criteria:

- At least eight rules exist.
- Every rule has id, title, family, regime, thesis, trigger, required evidence, invalidation, instrument discipline, source refs, research boundary, and keywords.
- Every rule id starts with `zhao-`.
- Every rule has source references to local docs.
- Rule text stays research-only.

### FR3: Context Matching

The rulebook must map selected-day context into bounded rule matches.

Acceptance criteria:

- Matching uses local input only.
- Matches include reason, evidence needs, invalidation, and source refs.
- Passive reduction context matches `zhao-passive-reduction-window`.
- Price/time/capital-acceptance context matches `zhao-turning-volume-confirmation`.
- Weekend or event risk context matches `zhao-event-weekend-cash-discipline`.

### FR4: Opportunity Reasoning Integration

`buildOpportunityReasoning(...)` must surface matched rules.

Acceptance criteria:

- `matchedAdminRules` appears beside `adminTheory`.
- Research plan hypothesis step references rule matches.
- Reasoning summary includes rule-match count.
- Existing evidence needs, invalidation plan, and candidate opportunities remain intact.

## Out Of Scope

- Automatic extraction from raw chat.
- Longbridge options-chain integration.
- Opponent behavior modeling.
- Review-record persistence.
- Prompt-persona imitation.
- Autonomous order execution.
- Public deployment.

## Data Boundary

Allowed:

- Rule ids.
- Rule titles.
- Bounded evidence and invalidation summaries.
- Workspace-relative source refs.

Not allowed:

- Raw chat logs.
- Model prompts.
- Raw chain-of-thought.
- Provider payloads.
- Credentials.
- Direct transaction instructions.

## Verification

Focused verification:

```text
node --test test\opportunity-reasoning.test.mjs
```

Expected result:

- Rulebook tests pass.
- Existing opportunity reasoning tests pass.
- No raw chain-of-thought fields are exposed.
- Rulebook language stays research-only.

Broader follow-up verification before release:

```text
npm run console:lint
npm run console:build
npm run test:summary
```

## Risks

- Rule overfitting: source docs are summaries, not raw trade records.
- Persona drift: stable language can look like personality even when it is only a rule match.
- False confidence: matching a rule does not validate an opportunity.
- Source staleness: rules must stay source-referenced and reviewable.
- Scope creep: options data and opponent modeling belong to later modules.

## Status

Implemented locally as `AdminStrategyRule v1` with static source-referenced rules and deterministic context matching.
