# Trader Agent Backend

Agent Core Backend for the `apps/trader-agent/` subproject.

Phase 0 scope:

- FastAPI application entrypoint.
- SQLite runtime state.
- Local data directory bootstrap.
- RulePack loader.
- Agent event writer.
- Focused tests for health, schema bootstrap, RulePack loading, and event persistence.

The backend reads canonical RulePack files from `../shared/rulepacks/`.

