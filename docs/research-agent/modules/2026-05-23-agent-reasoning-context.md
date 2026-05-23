# Agent Reasoning Context Module

## Purpose

Connect the local staged opportunity reasoning engine to the conversational agent.

The workbench already has a deterministic `buildOpportunityReasoning(...)` function and the Opportunity Board already shows its output. The agent path should use the same local reasoning context so the chat response can explain:

- which admin theory is being tested;
- which candidates exist;
- what evidence is still needed;
- what would invalidate the observation;
- which checks should happen next.

This moves the React console closer to the target: a contextual, tool-calling, multi-turn trading research workbench.

## Boundaries

- Runtime surface: `apps/research-console`.
- Source of truth: local structured summary and local opportunity observation files for the selected day.
- Browser payload: bounded staged fields only. Do not expose raw Markdown, raw JSON, absolute local paths, or secrets.
- Reasoning boundary: expose structured reasoning summaries, not raw chain-of-thought.
- Trading boundary: output is research observation only, not buy/sell/long/short instruction.
- Daily pipeline boundary: do not modify `daily_summary_structured.py`, `utils/structured_summary.py`, `scripts/daily-summary.mjs`, notification scripts, or GitHub publishing workflows.

## Files

Implementation and tests:

- `packages/summary-core/src/index.ts`
- `apps/research-console/lib/opportunity-reasoning.ts`
- `apps/research-console/lib/opportunity-board.ts`
- `apps/research-console/lib/agent-kernel.ts`
- `apps/research-console/lib/agent-provider.ts`
- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`
- `test/opportunity-reasoning.test.mjs`

Documentation:

- `docs/research-agent/opportunity-reasoning.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Expected Behavior

- `runResearchAgent(...)` returns `opportunity_reasoning` built from the same selected-day local context as the Opportunity Board.
- The response remains bounded and does not include raw local Markdown or full structured JSON.
- `AgentPanel` renders the reasoning context with candidate opportunities, market intelligence needs, invalidation checks, and next checks.
- Provider prompts can reference the staged reasoning summary without requiring a second file read or exposing raw chain-of-thought.

## Tests

Focused commands:

```powershell
node --test --test-name-pattern "agent response includes staged opportunity reasoning|renders staged opportunity reasoning" test\daily-summary-assets.test.mjs
node --test test\opportunity-reasoning.test.mjs
```

Integration gates:

```powershell
npm run console:lint
npm run test:summary
npm run console:build
npm run pages:build
```

## Agent Split

- Worker-suitable: review UI copy and CSS for readability after implementation.
- Main-agent responsibility: type contract, kernel/provider integration, TDD, and full verification.

## Risks

- Duplicating reasoning-input construction can cause board and agent behavior to drift. Prefer one shared helper.
- Adding too much reasoning payload can expose local audit content or make chat responses heavy.
- The UI must clearly label this as research context, not trade advice.
- Provider prompt updates must not leak server-only paths or secrets.
