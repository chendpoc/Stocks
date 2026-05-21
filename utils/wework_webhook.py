"""企业微信群机器人 Webhook 推送。

新流水线默认使用 image 类型推送日报图；text 函数仅作为历史兼容工具保留。
"""

from __future__ import annotations

import base64
import hashlib
import re
import time
from pathlib import Path
from typing import Any, Dict, List

import requests
from loguru import logger

# 企业微信 text 消息 content 上限（UTF-8 字节），留出余量
WEWORK_TEXT_MAX_BYTES = 2040
WEWORK_IMAGE_MAX_BYTES = 2 * 1024 * 1024


def build_wework_image_payload(image_bytes: bytes) -> Dict[str, Dict[str, str] | str]:
    """
    构造企业微信群机器人 image 消息 payload。

    企业微信 image 消息需要原始图片的 base64 与 md5，图片本体不能超过 2MB。
    """
    if len(image_bytes) > WEWORK_IMAGE_MAX_BYTES:
        raise ValueError(f"企业微信 image 图片超过 2MB 限制: {len(image_bytes)} bytes")
    return {
        "msgtype": "image",
        "image": {
            "base64": base64.b64encode(image_bytes).decode("ascii"),
            "md5": hashlib.md5(image_bytes).hexdigest(),
        },
    }


def build_wework_image_payload_from_file(path: str | Path) -> Dict[str, Dict[str, str] | str]:
    return build_wework_image_payload(Path(path).read_bytes())


def _raise_for_wework_error(body: Dict[str, Any]) -> None:
    if body.get("errcode", 0) != 0:
        raise RuntimeError(f"企业微信返回错误: {body}")


def send_wework_image(webhook_url: str, image_path: str | Path, timeout: float = 30.0) -> None:
    """发送企业微信 image 消息。"""
    payload = build_wework_image_payload_from_file(image_path)
    resp = requests.post(webhook_url, json=payload, timeout=timeout)
    resp.raise_for_status()
    _raise_for_wework_error(resp.json())


def markdown_to_plain_article(md: str) -> str:
    """
    将 Markdown 转为适合群播报的纯文本段落：弱化符号，段落之间空行分隔。
    """
    text = md or ""
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^>\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\-\*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^---+ *\r?$", "", text, flags=re.MULTILINE)
    lines: List[str] = []
    for raw in text.splitlines():
        ln = raw.strip()
        if ln:
            lines.append(ln)
        elif lines and lines[-1] != "":
            lines.append("")
    while lines and lines[-1] == "":
        lines.pop()
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def md_file_to_plain_article(path: str | Path) -> str:
    p = Path(path)
    return markdown_to_plain_article(p.read_text(encoding="utf-8"))


def _utf8_len(s: str) -> int:
    return len(s.encode("utf-8"))


def chunk_plain_text_for_wework(text: str, max_bytes: int = WEWORK_TEXT_MAX_BYTES) -> List[str]:
    """按 UTF-8 字节长度切段，优先在段落边界断开。"""
    text = text.strip()
    if not text:
        return []

    if _utf8_len(text) <= max_bytes:
        return [text]

    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    buf = ""

    def flush():
        nonlocal buf
        if buf.strip():
            chunks.append(buf.strip())
        buf = ""

    for para in paras:
        candidate = para if not buf else f"{buf}\n\n{para}"
        if _utf8_len(candidate) <= max_bytes:
            buf = candidate
            continue
        if buf:
            flush()
        if _utf8_len(para) <= max_bytes:
            buf = para
            continue
        # 单段过长：按字符硬切
        cur = ""
        for ch in para:
            trial = cur + ch
            if _utf8_len(trial) > max_bytes:
                if cur:
                    chunks.append(cur)
                cur = ch
            else:
                trial = cur + ch
                cur = trial
        buf = cur
    flush()
    return chunks


def send_wework_text(webhook_url: str, content: str, timeout: float = 30.0) -> None:
    payload = {"msgtype": "text", "text": {"content": content}}
    resp = requests.post(webhook_url, json=payload, timeout=timeout)
    resp.raise_for_status()
    _raise_for_wework_error(resp.json())


def send_wework_text_article(webhook_url: str, plain_article: str) -> int:
    """
    发送纯文本（可能多条，自动分段）。返回成功发送的条数。
    """
    plain_article = (plain_article or "").strip()
    if not plain_article:
        logger.warning("纯文本为空，跳过推送")
        return 0

    first_pass = chunk_plain_text_for_wework(plain_article, max_bytes=WEWORK_TEXT_MAX_BYTES)
    if len(first_pass) <= 1:
        logger.info("推送企业微信 text（单条）…")
        send_wework_text(webhook_url, first_pass[0])
        return 1

    inner_max = WEWORK_TEXT_MAX_BYTES - 32
    parts = chunk_plain_text_for_wework(plain_article, max_bytes=inner_max)
    n = len(parts)
    sent = 0
    for i, part in enumerate(parts, start=1):
        body = f"【{i}/{n}】\n{part}"
        if _utf8_len(body) > WEWORK_TEXT_MAX_BYTES:
            body = part
        logger.info(f"推送企业微信 text {i}/{n} …")
        send_wework_text(webhook_url, body)
        sent += 1
        if i < n:
            time.sleep(0.35)
    return sent
