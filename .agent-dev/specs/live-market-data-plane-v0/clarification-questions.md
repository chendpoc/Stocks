# LiveMarketDataPlane v0 Clarification Questions

Status: open before implementation

These questions do not block the T015 spec gate. They block M2 implementation.

| ID | Category | Question | Why it blocks implementation |
|---|---|---|---|
| Q401 | dependency | Which provider and entitlement level supplies quote, depth, and trade facts? | Depth, delay, and tick availability determine adapter and validation behavior. |
| Q402 | scope_boundary | Which symbols and markets are in the first M2 implementation slice? | Storage, subscriptions, replay windows, and operator inspection depend on the initial market set. |
| Q403 | data_model | Where should normalized market facts be stored and how long should they be retained? | Replay and inspection need a durable store, but the store is not selected in T015. |
| Q404 | user_experience | Which surface inspects `MarketStateSnapshot` first: CLI, TUI, or cockpit? | The first inspection surface shapes the smallest useful API and artifact summary. |
| Q405 | risk | What staleness and gap thresholds block analysis monitoring versus paper/shadow use? | Consumer readiness needs deterministic thresholds before runtime implementation. |
| Q406 | dependency | Is provider fallback allowed in live monitoring, and if so which fallback sources are trusted? | Fallback must be explicit and must not hide missing live facts. |
