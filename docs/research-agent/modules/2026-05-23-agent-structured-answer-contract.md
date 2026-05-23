# Agent Structured Answer Contract

## Goal

Make research-agent answers predictable and easier to compare across repeated runs.

Current answers contain useful evidence, but the prose can still drift. The agent should use a stable visible structure so later market-data tools, model-backed providers, and UI panels all point to the same mental model.

## Answer Contract

Every local deterministic answer should include these sections in order:

1. `结论`
2. `证据`
3. `反证`
4. `下一步观察`
5. `研究边界`

The answer should remain research-only. It may identify opportunity observations, evidence, and invalidation conditions, but must not become a buy/sell command.

## UI Contract

The React panel should preserve line breaks in the answer body. A structured answer is useless if the browser collapses it into one paragraph.

## Scope

- Update the local deterministic answer builder.
- Add the same structure requirement to the OpenAI-compatible prompt.
- Preserve current `reasoning_summary`, `tool_trace`, `policy_decisions`, and evidence JSONL behavior.
- Do not add a new endpoint or external data provider.

## Test Plan

- Add a provider test that verifies local answer section order and blocked-tool visibility.
- Add a source-level prompt test so the model-backed provider is also instructed to use the same structure.
- Add a UI static test that verifies answer text uses a pre-wrap class.

## Agent Split

No subagent. This is a small contract change touching provider wording, tests, and one UI rendering line.
