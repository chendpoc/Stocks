from __future__ import annotations

from app.rulepack.loader import load_rulepack


def test_rulepack_loads_version_universe_and_active_rules(temp_settings) -> None:
    rulepack = load_rulepack(temp_settings.rulepack_path)

    assert rulepack.version == "0.1.0"
    assert {"SPY", "QQQ", "TSLA", "NVDA", "AAPL", "COIN", "BMNR"}.issubset(
        set(rulepack.universe_symbols)
    )
    assert len(rulepack.active_rules) >= 1

