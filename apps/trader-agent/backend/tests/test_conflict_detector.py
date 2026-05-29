from __future__ import annotations

from app.modules.conflict_detector import detect_conflict, find_conflicts


def _item(
    *,
    item_id: str = "item-1",
    symbols: list[str] | None = None,
    tags: list[str] | None = None,
    market_scope: str | None = None,
    rule_text: str = "",
    summary: str = "",
    invalidation: str | None = None,
    status: str = "active",
) -> dict:
    return {
        "id": item_id,
        "symbols_json": symbols or [],
        "tags_json": tags or [],
        "market_scope": market_scope,
        "rule_text": rule_text,
        "summary": summary,
        "title": summary or rule_text,
        "invalidation": invalidation,
        "status": status,
    }


def test_same_symbol_tag_overlap_opposite_direction_is_conflict() -> None:
    new_item = _item(
        symbols=["AAPL"],
        tags=["breakout"],
        rule_text="Buy AAPL on breakout above resistance",
    )
    existing = _item(
        item_id="existing-1",
        symbols=["AAPL"],
        tags=["breakout"],
        rule_text="Sell AAPL short on breakdown below support",
    )
    assert detect_conflict(new_item, [existing]) is True
    assert find_conflicts(new_item, [existing]) == ["existing-1"]


def test_same_symbol_no_tag_overlap_is_not_conflict() -> None:
    new_item = _item(
        symbols=["AAPL"],
        tags=["breakout"],
        rule_text="Buy AAPL on breakout",
    )
    existing = _item(
        item_id="existing-1",
        symbols=["AAPL"],
        tags=["earnings"],
        rule_text="Sell AAPL short",
    )
    assert detect_conflict(new_item, [existing]) is False


def test_different_symbols_is_not_conflict() -> None:
    new_item = _item(
        symbols=["AAPL"],
        tags=["breakout"],
        rule_text="Buy AAPL long",
    )
    existing = _item(
        item_id="existing-1",
        symbols=["MSFT"],
        tags=["breakout"],
        rule_text="Sell MSFT short",
    )
    assert detect_conflict(new_item, [existing]) is False


def test_same_direction_is_not_conflict() -> None:
    new_item = _item(
        symbols=["AAPL"],
        tags=["momentum"],
        market_scope="us_equities",
        rule_text="Buy AAPL on momentum continuation",
    )
    existing = _item(
        item_id="existing-1",
        symbols=["AAPL"],
        tags=["momentum"],
        market_scope="us_equities",
        rule_text="Go long AAPL when trend continues",
    )
    assert detect_conflict(new_item, [existing]) is False


def test_market_scope_overlap_with_opposite_invalidation_is_conflict() -> None:
    new_item = _item(
        symbols=["TSLA"],
        market_scope="us_equities",
        rule_text="Hold long TSLA",
        invalidation="Close below 200 DMA",
    )
    existing = _item(
        item_id="existing-1",
        symbols=["TSLA"],
        market_scope="us_equities",
        rule_text="Stay short TSLA",
        invalidation="Break above 200 DMA",
    )
    assert detect_conflict(new_item, [existing]) is True
