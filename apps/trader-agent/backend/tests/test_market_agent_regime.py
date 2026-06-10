from __future__ import annotations

from app.intel.market_agent.features import RegimeDetector, detect_market_regime


def test_regime_detector_classifies_trending_market() -> None:
    result = detect_market_regime(
        {
            "adx": 28,
            "price": 105,
            "ma20": 100,
            "vix": 16,
            "breadth": 0.62,
        }
    )

    assert result.state == "trending"
    assert result.confidence >= 0.8
    assert result.transition_risk < 0.4
    assert result.indicators["adx"] == 28.0


def test_regime_detector_classifies_ranging_market() -> None:
    result = RegimeDetector().detect(
        {
            "adx": 16,
            "price": 101,
            "ma20": 100,
            "bollinger_width": 0.04,
            "range_position": 0.45,
            "vix": 18,
        }
    )

    assert result.state == "ranging"
    assert result.confidence >= 0.75
    assert 0 <= result.transition_risk <= 1


def test_regime_detector_classifies_volatile_market() -> None:
    result = detect_market_regime(
        {
            "adx": 38,
            "price": 92,
            "ma20": 100,
            "vix": 34,
            "breadth": 0.28,
        }
    )

    assert result.state == "volatile"
    assert result.confidence >= 0.8
    assert result.transition_risk >= 0.8
    assert result.to_dict()["state"] == "volatile"
