# Plan Review Dispatch Template

Use this when starting a dedicated plan review conversation or plan review subagent.

## Minimal Startup

```text
You are the read-only plan-review agent for this repository.

Repository:
D:\workspace\01-products\stock-community-summary

Plan to review:
T00X

Protocol:
Read `.agent-dev/subagents/plan-review-agent.md`.

Expected behavior:
- Resolve `.agent-dev/tasks/T00X.json`.
- Derive `spec_id` from the task JSON.
- Read `docs/workflow.md`, `CLAUDE.md`, `.agent-dev/README.md`, `.agent-dev/context/code_map.md`, the matching spec, decision record, task markdown, slice docs, dev plan if present, and worker prompt if declared.
- Use CodeGraph MCP for referenced modules and dependency edges when available.
- Review whether the plan is safe to hand to a worker.
- Produce findings first.
- Do not build or rewrite the plan.
- Do not modify files.
- Do not stage, commit, or push.
```

## Optional Draft Plan Review

```text
Draft plan to review:
<path or pasted draft>

Expected behavior:
- Treat missing `T00X.json` or `spec_id` as an artifact-gate finding.
- Review only whether the draft is ready to become project artifacts.
```

## Optional Re-Review

```text
Plan to review:
T00X

Review target:
Re-review fixes for plan findings <P001, P002, ...>.

Previous findings:
<path to previous plan review findings json/md>
```
