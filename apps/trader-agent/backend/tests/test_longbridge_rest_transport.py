from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.modules.live_market_plane.longbridge_rest_transport import (
    build_longbridge_rest_transport,
    longbridge_rest_transport_available,
)
from app.tools.longbridge_adapter import LONGBRIDGE_MARKET_DATA


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=repo_root / "apps" / "trader-agent" / "backend" / "tests" / "fixtures",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset({LONGBRIDGE_MARKET_DATA}),
        enable_event_jsonl_mirror=False,
    )


def test_longbridge_rest_transport_normalizes_quote_row(tmp_path: Path) -> None:
    quote_obj = MagicMock()
    quote_obj.model_dump.return_value = {
        "sequence": 1_714_000_000_000_000,
        "last_done": 191.25,
        "bid": 191.2,
        "ask": 191.3,
        "volume": 12345,
    }
    ctx = MagicMock()
    ctx.quote.return_value = [quote_obj]

    with (
        patch(
            "app.modules.live_market_plane.longbridge_rest_transport.longbridge_rest_transport_available",
            return_value=True,
        ),
        patch(
            "app.modules.live_market_plane.longbridge_rest_transport.load_longbridge_config",
            return_value=object(),
        ),
        patch("longbridge.openapi.QuoteContext", return_value=ctx),
    ):
        transport = build_longbridge_rest_transport()
        row = transport("quote", {"symbol": "AAPL.US"})

    assert row["last_done"] == 191.25
    assert row["symbol"] == "AAPL.US"
    assert "timestamp" in row
    ctx.quote.assert_called_once_with(["AAPL.US"])


def test_should_auto_enable_longbridge_capability(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.live_market_plane.longbridge_config import (
        should_auto_enable_longbridge_capability,
    )

    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("LONGBRIDGE_APP_KEY", "k")
    monkeypatch.setenv("LONGBRIDGE_APP_SECRET", "s")
    monkeypatch.setenv("LONGBRIDGE_ACCESS_TOKEN", "t")
    assert should_auto_enable_longbridge_capability() is True

    monkeypatch.setenv("PYTEST_CURRENT_TEST", "test_longbridge_rest_transport.py::x")
    assert should_auto_enable_longbridge_capability() is False


def test_settings_merges_longbridge_capability_when_auto_enable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.modules.live_market_plane.longbridge_config.should_auto_enable_longbridge_capability",
        lambda: True,
    )
    repo_root = Path(__file__).resolve().parents[4]
    settings = Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
    )
    assert LONGBRIDGE_MARKET_DATA in settings.enabled_tool_capabilities


def test_longbridge_rest_transport_available_requires_sdk_and_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LONGBRIDGE_APP_KEY", raising=False)
    with patch(
        "app.modules.live_market_plane.longbridge_rest_transport.longbridge_sdk_available",
        return_value=True,
    ):
        assert longbridge_rest_transport_available() is False
