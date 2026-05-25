from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

from app.core.config import Settings

MARKET_BARS_FIXTURE = "market_bars.fixture"
MARKET_CALENDAR_FIXTURE = "market_calendar.fixture"
NEWS_EVENTS_FIXTURE = "news_events.fixture"
FILING_EVENTS_FIXTURE = "filing_events.fixture"
FREE_FIXTURE_COST = "free_fixture"
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9.-]+$")
PRICE_FIELDS = {"open", "high", "low", "close", "vwap"}


class CapabilityDisabledError(PermissionError):
    def __init__(self, capability: str) -> None:
        super().__init__(f"Tool capability is disabled: {capability}")
        self.capability = capability


class FixtureNotFoundError(FileNotFoundError):
    def __init__(self, path: Path) -> None:
        super().__init__(f"Fixture file not found: {path}")
        self.path = path


@dataclass(frozen=True)
class LocalEvidence:
    provider: str
    timestamp: str
    symbol: str
    payload: dict[str, Any]
    cost_category: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "timestamp": self.timestamp,
            "symbol": self.symbol,
            "payload": self.payload,
            "cost_category": self.cost_category,
        }


class LocalToolAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def get_market_bars(self, symbol: str, start: str, end: str) -> list[LocalEvidence]:
        self._require_capability(MARKET_BARS_FIXTURE)
        normalized_symbol = normalize_symbol(symbol)
        path = self._fixture_path(f"market_bars_{normalized_symbol.lower()}.csv")
        rows: list[LocalEvidence] = []

        with path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                timestamp = row["timestamp"]
                row_symbol = row["symbol"].upper()
                if row_symbol != normalized_symbol or not _within(timestamp, start, end):
                    continue
                rows.append(
                    LocalEvidence(
                        provider="fixture.market_bars",
                        timestamp=timestamp,
                        symbol=row_symbol,
                        payload=_coerce_market_bar_payload(row),
                        cost_category=FREE_FIXTURE_COST,
                    )
                )
        return rows

    def get_market_calendar(self, start: str, end: str) -> list[LocalEvidence]:
        self._require_capability(MARKET_CALENDAR_FIXTURE)
        path = self._fixture_path("market_calendar_us.csv")
        sessions: list[LocalEvidence] = []

        with path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                session_date = row["date"]
                if not _within_date(session_date, start, end):
                    continue
                sessions.append(
                    LocalEvidence(
                        provider="fixture.market_calendar",
                        timestamp=session_date,
                        symbol="US",
                        payload={
                            "exchange": row["exchange"],
                            "session_open": row["session_open"],
                            "session_close": row["session_close"],
                        },
                        cost_category=FREE_FIXTURE_COST,
                    )
                )
        return sessions

    def get_news_events(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[LocalEvidence]:
        self._require_capability(NEWS_EVENTS_FIXTURE)
        return self._read_jsonl_events(
            filename="news_events.jsonl",
            provider="fixture.news_events",
            symbol=symbol,
            start=start,
            end=end,
        )

    def get_filing_events(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[LocalEvidence]:
        self._require_capability(FILING_EVENTS_FIXTURE)
        return self._read_jsonl_events(
            filename="filing_events.jsonl",
            provider="fixture.filing_events",
            symbol=symbol,
            start=start,
            end=end,
        )

    def _read_jsonl_events(
        self,
        filename: str,
        provider: str,
        symbol: str,
        start: str | None,
        end: str | None,
    ) -> list[LocalEvidence]:
        normalized_symbol = normalize_symbol(symbol)
        rows: list[LocalEvidence] = []
        path = self._fixture_path(filename)
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                timestamp = row["timestamp"]
                row_symbol = row["symbol"].upper()
                if row_symbol != normalized_symbol or not _within(timestamp, start, end):
                    continue
                rows.append(
                    LocalEvidence(
                        provider=provider,
                        timestamp=timestamp,
                        symbol=row_symbol,
                        payload={
                            key: value
                            for key, value in row.items()
                            if key not in {"timestamp", "symbol"}
                        },
                        cost_category=FREE_FIXTURE_COST,
                    )
                )
        return rows

    def _fixture_path(self, filename: str) -> Path:
        path = self.settings.fixture_data_dir / filename
        if not path.exists():
            raise FixtureNotFoundError(path)
        return path

    def _require_capability(self, capability: str) -> None:
        if capability not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(capability)


def _within(timestamp: str, start: str | None, end: str | None) -> bool:
    parsed_timestamp = _parse_datetime(timestamp)
    if start is not None and parsed_timestamp < _parse_datetime(start):
        return False
    if end is not None and parsed_timestamp > _parse_datetime(end, is_end=True):
        return False
    return True


def _within_date(session_date: str, start: str | None, end: str | None) -> bool:
    parsed_date = _parse_date(session_date)
    if start is not None and parsed_date < _parse_datetime(start).date():
        return False
    if end is not None and parsed_date > _parse_datetime(end, is_end=True).date():
        return False
    return True


def _parse_datetime(value: str, *, is_end: bool = False) -> datetime:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        boundary_time = time.max if is_end else time.min
        return datetime.combine(date.fromisoformat(value), boundary_time, tzinfo=UTC)

    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def normalize_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    if not normalized or not SYMBOL_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid symbol: {symbol!r}")
    return normalized


def _coerce_market_bar_payload(row: dict[str, str]) -> dict[str, int | float | str]:
    payload: dict[str, int | float | str] = {}
    for key, value in row.items():
        if key in {"timestamp", "symbol"}:
            continue
        if key in PRICE_FIELDS:
            payload[key] = float(value)
        elif key == "volume":
            payload[key] = int(value)
        else:
            payload[key] = _coerce_scalar(value)
    return payload


def _coerce_scalar(value: str) -> int | float | str:
    try:
        parsed = float(value)
    except ValueError:
        return value
    if parsed.is_integer():
        return int(parsed)
    return parsed
