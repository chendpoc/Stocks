from __future__ import annotations

from app.intel.ingestion.market_data import get_bars_from_db


def calc_cross_asset_correlation(engine, symbols: list[str], days: int = 5) -> dict:
    returns_by_symbol: dict[str, list[float]] = {}
    for sym in symbols:
        bars = get_bars_from_db(engine, sym, "1d", limit=days + 1)
        closes = [float(b["close"]) for b in bars if b.get("close") is not None]
        if len(closes) < 2:
            continue
        returns = [
            (closes[i] - closes[i - 1]) / closes[i - 1] if closes[i - 1] else 0.0
            for i in range(1, len(closes))
        ]
        returns_by_symbol[sym] = returns

    pairs: list[dict] = []
    sym_list = list(returns_by_symbol.keys())
    for i, a in enumerate(sym_list):
        for b in sym_list[i + 1 :]:
            ra, rb = returns_by_symbol[a], returns_by_symbol[b]
            n = min(len(ra), len(rb))
            if n < 2:
                continue
            mean_a = sum(ra[:n]) / n
            mean_b = sum(rb[:n]) / n
            cov = sum((ra[j] - mean_a) * (rb[j] - mean_b) for j in range(n))
            var_a = sum((ra[j] - mean_a) ** 2 for j in range(n))
            var_b = sum((rb[j] - mean_b) ** 2 for j in range(n))
            if var_a <= 0 or var_b <= 0:
                corr = 0.0
            else:
                corr = cov / ((var_a**0.5) * (var_b**0.5))
            pairs.append({"a": a, "b": b, "corr": round(float(corr), 3)})

    return {"pairs": pairs, "anomalies": []}
