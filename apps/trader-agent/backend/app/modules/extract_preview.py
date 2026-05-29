from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.core.config import Settings


@dataclass
class ExtractPreviewResult:
    memory_type: str
    title: str
    summary: str
    rule_text: str
    applicability: str | None
    invalidation: str | None
    symbols: list[str]
    tags: list[str]
    confidence: float


def _call_deepseek_json(settings: Settings, prompt: str) -> dict | None:
    payload = {
        "model": settings.deepseek_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Return only JSON. Do not include trading execution instructions.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        settings.deepseek_base_url,
        data=data,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=settings.model_call_timeout_seconds,
        ) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        KeyError,
        IndexError,
        TypeError,
    ):
        return None

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None

    if isinstance(content, str):
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    if isinstance(content, dict):
        return content
    return None


def _build_prompt(text: str, context_note: str | None) -> str:
    return (
        "Extract a memory item from the following text. Return JSON:\n"
        '{"memory_type": "...", "title": "...", "summary": "...", "rule_text": "...", '
        '"applicability": "...", "invalidation": "...", "symbols": [...], "tags": [...], '
        '"confidence": 0.7}\n\n'
        "memory_type must be one of: market_mechanism, trading_rule, source_pattern_summary\n"
        'If the text does not contain a clear financial memory, return {"memory_type": "none"}\n\n'
        f"Text: {text}\n"
        f"Context: {context_note or 'none'}"
    )


def extract_preview(
    settings: Settings,
    text: str,
    *,
    context_note: str | None = None,
) -> ExtractPreviewResult | None:
    if not text or not text.strip():
        return None

    parsed = _call_deepseek_json(settings, _build_prompt(text.strip(), context_note))
    if not isinstance(parsed, dict):
        return None

    memory_type = parsed.get("memory_type")
    if memory_type in (None, "none"):
        return None

    title = parsed.get("title")
    if not title:
        return None

    symbols = parsed.get("symbols") or []
    if not isinstance(symbols, list):
        symbols = []

    tags = parsed.get("tags") or []
    if not isinstance(tags, list):
        tags = []

    try:
        confidence = float(parsed.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5

    return ExtractPreviewResult(
        memory_type=str(memory_type),
        title=str(title),
        summary=str(parsed.get("summary") or ""),
        rule_text=str(parsed.get("rule_text") or ""),
        applicability=parsed.get("applicability"),
        invalidation=parsed.get("invalidation"),
        symbols=[str(symbol) for symbol in symbols if symbol],
        tags=[str(tag) for tag in tags if tag],
        confidence=confidence,
    )
