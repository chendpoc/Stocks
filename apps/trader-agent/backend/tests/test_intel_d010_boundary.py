from __future__ import annotations

import ast
from pathlib import Path

FORBIDDEN_OLD_MEMORY_MODULES = (
    "app.modules.context_selector",
    "app.modules.memory_service",
    "app.modules.candidate_service",
)


def _imported_modules(source: str) -> list[str]:
    tree = ast.parse(source)
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
    return modules


def test_intel_does_not_import_old_memory_modules() -> None:
    intel_root = Path(__file__).resolve().parents[1] / "app" / "intel"
    violations: list[str] = []
    for path in sorted(intel_root.rglob("*.py")):
        for module in _imported_modules(path.read_text(encoding="utf-8")):
            if module in FORBIDDEN_OLD_MEMORY_MODULES or any(
                module.endswith(suffix)
                for suffix in (
                    ".context_selector",
                    ".memory_service",
                    ".candidate_service",
                )
            ):
                violations.append(f"{path.relative_to(intel_root)}: {module}")
    assert violations == []
