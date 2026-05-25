# 10 - Market Brain

Source module: `01-agent-core-backend-prd.md` module 10.  
Phase: Phase 1.5 after Market Snapshot and Rule Engine inputs stabilize.  
Domain: Market and opportunity chain.

## Module Goal

Classify current market regime, ticker strength, market gate, catalysts, options confirmation, crypto-beta state, and flow warnings for Opportunity Brain.

## Non-Goals

- Does not replace Rule Engine.
- Does not create tickets.
- Does not decide final risk veto.
- Does not call high-cost tools without permission.

## Inputs And Outputs

Inputs:

- `MarketSnapshot` for SPY, QQQ, and target symbol.
- RulePack market-gate configuration.
- Optional news, options, crypto, and flow tool outputs.

Outputs:

- `market_gate`, `market_regime`, `ticker_strength`, `news_catalyst`, `options_confirmation`, `crypto_beta_state`, `flow_warning`.
- Bounded evidence and missing evidence fields.

## Core Tables And Schema

No dedicated table is required. Outputs are stored in:

- `signals.evidence`.
- `signals.market_gate`.
- `signals.tool_outputs`.
- `agent_events.output_summary`.

Related platform objects:

- `agent_capabilities` gates tools.
- `approval_requests` gates high-risk or high-cost calls.
- Tool calls are audited through Tool Gateway.

## API Contract

```text
POST /api/market-brain/analyze
POST /api/market-brain/analyze/{symbol}
```

Response:

```json
{
  "symbol": "COIN",
  "market_regime": "risk_on",
  "market_gate": "caution",
  "ticker_strength": "strong_vs_qqq",
  "crypto_beta_state": "btc_supportive",
  "flow_warning": null,
  "missing_evidence": []
}
```

## Dependencies

- Requires Market Snapshot Service.
- Reads RulePack.
- Calls Tool Registry / MCP Adapter for optional tools.
- Feeds Opportunity Brain, Rule Engine, Scoring Engine, Risk Engine, and Explanation Service.
- May trigger approval for high-cost tools.
- Does not override Risk Engine.

## Implementation Steps

1. Analyze SPY and QQQ state from snapshot.
2. Derive `risk_on`, `risk_off`, `mixed`, or `chop`.
3. Evaluate target symbol relative strength versus QQQ.
4. Add BTC and ETH filters for COIN and BMNR.
5. Pull optional catalyst, options, or flow evidence only through Tool Gateway.
6. Return `pass`, `caution`, or `block` market gate inputs.
7. Log analysis summary with tool call references.

## Failure Modes

- Missing benchmark data: return market gate `caution` with missing evidence.
- Optional tool blocked: continue with skipped-tool note.
- Crypto data missing for COIN/BMNR: mark crypto-beta state unknown.
- Conflicting market signals: return `mixed` and lower confidence.
- Tool failure: do not fail whole analysis unless required low-cost market data is absent.

## Acceptance Criteria

- Determines `risk_on`, `risk_off`, `mixed`, or `chop`.
- Determines whether ticker is stronger than QQQ.
- Adds BTC/ETH filtering for COIN and BMNR.
- Outputs market gate pass, caution, or block.
- All optional tool calls are audited.

## Test Scenarios

- Analyze risk-on SPY/QQQ fixture.
- Analyze risk-off QQQ and high-beta symbol.
- Analyze COIN with supportive BTC data.
- Analyze missing benchmark data and return caution.
- Verify high-cost tool request creates approval requirement instead of silent call.
