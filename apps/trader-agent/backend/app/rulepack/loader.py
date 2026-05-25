from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class RulePackRule:
    name: str
    config: dict[str, Any]


@dataclass(frozen=True)
class RulePack:
    version: str
    universe_symbols: list[str]
    active_rules: list[RulePackRule]
    raw: dict[str, Any]


def load_rulepack(path: str | Path) -> RulePack:
    rulepack_path = Path(path)
    with rulepack_path.open("r", encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    if not isinstance(raw, dict):
        raise ValueError("RulePack must be a YAML mapping")

    version = raw.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError("RulePack version must be a non-empty string")

    universe = raw.get("universe")
    if not isinstance(universe, dict):
        raise ValueError("RulePack universe must be a mapping")
    symbols = universe.get("symbols")
    if not isinstance(symbols, list) or not all(isinstance(symbol, str) for symbol in symbols):
        raise ValueError("RulePack universe.symbols must be a string list")

    setups = raw.get("setups", {})
    if not isinstance(setups, dict):
        raise ValueError("RulePack setups must be a mapping")

    active_rules = [
        RulePackRule(name=name, config=config)
        for name, config in setups.items()
        if isinstance(config, dict) and config.get("enabled") is True
    ]

    return RulePack(version=version, universe_symbols=symbols, active_rules=active_rules, raw=raw)
