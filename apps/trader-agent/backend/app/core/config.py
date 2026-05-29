from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_FIXTURE_TOOL_CAPABILITIES = frozenset(
    {
        "market_bars.fixture",
        "market_calendar.fixture",
        "news_events.fixture",
        "filing_events.fixture",
    }
)

_CONFIG_FILE_NAME = "config.json"


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _find_config_json(repo_root: Path) -> Path | None:
    """Look for config.json next to this file first, then in the repo root."""
    candidates = [
        Path(__file__).resolve().parent.parent / _CONFIG_FILE_NAME,  # backend/config.json
        repo_root / _CONFIG_FILE_NAME,
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _load_config_overrides(repo_root: Path) -> dict:
    """Load config.json overrides. Missing file is not an error — defaults apply."""
    path = _find_config_json(repo_root)
    if path is None:
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@dataclass(frozen=True)
class Settings:
    repo_root: Path = field(default_factory=_default_repo_root)
    data_dir: Path | None = None
    fixture_data_dir: Path | None = None
    knowledge_docs_root: Path | None = None
    news_archive_path: Path | None = None
    sec_filings_archive_path: Path | None = None
    rulepack_path: Path | None = None
    enable_event_jsonl_mirror: bool = False
    enabled_tool_capabilities: frozenset[str] = field(
        default_factory=lambda: DEFAULT_FIXTURE_TOOL_CAPABILITIES
    )
    enabled_model_channels: frozenset[str] = field(default_factory=frozenset)
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com/chat/completions"
    deepseek_model: str = "deepseek-chat"
    model_call_timeout_seconds: int = 20
    codex_cli_executable: Path | None = None
    codex_cli_timeout_seconds: int = 30
    codex_cli_max_prompt_chars: int = 12000
    alpha_vantage_api_key: str | None = None

    def __post_init__(self) -> None:
        repo_root = self.repo_root.resolve()

        # Load config.json overrides (only for keys present in the file)
        overrides = _load_config_overrides(repo_root)

        data_dir = self.data_dir or repo_root / "data" / "trader-agent"
        fixture_data_dir = (
            self.fixture_data_dir
            or repo_root / "apps" / "trader-agent" / "shared" / "fixtures"
        )
        knowledge_docs_root = self.knowledge_docs_root or repo_root / "docs" / "summaries"
        news_archive_path = self.news_archive_path or data_dir / "raw" / "news_events.jsonl"
        sec_filings_archive_path = (
            self.sec_filings_archive_path or data_dir / "raw" / "filing_events.jsonl"
        )
        rulepack_path = (
            self.rulepack_path
            or repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml"
        )

        # Apply config.json overrides (only for simple scalar/collection fields)
        _apply_override(self, "enable_event_jsonl_mirror", overrides)
        _apply_override(self, "model_call_timeout_seconds", overrides)
        _apply_override(self, "deepseek_api_key", overrides)
        _apply_override(self, "deepseek_base_url", overrides)
        _apply_override(self, "deepseek_model", overrides)
        _apply_override(self, "codex_cli_timeout_seconds", overrides)
        _apply_override(self, "codex_cli_max_prompt_chars", overrides)
        _apply_override(self, "alpha_vantage_api_key", overrides)

        # Capabilities from config.json override the defaults entirely
        if "enabled_tool_capabilities" in overrides:
            enabled_tool_capabilities = frozenset(
                str(item) for item in overrides["enabled_tool_capabilities"]
            )
        else:
            enabled_tool_capabilities = frozenset(
                str(item) for item in self.enabled_tool_capabilities
            )

        if "enabled_model_channels" in overrides:
            enabled_model_channels = frozenset(
                str(item) for item in overrides["enabled_model_channels"]
            )
        else:
            enabled_model_channels = frozenset(str(item) for item in self.enabled_model_channels)

        codex_cli_executable = (
            Path(self.codex_cli_executable) if self.codex_cli_executable is not None else None
        )

        object.__setattr__(self, "repo_root", repo_root)
        object.__setattr__(self, "data_dir", Path(data_dir))
        object.__setattr__(self, "fixture_data_dir", Path(fixture_data_dir))
        object.__setattr__(self, "knowledge_docs_root", Path(knowledge_docs_root))
        object.__setattr__(self, "news_archive_path", Path(news_archive_path))
        object.__setattr__(self, "sec_filings_archive_path", Path(sec_filings_archive_path))
        object.__setattr__(self, "rulepack_path", Path(rulepack_path))
        object.__setattr__(self, "enabled_tool_capabilities", enabled_tool_capabilities)
        object.__setattr__(self, "enabled_model_channels", enabled_model_channels)
        object.__setattr__(self, "codex_cli_executable", codex_cli_executable)

    @property
    def database_path(self) -> Path:
        return self.data_dir / "trader-agent.db"


def _apply_override(instance: Settings, key: str, overrides: dict) -> None:
    if key in overrides:
        object.__setattr__(instance, key, overrides[key])
