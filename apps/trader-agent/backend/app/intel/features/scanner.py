from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel import logger
from app.intel.db.schema import MVP_SYMBOLS
from app.intel.ingestion.market_data import get_bars_from_db
from app.modules.json_row_codec import serialize_json_field

MVP_SYMBOL_LIST = [row[0] for row in MVP_SYMBOLS]


@dataclass
class ScanResult:
    triggered: bool
    severity: float
    description: str
    feature_snapshot: dict[str, Any]


def _pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return (current - previous) / previous * 100


def calc_relative_return_vs_qqq(
    symbol: str, bars_daily: list[dict], qqq_bars: list[dict]
) -> ScanResult | None:
    if len(bars_daily) < 2 or len(qqq_bars) < 2:
        return None
    sym_ret = _pct_change(bars_daily[-1]["close"], bars_daily[-2]["close"])
    qqq_ret = _pct_change(qqq_bars[-1]["close"], qqq_bars[-2]["close"])
    diff = sym_ret - qqq_ret
    triggered = abs(diff) >= 1.0
    signal_type = "relative_weakness" if diff < 0 else "relative_strength"
    return ScanResult(
        triggered=triggered,
        severity=min(abs(diff) / 3.0, 1.0),
        description=f"{symbol} 相对 QQQ {'跑输' if diff < 0 else '跑赢'} {abs(diff):.2f}%",
        feature_snapshot={
            "signal_subtype": signal_type,
            "symbol_return_pct": round(sym_ret, 3),
            "qqq_return_pct": round(qqq_ret, 3),
            "relative_diff_pct": round(diff, 3),
        },
    )


