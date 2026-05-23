# Agent Response Evidence Panel

## Goal

Expose the current agent response evidence chain in the React console without forcing the user to inspect JSONL cache files.

The answer text now includes a compact digest, but the UI still mixes full tool traces and policy decisions into plain lists. A dedicated evidence panel makes the latest response easier to audit.

## Scope

- Add a visual evidence-detail section inside `AgentPanel`.
- Summarize executed tools, blocked policy decisions, evidence log path, and research-only boundary.
- Keep full JSONL records local; do not expose raw Markdown, raw JSON, secrets, headers, prompts, or absolute paths.
- Do not add a new route or modal in this module.

## UI Direction

- Utilitarian research-console style.
- Dense but readable.
- Small stat tiles for executed tools and blocked tools.
- Separate row styles for executed evidence and blocked policy decisions.
- Fixed-width panel remains unchanged.

## Test Plan

- Add a static test for `AgentPanel.tsx` and `globals.css`.
- Verify the response panel renders `agent-evidence-detail`.
- Verify it derives counts from `reply.tool_trace.length` and filtered blocked policy decisions.
- Verify it displays `reply.evidence_log_path`.
- Verify blocked decisions render separately from executed tool traces.

## Agent Split

No subagent. The write set is narrow and overlaps the active UI file; adding another agent would increase merge risk more than it helps.
