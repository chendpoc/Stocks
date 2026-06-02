# Research Agent Docs Boundary

This directory contains both active target-system docs and historical research
console material. Do not broad-read this tree for ordinary engineering work.

## Read First

| Need | Start here |
|---|---|
| Current trader-agent target system | `target-system/README.md` |
| Current trader-agent workflow routing | `target-system/trader-agent/README.md` |
| Legacy research-console migration | `trading-workbench-master-plan.md` |
| Legacy module detail | `modules/README.md` |

## Status Map

| Path | Status | Default read |
|---|---|---|
| `target-system/trader-agent/` | active source-of-truth | only through an explicit trader-agent route |
| `modules/` | legacy implementation slices | no |
| `trading-workbench-master-plan.md` | superseded master plan | no |
| root release/queue/handoff docs | historical/local operations records | no |
| `design/` | historical design assets | no |

## Rules

- Do not treat `project-docs/research-agent/modules/**` as current product direction.
- Do not use `trading-workbench-master-plan.md` as the current roadmap.
- Do not move paths in this tree without a migration task; tests and old specs
  still reference many historical files.
- For ordinary implementation, use `.agent-dev/context/ai-index.md` first and
  read only the selected route's documents.
