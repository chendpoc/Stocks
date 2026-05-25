from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.tools.alpha_vantage_adapter import ALPHA_VANTAGE_MARKET_DATA, AlphaVantageAdapter
from app.tools.local_adapter import CapabilityDisabledError, FixtureNotFoundError, LocalToolAdapter
from app.tools.longbridge_adapter import LONGBRIDGE_MARKET_DATA, LongbridgeMarketDataAdapter
from app.tools.news_archive_adapter import NEWS_ARCHIVE_LOCAL, NewsArchiveAdapter
from app.tools.sec_adapter import SEC_EDGAR, SecFilingAdapter
from app.tools.yfinance_adapter import YFINANCE_MARKET_DATA, YFinanceAdapter


def _settings(
    tmp_path: Path,
    capabilities: set[str] | None = None,
    *,
    alpha_vantage_api_key: str | None = None,
    news_archive_path: Path | None = None,
    sec_filings_archive_path: Path | None = None,
) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=tmp_path,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=capabilities or set(),
        alpha_vantage_api_key=alpha_vantage_api_key,
        news_archive_path=news_archive_path,
        sec_filings_archive_path=sec_filings_archive_path,
    )


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> Path:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    return path


def _assert_normalized_evidence(row: object, *, source_type: str, provider: str) -> dict[str, Any]:
    evidence = row.as_dict()
    assert set(evidence) == {
        "evidence_id",
        "source_type",
        "provider",
        "symbol",
        "timestamp",
        "retrieved_at",
        "payload",
        "confidence",
        "limitations",
        "freshness",
        "cost_category",
    }
    assert evidence["evidence_id"]
    assert evidence["source_type"] == source_type
    assert evidence["provider"] == provider
    assert evidence["retrieved_at"].endswith("Z")
    assert isinstance(evidence["limitations"], list)
    return evidence


def test_default_settings_keep_news_archive_opt_in_until_archive_path_exists(
    tmp_path: Path,
) -> None:
    settings = Settings(
        repo_root=Path(__file__).resolve().parents[4],
        data_dir=tmp_path / "trader-agent-data",
    )

    assert NEWS_ARCHIVE_LOCAL not in settings.enabled_tool_capabilities
    assert (
        settings.news_archive_path
        == tmp_path / "trader-agent-data" / "raw" / "news_events.jsonl"
    )
    assert (
        settings.sec_filings_archive_path
        == tmp_path / "trader-agent-data" / "raw" / "filing_events.jsonl"
    )


def test_news_archive_classifies_required_event_types_from_local_jsonl(tmp_path: Path) -> None:
    archive_path = _write_jsonl(
        tmp_path / "news_archive.jsonl",
        [
            {
                "timestamp": "2026-05-22T12:00:00Z",
                "symbol": "SPY",
                "headline": "Fed minutes and CPI keep rate-cut path uncertain",
            },
            {
                "timestamp": "2026-05-22T12:01:00Z",
                "symbol": "NVDA",
                "headline": "NVIDIA earnings guidance raises data-center expectations",
            },
            {
                "timestamp": "2026-05-22T12:02:00Z",
                "symbol": "TSLA",
                "headline": "Tesla files 8-K after market close",
            },
            {
                "timestamp": "2026-05-22T12:03:00Z",
                "symbol": "AAPL",
                "headline": "Export restrictions escalate geopolitical supply-chain risk",
            },
            {
                "timestamp": "2026-05-22T12:04:00Z",
                "symbol": "XLE",
                "headline": "Energy sector rallies as crude oil breaks higher",
            },
            {
                "timestamp": "2026-05-22T12:05:00Z",
                "symbol": "TSLA",
                "headline": "Tesla recall investigation expands at NHTSA",
            },
            {
                "timestamp": "2026-05-22T12:06:00Z",
                "symbol": "SPY",
                "headline": "Friday option expiry lifts gamma hedging flows",
            },
            {
                "timestamp": "2026-05-22T12:07:00Z",
                "symbol": "COIN",
                "headline": "Bitcoin volatility drives crypto-linked equity beta",
            },
        ],
    )
    adapter = NewsArchiveAdapter(
        _settings(tmp_path, {NEWS_ARCHIVE_LOCAL}),
        archive_path=archive_path,
    )

    rows = adapter.lookup(symbol="*", start="2026-05-22", end="2026-05-22")

    event_types = {row.as_dict()["payload"]["event_type"] for row in rows}
    assert event_types == {
        "macro",
        "earnings",
        "filing",
        "geopolitical",
        "sector",
        "company_specific",
        "options_market",
        "crypto_beta",
    }
    evidence = _assert_normalized_evidence(
        rows[0],
        source_type="news",
        provider="local.news_archive",
    )
    assert evidence["freshness"] == "local_archive"
    assert evidence["cost_category"] == "free_local"
    assert "Local archive may lag source publication updates." in evidence["limitations"]


