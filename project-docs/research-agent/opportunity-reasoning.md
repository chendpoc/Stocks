# Opportunity Reasoning Engine

This module is a local reasoning skeleton for opportunity observation workflows in `research-console`.

## Boundary

File: `apps/research-console/lib/opportunity-reasoning.ts`

The module accepts simplified local inputs:

- `summary`: selected-day overview, event summary, and risk notes.
- `opportunity`: local opportunity observation fields, including symbols, hypothesis, evidence, triggers, invalidation, and watch plan.
- `context`: admin theory notes and admin watchlist symbols.

It returns a staged result:

- `context`
- `adminTheory`
- `marketIntelNeeds`
- `evidenceNeeds`
- `candidateOpportunities`
- `invalidationPlan`
- `nextChecks`
- `reasoningSummary`

The module is a pure function. It does not read files, call the network, load environment variables, or require secrets. Its output is research observation only and must not be treated as a trading instruction.

## Why Raw Chain-of-Thought Is Not Exposed

The product goal is auditable research reasoning, not hidden model scratchpad disclosure.

Raw chain-of-thought creates three problems:

- It can expose internal deliberation that is not stable product data.
- It can invite users to over-trust intermediate speculation instead of checking evidence.
- It makes future model-backed agent integration harder because different providers handle hidden reasoning differently.

The public contract therefore exposes only structured, reviewable summaries:

- What local context was used.
- What admin theory is being tested.
- What market intelligence is still needed.
- What structured evidence is required before confidence can rise.
- Which candidates exist and what source basis supports each one.
- What would invalidate the idea.
- What should be checked next.

The module deliberately avoids fields such as `raw`, `cot`, and `chain_of_thought`.

## Fallback Language

When source evidence is incomplete, fallback text must still read like product copy:

- Use Chinese-first research language.
- Describe the evidence gap and next verification step.
- Avoid implementation terms such as placeholder, stub, or raw model scratchpad.
- Keep the boundary explicit: this is a research observation, not a trading instruction.

## Agent Integration Path

The next integration step should keep this module as the deterministic planning layer before any model or external tool call.

Recommended flow:

1. Load selected-day local context with existing server-side research context utilities.
2. Convert local summary and opportunity observation data into the simplified input shape.
3. Call `buildOpportunityReasoning(input)` on the server.
4. Render `reasoningSummary`, staged fields, and candidates in the Agent panel or Opportunity Board.
5. Use `evidenceNeeds`, `marketIntelNeeds`, and `nextChecks` as proposed tool-plan inputs.
6. Keep external quote/news tools behind existing policy gates and compare results against `invalidationPlan`.

This preserves the core boundary: local deterministic reasoning first, evidence refresh second, no direct trading instruction at any stage.

## Evidence Needs

`evidenceNeeds` is the bridge between local reasoning and future tool execution. It names missing evidence before the agent calls any external data provider.

Each need has:

- `kind`: `quote`, `history`, `news`, or `fundamental`
- `symbol`: ticker or `GENERAL`
- `question`: the concrete question the evidence should answer
- `preferredTools`: candidate tool names
- `required`: whether this evidence must be refreshed before confidence can rise

This is planning metadata only. It does not mean the evidence was fetched, and it must not be rendered as a buy/sell instruction.

The local provider consumes this field when the user explicitly asks to refresh or validate missing evidence. It maps needs to candidate tools, then the kernel sends each planned call through the normal policy gate.

The OpenAI-compatible provider also includes this field in the server-side prompt. That keeps model-backed planning aligned with the deterministic local contract while preserving the same fixed answer shape and policy boundary.
