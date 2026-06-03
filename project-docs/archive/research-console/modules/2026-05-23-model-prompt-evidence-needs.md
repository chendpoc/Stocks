# Model Prompt Evidence Needs

## Goal

Pass structured `evidenceNeeds` into the OpenAI-compatible provider prompt.

The local provider can now translate evidence needs into tool plans, but the model-backed provider still sees only broad market-intelligence text. That makes model tool planning less deterministic and pushes it back toward guessing.

## Contract

- `buildPrompt(...)` must include a readable evidence-needs section.
- Each evidence need should expose:
  - kind
  - symbol
  - question
  - preferred tools
  - required flag
- The prompt must preserve the research-only boundary and the fixed answer shape.
- Browser/client code must still not see provider API keys or model environment variables.
- This module does not change tool policy, tool execution, or provider credentials.

## Boundaries

- Server prompt only.
- No new external network call.
- No new model provider.
- No subagent. The change is a tight provider/test update.

## Test Plan

- RED: OpenAI-compatible provider mock request body should contain the evidence-needs section and concrete tool candidates.
- GREEN: add the evidence-needs line to `buildPrompt(...)`.
- Run focused provider tests, `npm run console:lint`, `npm run test:summary`, and builds.

## Verification

- RED: `node --test --test-name-pattern "openai-compatible prompt includes structured evidence needs|openai-compatible provider parses model tool calls|server-only openai compatible" test\daily-summary-assets.test.mjs` failed before implementation because the model prompt did not include `Evidence needs:`.
- GREEN: the same focused command passed after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.
- `git diff --check` reported only existing LF/CRLF warnings, with no whitespace errors.
