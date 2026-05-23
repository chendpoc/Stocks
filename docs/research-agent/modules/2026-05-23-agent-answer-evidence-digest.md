# Agent Answer Evidence Digest

## Goal

Make each local research-agent answer self-explanatory by including a compact evidence digest in the visible answer text.

The current evidence trail is auditable through tool traces and local JSONL records, but the user reading the chat response should not need to open raw evidence logs to know:

- which local or external evidence was used;
- which tool requests were blocked by policy;
- whether the answer is research-only instead of a trading instruction.

## Scope

- Add visible evidence and policy notes to the local deterministic agent answer.
- Keep the structured `tool_trace`, `policy_decisions`, and JSONL evidence records unchanged.
- Do not expose raw Markdown, raw JSON, secrets, authorization headers, or absolute local paths.
- Do not add any new external data provider.

## Behavior

The visible answer should include:

1. `证据摘要` with bounded tool result summaries.
2. `策略阻断` when a requested tool is blocked.
3. `研究边界` explaining that the output is an opportunity observation, not a buy/sell command.

When no tools were executed, the digest should still say that only local summary and opportunity context were used.

## Test Plan

- Add a focused Node test for `createResearchAgentProvider().generateResponse(...)`.
- Verify the answer contains the evidence section.
- Verify blocked policy decisions are visible.
- Verify blocked tools are not treated as executed evidence.
- Verify the research-only boundary is visible.

## Agent Split

No subagent for this module. The change is small, tightly coupled to provider response wording, and should stay local to avoid increasing the already high agent count.
