# T017 Clarification Questions

Status: no blocking questions

No user-blocking product questions are required for T017 because the slice is
read-only observability over the existing `Stage1Runtime` checkpoint store.

Deferred questions for later milestones:

| ID | Question | Why deferred |
|---|---|---|
| Q601 | Should workflow runtime traces merge backend `agent_events`? | Needs a cross-system audit/event contract. |
| Q602 | Should Run Monitor become a cockpit/TUI surface? | UI surfaces should wait until the CLI/API read model stabilizes. |
| Q603 | Should operators retry, cancel, or replay individual nodes? | These are workflow-control semantics, not observability. |
