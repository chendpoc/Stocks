from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Sequence

from app.intel.market_agent.features import FeatureComputationInput, FeatureEngine
from app.intel.market_agent.market_data import MarketDataService
from app.intel.market_agent.repositories import create_model_decision
from app.intel.market_agent.risk import evaluate_monitor_risk
from app.intel.market_agent.schemas import (
    MarketMonitorDecisionAction,
    MarketMonitorDecisionEnvelope,
    MarketMonitorRiskStatus,
    ModelDecisionRecord,
)
from app.intel.market_agent.setups import SetupDetector


@dataclass(frozen=True)
class MarketMonitorRunResult:
    symbol: str
    timeframe: str
    decision_id: str
    snapshot_id: str
    feature_snapshot_id: str | None
    setup_event_ids: list[str]
    quality_status: str
    quality_reason: str
    risk_status: MarketMonitorRiskStatus
    risk_reason: str


DEFAULT_BENCHMARK_SYMBOLS: tuple[str, ...] = ("SPY", "QQQ")


def _normalize_symbol(value: str) -> str:
    return value.strip().upper()


def _normalize_timeframe(value: str) -> str:
    return value.strip().lower()


def _latest_ts(bars: list[dict[str, Any]]) -> str:
    if not bars:
        return ""
    return max(str(bar.get("ts") or "") for bar in bars)


def _make_id(prefix: str, payload: dict[str, Any]) -> str:
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:20]
    return f"{prefix}_{digest}"


def _normalize_benchmark_symbols(
    symbols: Sequence[str] | None,
) -> tuple[str, ...]:
    if symbols is None:
        return ()
    normalized: list[str] = []
    for symbol in symbols:
        normalized_value = _normalize_symbol(symbol)
        if not normalized_value:
            continue
        if normalized_value not in normalized:
            normalized.append(normalized_value)
    return tuple(normalized)


def _normalize_benchmark_bars(
    benchmark_bars: dict[str, list[dict[str, Any]]] | None,
) -> dict[str, list[dict[str, Any]]]:
    if benchmark_bars is None:
        return {}
    normalized: dict[str, list[dict[str, Any]]] = {}
    for symbol, bars in benchmark_bars.items():
        normalized_symbol = _normalize_symbol(symbol)
        if not normalized_symbol:
            continue
        if not isinstance(bars, list):
            continue
        normalized[normalized_symbol] = list(bars)
    return normalized


def _resolve_benchmark_bars(
    market_data_service: MarketDataService,
    benchmark_symbols: tuple[str, ...],
    benchmark_bars: dict[str, list[dict[str, Any]]] | None,
    *,
    timeframe: str,
    limit: int,
    min_required: int | None,
    allow_live_fallback: bool,
) -> dict[str, list[dict[str, Any]]]:
    if benchmark_bars is not None:
        return _normalize_benchmark_bars(benchmark_bars)

    if not benchmark_symbols:
        return {}

    resolved: dict[str, list[dict[str, Any]]] = {}
    for symbol in benchmark_symbols:
        benchmark_data = market_data_service.get_market_data(
            symbol,
            timeframe,
            limit=limit,
            min_required=min_required,
            allow_live_fallback=allow_live_fallback,
        )
        resolved[symbol] = list(benchmark_data.bars)
    return resolved


def _snapshot_id_from_quality(
    *,
    symbol: str,
    timeframe: str,
    quality_status: str,
    quality_reason: str,
    bar_count: int,
    min_required: int,
    bars: list[dict[str, Any]],
) -> str:
    payload = {
        "kind": "monitor_decision_fallback",
        "symbol": symbol,
        "timeframe": timeframe,
        "quality_status": quality_status,
        "quality_reason": quality_reason,
        "bar_count": bar_count,
        "min_required": min_required,
        "latest_ts": _latest_ts(bars),
    }
    return _make_id("fs", payload)


def _decision_action(risk_status: MarketMonitorRiskStatus) -> MarketMonitorDecisionAction:
    if risk_status == "pass":
        return "watch"
    if risk_status == "requires_user_confirmation":
        return "review"
    if risk_status == "blocked":
        return "ignore"
    return "watch"