def test_sec_filing_evidence_validates_required_contexts(tmp_path: Path) -> None:
    filing_path = _write_jsonl(
        tmp_path / "sec_filings.jsonl",
        [
            {
                "timestamp": "2026-05-20T21:00:00Z",
                "symbol": "NVDA",
                "form_type": "10-Q",
                "summary": "Quarterly earnings and revenue update",
            },
            {
                "timestamp": "2026-05-20T21:01:00Z",
                "symbol": "NVDA",
                "form_type": "144",
                "summary": "Proposed insider sale reduction disclosure",
            },
            {
                "timestamp": "2026-05-20T21:02:00Z",
                "symbol": "NVDA",
                "form_type": "SC 13G",
                "summary": "Major holder reports beneficial ownership",
            },
            {
                "timestamp": "2026-05-20T21:03:00Z",
                "symbol": "NVDA",
                "form_type": "8-K",
                "summary": "Material litigation and lawsuit update",
            },
            {
                "timestamp": "2026-05-20T21:04:00Z",
                "symbol": "NVDA",
                "form_type": "8-K",
                "summary": "Stock split corporate action approved",
            },
        ],
    )
    adapter = SecFilingAdapter(
        _settings(tmp_path, {SEC_EDGAR}),
        local_path=filing_path,
    )

    rows = adapter.lookup(
        "nvda",
        contexts={"earnings", "reduction", "major_holding", "litigation", "corporate_action"},
    )

    validated_contexts = {
        context
        for row in rows
        for context in row.as_dict()["payload"]["validated_contexts"]
    }
    assert validated_contexts == {
        "earnings",
        "reduction",
        "major_holding",
        "litigation",
        "corporate_action",
    }
    evidence = _assert_normalized_evidence(rows[0], source_type="filing", provider="sec.edgar")
    assert evidence["symbol"] == "NVDA"
    assert evidence["freshness"] == "local_or_injected"
    assert "Not legal advice; filing context labels are heuristic." in evidence["limitations"]


def test_sec_filing_adapter_uses_configured_archive_path_without_injected_source(
    tmp_path: Path,
) -> None:
    filing_path = _write_jsonl(
        tmp_path / "configured_sec_filings.jsonl",
        [
            {
                "timestamp": "2026-05-20T21:00:00Z",
                "symbol": "TSLA",
                "form_type": "144",
                "summary": "Insider sale reduction disclosure",
            }
        ],
    )
    adapter = SecFilingAdapter(
        _settings(tmp_path, {SEC_EDGAR}, sec_filings_archive_path=filing_path),
    )

    rows = adapter.lookup("tsla", contexts={"reduction"})

    assert len(rows) == 1
    evidence = _assert_normalized_evidence(rows[0], source_type="filing", provider="sec.edgar")
    assert evidence["payload"]["validated_contexts"] == ["reduction"]


def test_sec_filing_adapter_fails_loudly_when_configured_archive_is_missing(
    tmp_path: Path,
) -> None:
    missing_path = tmp_path / "missing_sec_filings.jsonl"
    adapter = SecFilingAdapter(
        _settings(tmp_path, {SEC_EDGAR}, sec_filings_archive_path=missing_path),
    )

    with pytest.raises(FixtureNotFoundError, match="missing_sec_filings.jsonl"):
        adapter.lookup("TSLA")


def test_local_tool_adapter_exposes_configured_local_external_evidence(
    tmp_path: Path,
) -> None:
    news_path = _write_jsonl(
        tmp_path / "configured_news_archive.jsonl",
        [
            {
                "timestamp": "2026-05-22T12:06:00Z",
                "symbol": "SPY",
                "headline": "Friday option expiry lifts gamma hedging flows",
            }
        ],
    )
    filing_path = _write_jsonl(
        tmp_path / "configured_sec_filings.jsonl",
        [
            {
                "timestamp": "2026-05-20T21:00:00Z",
                "symbol": "SPY",
                "form_type": "8-K",
                "summary": "Material litigation and lawsuit update",
            }
        ],
    )
    adapter = LocalToolAdapter(
        _settings(
            tmp_path,
            {NEWS_ARCHIVE_LOCAL, SEC_EDGAR},
            news_archive_path=news_path,
            sec_filings_archive_path=filing_path,
        )
    )

    news = adapter.get_news_archive_events("SPY", event_types={"options_market"})
    filings = adapter.get_sec_filings("SPY", contexts={"litigation"})

    assert len(news) == 1
    assert len(filings) == 1
    assert news[0].as_dict()["payload"]["event_type"] == "options_market"
    assert filings[0].as_dict()["payload"]["validated_contexts"] == ["litigation"]


@pytest.mark.parametrize(
    ("adapter_factory", "method_name", "expected_capability"),
    [
        (
            lambda settings: YFinanceAdapter(settings, history_provider=lambda **_: []),
            "get_daily_bars",
            YFINANCE_MARKET_DATA,
        ),
        (
            lambda settings: LongbridgeMarketDataAdapter(
                settings,
                transport=lambda *_, **__: {},
            ),
            "get_quote",
            LONGBRIDGE_MARKET_DATA,
        ),
        (
            lambda settings: AlphaVantageAdapter(settings, transport=lambda *_, **__: {}),
            "get_daily_bars",
            ALPHA_VANTAGE_MARKET_DATA,
        ),
    ],
)
def test_optional_live_market_adapters_reject_when_disabled(
    tmp_path: Path,
    adapter_factory: Any,
    method_name: str,
    expected_capability: str,
) -> None:
    adapter = adapter_factory(_settings(tmp_path, set(), alpha_vantage_api_key="demo"))

    with pytest.raises(CapabilityDisabledError, match=expected_capability):
        getattr(adapter, method_name)("SPY")


