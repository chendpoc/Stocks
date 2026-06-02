# Design Notes Index

Status: planning/reference index
Date: 2026-06-02

This directory contains planning notes for the self-evolving trading agent. These notes are not implementation tasks by themselves and do not override current task/spec artifacts. Promote a note into `.agent-dev/tasks/**` or `.agent-dev/specs/**` only after an explicit planning/review decision.

## Current Notes

| Note | Purpose | Use When |
|---|---|---|
| `T006-workflow-design.md` | Captures candidate T006 revision ideas: ContextGatherGraph, DecisionGraph, OutcomeGraph, EvaluationGraph, InsightExplorationGraph, ExecutionIntent, provider guidance, and pending sync items. | Planning a T006 revision or a follow-up task after reading the current T006 task/spec/decision record. |
| `self-evolving-agent-backlog.md` | P0-P4 backlog for future workflows and data-foundation modules. | Discussing what to build after T006, or deciding whether a new idea belongs in near-term scope. |
| `self-evolving-agent-cross-cutting-concerns.md` | Cross-cutting rules for market data quality, replay, run governance, HITL, dataset hygiene, evaluation integrity, and trace policy. | Writing future specs, worker prompts, review gates, and tests. |

## Reading Order

Always read current source-of-truth artifacts before these notes:

```text
1. docs/workflow.md
2. CLAUDE.md
3. .agent-dev/tasks/T006.json
4. .agent-dev/tasks/T006.md
5. .agent-dev/specs/self-evolving-agent-stage1/spec.json
6. .agent-dev/specs/self-evolving-agent-stage1/spec.md
7. .agent-dev/specs/self-evolving-agent-stage1/decision-record.json
```

Then read design notes:

```text
1. T006-workflow-design.md
2. self-evolving-agent-backlog.md
3. self-evolving-agent-cross-cutting-concerns.md
```

## Scope Boundary

These notes are planning artifacts. They must not silently expand active implementation scope.

Current T006 task artifacts may already be marked complete. Future changes from these notes require either a T006 revision gate or a new task/spec.

Before implementation:

```text
review note
-> select 3-5 decisions for revision
-> promote selected decisions into decision-record/spec/task/slice
-> review updated plan
-> dispatch implementation worker
```

Do not hand these notes directly to a worker as implementation scope.