def _make_decision_json(
    *,
    symbol: str,
    action: MarketMonitorDecisionAction,
    risk: str,
    feature_snapshot_id: str | None,
    quality: dict[str, Any],
    setup_event_ids: list[str],
    risk_payload: dict[str, Any],
    snapshot_id: str,
) -> dict[str, Any]:
    confidence = round(float(risk_payload.get("risk_score") or 0.0), 4)
    uncertainty = round(1.0 - confidence, 4) if 0.0 <= confidence <= 1.0 else None
    if risk == "pass":
        thesis = "monitor-ready patterns observed"
        watch_condition = "confirmed setup present; continue monitoring before escalation"
        trigger = None
        invalidation = "operator-level review gate for execution is not enabled"
    elif risk == "requires_user_confirmation":
        thesis = "monitor requires operator review before any action"
        watch_condition = "signals indicate review-worthy setup context"
        trigger = "operator_review_required"
        invalidation = "automatic action disabled in monitor-only mode"
    elif risk == "watch_only":
        thesis = "no confirmed setup yet; keep observing feature/price behavior"
        watch_condition = "formation not confirmed yet"
        trigger = None
        invalidation = "no action until confirmation"
    else:
        thesis = "monitor blocked"
        watch_condition = None
        trigger = None
        invalidation = "blocked by deterministic quality/risk gate"

    return MarketMonitorDecisionEnvelope(
        symbol=symbol,
        action=action,
        thesis=thesis,
        confidence=confidence,
        uncertainty=uncertainty,
        watch_condition=watch_condition,
        trigger=trigger,
        invalidation=invalidation,
        feature_snapshot_id=feature_snapshot_id,
        snapshot_id=snapshot_id,
        quality=quality,
        setup_event_ids=setup_event_ids,
        risk=risk_payload,
    ).to_decision_json()