def test_alpha_vantage_rejects_missing_manual_api_key_when_capability_enabled(
    tmp_path: Path,
) -> None:
    adapter = AlphaVantageAdapter(
        _settings(tmp_path, {ALPHA_VANTAGE_MARKET_DATA}, alpha_vantage_api_key=None),
        transport=lambda *_, **__: {},
    )

    with pytest.raises(CapabilityDisabledError, match="alpha_vantage.api_key"):
        adapter.get_daily_bars("SPY")


def test_yfinance_normalizes_mocked_history_without_network(tmp_path: Path) -> None:
    def history_provider(**kwargs: Any) -> list[dict[str, Any]]:
        assert kwargs["symbol"] == "SPY"
        return [
            {
                "timestamp": "2026-05-22T13:30:00Z",
                "open": 530.0,
                "high": 532.0,
                "low": 529.5,
                "close": 531.2,
                "volume": 123456,
            }
        ]

    adapter = YFinanceAdapter(
        _settings(tmp_path, {YFINANCE_MARKET_DATA}),
        history_provider=history_provider,
    )

    rows = adapter.get_daily_bars(" spy ", start="2026-05-22", end="2026-05-23")

    evidence = _assert_normalized_evidence(rows[0], source_type="market_bar", provider="yfinance")
    assert evidence["symbol"] == "SPY"
    assert evidence["payload"]["close"] == 531.2
    assert evidence["cost_category"] == "free_manual"


def test_longbridge_normalizes_market_data_only_and_exposes_no_broker_surface(
    tmp_path: Path,
) -> None:
    def transport(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        assert endpoint == "quote"
        assert params == {"symbol": "AAPL"}
        return {
            "timestamp": "2026-05-22T14:00:00Z",
            "last_done": "191.25",
            "volume": 987654,
        }

    adapter = LongbridgeMarketDataAdapter(
        _settings(tmp_path, {LONGBRIDGE_MARKET_DATA}),
        transport=transport,
    )

    quote = adapter.get_quote("aapl")

    evidence = _assert_normalized_evidence(
        quote,
        source_type="market_bar",
        provider="longbridge.market_data",
    )
    assert evidence["payload"]["last_done"] == 191.25
    assert evidence["payload"]["evidence_kind"] == "quote"
    forbidden_surface = {
        "place_order",
        "submit_order",
        "cancel_order",
        "get_account",
        "get_positions",
        "simulation_account",
        "trade",
        "broker",
    }
    assert not (forbidden_surface & set(dir(adapter)))


def test_alpha_vantage_normalizes_mocked_manual_key_response_without_network(
    tmp_path: Path,
) -> None:
    def transport(params: dict[str, Any]) -> dict[str, Any]:
        assert params["apikey"] == "manual-key"
        assert params["symbol"] == "MSFT"
        return {
            "Time Series (Daily)": {
                "2026-05-22": {
                    "1. open": "420.00",
                    "2. high": "425.00",
                    "3. low": "419.25",
                    "4. close": "424.10",
                    "5. volume": "1234567",
                }
            }
        }

    adapter = AlphaVantageAdapter(
        _settings(
            tmp_path,
            {ALPHA_VANTAGE_MARKET_DATA},
            alpha_vantage_api_key="manual-key",
        ),
        transport=transport,
    )

    rows = adapter.get_daily_bars("msft")

    evidence = _assert_normalized_evidence(
        rows[0],
        source_type="market_bar",
        provider="alpha_vantage",
    )
    assert evidence["payload"]["close"] == 424.10
    assert evidence["cost_category"] == "free_manual_key"


def test_business_modules_do_not_import_provider_sdks_or_akshare() -> None:
    modules_dir = Path(__file__).resolve().parents[1] / "app" / "modules"
    provider_modules = {"yfinance", "longbridge", "akshare"}
    offenders: list[str] = []

    for path in modules_dir.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported = {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported = {node.module.split(".")[0]}
            else:
                continue
            if provider_modules & imported:
                offenders.append(str(path.relative_to(modules_dir)))

    assert offenders == []


def test_akshare_is_not_imported_anywhere_in_backend_app() -> None:
    app_dir = Path(__file__).resolve().parents[1] / "app"
    offenders: list[str] = []

    for path in app_dir.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported = {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported = {node.module.split(".")[0]}
            else:
                continue
            if "akshare" in imported:
                offenders.append(str(path.relative_to(app_dir)))

    assert offenders == []


def test_akshare_is_not_a_backend_dependency() -> None:
    pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"

    assert "akshare" not in pyproject_path.read_text(encoding="utf-8").lower()
