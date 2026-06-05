# LiveMarketDataPlane Implementation Decision Gate Questions

Status: pending user confirmation

These questions block M2 implementation, not the T016 planning artifact.

| ID | Category | Question | Recommended answer |
|---|---|---|---|
| Q501 | dependency | Which provider and entitlement should be used first? | Longbridge OpenAPI quote domain with startup entitlement probe. |
| Q502 | scope_boundary | Which first symbols and market sessions are in scope? | US equities: `TSLA.US`, `NVDA.US`, `AAPL.US`, `QQQ.US`, `SPY.US`, regular trading hours first. |
| Q503 | data_model | Where should normalized facts be stored? | Dedicated M2 tables in `data/market_intel.db`; optional bounded raw refs. |
| Q504 | data_model | What retention should v0 use? | 7 trading days for normalized quote/depth/trade facts; 30 calendar days for derived artifacts. |
| Q505 | user_experience | Which surface inspects market state first? | Backend read APIs plus CLI inspection first. |
| Q506 | risk | What readiness thresholds should be used first? | Analysis warning > 5s, analysis blocked > 30s, paper/shadow blocked > 2s or missing required depth/trade. |
| Q507 | dependency | Is provider fallback allowed? | No silent live fallback; replay/degraded only, labeled, and cannot upgrade readiness. |
| Q508 | scope_boundary | Does M2 include execution simulation? | No. M2 remains read-only; M3 owns PaperTradingEngine and execution state. |
