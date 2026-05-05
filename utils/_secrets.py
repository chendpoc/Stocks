"""从本地密钥文件加载配置（勿提交密钥）。

优先读取 ``.local_secrets.py``，其次 ``local_secrets.py``（二者应在 .gitignore 中）。
"""

from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_user_secrets():
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
