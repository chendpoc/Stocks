from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from app.core.config import Settings
from app.modules.extract_preview import extract_preview


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        repo_root=tmp_path,
        data_dir=tmp_path / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_extract_preview_returns_structured_result_with_valid_memory_type(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    mock_response = {
        "memory_type": "trading_rule",
        "title": "AAPL breakout rule",
        "summary": "Buy AAPL on breakout above VWAP",
        "rule_text": "Enter long when price breaks above VWAP with volume",
        "applicability": "US equities",
        "invalidation": "Close below VWAP",
        "symbols": ["AAPL"],
        "tags": ["breakout"],
        "confidence": 0.8,
    }
    with patch(
        "app.modules.extract_preview._call_deepseek_json",
        return_value=mock_response,
    ):
        result = extract_preview(settings, "Remember this AAPL breakout setup")

    assert result is not None
    assert result.memory_type == "trading_rule"
    assert result.title == "AAPL breakout rule"
    assert result.summary
    assert result.rule_text
    assert result.symbols == ["AAPL"]
    assert result.tags == ["breakout"]
    assert result.confidence == 0.8


def test_extract_preview_with_empty_text_returns_none(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    assert extract_preview(settings, "") is None
    assert extract_preview(settings, "   ") is None


def test_extract_preview_result_fields_are_populated(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    mock_response = {
        "memory_type": "market_mechanism",
        "title": "Liquidity sweep pattern",
        "summary": "Price sweeps lows then reverses",
        "rule_text": "Watch for liquidity sweep before reversal",
        "applicability": None,
        "invalidation": None,
        "symbols": ["SPY", "QQQ"],
        "tags": ["liquidity"],
        "confidence": 0.65,
    }
    with patch(
        "app.modules.extract_preview._call_deepseek_json",
        return_value=mock_response,
    ):
        result = extract_preview(settings, "liquidity sweep on SPY and QQQ")

    assert result is not None
    assert result.title
    assert result.summary
    assert len(result.symbols) == 2


def test_extract_preview_handles_deepseek_error_gracefully(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with patch("app.modules.extract_preview._call_deepseek_json", return_value=None):
        assert extract_preview(settings, "some text") is None


def test_extract_preview_returns_none_when_memory_type_is_none(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with patch(
        "app.modules.extract_preview._call_deepseek_json",
        return_value={"memory_type": "none"},
    ):
        assert extract_preview(settings, "random chat") is None
