# Research Agent Docs Boundary

This directory contains active trader-agent target-system docs. Historical
research-console and trader-cockpit material has moved to `../archive/`.
Do not broad-read this tree for ordinary engineering work.

## Read First

| Need | Start here |
|---|---|
| Current trader-agent target system | `target-system/README.md` |
| Current trader-agent workflow routing | `target-system/trader-agent/README.md` |
| Archived research-console material | `../archive/research-console/` |
| Archived trader-cockpit material | `../archive/trader-cockpit/` |

## Status Map

| Path | Status | Default read |
|---|---|---|
| `target-system/trader-agent/` | active source-of-truth | only through an explicit trader-agent route |
| `../archive/research-console/` | archived legacy research console and workbench docs | no |
| `../archive/trader-cockpit/` | archived removed cockpit docs | no |

## Rules

- Do not treat `project-docs/archive/**` as current product direction.
- Do not use archived research-console or trader-cockpit docs as the current
  roadmap.
- Do not move paths in this tree without a migration task; tests and old specs
  may still reference historical files.
- For ordinary implementation, use `.agent-dev/context/ai-index.md` first and
  read only the selected route's documents.
