#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import datetime as dt

from loguru import logger
import pytz

from utils._secrets import model_key as _model_key_list
from utils.agent import get_response
from utils.media_utils import download_image_assets, extract_image_attachments
from utils.message_utils import get_history_posts
from utils.parse_utils import history_list_to_text
from utils.structured_summary import (
    archive_raw_messages,
    generate_structured_summary,
    save_structured_summary,
)

logger.remove()
logger.add(sys.stderr, colorize=False)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch Whop chat records and generate a structured daily summary.")
    parser.add_argument("--date", help="Target Beijing date to summarize, formatted as YYYY-MM-DD.")
    parser.add_argument("--limit", type=int, default=1000, help="Maximum number of posts to fetch before filtering.")
    return parser.parse_args()


def resolve_window(target_date: str | None) -> tuple[dt.datetime, dt.datetime | None, dt.datetime | None, str, str]:
    tz = pytz.timezone("Asia/Shanghai")
    if not target_date:
        generated_at = dt.datetime.now(tz)
        day = generated_at.strftime("%Y-%m-%d")
        return generated_at, None, None, day, "每日定时总结（过去24小时）"

    start = tz.localize(dt.datetime.strptime(target_date, "%Y-%m-%d"))
    end = start + dt.timedelta(days=1)
    generated_at = end - dt.timedelta(seconds=1)
    return generated_at, start, end, target_date, f"{target_date} 全日总结"


def filter_posts_by_window(
    posts: list[dict],
    start: dt.datetime | None,
    end: dt.datetime | None,
) -> list[dict]:
    if start is None or end is None:
        return posts

    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    return [
        post
        for post in posts
        if start_ms <= int(post.get("createdAt", 0)) < end_ms
    ]


def build_search_index() -> None:
    result = subprocess.run(
        [sys.executable, "build_search_index.py"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"search index failed: {result.stderr}")
    if result.stdout:
        logger.info(result.stdout.strip())


def main() -> int:
    args = parse_args()
    os.environ.setdefault("SKIP_GIT_PUSH", "1")
    model = _model_key_list[0]["model"]
    generated_at, start, end, day, description = resolve_window(args.date)
    before = int(end.timestamp() * 1000) if end else None
    history_items, username_dict = get_history_posts(
        args.limit,
        before=before,
        is_whole_day=not bool(args.date),
        force_fetch=bool(args.date),
    )
    history_items = filter_posts_by_window(history_items, start, end)
    logger.info(f"用于总结的消息数量：{len(history_items)}，day={day}")
    image_records = extract_image_attachments(history_items, username_dict)
    image_records = download_image_assets(image_records, day=day, docs_root="docs")
    raw_artifacts = archive_raw_messages(
        history_items,
        username_dict,
        from_cache=False,
        generated_at=generated_at,
        images=image_records,
    )
    chat_text = history_list_to_text(history_items, username_dict, images=image_records)
    summary = generate_structured_summary(chat_text, get_response, model=model, attempts=2)
    artifacts = save_structured_summary(
        summary=summary,
        title="每日总结",
        description=description,
        model=model,
        output_dir="docs",
        generated_at=generated_at,
        images=image_records,
        chat_text=chat_text,
    )
    build_search_index()
    artifacts["raw_day_dir"] = raw_artifacts["day_dir"].replace("\\", "/")
    print("ARTIFACTS_JSON=" + json.dumps(artifacts, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
