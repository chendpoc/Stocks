from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path

import pytest

from app.core.config import Settings
from app.tools.local_adapter import CapabilityDisabledError, LocalToolAdapter

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def _settings(tmp_path: Path, capabilities: set[str]) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=capabilities,
    )


def test_market_bars_are_loaded_as_normalized_fixture_evidence(tmp_path: Path) -> None:
    adapter = LocalToolAdapter(
        _settings(tmp_path, {"market_bars.fixture"}),
    )

    rows = adapter.get_market_bars(
        symbol=" spy ",
        start="2026-05-22",
        end="2026-05-22",
    )

    assert [row.symbol for row in rows] == ["SPY", "SPY", "SPY"]
    assert rows[0].provider == "fixture.market_bars"
    assert rows[0].cost_category == "free_fixture"
    assert rows[0].timestamp == "2026-05-22T13:30:00Z"
    assert rows[0].payload["open"] == 530.0
    assert isinstance(rows[0].payload["open"], float)
    assert rows[0].payload["close"] == 530.9
    assert isinstance(rows[0].payload["close"], float)
    assert rows[0].payload["volume"] == 1200000
    assert isinstance(rows[0].payload["volume"], int)


def test_news_and_filings_are_loaded_as_normalized_fixture_evidence(tmp_path: Path) -> None:
    adapter = LocalToolAdapter(
        _settings(tmp_path, {"news_events.fixture", "filing_events.fixture"}),
    )

    news = adapter.get_news_events(symbol="SPY", start="2026-05-22T00:00:00Z")
    filings = adapter.get_filing_events(symbol="tsla", end="2026-05-22T00:00:00Z")

    assert len(news) == 1
    assert news[0].provider == "fixture.news_events"
    assert news[0].symbol == "SPY"
    assert "option expiry" in news[0].payload["headline"]

    assert len(filings) == 1
    assert filings[0].provider == "fixture.filing_events"
    assert filings[0].symbol == "TSLA"
    assert filings[0].payload["form_type"] == "8-K"


def test_market_calendar_uses_capability_gated_local_sessions(tmp_path: Path) -> None:
    adapter = LocalToolAdapter(
        _settings(tmp_path, {"market_calendar.fixture"}),
    )

    sessions = adapter.get_market_calendar(start="2026-05-22", end="2026-05-26")

    assert [(session.timestamp, session.symbol) for session in sessions] == [
        ("2026-05-22", "US"),
        ("2026-05-26", "US"),
    ]
    assert sessions[0].provider == "fixture.market_calendar"
    assert sessions[0].payload["session_open"] == "09:30"
    assert sessions[0].payload["session_close"] == "16:00"


@pytest.mark.parametrize(
    ("expected_capability", "call_factory"),
    [
        (
            "market_bars.fixture",
            lambda adapter: adapter.get_market_bars(
                symbol="SPY",
                start="2026-05-22",
                end="2026-05-22",
            ),
        ),
        (
            "market_calendar.fixture",
            lambda adapter: adapter.get_market_calendar(start="2026-05-22", end="2026-05-26"),
        ),
        (
            "news_events.fixture",
            lambda adapter: adapter.get_news_events(symbol="SPY"),
        ),
        (
            "filing_events.fixture",
            lambda adapter: adapter.get_filing_events(symbol="TSLA"),
        ),
    ],
)
def test_missing_capability_blocks_each_tool_call(
    tmp_path: Path,
    expected_capability: str,
    call_factory: Callable[[LocalToolAdapter], object],
) -> None:
    adapter = LocalToolAdapter(_settings(tmp_path, set()))

    with pytest.raises(CapabilityDisabledError, match=expected_capability):
        call_factory(adapter)


def test_invalid_symbol_is_rejected_before_fixture_path_lookup(tmp_path: Path) -> None:
    adapter = LocalToolAdapter(_settings(tmp_path, {"market_bars.fixture"}))

    with pytest.raises(ValueError, match="Invalid symbol"):
        adapter.get_market_bars(symbol="../SPY", start="2026-05-22", end="2026-05-22")


def test_default_settings_fixture_path_has_seed_data(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[4]
    adapter = LocalToolAdapter(
        Settings(
            repo_root=repo_root,
            data_dir=tmp_path / "trader-agent-data",
            rulepack_path=repo_root
            / "apps"
            / "trader-agent"
            / "shared"
            / "rulepacks"
            / "v0_1_0.yaml",
            enabled_tool_capabilities={
                "market_bars.fixture",
                "market_calendar.fixture",
                "news_events.fixture",
                "filing_events.fixture",
            },
        )
    )

    assert adapter.get_market_bars(symbol="SPY", start="2026-05-22", end="2026-05-22")
    assert adapter.get_market_calendar(start="2026-05-22", end="2026-05-26")
    assert adapter.get_news_events(symbol="SPY")
    assert adapter.get_filing_events(symbol="TSLA")


def test_provider_sdks_are_not_imported_outside_tool_adapter() -> None:
    app_dir = Path(__file__).resolve().parents[1] / "app"
    provider_modules = {"yfinance", "pandas_market_calendars"}
    offenders: list[str] = []

    for path in app_dir.rglob("*.py"):
        if path.as_posix().endswith("/tools/local_adapter.py"):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported = {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported = {node.module.split(".")[0]}
            else:
                continue
            if provider_modules & imported:
                offenders.append(str(path.relative_to(app_dir.parent)))

    assert offenders == []
