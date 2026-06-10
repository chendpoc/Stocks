"""
/api/intel/tools — Agent 工具后端路由

所有 sentiment 组工具的 Backend 端点。
web-search 使用 DuckDuckGo (duckduckgo_search 库)；
fetch-url 使用标准库 urllib + HTML 提取。
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_logger = logging.getLogger(__name__)

# ─── DuckDuckGo 搜索客户端（懒加载） ──────────────────────

_ddgs = None


def _get_ddgs():
    global _ddgs
    if _ddgs is None:
        from duckduckgo_search import DDGS
        _ddgs = DDGS(timeout=3)
    return _ddgs


def _ddg_text_search(query: str, max_results: int = 5) -> dict[str, Any]:
    """用 duckduckgo_search 库执行文本搜索。"""
    try:
        results = list(_get_ddgs().text(query, max_results=max_results))
    except Exception as exc:
        _logger.warning("DDG search failed: %s", exc)
        return {"query": query, "results": [], "total": 0, "error": str(exc)}

    return {
        "query": query,
        "results": [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in results
        ],
        "total": len(results),
    }

# ─── HTML 纯文本提取 ──────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")


def _extract_text_from_html(html: str, max_chars: int = 3000) -> str:
    """从 HTML 中提取纯文本（先去掉 script/style，再清理标签）。"""
    # 移除 script/style
    cleaned = re.sub(
        r"<(script|style|noscript|iframe|svg)[^>]*>.*?</\1>",
        "",
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # 移除所有标签
    text = _TAG_RE.sub(" ", cleaned)
    # 压缩空白
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _fetch_url_content(url: str, timeout: float = 5.0) -> dict[str, Any]:
    """用 urllib 拉取 URL 并提取纯文本。"""
    try:
        req = Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; trader-agent/1.0)"},
        )
        resp = urlopen(req, timeout=timeout)
        ct = resp.headers.get("Content-Type", "")
        raw = resp.read()

        # 按 Content-Type 分流
        if "text/html" in ct or ct.startswith("text/"):
            charset = "utf-8"
            # 尝试从 header 或 meta 中提取编码
            match = re.search(rb'charset[=:"\s]+([a-zA-Z0-9_-]+)', raw[:2000])
            if match:
                charset = match.group(1).decode("ascii", errors="replace")
            html = raw.decode(charset, errors="replace")
            text = _extract_text_from_html(html)
        elif "application/json" in ct:
            text = raw.decode("utf-8", errors="replace")[:3000]
        else:
            text = raw.decode("utf-8", errors="replace")[:3000]

        return {
            "url": url,
            "content": text,
            "status": resp.status,
        }
    except URLError as exc:
        _logger.warning("fetch_url failed for %s: %s", url, exc)
        return {"url": url, "content": "", "status": 0, "error": str(exc)}
    except Exception as exc:
        _logger.warning("fetch_url error for %s: %s", url, exc)
        return {"url": url, "content": f"Fetch error: {exc}", "status": 0}


# ─── 请求模型 ─────────────────────────────────────────────

class WebSearchRequest(BaseModel):
    query: str
    maxResults: int = 5


class SearchCnFinanceRequest(BaseModel):
    symbol: str
    source: str = "auto"


class FetchUrlRequest(BaseModel):
    url: str


class RecentEventsRequest(BaseModel):
    symbol: str
    windowMinutes: int = 30


class AnalyzeSentimentRequest(BaseModel):
    symbol: str
    platforms: list[str] = ["x"]


class ExtractNewsSignalRequest(BaseModel):
    text: str
    symbol: str | None = None


# ─── 路由 ─────────────────────────────────────────────────

@router.post("/web-search")
async def web_search(body: WebSearchRequest) -> dict[str, Any]:
    """POST /api/intel/tools/web-search — 搜索 Web (DuckDuckGo)"""
    return _ddg_text_search(body.query, body.maxResults)


@router.post("/fetch-url")
async def fetch_url(body: FetchUrlRequest) -> dict[str, Any]:
    """POST /api/intel/tools/fetch-url — 访问 URL 提取正文"""
    return _fetch_url_content(body.url)


@router.post("/search-cn-finance")
async def search_cn_finance(body: SearchCnFinanceRequest) -> dict[str, Any]:
    """POST /api/intel/tools/search-cn-finance — 中文金融源搜索"""
    return {
        "symbol": body.symbol,
        "source": body.source,
        "articles": [
            {
                "title": f"{body.symbol} 最新动态",
                "source": "雪球" if body.source in ("xueqiu", "auto") else body.source,
                "url": f"https://xueqiu.com/S/{body.symbol}",
                "summary": f"{body.symbol} 的实时讨论和最新公告。",
                "published": datetime.now(timezone.utc).isoformat(),
            },
        ],
        "sentiment": "neutral",
    }


@router.post("/recent-events")
async def recent_events(body: RecentEventsRequest) -> dict[str, Any]:
    """POST /api/intel/tools/recent-events — 结构化事件查询"""
    return {
        "symbol": body.symbol,
        "events": [],
        "window_minutes": body.windowMinutes,
    }


@router.post("/analyze-sentiment")
async def analyze_sentiment(body: AnalyzeSentimentRequest) -> dict[str, Any]:
    """POST /api/intel/tools/analyze-sentiment — 社交媒体散户情绪分析

    返回值包含:
      - summary: 最近讨论摘要（每条含平台、时间、内容片段）
      - volume_trend: 24h 讨论量变化（current / avg / change_pct）
      - platform_distribution: 各平台讨论量占比
      - note: 工具提示——散户情绪在极端一致时最有参考价值
    """
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    platforms_data: list[dict[str, Any]] = []
    total_current = 0
    total_avg = 0

    for platform in body.platforms:
        # 模拟数据——真实实现需对接各平台 API
        platform_info = {
            "x": {"name": "X/Twitter", "current": 120, "avg_24h": 85},
            "stocktwits": {"name": "StockTwits", "current": 55, "avg_24h": 40},
            "reddit": {"name": "Reddit", "current": 35, "avg_24h": 30},
        }.get(platform, {"name": platform, "current": 10, "avg_24h": 10})

        total_current += platform_info["current"]
        total_avg += platform_info["avg_24h"]
        platforms_data.append(platform_info)

    change_pct = round((total_current - total_avg) / max(total_avg, 1) * 100, 1)

    return {
        "symbol": body.symbol,
        "timestamp": now.isoformat(),
        "platforms_requested": body.platforms,
        "summary": [
            {
                "platform": "x",
                "timestamp": (now - timedelta(minutes=15)).isoformat(),
                "snippet": f"${body.symbol} looking strong after earnings beat. Adding more on this dip.",
            },
            {
                "platform": "x",
                "timestamp": (now - timedelta(minutes=45)).isoformat(),
                "snippet": f"Cannot believe ${body.symbol} is still undervalued. Institutions sleeping on this.",
            },
            {
                "platform": "stocktwits",
                "timestamp": (now - timedelta(minutes=20)).isoformat(),
                "snippet": f"{body.symbol} chart looks textbook bullish. Watching for breakout above resistance.",
            },
        ],
        "volume_trend": {
            "current_24h": total_current,
            "avg_24h": total_avg,
            "change_pct": change_pct,
            "trend": "surging" if change_pct > 30 else "rising" if change_pct > 10 else "stable" if change_pct > -10 else "declining",
        },
        "platform_distribution": {
            p["name"]: round(p["current"] / max(total_current, 1) * 100, 1)
            for p in platforms_data
        },
        "note": "散户情绪在极端一致时最有参考价值。讨论量异常飙升（change_pct > 50%）时警惕过热，建议交叉验证新闻面和基本面。",
    }


@router.post("/extract-news-signal")
async def extract_news_signal(body: ExtractNewsSignalRequest) -> dict[str, Any]:
    """POST /api/intel/tools/extract-news-signal — 财经新闻结构化信号提取

    输入一段新闻文本，返回结构化的事件类型、细粒度情感、交易信号。
    后续 Phase 集成 LLM 做实际提取——当前返回示例格式。
    """
    return {
        "company": body.symbol or "UNKNOWN",
        "event_type": "earnings",
        "sentiment_overall": 0.6,
        "key_points": [
            {"topic": "revenue", "sentiment": 0.8, "value": "beat by 4%"},
            {"topic": "china_sales", "sentiment": -0.7, "value": "-15% YoY"},
        ],
        "trading_signal": "mixed",
        "confidence": 0.7,
        "note": "当前为预置接口——返回示例格式。后续 Phase 集成 LLM (generateObject) 做实际提取。",
    }
