from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


@dataclass(frozen=True)
class Settings:
    repo_root: Path = field(default_factory=_default_repo_root)
    data_dir: Path | None = None
    rulepack_path: Path | None = None
    enable_event_jsonl_mirror: bool = False

    def __post_init__(self) -> None:
        repo_root = self.repo_root.resolve()
        data_dir = self.data_dir or repo_root / "data" / "trader-agent"
        rulepack_path = (
            self.rulepack_path
            or repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml"
        )

        object.__setattr__(self, "repo_root", repo_root)
        object.__setattr__(self, "data_dir", Path(data_dir))
        object.__setattr__(self, "rulepack_path", Path(rulepack_path))

    @property
    def database_path(self) -> Path:
        return self.data_dir / "trader-agent.db"
