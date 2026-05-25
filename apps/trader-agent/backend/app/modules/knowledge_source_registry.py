from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings


@dataclass(frozen=True)
class KnowledgeSource:
    path: Path
    source_type: str


RAW_SOURCE_TYPES = {
    "trader_messages.jsonl": "trader_message",
    "x_posts.jsonl": "x_post",
    "news_events.jsonl": "news_event",
    "filing_events.jsonl": "filing_event",
}


def list_local_knowledge_sources(
    settings: Settings,
    *,
    docs_root: str | Path | None = None,
) -> list[KnowledgeSource]:
    """Return existing local knowledge sources without requiring optional raw files."""
    sources: list[KnowledgeSource] = []
    resolved_docs_root = Path(docs_root) if docs_root is not None else settings.knowledge_docs_root
    if resolved_docs_root.exists():
        sources.extend(
            KnowledgeSource(path=path, source_type="markdown_summary")
            for path in sorted(resolved_docs_root.rglob("*.md"))
            if path.is_file()
        )

    raw_root = settings.data_dir / "raw"
    for filename, source_type in RAW_SOURCE_TYPES.items():
        path = raw_root / filename
        if path.exists() and path.is_file():
            sources.append(KnowledgeSource(path=path, source_type=source_type))
    return sources
