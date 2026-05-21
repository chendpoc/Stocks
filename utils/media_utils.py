from __future__ import annotations

import datetime as dt
import mimetypes
import re
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional
from urllib.parse import unquote, urlparse

import pytz
import requests


ImageRecord = Dict[str, Any]


def _safe_part(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", text)
    return text.strip("._") or "unknown"


def _format_cst_ms(ts_ms: Any) -> str:
    try:
        value = int(ts_ms)
    except Exception:
        return ""
    tz = pytz.timezone("Asia/Shanghai")
    return dt.datetime.fromtimestamp(value / 1000, tz=dt.timezone.utc).astimezone(tz).strftime("%Y-%m-%d %H:%M:%S CST")


def _user_name(post: Dict[str, Any], username_dict: Dict[str, str]) -> str:
    user = post.get("user")
    if isinstance(user, dict):
        return user.get("name") or user.get("username") or username_dict.get(post.get("userId"), "未知用户")
    return username_dict.get(post.get("userId"), "未知用户")


def _extension(filename: str, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    guessed = mimetypes.guess_extension(content_type or "")
    if guessed == ".jpe":
        return ".jpg"
    if guessed in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return ".jpg" if guessed == ".jpeg" else guessed
    return ".png"


def _filename_from_url(url: str, fallback: str) -> str:
    parsed_name = Path(unquote(urlparse(url or "").path)).name
    if parsed_name and Path(parsed_name).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return parsed_name
    return f"{fallback}{_extension(parsed_name, '')}"


def extract_image_attachments(posts: Iterable[Dict[str, Any]], username_dict: Dict[str, str]) -> List[ImageRecord]:
    records: List[ImageRecord] = []
    for post in posts:
        attachments = post.get("attachments") or []
        if isinstance(attachments, list):
            for attachment in attachments:
                if not isinstance(attachment, dict):
                    continue
                content_type = str(attachment.get("contentType") or "")
                typename = str(attachment.get("__typename") or "")
                if typename != "ImageAttachment" and not content_type.startswith("image/"):
                    continue
                source = attachment.get("source") or {}
                original_url = source.get("url") if isinstance(source, dict) else None
                if not original_url:
                    continue
                records.append(
                    {
                        "asset_index": f"image_{len(records) + 1:03d}",
                        "source_type": "attachment",
                        "id": str(attachment.get("id") or ""),
                        "post_id": str(post.get("id") or ""),
                        "created_at": str(post.get("createdAt") or ""),
                        "created_at_text": _format_cst_ms(post.get("createdAt")),
                        "user_id": str(post.get("userId") or ""),
                        "username": _user_name(post, username_dict),
                        "is_admin": bool(post.get("isPosterAdmin")),
                        "filename": str(attachment.get("filename") or "image"),
                        "content_type": content_type,
                        "byte_size": str(attachment.get("byteSizeV2") or ""),
                        "width": attachment.get("width"),
                        "height": attachment.get("height"),
                        "aspect_ratio": attachment.get("aspectRatio"),
                        "blurhash": attachment.get("blurhash"),
                        "original_url": str(original_url),
                        "link_url": "",
                        "link_title": "",
                        "link_description": "",
                        "download_status": "pending",
                        "local_path": "",
                        "markdown_path": "",
                        "error": "",
                    }
                )

        link_embeds = post.get("linkEmbeds") or []
        if not isinstance(link_embeds, list):
            continue
        for embed_idx, embed in enumerate(link_embeds, 1):
            if not isinstance(embed, dict):
                continue
            image_url = str(embed.get("image") or "").strip()
            if not image_url:
                continue
            records.append(
                {
                    "asset_index": f"image_{len(records) + 1:03d}",
                    "source_type": "link_embed",
                    "id": f"link_embed_{embed_idx}",
                    "post_id": str(post.get("id") or ""),
                    "created_at": str(post.get("createdAt") or ""),
                    "created_at_text": _format_cst_ms(post.get("createdAt")),
                    "user_id": str(post.get("userId") or ""),
                    "username": _user_name(post, username_dict),
                    "is_admin": bool(post.get("isPosterAdmin")),
                    "filename": _filename_from_url(image_url, f"link-preview-{embed_idx}"),
                    "content_type": "image/link-preview",
                    "byte_size": "",
                    "width": None,
                    "height": None,
                    "aspect_ratio": None,
                    "blurhash": "",
                    "original_url": image_url,
                    "link_url": str(embed.get("url") or ""),
                    "link_title": str(embed.get("title") or ""),
                    "link_description": str(embed.get("description") or ""),
                    "download_status": "pending",
                    "local_path": "",
                    "markdown_path": "",
                    "error": "",
                }
            )

    return sorted(records, key=lambda item: int(item.get("created_at") or 0))


def _fetch_bytes(url: str, fetcher: Optional[Callable[[str], Any]]) -> bytes:
    response = fetcher(url) if fetcher else requests.get(url, timeout=45)
    if isinstance(response, bytes):
        return response
    if hasattr(response, "raise_for_status"):
        response.raise_for_status()
    content = getattr(response, "content", None)
    if content is None:
        raise ValueError("image response has no content")
    return bytes(content)


def download_image_assets(
    image_records: Iterable[ImageRecord],
    day: str,
    docs_root: str | Path = "docs",
    fetcher: Optional[Callable[[str], Any]] = None,
) -> List[ImageRecord]:
    asset_dir = Path(docs_root) / "assets" / "chat-images" / day
    asset_dir.mkdir(parents=True, exist_ok=True)

    mirrored: List[ImageRecord] = []
    for record in image_records:
        item = dict(record)
        ext = _extension(item.get("filename", ""), item.get("content_type", ""))
        file_name = "-".join(
            [
                _safe_part(item.get("created_at")),
                _safe_part(item.get("post_id")),
                _safe_part(item.get("id")),
            ]
        ) + ext
        local_path = asset_dir / file_name
        item["local_path"] = str(local_path).replace("\\", "/")
        item["markdown_path"] = f"/assets/chat-images/{day}/{file_name}"

        try:
            content = _fetch_bytes(str(item.get("original_url") or ""), fetcher)
            local_path.write_bytes(content)
            item["download_status"] = "downloaded"
            item["downloaded_bytes"] = len(content)
            item["error"] = ""
        except Exception as exc:
            item["download_status"] = "failed"
            item["downloaded_bytes"] = 0
            item["error"] = str(exc)

        mirrored.append(item)

    return mirrored
