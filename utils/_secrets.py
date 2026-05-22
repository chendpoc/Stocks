"""从本地密钥文件加载配置（勿提交密钥）。

优先读取 ``.local_secrets.py``，其次 ``local_secrets.py``（二者应在 .gitignore 中）。
"""

from __future__ import annotations

import ast
import importlib.util
import json
import os
from pathlib import Path


def _parse_secret_value(env_name: str, raw: str, assignment_names: tuple[str, ...]):
    value = raw.strip()
    try:
        return json.loads(value)
    except json.JSONDecodeError as json_error:
        pass

    try:
        module = ast.parse(value, mode="exec")
        for node in module.body:
            if not isinstance(node, ast.Assign):
                continue
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in assignment_names:
                    return ast.literal_eval(node.value)

        if len(module.body) == 1 and isinstance(module.body[0], ast.Expr):
            return ast.literal_eval(module.body[0].value)
    except (SyntaxError, ValueError) as literal_error:
        raise ImportError(
            f"{env_name} must be valid JSON, a Python literal, or a copied assignment from utils/.local_secrets.py."
        ) from literal_error

    raise ImportError(
        f"{env_name} must contain one of these assignments: {', '.join(assignment_names)}."
    )


def _load_env_secrets():
    headers_raw = (os.environ.get("WHOP_HEADERS_JSON") or "").strip()
    model_raw = (os.environ.get("MODEL_KEY_JSON") or "").strip()
    if not headers_raw and not model_raw:
        return None
    if not headers_raw or not model_raw:
        raise ImportError("WHOP_HEADERS_JSON and MODEL_KEY_JSON must be provided together.")

    headers = _parse_secret_value("WHOP_HEADERS_JSON", headers_raw, ("whom_headers", "WHOP_HEADERS_JSON"))
    model = _parse_secret_value("MODEL_KEY_JSON", model_raw, ("model_key", "MODEL_KEY_JSON"))
    if isinstance(model, dict):
        model = [model]
    if not isinstance(headers, dict) or not isinstance(model, list) or not model:
        raise ImportError("WHOP_HEADERS_JSON must be an object and MODEL_KEY_JSON must be a non-empty array.")

    hook = (os.environ.get("WEWORK_WEBHOOK_URL") or "").strip() or None
    return headers, model, hook


def _load_user_secrets():
    env_secrets = _load_env_secrets()
    if env_secrets is not None:
        return env_secrets

    base = Path(__file__).resolve().parent
    for name in (".local_secrets.py", "local_secrets.py"):
        path = base / name
        if not path.is_file():
            continue
        spec = importlib.util.spec_from_file_location("_user_whop_secrets", path)
        if spec is None or spec.loader is None:
            continue
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        hook = getattr(mod, "wework_webhook_url", None)
        hook_norm = (hook or "").strip() or None
        return mod.whom_headers, mod.model_key, hook_norm
    raise ImportError(
        "请在 utils 目录创建 .local_secrets.py（推荐）或 local_secrets.py，"
        "并定义 whom_headers 与 model_key（参见 README）。"
    )


whom_headers, model_key, wework_webhook_url = _load_user_secrets()
