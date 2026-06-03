# Model Prompt Context Sections

## Goal

Make the OpenAI-compatible provider prompt expose opportunity context sections with stable, explicit labels, not only broad Chinese prose labels.

## Background

The model prompt already includes:

- `Research plan:`
- `Evidence needs:`
- market-intelligence text
- next-check text

The gap is that market-intelligence and next-check content are not covered by a stable English section contract. That makes model-backed planning more dependent on prose parsing, while the rest of the prompt has explicit machine-readable anchors.

## Contract

- `buildPrompt(...)` must include:
  - `Market intel needs:`
  - `Next checks:`
  - `Invalidation plan:`
- These sections must use the same bounded opportunity-reasoning data already sent to the provider.
- The prompt must still include `Research plan:` and `Evidence needs:`.
- Do not add new external tools, network calls, provider credentials, or browser-visible data.
- Do not expose secrets or raw local files.

## Boundaries

- Server-side model prompt only.
- No UI change.
- No provider schema change.
- No subagent.

## Test Plan

- RED：OpenAI-compatible provider prompt test should require `Market intel needs:`, `Next checks:`, and `Invalidation plan:`.
- GREEN：update `buildPrompt(...)` section labels and keep existing evidence/research-plan sections passing.
- Run focused provider test, `npm run test:summary`, `npm run console:build`, and `npm run pages:build`.

## Verification

- RED: `node --test --test-name-pattern "openai-compatible prompt includes structured evidence needs" test\daily-summary-assets.test.mjs` failed because the prompt still used Chinese prose labels for market intel, invalidation, and next checks.
- GREEN: the same focused command passed after adding stable English section labels.
- Full relevant checks passed:
  - `npm run test:summary`
  - `npm run console:build`
  - `npm run pages:build`
