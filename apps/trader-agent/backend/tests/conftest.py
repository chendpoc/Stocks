from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings


@pytest.fixture()
def temp_settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enable_event_jsonl_mirror=False,
    )