def calc_volume_vs_20d_avg(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    if len(bars_daily) < 21:
        return None
    recent = bars_daily[-21:]
    avg_vol = sum(b["volume"] for b in recent[:-1]) / 20
    current_vol = recent[-1]["volume"]
    if avg_vol <= 0:
        return None
    ratio = current_vol / avg_vol
    triggered = ratio >= 1.5 or ratio <= 0.6
    return ScanResult(
        triggered=triggered,
        severity=min(abs(ratio - 1) / 1.5, 1.0),
        description=f"{symbol} 成交量为 20 日均量的 {ratio:.2f}x",
        feature_snapshot={"volume_ratio": round(ratio, 3), "avg_volume_20d": avg_vol},
    )


def calc_distance_to_vwap(symbol: str, bars_minute: list[dict]) -> ScanResult | None:
    if not bars_minute:
        return None
    bar = bars_minute[-1]
    vwap = bar.get("vwap")
    close = bar.get("close")
    if not vwap or not close:
        return None
    dist_pct = (close - vwap) / vwap * 100
    triggered = abs(dist_pct) >= 1.0
    return ScanResult(
        triggered=triggered,
        severity=min(abs(dist_pct) / 3.0, 1.0),
        description=f"{symbol} 距 VWAP {dist_pct:+.2f}%",
        feature_snapshot={"distance_to_vwap_pct": round(dist_pct, 3), "close": close, "vwap": vwap},
    )


def _swing_lows(bars: list[dict], window: int = 3) -> list[tuple[int, float]]:
    lows: list[tuple[int, float]] = []
    for i in range(window, len(bars) - window):
        low = bars[i]["low"]
        if all(low <= bars[j]["low"] for j in range(i - window, i + window + 1) if j != i):
            lows.append((i, low))
    return lows


def detect_higher_low(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    lows = _swing_lows(bars_daily)
    if len(lows) < 2:
        return None
    prev_low = lows[-2][1]
    last_low = lows[-1][1]
    triggered = last_low > prev_low
    return ScanResult(
        triggered=triggered,
        severity=0.7 if triggered else 0.0,
        description=f"{symbol} 回踩低点{'高于' if triggered else '未高于'}前低",
        feature_snapshot={
            "higher_low": triggered,
            "previous_low": prev_low,
            "current_low": last_low,
        },
    )


def detect_lower_high(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    highs: list[tuple[int, float]] = []
    window = 3
    for i in range(window, len(bars_daily) - window):
        high = bars_daily[i]["high"]
        if all(high >= bars_daily[j]["high"] for j in range(i - window, i + window + 1) if j != i):
            highs.append((i, high))
    if len(highs) < 2:
        return None
    prev_high = highs[-2][1]
    last_high = highs[-1][1]
    triggered = last_high < prev_high
    return ScanResult(
        triggered=triggered,
        severity=0.65 if triggered else 0.0,
        description=f"{symbol} {'形成' if triggered else '未形成'}更低高点",
        feature_snapshot={"lower_high": triggered, "previous_high": prev_high, "current_high": last_high},
    )


def detect_pullback_to_support(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    if len(bars_daily) < 20:
        return None
    support = min(b["low"] for b in bars_daily[-20:-1])
    close = bars_daily[-1]["close"]
    dist = (close - support) / support * 100 if support else 0
    triggered = 0 <= dist <= 2.0
    return ScanResult(
        triggered=triggered,
        severity=0.6 if triggered else 0.0,
        description=f"{symbol} {'回踩' if triggered else '远离'}支撑位",
        feature_snapshot={"support_level": support, "distance_to_support_pct": round(dist, 3)},
    )


def detect_break_previous_low(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    if len(bars_daily) < 10:
        return None
    prev_low = min(b["low"] for b in bars_daily[-10:-1])
    current_low = bars_daily[-1]["low"]
    triggered = current_low < prev_low
    return ScanResult(
        triggered=triggered,
        severity=0.75 if triggered else 0.0,
        description=f"{symbol} {'跌破' if triggered else '未跌破'}前低",
        feature_snapshot={"break_previous_low": triggered, "previous_low": prev_low, "current_low": current_low},
    )


def detect_reclaim_vwap(symbol: str, bars_minute: list[dict]) -> ScanResult | None:
    if len(bars_minute) < 3:
        return None
    prev = bars_minute[-2]
    last = bars_minute[-1]
    prev_vwap = prev.get("vwap")
    last_vwap = last.get("vwap")
    if not prev_vwap or not last_vwap:
        return None
    was_below = prev["close"] < prev_vwap
    now_above = last["close"] > last_vwap
    triggered = was_below and now_above
    return ScanResult(
        triggered=triggered,
        severity=0.7 if triggered else 0.0,
        description=f"{symbol} {'站回' if triggered else '未站回'} VWAP",
        feature_snapshot={"reclaim_vwap": triggered},
    )


def calc_trend_strength(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    if len(bars_daily) < 20:
        return None
    closes = [b["close"] for b in bars_daily[-20:]]
    ma = sum(closes) / len(closes)
    close = closes[-1]
    diff_pct = (close - ma) / ma * 100 if ma else 0
    triggered = abs(diff_pct) >= 3.0
    return ScanResult(
        triggered=triggered,
        severity=min(abs(diff_pct) / 6.0, 1.0),
        description=f"{symbol} 趋势强度偏离 MA20 {diff_pct:+.2f}%",
        feature_snapshot={"trend_strength_pct": round(diff_pct, 3), "ma20": ma},
    )


def detect_volume_contraction(symbol: str, bars_daily: list[dict]) -> ScanResult | None:
    if len(bars_daily) < 3:
        return None
    prev = bars_daily[-2]
    last = bars_daily[-1]
    down_day = last["close"] < prev["close"]
    vol_contract = last["volume"] < prev["volume"] * 0.8
    triggered = down_day and vol_contract
    return ScanResult(
        triggered=triggered,
        severity=0.65 if triggered else 0.0,
        description=f"{symbol} 下跌{'缩量' if triggered else '未缩量'}",
        feature_snapshot={
            "volume_contraction": triggered,
            "volume_ratio": round(last["volume"] / prev["volume"], 3) if prev["volume"] else 0,
        },
    )


SCANNERS: list[tuple[str, Callable, str, str]] = [
    ("relative_weakness", calc_relative_return_vs_qqq, "relative_weakness", "{symbol} 相对 QQQ 表现异常"),
    ("volume_vs_avg", calc_volume_vs_20d_avg, "volume_anomaly", "{symbol} 成交量异于 20 日均量"),
    ("distance_to_vwap", calc_distance_to_vwap, "vwap_distance", "{symbol} 价格远离 VWAP"),
    ("higher_low", detect_higher_low, "higher_low_candidate", "{symbol} 可能形成更高低点"),
    ("lower_high", detect_lower_high, "lower_high_candidate", "{symbol} 可能形成更低高点"),
    ("pullback", detect_pullback_to_support, "pullback_to_support", "{symbol} 回踩支撑位"),
    ("break_low", detect_break_previous_low, "break_previous_low", "{symbol} 跌破前低"),
    ("reclaim_vwap", detect_reclaim_vwap, "reclaim_vwap", "{symbol} 站回 VWAP"),
    ("trend_strength", calc_trend_strength, "trend_strength_change", "{symbol} 趋势强度变化"),
    ("volume_contraction", detect_volume_contraction, "volume_contraction", "{symbol} 下跌缩量"),
]


def _make_signal_id(symbol: str, signal_type: str, ts: datetime) -> str:
    return f"{symbol}_{ts.year}_{ts.month:02d}_{ts.day:02d}_{ts.hour:02d}_{signal_type}"


def scan_symbol(engine, symbol: str, qqq_bars: list[dict]) -> list[dict]:
    daily = get_bars_from_db(engine, symbol, "1d", limit=120)
    minute = get_bars_from_db(engine, symbol, "5m", limit=100)
    now = datetime.now(UTC)
    signals: list[dict] = []

    for _name, func, signal_type, desc_tpl in SCANNERS:
        try:
            if func is calc_relative_return_vs_qqq:
                result = func(symbol, daily, qqq_bars)
            elif func in (calc_distance_to_vwap, detect_reclaim_vwap):
                result = func(symbol, minute)
            else:
                result = func(symbol, daily)
        except Exception as exc:
            logger.warning("Scanner %s failed for %s: %s", _name, symbol, exc)
            continue

        if result is None or not result.triggered:
            continue

        signal = {
            "signal_id": _make_signal_id(symbol, signal_type, now),
            "ts": utc_now_iso(),
            "symbol": symbol,
            "signal_type": signal_type,
            "raw_description": result.description or desc_tpl.format(symbol=symbol),
            "severity": result.severity,
            "feature_snapshot": serialize_json_field(result.feature_snapshot),
            "status": "new",
        }
        signals.append(signal)
    return signals


def build_anomaly_dashboard(engine) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT symbol, signal_type, severity, raw_description
                FROM signals
                WHERE datetime(ts) > datetime('now','-1 day')
                ORDER BY severity DESC LIMIT 10
                """
            )
        ).mappings().all()
    return [
        {"symbol": r["symbol"], "rank": i + 1, "anomaly": r["raw_description"]}
        for i, r in enumerate(rows)
    ]


def scan_all_symbols(engine) -> dict[str, int]:
    qqq_bars = get_bars_from_db(engine, "QQQ", "1d", limit=120)
    total = 0
    for symbol in MVP_SYMBOL_LIST:
        signals = scan_symbol(engine, symbol, qqq_bars)
        with engine.begin() as conn:
            for signal in signals:
                result = conn.execute(
                    text(
                        """
                        INSERT OR IGNORE INTO signals
                        (signal_id, ts, symbol, signal_type, raw_description, severity,
                         feature_snapshot, status)
                        VALUES (:signal_id, :ts, :symbol, :signal_type, :raw_description,
                                :severity, :feature_snapshot, :status)
                        """
                    ),
                    signal,
                )
                total += result.rowcount or 0
    logger.info("Scan complete: %s new signals", total)
    return {"signal_count": total}


def list_signals(
    engine,
    *,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    clauses = ["1=1"]
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if status:
        clauses.append("status = :status")
        params["status"] = status
    where = " AND ".join(clauses)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT signal_id, ts, symbol, signal_type, raw_description, severity,
                       feature_snapshot, status, created_at
                FROM signals
                WHERE {where}
                ORDER BY ts DESC
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    return [dict(row) for row in rows]


def get_signal(engine, signal_id: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM signals WHERE signal_id = :signal_id"),
            {"signal_id": signal_id},
        ).mappings().fetchone()
    return dict(row) if row else None


def update_signal_status(engine, signal_id: str, status: str) -> dict | None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE signals SET status = :status WHERE signal_id = :signal_id"),
            {"status": status, "signal_id": signal_id},
        )
    return get_signal(engine, signal_id)
