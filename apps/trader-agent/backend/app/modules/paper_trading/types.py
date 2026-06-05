from __future__ import annotations

from typing import Any, Literal, TypedDict

PAPER_SCHEMA_VERSION = "paper_trading_engine.v0"


class OrderIntent(TypedDict, total=False):
    order_intent_id: str
    schema_version: str
    symbol: str
    market_state_snapshot_id: str
    direction: Literal["buy", "sell"]
    quantity: float
    limit_price: float | None
    slippage_bps: float
    created_at: str


class RiskDecision(TypedDict):
    risk_decision_id: str
    order_intent_id: str
    decision: Literal["allow", "reject"]
    reason: str


class OrderEvent(TypedDict, total=False):
    order_event_id: str
    order_intent_id: str
    event_type: Literal["accepted", "filled", "rejected"]
    fill_price: float
    fill_quantity: float
    event_ts: str
    payload: dict[str, Any]


class PositionSnapshot(TypedDict, total=False):
    position_snapshot_id: str
    symbol: str
    quantity: float
    average_cost: float
    realized_pnl: float
    unrealized_pnl: float
    mark_price: float
    asof_ts: str
