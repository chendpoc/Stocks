from __future__ import annotations

from app.modules.ticker_alias import TickerAliasResolver
from app.rulepack.loader import load_rulepack


def test_resolves_default_rulepack_universe_and_conservative_aliases(temp_settings) -> None:
    rulepack = load_rulepack(temp_settings.rulepack_path)
    resolver = TickerAliasResolver.from_rulepack(rulepack)

    result = resolver.resolve_text("TSLA 和 NVDA 都等二次握手，大盘不要太弱")

    assert [candidate.symbol for candidate in result.active_universe_matches] == ["TSLA", "NVDA"]
    assert {candidate.symbol for candidate in result.candidates} >= {"SPY", "QQQ"}
    assert any(
        candidate.alias == "大盘" and candidate.status == "candidate"
        for candidate in result.candidates
    )


def test_unknown_ticker_requires_approval_and_is_not_added_to_active_universe(
    temp_settings,
) -> None:
    rulepack = load_rulepack(temp_settings.rulepack_path)
    resolver = TickerAliasResolver.from_rulepack(rulepack)

    result = resolver.resolve_text("XYZ 突破了也不能自动进 universe")

    assert result.active_universe_matches == []
    assert any(
        candidate.symbol == "XYZ" and candidate.status == "requires_approval"
        for candidate in result.candidates
    )
    assert "XYZ" not in resolver.active_universe


def test_btc_alias_is_market_context_asset_not_stock_universe(temp_settings) -> None:
    rulepack = load_rulepack(temp_settings.rulepack_path)
    resolver = TickerAliasResolver.from_rulepack(rulepack)

    result = resolver.resolve_text("比特币 1% 预警，BTC 影响 COIN")

    assert any(
        candidate.symbol == "BTC"
        and candidate.asset_class == "market_context"
        and candidate.status == "context_asset"
        for candidate in result.candidates
    )
    assert "BTC" not in resolver.active_universe


def test_market_structure_terms_are_not_treated_as_unknown_tickers(temp_settings) -> None:
    rulepack = load_rulepack(temp_settings.rulepack_path)
    resolver = TickerAliasResolver.from_rulepack(rulepack)

    result = resolver.resolve_text("TSLA 等待放量站回 VWAP，再观察 20EMA 和 ATR。")

    assert [candidate.symbol for candidate in result.active_universe_matches] == ["TSLA"]
    assert not any(
        candidate.symbol in {"VWAP", "EMA", "ATR"} and candidate.status == "requires_approval"
        for candidate in result.candidates
    )
