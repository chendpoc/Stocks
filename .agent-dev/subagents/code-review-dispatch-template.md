# Code Review Dispatch Template

Use this when starting a dedicated review conversation or review subagent.

## Minimal Startup

```text
You are the read-only code-review agent for this repository.

Repository:
D:\workspace\01-products\stock-community-summary

Task to review:
T00X

Protocol:
Read `.agent-dev/subagents/code-review-agent.md`.

Expected behavior:
- Resolve `.agent-dev/tasks/T00X.json`.
- Derive `spec_id` from the task JSON.
- Read the matching spec, decision record, task markdown, slice docs, worker prompt if present, `.agent-dev/context/code_map.md`, and current diff.
- Use CodeGraph MCP for changed symbols and dependency edges when available.
- Produce findings first.
- Do not modify files.
- Do not stage, commit, or push.
```

## Optional Slice Review

```text
Task to review:
T00X

Slice:
<slice id or slice file>

Review target:
Only this slice's diff and acceptance criteria.
```

## Optional Re-Review

```text
Task to review:
T00X

Review target:
Re-review fixes for findings <F001, F002, ...>.

Previous findings:
<path to previous review findings json/md>
```
