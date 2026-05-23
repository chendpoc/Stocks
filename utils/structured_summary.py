from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pytz

SUMMARY_SCHEMA_VERSION = "1.0"
DEFAULT_PUBLIC_LINK = "https://stock.autoin.me/"
DEFAULT_FEED_ID = "chat_feed_1CTr5VAdNHtbZAFaTitvoT"


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if item not in (None, "")]
    return [value]


def _as_text_list(value: Any) -> List[str]:
    out: List[str] = []
    for item in _as_list(value):
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = "；".join(f"{key}：{val}" for key, val in item.items() if val not in (None, ""))
        elif isinstance(item, list):
            text = "；".join(str(part).strip() for part in item if part not in (None, ""))
        else:
            text = str(item).strip()
        if text:
            out.append(text)
    return out


def _is_admin_source(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return any(token in text for token in ("admin", "管理员", "xiaozhaolucky", "赵哥", "zhaoge"))


def _normalize_symbol_item(item: Any, default_source: str = "user") -> Optional[Dict[str, str]]:
    if isinstance(item, str):
        symbol = item.strip()
        return {"symbol": symbol, "name": "", "summary": "", "source": default_source} if symbol else None
    if not isinstance(item, dict):
        return None
    symbol = str(item.get("symbol") or item.get("name") or "UNKNOWN").strip()
    if not symbol:
        return None
    normalized = {
        "symbol": symbol,
        "name": str(item.get("name") or "").strip(),
        "summary": str(item.get("summary") or item.get("reason") or item.get("thesis") or "").strip(),
        "source": str(item.get("source") or default_source).strip(),
    }
    for field in ("thesis", "trigger", "action", "risk", "evidence"):
        text = str(item.get(field) or "").strip()
        if text:
            normalized[field] = text
    return normalized


def _normalize_professional_brief(value: Any, summary: Dict[str, Any]) -> Dict[str, Any]:
    brief = value if isinstance(value, dict) else {}
    framework = brief.get("trade_framework") if isinstance(brief.get("trade_framework"), dict) else {}
    normalized = {
        "market_regime": _as_text_list(brief.get("market_regime")) or summary.get("market_context", [])[:2],
        "core_theory": _as_text_list(brief.get("core_theory")) or summary.get("admin_deep_reading", [])[:3],
        "evidence_chain": _as_text_list(brief.get("evidence_chain")),
        "trade_framework": {
            "entry_conditions": _as_text_list(framework.get("entry_conditions")),
            "holding_logic": _as_text_list(framework.get("holding_logic")),
            "exit_conditions": _as_text_list(framework.get("exit_conditions")),
            "position_control": _as_text_list(framework.get("position_control")),
            "risk_control": _as_text_list(framework.get("risk_control")),
        },
        "watch_points": _as_text_list(brief.get("watch_points")) or summary.get("events", [])[:2],
        "invalidation": _as_text_list(brief.get("invalidation")) or summary.get("risks", [])[:2],
    }
    return normalized


def _normalize_arbitrage_opportunity(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    has_content = any(
        [
            str(item.get("title") or "").strip(),
            _as_text_list(item.get("symbols")),
            str(item.get("setup") or "").strip(),
            str(item.get("trigger") or "").strip(),
            _as_text_list(item.get("data_points")),
            str(item.get("action_bias") or "").strip(),
            str(item.get("risk") or "").strip(),
            str(item.get("source_basis") or "").strip(),
        ]
    )
    if not has_content:
        return None
    normalized = {
        "title": str(item.get("title") or "未命名机会").strip(),
        "symbols": _as_text_list(item.get("symbols")),
        "setup": str(item.get("setup") or "").strip(),
        "trigger": str(item.get("trigger") or "").strip(),
        "data_points": _as_text_list(item.get("data_points")),
        "action_bias": str(item.get("action_bias") or "").strip(),
        "risk": str(item.get("risk") or "").strip(),
        "confidence": str(item.get("confidence") or "").strip(),
        "source_basis": str(item.get("source_basis") or "").strip(),
    }
    return normalized


def _safe_filename_part(text: str) -> str:
    out = "".join("_" if c in '\\/:*?"<>|' else c for c in (text or "").strip())
    return out or "untitled"


def _sanitize_markdown(text: str) -> str:
    text = text or ""
    for tag in ("think", "thinking"):
        text = re.sub(
            rf"<{tag}\b[^>]*>.*?</{tag}\s*>",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        text = re.sub(rf"</?{tag}\b[^>]*>", "", text, flags=re.IGNORECASE)
    return text.strip()


def _write_text_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True


def _html_attr(text: Any) -> str:
    value = str(text or "")
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _now_cst(generated_at: Optional[dt.datetime] = None) -> dt.datetime:
    tz = pytz.timezone("Asia/Shanghai")
    if generated_at is None:
        return dt.datetime.now(tz)
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=tz)
    return generated_at.astimezone(tz)


def _format_ms(ts_ms: Any) -> Optional[str]:
    try:
        value = int(ts_ms)
    except Exception:
        return None
    return dt.datetime.fromtimestamp(value / 1000, tz=dt.timezone.utc).isoformat()


def archive_raw_messages(
    posts: Iterable[Dict[str, Any]],
    users: Dict[str, str],
    output_root: str | os.PathLike[str] = "data/raw",
    generated_at: Optional[dt.datetime] = None,
    from_cache: bool = False,
    images: Optional[Iterable[Dict[str, Any]]] = None,
) -> Dict[str, str]:
    posts_list = list(posts)
    images_list = list(images or [])
    generated_cst = _now_cst(generated_at)
    day = generated_cst.strftime("%Y-%m-%d")
    day_dir = Path(output_root) / day
    day_dir.mkdir(parents=True, exist_ok=True)

    posts_path = day_dir / "posts.jsonl"
    with posts_path.open("w", encoding="utf-8") as f:
        for post in posts_list:
            f.write(json.dumps(post, ensure_ascii=False, sort_keys=True) + "\n")

    users_path = day_dir / "users.json"
    users_path.write_text(
        json.dumps(users or {}, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    images_path = day_dir / "images.json"
    images_path.write_text(
        json.dumps(images_list, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    timestamps = []
    for post in posts_list:
        try:
            timestamps.append(int(post.get("createdAt", 0)))
        except Exception:
            continue

    downloaded_count = sum(1 for item in images_list if item.get("download_status") == "downloaded")
    failed_count = sum(1 for item in images_list if item.get("download_status") == "failed")
    feed_id = next((post.get("feedId") for post in posts_list if post.get("feedId")), DEFAULT_FEED_ID)
    manifest = {
        "day": day,
        "generated_at": generated_cst.isoformat(),
        "post_count": len(posts_list),
        "user_count": len(users or {}),
        "image_count": len(images_list),
        "downloaded_image_count": downloaded_count,
        "failed_image_count": failed_count,
        "feed_id": feed_id,
        "from_cache": bool(from_cache),
        "earliest_created_at": _format_ms(min(timestamps)) if timestamps else None,
        "latest_created_at": _format_ms(max(timestamps)) if timestamps else None,
    }
    manifest_path = day_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "day": day,
        "day_dir": str(day_dir),
        "posts_path": str(posts_path),
        "users_path": str(users_path),
        "images_path": str(images_path),
        "manifest_path": str(manifest_path),
    }


def normalize_summary_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise TypeError("summary payload must be a dict")

    normalized: Dict[str, Any] = {
        "schema_version": str(payload.get("schema_version") or SUMMARY_SCHEMA_VERSION),
        "event_summary": _as_text_list(
            payload.get("event_summary")
            or payload.get("three_sentence_summary")
            or payload.get("executive_summary")
        ),
        "overview": _as_text_list(payload.get("overview")),
        "market_context": _as_text_list(payload.get("market_context")),
        "options": _as_text_list(payload.get("options")),
        "events": _as_text_list(payload.get("events")),
        "admin_core": _as_text_list(payload.get("admin_core")),
        "admin_quotes": _as_text_list(payload.get("admin_quotes")),
        "admin_deep_reading": _as_text_list(
            payload.get("admin_deep_reading")
            or payload.get("admin_intent")
            or payload.get("admin_analysis")
        ),
        "user_core": _as_text_list(payload.get("user_core") or payload.get("user_discussion")),
        "disagreements": _as_text_list(payload.get("disagreements")),
        "risks": _as_text_list(payload.get("risks")),
    }

    if not normalized["admin_core"]:
        normalized["admin_core"] = ["未发现管理员发言"]
    if not normalized["admin_deep_reading"]:
        normalized["admin_deep_reading"] = normalized["admin_core"]
    if not normalized["user_core"]:
        normalized["user_core"] = normalized["disagreements"]

    symbols: List[Dict[str, str]] = []
    seen_symbols = set()

    def add_symbol(symbol_item: Optional[Dict[str, str]]) -> None:
        if not symbol_item:
            return
        key = (
            symbol_item.get("symbol", "").upper(),
            symbol_item.get("name", ""),
            symbol_item.get("summary", ""),
            "admin" if _is_admin_source(symbol_item.get("source")) else "user",
        )
        if key in seen_symbols:
            return
        seen_symbols.add(key)
        symbols.append(symbol_item)

    for item in _as_list(payload.get("key_symbols")):
        add_symbol(_normalize_symbol_item(item, default_source="user"))
    for item in _as_list(payload.get("admin_symbols")):
        symbol_item = _normalize_symbol_item(item, default_source="admin")
        if symbol_item:
            symbol_item["source"] = "admin"
        add_symbol(symbol_item)
    for item in _as_list(payload.get("user_symbols")):
        symbol_item = _normalize_symbol_item(item, default_source="user")
        if symbol_item:
            symbol_item["source"] = "user"
        add_symbol(symbol_item)
    normalized["key_symbols"] = symbols
    normalized["admin_symbols"] = [item for item in symbols if _is_admin_source(item.get("source"))]
    normalized["user_symbols"] = [item for item in symbols if not _is_admin_source(item.get("source"))]
    normalized["professional_brief"] = _normalize_professional_brief(
        payload.get("professional_brief"),
        normalized,
    )
    normalized["arbitrage_opportunities"] = [
        item
        for item in (
            _normalize_arbitrage_opportunity(raw_item)
            for raw_item in _as_list(payload.get("arbitrage_opportunities"))
        )
        if item
    ]

    image_digest = payload.get("image_digest")
    if not isinstance(image_digest, dict):
        image_digest = {}
    normalized["image_digest"] = {
        "title": str(image_digest.get("title") or "每日财经群总结"),
        "subtitle": str(image_digest.get("subtitle") or ""),
        "core": _as_text_list(image_digest.get("core")) or normalized["overview"][:4],
        "market": _as_text_list(image_digest.get("market")) or normalized["market_context"][:3],
        "symbols": _as_list(image_digest.get("symbols")) or normalized["key_symbols"][:5],
        "admin": _as_text_list(image_digest.get("admin")) or normalized["admin_core"][:3],
        "risks": _as_text_list(image_digest.get("risks")) or normalized["risks"][:4],
        "link": str(image_digest.get("link") or DEFAULT_PUBLIC_LINK),
    }
    if not normalized["event_summary"]:
        fallback_event_summary = _build_fallback_event_summary(normalized)
        normalized["event_summary"] = (
            fallback_event_summary[:3]
            or normalized["image_digest"]["core"][:3]
            or normalized["overview"][:3]
        )

    return normalized


def _bullet_list(items: List[str], empty: str = "暂无明确记录。") -> str:
    if not items:
        return f"- {empty}\n"
    return "".join(f"- {item}\n" for item in items)


def _explain_beginner_terms(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return text

    replacements = [
        (r"(?<![A-Za-z])SPX(?![A-Za-z（])", "SPX（标普500指数）"),
        ("缓跌模型", "缓跌模型（把下跌按时间和幅度拆成一条可跟踪的路线图）"),
        ("机械化套利", "机械化套利（按固定规则在低点附近买、反弹时卖，不靠临场猜方向）"),
        ("做T", "做T（围绕同一标的低买高卖来降低成本）"),
        ("缺口", "缺口（价格跳空后留下的未交易区间，常被交易者当成回补目标）"),
        ("仓位", "仓位（投入资金比例）"),
        ("夜盘", "夜盘（常规交易时间外的夜间交易）"),
        ("盘前", "盘前（正式开盘前的交易时段）"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, count=1)
    return text


def _build_fallback_event_summary(summary: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    admin_line = next(iter(summary.get("admin_deep_reading") or []), "")
    market_line = next(iter(summary.get("market_context") or summary.get("overview") or []), "")
    action_line = next(iter(summary.get("risks") or summary.get("options") or []), "")

    if admin_line:
        lines.append(f"赵哥的框架：{_explain_beginner_terms(admin_line)}")
    if market_line:
        lines.append(f"市场发生的事：{_explain_beginner_terms(market_line)}")
    if action_line:
        lines.append(f"操作含义：{_explain_beginner_terms(action_line)}")
    return lines


def _render_symbol_list(items: List[Dict[str, Any]], empty: str = "暂无明确标的。") -> str:
    if not items:
        return f"- {empty}\n"
    parts: List[str] = []
    for item in items:
        label = item["symbol"]
        if item.get("name"):
            label = f"{label}（{item['name']}）"
        summary_text = item.get("summary") or "暂无明确描述。"
        parts.append(f"- **{label}**: {summary_text}\n")
    return "".join(parts)


def _symbol_label(item: Dict[str, Any]) -> str:
    label = str(item.get("symbol") or "UNKNOWN").strip() or "UNKNOWN"
    name = str(item.get("name") or "").strip()
    if name:
        label = f"{label}（{name}）"
    return label


def _table_cell(value: Any) -> str:
    text = str(value or "").replace("\n", " ").strip()
    return text.replace("|", "\\|")


def _join_points(items: Any) -> str:
    values = _as_text_list(items)
    return "；".join(values)


def _render_admin_symbol_section(items: List[Dict[str, Any]], empty: str = "管理员未明确提到重点标的。") -> str:
    if not items:
        return f"- {empty}\n"
    has_structured_fields = any(
        item.get("thesis") or item.get("trigger") or item.get("action") or item.get("risk")
        for item in items
    )
    if not has_structured_fields:
        return _render_symbol_list(items, empty=empty)

    rows = ["| 标的 | 逻辑 | 触发条件 | 动作 | 风险 |\n", "| --- | --- | --- | --- | --- |\n"]
    for item in items:
        rows.append(
            "| "
            + " | ".join(
                [
                    _table_cell(_symbol_label(item)),
                    _table_cell(item.get("thesis") or item.get("summary") or "暂无明确描述。"),
                    _table_cell(item.get("trigger") or "待确认"),
                    _table_cell(item.get("action") or "观察"),
                    _table_cell(item.get("risk") or "未明确"),
                ]
            )
            + " |\n"
        )
    return "".join(rows)


def _render_professional_brief(brief: Dict[str, Any]) -> str:
    if not isinstance(brief, dict):
        return ""
    framework = brief.get("trade_framework") if isinstance(brief.get("trade_framework"), dict) else {}
    has_content = any(
        [
            brief.get("market_regime"),
            brief.get("core_theory"),
            brief.get("evidence_chain"),
            brief.get("watch_points"),
            brief.get("invalidation"),
            any(framework.get(key) for key in framework),
        ]
    )
    if not has_content:
        return ""

    parts: List[str] = ["\n## 市场状态判断\n"]
    parts.append(_bullet_list(brief.get("market_regime", []), empty="暂无明确市场状态判断。"))
    parts.append("\n### 核心理论\n")
    parts.append(_bullet_list(brief.get("core_theory", []), empty="暂无明确核心理论。"))
    if brief.get("evidence_chain"):
        parts.append("\n### 证据链\n")
        parts.append(_bullet_list(brief.get("evidence_chain", [])))

    framework_rows = [
        ("入场条件", framework.get("entry_conditions")),
        ("持仓逻辑", framework.get("holding_logic")),
        ("退出条件", framework.get("exit_conditions")),
        ("仓位纪律", framework.get("position_control")),
        ("风控规则", framework.get("risk_control")),
        ("观察信号", brief.get("watch_points")),
        ("失效条件", brief.get("invalidation")),
    ]
    if any(_as_text_list(items) for _, items in framework_rows):
        parts.append("\n### 交易框架拆解\n")
        for label, items in framework_rows:
            text = _join_points(items)
            if text:
                parts.append(f"- **{label}**：{text}\n")
    return "".join(parts)


def _render_arbitrage_opportunities(items: List[Dict[str, Any]]) -> str:
    if not items:
        return ""
    parts: List[str] = [
        "\n## 套利机会推测\n",
        "> 免责声明：以下内容是基于聊天信息和管理员框架的机会观察，不是确定性交易建议。\n",
    ]
    for item in items:
        title = str(item.get("title") or "未命名机会").strip()
        parts.append(f"\n### {title}\n")
        symbols = item.get("symbols") or []
        if symbols:
            parts.append(f"- **标的**：{', '.join(symbols)}\n")
        field_rows = [
            ("结构", item.get("setup")),
            ("触发条件", item.get("trigger")),
            ("数据点", "；".join(item.get("data_points") or [])),
            ("动作倾向", item.get("action_bias")),
            ("风险", item.get("risk")),
            ("置信度", item.get("confidence")),
            ("来源依据", item.get("source_basis")),
        ]
        for label, value in field_rows:
            text = str(value or "").strip()
            if text:
                parts.append(f"- **{label}**：{text}\n")
    return "".join(parts)


def _render_prefixed_list(prefix: str, items: List[str], empty: str) -> str:
    if not items:
        return f"- {empty}\n"
    return "".join(f"- {prefix}：{item}\n" for item in items)


def _render_prefixed_symbol_list(
    prefix: str,
    items: List[Dict[str, Any]],
    empty: str = "暂无明确标的。",
) -> str:
    if not items:
        return f"- {empty}\n"
    parts: List[str] = []
    for item in items:
        label = item["symbol"]
        if item.get("name"):
            label = f"{label}（{item['name']}）"
        summary_text = item.get("summary") or "暂无明确描述。"
        parts.append(f"- {prefix} **{label}**：{summary_text}\n")
    return "".join(parts)


def _render_collapsed_text(summary: str, lines: List[str], empty: str) -> str:
    if not lines:
        return f"- {empty}\n"
    safe_text = "\n".join(lines).replace("```", "`\u200b``")
    return (
        "<details>\n"
        f"<summary>{summary}</summary>\n\n"
        "```text\n"
        f"{safe_text}\n"
        "```\n\n"
        "</details>\n"
    )


def _extract_admin_lines(chat_text: Optional[str]) -> List[str]:
    if not chat_text:
        return []

    lines: List[str] = []
    for raw_line in chat_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(
            r"^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+(?P<speaker>.*?)(?:\s+\(回复.*?\))?\s*说[:：]",
            line,
        )
        if match:
            speaker_part = match.group("speaker").strip()
        else:
            speaker_part = re.split(r"\s说[:：]\s*", line, maxsplit=1)[0]
            speaker_part = re.sub(r"\s+\(回复.*$", "", speaker_part).strip()
        if "[管理员]" in speaker_part or any(token in speaker_part for token in ("xiaozhaolucky", "赵哥")):
            lines.append(line)
    return lines


def _is_admin_image(image: Dict[str, Any]) -> bool:
    return bool(image.get("is_admin")) or _is_admin_source(image.get("username"))


def _render_image_gallery(images: List[Dict[str, Any]], image_display: str = "details") -> str:
    if not images:
        return ""

    parts: List[str] = []
    parts.append("\n## 群聊图片记录\n")

    if image_display == "details":
        parts.append(f"\n<details>\n<summary>共 {len(images)} 张图片</summary>\n\n")

    for idx, image in enumerate(images, 1):
        username = image.get("username") or "未知用户"
        admin_label = "管理员" if image.get("is_admin") else "普通用户"
        filename = image.get("filename") or image.get("id") or f"image-{idx}"
        created_at = image.get("created_at_text") or image.get("created_at") or ""
        dimensions = ""
        if image.get("width") and image.get("height"):
            dimensions = f"{image.get('width')}x{image.get('height')}"
        meta = " / ".join(item for item in [created_at, username, admin_label, dimensions] if item)
        parts.append(f"### 图片 {idx}: {filename}\n\n")
        if meta:
            parts.append(f"- 信息：{meta}\n")
        if image.get("post_id"):
            parts.append(f"- Post ID：`{image.get('post_id')}`\n")
        if image.get("content_type"):
            parts.append(f"- 类型：{image.get('content_type')}\n")
        if image.get("source_type") == "link_embed":
            parts.append("- 来源：链接预览图\n")
            if image.get("link_title"):
                parts.append(f"- 链接标题：{image.get('link_title')}\n")
            if image.get("link_url"):
                parts.append(f"- [来源链接]({image.get('link_url')})\n")

        markdown_path = image.get("markdown_path")
        if image.get("download_status") == "downloaded" and markdown_path:
            parts.append(
                "\n"
                f'<p><img src="{_html_attr(markdown_path)}" alt="{_html_attr(filename)}" '
                'loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px; '
                'border: 1px solid #e5e7eb;" /></p>\n\n'
            )
            parts.append(f"- [本地镜像]({markdown_path})\n")
        else:
            error = image.get("error") or "下载失败"
            parts.append(f"- 本地镜像：失败，{error}\n")

        if image.get("original_url"):
            parts.append(f"- [原始链接]({image.get('original_url')})\n")
        parts.append("\n")

    if image_display == "details":
        parts.append("</details>\n")

    return "".join(parts)


def _render_chat_transcript(chat_text: Optional[str]) -> str:
    transcript = (chat_text or "").strip()
    if not transcript:
        return ""

    transcript = re.sub(r"\s*\[图片 [^\]]+\]", "", transcript)

    def strip_link_preview_image(match: re.Match[str]) -> str:
        content = re.sub(r"\s+image=\S+", "", match.group(1)).strip()
        return f"[链接预览: {content}]"

    transcript = re.sub(r"\[链接预览: ([^\]]+)\]", strip_link_preview_image, transcript)
    safe_transcript = transcript.replace("```", "`\u200b``")
    line_count = len([line for line in transcript.splitlines() if line.strip()])
    return (
        "\n## 群聊内容记录\n\n"
        "<details>\n"
        f"<summary>共 {line_count} 条群聊记录</summary>\n\n"
        "```text\n"
        f"{safe_transcript}\n"
        "```\n\n"
        "</details>\n"
    )


def render_summary_markdown(
    summary: Dict[str, Any],
    images: Optional[Iterable[Dict[str, Any]]] = None,
    image_display: str = "details",
    chat_text: Optional[str] = None,
    include_audit_records: bool = True,
) -> str:
    summary = normalize_summary_payload(summary)
    admin_lines = _extract_admin_lines(chat_text) or summary["admin_quotes"]
    admin_images = [image for image in list(images or []) if _is_admin_image(image)]
    parts: List[str] = []
    parts.append("## 三句话总结\n")
    parts.append(_bullet_list(summary["event_summary"][:3]))
    parts.append("\n## 核心结论\n")
    parts.append(_bullet_list(summary["overview"]))
    parts.append(_render_professional_brief(summary["professional_brief"]))
    parts.append("\n## xiaozhaolucky\n")
    parts.append("### 深度解读\n")
    parts.append(_bullet_list(summary["admin_deep_reading"], empty="未发现可解读的管理员意图。"))
    parts.append("\n### 管理员重点标的\n")
    parts.append(_render_admin_symbol_section(summary["admin_symbols"], empty="管理员未明确提到重点标的。"))
    parts.append(_render_arbitrage_opportunities(summary["arbitrage_opportunities"]))
    if include_audit_records:
        parts.append("\n### 原始发言记录\n")
        parts.append(_render_collapsed_text(f"查看 xiaozhaolucky 原始发言 {len(admin_lines)} 条", admin_lines, "未发现管理员发言。"))
    parts.append("\n## 其他用户\n")
    parts.append("### 用户观点提炼\n")
    parts.append(_bullet_list(summary["user_core"], empty="暂无用户补充讨论。"))
    parts.append("\n### 普通用户提到的标的\n")
    parts.append(_render_symbol_list(summary["user_symbols"], empty="用户未明确提到重点标的。"))
    parts.append("\n## 市场主线\n")
    parts.append(_bullet_list(summary["market_context"]))
    parts.append("\n## 期权与交易策略\n")
    parts.append(_bullet_list(summary["options"]))
    parts.append("\n## 事件与关键日期\n")
    parts.append(_bullet_list(summary["events"]))
    parts.append("\n## 风险与观察点\n")
    parts.append(_bullet_list(summary["risks"]))
    if include_audit_records:
        parts.append(_render_image_gallery(admin_images, image_display=image_display))
        parts.append(_render_chat_transcript(chat_text))
    return _sanitize_markdown("".join(parts)) + "\n"


def _render_text_section(title: str, items: List[str]) -> List[str]:
    if not items:
        return []
    lines = [title]
    lines.extend(f"- {item}" for item in items)
    lines.append("")
    return lines


def _render_text_symbol_section(title: str, items: List[Dict[str, Any]]) -> List[str]:
    if not items:
        return []
    lines = [title]
    seen_symbols = set()
    for item in items:
        label = str(item.get("symbol") or "").strip() or "UNKNOWN"
        symbol_key = label.upper()
        if symbol_key in seen_symbols:
            continue
        seen_symbols.add(symbol_key)
        name = str(item.get("name") or "").strip()
        if name:
            label = f"{label} ({name})"
        summary_text = str(item.get("summary") or "").strip()
        lines.append(f"- {label}: {summary_text}" if summary_text else f"- {label}")
    lines.append("")
    return lines


def render_summary_text(
    summary: Dict[str, Any],
    images: Optional[Iterable[Dict[str, Any]]] = None,
    chat_text: Optional[str] = None,
) -> str:
    """Render dense WeCom text without audit-only transcript, image, or raw quote records."""
    summary = normalize_summary_payload(summary)
    lines: List[str] = ["每日财经总结", ""]
    lines.extend(_render_text_section("三句话总结", summary["event_summary"][:3]))
    lines.extend(_render_text_section("核心结论", summary["overview"]))
    lines.extend(_render_text_section("xiaozhaolucky", summary["admin_deep_reading"]))
    lines.extend(_render_text_symbol_section("管理员重点标的", summary["admin_symbols"]))
    lines.extend(_render_text_section("其他用户", summary["user_core"]))
    lines.extend(_render_text_symbol_section("普通用户提到的标的", summary["user_symbols"]))
    lines.extend(_render_text_section("市场主线", summary["market_context"]))
    lines.extend(_render_text_section("期权与交易策略", summary["options"]))
    lines.extend(_render_text_section("事件与关键日期", summary["events"]))
    lines.extend(_render_text_section("风险与观察点", summary["risks"]))
    return "\n".join(lines).strip()


def render_public_index_markdown(
    summary: Dict[str, Any],
    description: str,
    model: str,
    generated_at: Optional[dt.datetime] = None,
    images: Optional[Iterable[Dict[str, Any]]] = None,
    chat_text: Optional[str] = None,
) -> str:
    summary = normalize_summary_payload(summary)
    generated_cst = _now_cst(generated_at)
    now_utc = generated_cst.astimezone(pytz.UTC)
    now_pst = now_utc.astimezone(pytz.timezone("America/Los_Angeles"))
    now_est = now_utc.astimezone(pytz.timezone("America/New_York"))
    public_body = render_summary_markdown(
        summary,
        images=list(images or []),
        chat_text=chat_text,
        include_audit_records=False,
    )
    return f"""# 财经聊天总结 - {description}

> 北京时间：{generated_cst.strftime("%Y-%m-%d %H:%M:%S CST")}

> 美西时间：{now_pst.strftime("%Y-%m-%d %H:%M:%S PST")}

> 美东时间：{now_est.strftime("%Y-%m-%d %H:%M:%S EST")}

> 模型：{model}

{public_body}
"""


def build_structured_summary_prompt(chat_text: str) -> str:
    return f"""以下是财经社区聊天记录。请只基于聊天记录输出 JSON，不要输出 Markdown、解释或代码块。

目标：提取适合网页归档和单张总结图展示的结构化摘要。

硬性规则：
1. 只保留财经、交易、市场、风险、标的相关信息，忽略闲聊。
2. 管理员只包括 xiaozhaolucky / 赵哥；mrzhoulucky 等相似名字都不是管理员。
3. admin_quotes 必须完整保留管理员原始发言，不要改写、压缩或二次总结；关键数字、条件、否定词必须原样保留。
4. admin_deep_reading 是最重要字段：必须基于 admin_quotes 深入理解管理员“话背后的交易意图、风控框架、操作优先级、隐含判断”，不是复述表面文字。
5. 用户内容只作为补充讨论、情绪、分歧和线索，不得覆盖管理员框架。
6. 标的点位和操作建议以管理员发言为最高优先级；admin_symbols 只放管理员提到的重点标的，user_symbols 只放普通用户提到的标的。
7. key_symbols 的 source 只用于兼容旧结构；最终 Markdown 必须把标的分成“管理员重点标的”和“普通用户提到的标的”。
8. user_core 只总结其他用户，不要混入 xiaozhaolucky / 赵哥 的观点。
9. 如果没有发现管理员 xiaozhaolucky / 赵哥发言，admin_core 和 admin_deep_reading 必须包含“未发现管理员发言”。
10. event_summary 必须用三句话描述：核心理论是什么、市场实际发生了什么、这对操作意味着什么。
11. event_summary 必须小白友好：不要只写专业短句；遇到专业术语要用括号解释，例如 SPX=标普500指数、缺口=价格跳空后留下的未交易区间、做T=围绕同一标的低买高卖来降低成本。
12. overview、admin_deep_reading、user_core、market_context、risks 必须是 rewrite 后的提炼总结，不要把大量原话逐句搬运进去；原话只放 admin_quotes。
13. 不要编造聊天记录里没有的价格、日期、结论。
14. 输出要像专业报告：先判断市场状态，再解释核心理论、证据链、交易框架和风险边界，让普通读者知道“为什么这样看”。
15. professional_brief 是专业报告层，必须比 overview 更深入，不能只重复结论。
16. arbitrage_opportunities 是机会观察/推测，不是确定性交易建议；必须基于 xiaozhaolucky / 核心理论和群聊内容线索，提炼可关注的套利、价差、事件或节奏机会。
17. arbitrage_opportunities 必须写清 setup、trigger、data_points、action_bias、risk、confidence、source_basis；不要把套利机会写成确定性买卖指令。

JSON schema：
{{
  "schema_version": "1.0",
  "event_summary": ["小白友好三句话总结：赵哥的理论，解释专业术语", "小白友好三句话总结：市场发生的事", "小白友好三句话总结：操作含义"],
  "overview": ["核心结论，2-4条"],
  "admin_quotes": ["逐条完整保留 xiaozhaolucky / 赵哥 的原始发言，不改写"],
  "admin_deep_reading": ["基于管理员原话提炼深层意图、交易框架、风控含义，3-8条"],
  "user_core": ["普通用户讨论的主要补充、分歧、情绪或线索，1-5条"],
  "market_context": ["市场主线/资金逻辑/指数状态，1-4条"],
  "professional_brief": {{
    "market_regime": ["专业报告层：当前市场状态、资金环境、波动结构，2-4条"],
    "core_theory": ["核心理论：把赵哥框架解释成普通人能理解的交易原则，2-5条"],
    "evidence_chain": ["证据链：聊天里支持该判断的价格、时间、资金、标的线索，2-6条"],
    "trade_framework": {{
      "entry_conditions": ["什么条件出现才允许关注或试错"],
      "holding_logic": ["持有或做T的核心依据"],
      "exit_conditions": ["什么情况止盈、退出或降低仓位"],
      "position_control": ["仓位纪律"],
      "risk_control": ["风控和禁止动作"]
    }},
    "watch_points": ["后续需要观察的盘面信号或市场情报"],
    "invalidation": ["哪些情况会证明该框架失效"]
  }},
  "key_symbols": [
    {{"symbol": "NVDA", "name": "英伟达", "summary": "点位/观点/动作", "source": "admin或user"}}
  ],
  "admin_symbols": [
    {{"symbol": "NVDA", "name": "英伟达", "summary": "只来自管理员发言的点位/观点/动作", "thesis": "逻辑", "trigger": "触发条件", "action": "动作倾向", "risk": "风险", "evidence": "依据"}}
  ],
  "arbitrage_opportunities": [
    {{
      "title": "机会标题，必须体现套利/价差/事件/节奏观察",
      "symbols": ["相关标的或指数，例如 NVDA、LITE、SPX"],
      "setup": "机会结构：为什么这里可能有价差、节奏或事件窗口",
      "trigger": "触发条件：什么信号出现才值得继续关注",
      "data_points": ["来自聊天和管理员框架的关键数字、时间、标的、缺口、财报或节奏线索"],
      "action_bias": "动作倾向：观察、等待、低吸试错、价差收敛等，不能写成确定性买卖指令",
      "risk": "主要失效风险或风控边界",
      "confidence": "low/medium/high，只表示线索强弱，不表示确定性",
      "source_basis": "明确说明依据来自 xiaozhaolucky / 核心理论和哪些群聊线索"
    }}
  ],
  "user_symbols": [
    {{"symbol": "TSLA", "name": "特斯拉", "summary": "只来自普通用户讨论的点位/观点/动作"}}
  ],
  "options": ["期权或交易策略，没有则空数组"],
  "events": ["关键事件/日期/财报/政策，没有则空数组"],
  "admin_core": ["管理员核心观点/纪律/风控，没有管理员则写未发现管理员发言"],
  "disagreements": ["分歧和不同观点，没有则空数组"],
  "risks": ["风险、仓位纪律、注意事项"],
  "image_digest": {{
    "title": "每日财经群总结",
    "subtitle": "一句时间或场景说明",
    "core": ["适合图片展示的核心结论，2-3条"],
    "market": ["适合图片展示的市场主线，1-2条"],
    "symbols": [
      {{"symbol": "NVDA", "summary": "极短摘要", "source": "admin或user"}}
    ],
    "admin": ["适合图片展示的管理员观点，1-2条"],
    "risks": ["适合图片展示的风险，1-2条"],
    "link": "{DEFAULT_PUBLIC_LINK}"
  }}
}}

聊天记录：
{chat_text}
"""


def extract_json_object(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < start:
        raise ValueError("No JSON object found in model response")
    return json.loads(raw[start : end + 1])


def generate_structured_summary(chat_text: str, get_response_fn, model: str, attempts: int = 2) -> Dict[str, Any]:
    prompt = build_structured_summary_prompt(chat_text)
    last_error: Optional[Exception] = None
    last_response = ""

    for _ in range(max(1, attempts)):
        last_response = get_response_fn(prompt, model=model)
        try:
            return normalize_summary_payload(extract_json_object(last_response))
        except Exception as exc:
            last_error = exc
            prompt = (
                "上一次输出不是合法 JSON。请修复为单个 JSON object，不要输出解释或代码块。\n"
                f"错误：{exc}\n"
                f"上一次输出：\n{last_response}"
            )

    logs = Path("logs")
    logs.mkdir(exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    (logs / f"structured_summary_invalid_{stamp}.txt").write_text(last_response, encoding="utf-8")
    raise RuntimeError(f"Model did not return valid structured JSON: {last_error}")


def save_structured_summary(
    summary: Dict[str, Any],
    description: str,
    model: str,
    title: Optional[str] = None,
    output_dir: str = "docs",
    generated_at: Optional[dt.datetime] = None,
    images: Optional[Iterable[Dict[str, Any]]] = None,
    chat_text: Optional[str] = None,
) -> Dict[str, str]:
    summary = normalize_summary_payload(summary)
    images_list = list(images or [])
    generated_cst = _now_cst(generated_at)
    now_utc = generated_cst.astimezone(pytz.UTC)
    now_pst = now_utc.astimezone(pytz.timezone("America/Los_Angeles"))
    now_est = now_utc.astimezone(pytz.timezone("America/New_York"))
    public_body = render_summary_markdown(
        summary,
        images=images_list,
        chat_text=chat_text,
        include_audit_records=False,
    )
    local_body = render_summary_markdown(
        summary,
        images=images_list,
        chat_text=chat_text,
        include_audit_records=True,
    )

    output = Path(output_dir)
    summary_dir = output / "summaries"
    summary_dir.mkdir(parents=True, exist_ok=True)
    month_slug = generated_cst.strftime("%Y-%m")
    summary_month_dir = summary_dir / month_slug
    summary_month_dir.mkdir(parents=True, exist_ok=True)

    readme_content = render_public_index_markdown(
        summary,
        description=description,
        model=model,
        generated_at=generated_cst,
        images=images_list,
        chat_text=chat_text,
    )
    index_path = output / "index.md"
    index_updated = _write_text_if_changed(index_path, readme_content)

    heading_time = generated_cst.strftime("%Y-%m-%d %H:%M:%S CST")
    day_slug = generated_cst.strftime("%Y-%m-%d")
    file_ts = generated_cst.strftime("%Y-%m-%d_%H-%M-%S")
    archive_body = (
        f"# {heading_time} 总结 - {description}\n\n"
        f"> 美西时间：{now_pst.strftime('%Y-%m-%d %H:%M:%S PST')}\n\n"
        f"> 美东时间：{now_est.strftime('%Y-%m-%d %H:%M:%S EST')}\n\n"
        f"> 模型：{model}\n\n"
        f"{public_body}"
    )
    safe_title = _safe_filename_part(title or "")
    if title is None:
        fname = f"{file_ts}.md"
    elif safe_title == "\u6bcf\u65e5\u603b\u7ed3":
        fname = f"{day_slug}-{safe_title}.md"
    else:
        fname = f"{file_ts}-{safe_title}.md"
    archive_path = summary_month_dir / fname
    archive_path.write_text(archive_body, encoding="utf-8")
    archive_header = archive_body[: -len(public_body)] if public_body else archive_body
    local_archive_path = archive_path.with_name(f"{archive_path.stem}-local.md")
    local_archive_path.write_text(f"{archive_header}{local_body}", encoding="utf-8")

    structured_dir = Path("data/structured") / generated_cst.strftime("%Y-%m-%d")
    structured_dir.mkdir(parents=True, exist_ok=True)
    summary_json_path = structured_dir / (f"{day_slug}.json" if safe_title == "\u6bcf\u65e5\u603b\u7ed3" else f"{file_ts}.json")
    summary_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    chat_image_paths = [
        str(item.get("local_path", "")).replace("\\", "/")
        for item in images_list
        if item.get("download_status") == "downloaded" and item.get("local_path")
    ]
    chat_image_dir = ""
    if chat_image_paths:
        chat_image_dir = str(Path(chat_image_paths[0]).parent).replace("\\", "/")

    return {
        "day": generated_cst.strftime("%Y-%m-%d"),
        "generated_at_cst": generated_cst.strftime("%Y-%m-%d %H:%M:%S CST"),
        "index_path": str(index_path).replace("\\", "/"),
        "index_updated": index_updated,
        "archive_path": str(archive_path).replace("\\", "/"),
        "local_archive_path": str(local_archive_path).replace("\\", "/"),
        "summary_json_path": str(summary_json_path).replace("\\", "/"),
        "chat_image_dir": chat_image_dir,
        "chat_image_paths": chat_image_paths,
    }
