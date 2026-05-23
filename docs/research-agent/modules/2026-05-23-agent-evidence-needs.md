# Agent Evidence Needs

## Goal

Turn vague market-intelligence needs into structured evidence requirements.

The research agent already says it needs fresh market data, news, and validation. That is too loose for future tool planning. The next layer should identify which type of evidence is missing before calling any external API.

## Contract

Add `evidenceNeeds` to `OpportunityReasoningResult`.

Each item should include:

- `kind`: `quote`, `history`, `news`, or `fundamental`
- `symbol`: ticker or `GENERAL`
- `question`: what the evidence should answer
- `preferredTools`: candidate tool names that could satisfy it
- `required`: whether the evidence is required before confidence can rise

## Boundaries

- This is a planning layer, not a data-fetch layer.
- It must not call external APIs.
- It must not create buy/sell instructions.
- Keep existing `marketIntelNeeds` for compatibility.
- The UI may show evidence needs, but it must not imply the data was already fetched.

## Test Plan

- Add type-level coverage for `EvidenceNeed`.
- Add reasoning tests that produce quote/history/news/fundamental needs for symbols.
- Add UI coverage so the agent panel renders evidence needs separately from executed evidence.
- Run focused tests, `npm run console:lint`, `npm run test:summary`, and builds.

## Verification

- RED: `node --test --test-name-pattern "structured evidence needs|staged opportunity reasoning" test\opportunity-reasoning.test.mjs test\daily-summary-assets.test.mjs` failed before implementation because `EvidenceNeed/evidenceNeeds` did not exist.
- GREEN: the same focused command passed after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.
- `git diff --check` reported only existing LF/CRLF warnings, with no whitespace errors.

## Agent Split

No subagent. This touches shared types, reasoning output, and AgentPanel UI in a tight loop.
