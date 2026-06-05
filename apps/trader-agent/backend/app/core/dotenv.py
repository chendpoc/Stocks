from __future__ import annotations

import os
from pathlib import Path


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def load_repo_dotenv(repo_root: Path | None = None) -> None:
    """Load repo-root `.env` into os.environ (does not override existing vars)."""
    root = (repo_root or _default_repo_root()).resolve()
    path = root / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        if key not in os.environ:
            os.environ[key] = value
