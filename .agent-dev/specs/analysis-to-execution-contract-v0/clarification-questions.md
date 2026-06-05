# Clarification Questions: Analysis-to-Execution Contract v0

These questions do not block the M1 contract draft. They block M2 or later
implementation if still unanswered.

## Q301: Which provider and entitlement level will supply quote/depth/trade?

**Category**: dependency

**Context**: M2 `LiveMarketDataPlane v0` needs real provider constraints before
implementation. M1 only defines the handoff contract.

**Impact**: Provider choice changes normalized fields, latency expectations,
depth levels, replay semantics, and data-quality flags.

**Status**: pending for M2

## Q302: Which symbols and markets are in the first paper/shadow scope?

**Category**: scope_boundary

**Context**: `OpportunityMap` and `RiskEnvelope` can define fields now, but the
first executable scope needs a bounded symbol/market list.

**Impact**: Market sessions, quote format, currency, tick size, liquidity
constraints, and event-risk rules vary by market.

**Status**: pending for M2/M3

## Q303: Which concrete risk limits define the first RiskGate?

**Category**: data_model

**Context**: M1 defines `risk_limits` fields. M3 needs concrete policy values to
make deterministic allow/reject/reduce decisions.

**Impact**: Without concrete limits, `PaperTradingEngine` cannot produce
meaningful risk decisions or compare execution feedback.

**Status**: pending for M3

## Q304: Which operator surface inspects execution artifacts first?

**Category**: user_experience

**Context**: M6 will expose inspection, approval, audit, and kill-switch
behavior. The first surface may be CLI, TUI, or cockpit.

**Impact**: This changes command/API shape and review ergonomics, but does not
block M1.

**Status**: pending for M6
