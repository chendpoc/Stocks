from __future__ import annotations

SCHEMA_VERSION = "live_market_data_plane.v0"
NORMALIZATION_VERSION = "live_market_plane.v0"

M2_US_SYMBOLS: tuple[str, ...] = (
    "TSLA.US",
    "NVDA.US",
    "AAPL.US",
    "QQQ.US",
    "SPY.US",
)

ANALYSIS_WARNING_QUOTE_AGE_S = 5.0
ANALYSIS_BLOCKED_QUOTE_AGE_S = 30.0
PAPER_BLOCKED_QUOTE_AGE_S = 2.0
