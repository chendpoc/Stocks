# Trader Agent Subproject

`apps/trader-agent/` is the backend and shared-contract subproject for the trader-agent target system.

The former research console and cockpit apps have been removed. Historical UI
material lives under `project-docs/archive/`.

## Subproject Layout

```text
apps/trader-agent/
  package.json
  backend/
    pyproject.toml
    app/
    tests/
  shared/
    rulepacks/
    schemas/
```

## Ownership

- `backend/`: Agent Core Backend implementation.
- `shared/`: product-level contracts, RulePack files, and shared fixtures used by backend and workflows.

## Current Phase

Phase 0 starts with `backend/` only:

- FastAPI health endpoint.
- SQLite runtime schema bootstrap.
- RulePack loader reading `shared/rulepacks/v0_1_0.yaml`.
- Agent event audit writer.
- Minimal pytest coverage.

No trading execution path belongs in this subproject.

Package scripts assume the repository root `.venv` exists and contains the backend Python dependencies.
