from __future__ import annotations

import re
from html import unescape

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.ingestion.events_ingest import create_event

RSS_FEEDS: list[tuple[str, str]] = []

_STRIP_TAGS = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return unescape(_STRIP_TAGS.sub("", text or "")).strip()


def crawl_rss(feed_url: str) -> list[dict]:
    try:
        import feedparser
    except ImportError:
        return []
    feed = feedparser.parse(feed_url)
    items: list[dict] = []
    for entry in feed.entries[:20]:
        items.append(
            {
                "ts": entry.get("published", utc_now_iso()),
                "title": (entry.get("title") or "")[:200],
                "raw_text": _strip_html(entry.get("summary", ""))[:2000],
                "url": entry.get("link"),
            }
        )
    return items


def _event_exists(engine, title: str) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT 1 FROM events WHERE title = :title AND source_type = 'news' LIMIT 1"
            ),
            {"title": title},
        ).fetchone()
    return row is not None


def ingest_news(settings: Settings | None, engine, *, include_stub: bool = True) -> int:
    inserted = 0
    for name, feed_url in RSS_FEEDS:
        for item in crawl_rss(feed_url):
            if _event_exists(engine, item["title"]):
                continue
            try:
                create_event(
                    engine,
                    ts=item["ts"] or utc_now_iso(),
                    event_type="news",
                    title=item["title"],
                    raw_text=item["raw_text"],
                    source=name,
                    source_type="news",
                    url=item.get("url"),
                )
                inserted += 1
            except Exception:
                continue

    if include_stub and inserted == 0:
        title = "CLI TUI v2 news stub"
        if not _event_exists(engine, title):
            create_event(
                engine,
                ts=utc_now_iso(),
                event_type="news",
                title=title,
                raw_text="Stub news event for ingest smoke tests.",
                source="stub",
                source_type="news",
            )
            inserted += 1

    return inserted