class MarketMonitorService:
    def __init__(
        self,
        engine,
        market_data_service: MarketDataService | None = None,
        feature_engine: FeatureEngine | None = None,
        setup_detector: SetupDetector | None = None,
        *,
        model_provider: str = "monitor-service",
        model_name: str = "market-monitor",
        model_version: str = "v0",
    ) -> None:
        self.engine = engine
        self.market_data_service = market_data_service or MarketDataService(engine, settings=None)
        self.feature_engine = feature_engine or FeatureEngine(engine)
        self.setup_detector = setup_detector or SetupDetector()
        self.model_provider = model_provider
        self.model_name = model_name
        self.model_version = model_version

    def run_symbol(
        self,
        symbol: str,
        timeframe: str = "5m",
        limit: int = 20,
        min_required: int | None = None,
        allow_live_fallback: bool = False,
        benchmark_symbols: Sequence[str] | None = None,
        benchmark_bars: dict[str, list[dict[str, Any]]] | None = None,
        *,
        run_id: str | None = None,
    ) -> MarketMonitorRunResult:
        normalized_symbol = _normalize_symbol(symbol)
        normalized_timeframe = _normalize_timeframe(timeframe)

        market_data = self.market_data_service.get_market_data(
            normalized_symbol,
            normalized_timeframe,
            limit=limit,
            min_required=min_required,
            allow_live_fallback=allow_live_fallback,
        )
        quality_status = str(market_data.quality_status).lower()
        quality_reason = market_data.quality_reason
        bars = list(market_data.bars)
        effective_min_required = (
            int(min_required) if isinstance(min_required, int) else 0
        )

        feature_snapshot_id: str | None = None
        setup_events = []

        if quality_status in {"failed", "blocked"}:
            snapshot_id = _snapshot_id_from_quality(
                symbol=normalized_symbol,
                timeframe=normalized_timeframe,
                quality_status=quality_status,
                quality_reason=quality_reason,
                bar_count=market_data.bar_count,
                min_required=effective_min_required,
                bars=bars,
            )
            risk_decision = evaluate_monitor_risk(
                quality_status=quality_status,
                quality_reason=quality_reason,
                feature_snapshot_id=None,
                setup_events=[],
            )
        else:
            resolved_benchmarks = _resolve_benchmark_bars(
                self.market_data_service,
                (
                    _normalize_benchmark_symbols(benchmark_symbols)
                    if benchmark_symbols is not None
                    else DEFAULT_BENCHMARK_SYMBOLS
                ),
                benchmark_bars,
                timeframe=normalized_timeframe,
                limit=limit,
                min_required=min_required,
                allow_live_fallback=allow_live_fallback,
            )
            feature_input = FeatureComputationInput(
                symbol=normalized_symbol,
                timeframe=normalized_timeframe,
                bars=bars,
                quality_status=market_data.quality_status,
                quality_reason=quality_reason,
                benchmark_bars=resolved_benchmarks,
            )
            feature_payload = self.feature_engine.compute(feature_input)
            feature_snapshot = self.feature_engine.compute_and_persist(
                feature_input,
                engine=self.engine,
                computed=feature_payload,
            )
            if feature_snapshot is None:
                snapshot_id = _snapshot_id_from_quality(
                    symbol=normalized_symbol,
                    timeframe=normalized_timeframe,
                    quality_status=quality_status,
                    quality_reason=quality_reason,
                    bar_count=market_data.bar_count,
                    min_required=effective_min_required,
                    bars=bars,
                )
            else:
                feature_snapshot_id = feature_snapshot.feature_snapshot_id
                snapshot_id = feature_snapshot.feature_snapshot_id

            setup_events = self.setup_detector.detect(feature_payload, bars)
            setup_events = self.setup_detector.persist_events(setup_events, self.engine)
            risk_decision = evaluate_monitor_risk(
                quality_status=quality_status,
                quality_reason=quality_reason,
                setup_events=setup_events,
                feature_snapshot_id=feature_snapshot_id,
            )

        action = _decision_action(risk_decision.status)
        setup_event_ids = [item.setup_event_id for item in setup_events]
        risk_payload = {
            "status": risk_decision.status,
            "reason": risk_decision.reason,
            "risk_score": risk_decision.risk_score,
            "details": risk_decision.details,
        }
        quality_payload = {
            "status": quality_status,
            "reason": quality_reason,
            "bar_count": market_data.bar_count,
            "min_required": effective_min_required,
            "source": market_data.source,
            "asof_ts": _latest_ts(bars),
        }

        decision_json = _make_decision_json(
            symbol=normalized_symbol,
            action=action,
            risk=risk_decision.status,
            feature_snapshot_id=feature_snapshot_id,
            quality=quality_payload,
            setup_event_ids=setup_event_ids,
            risk_payload=risk_payload,
            snapshot_id=snapshot_id,
        )
        decision_id = _make_id(
            "md",
            {
                "symbol": normalized_symbol,
                "timeframe": normalized_timeframe,
                "snapshot_id": snapshot_id,
                "feature_snapshot_id": feature_snapshot_id,
                "risk_status": risk_decision.status,
                "setup_event_ids": sorted(setup_event_ids),
                "quality_status": quality_status,
            },
        )

        model_decision = create_model_decision(
            self.engine,
            ModelDecisionRecord(
                decision_id=decision_id,
                run_id=run_id,
                snapshot_id=snapshot_id,
                symbol=normalized_symbol,
                model_provider=self.model_provider,
                model_name=self.model_name,
                model_version=self.model_version,
                action=action,
                confidence=decision_json.get("confidence"),
                uncertainty=decision_json.get("uncertainty"),
                decision_json=decision_json,
            ),
        )

        return MarketMonitorRunResult(
            symbol=normalized_symbol,
            timeframe=normalized_timeframe,
            decision_id=model_decision.decision_id,
            snapshot_id=snapshot_id,
            feature_snapshot_id=feature_snapshot_id,
            setup_event_ids=setup_event_ids,
            quality_status=quality_status,
            quality_reason=quality_reason,
            risk_status=risk_decision.status,
            risk_reason=risk_decision.reason,
        )
