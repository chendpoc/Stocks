from __future__ import annotations

import os
from typing import Any


def longbridge_sdk_available() -> bool:
    try:
        import longbridge.openapi  # noqa: F401

        return True
    except ImportError:
        return False


def longbridge_credentials_configured() -> bool:
    return bool(
        os.getenv("LONGBRIDGE_APP_KEY")
        and os.getenv("LONGBRIDGE_APP_SECRET")
        and os.getenv("LONGBRIDGE_ACCESS_TOKEN")
    )


def load_longbridge_config() -> Any:
    """Load Longbridge OpenAPI config from env (use paper-account Access Token for 模拟盘)."""
    if not longbridge_sdk_available():
        raise RuntimeError(
            "longbridge SDK not installed; pip install 'trader-agent-core[longbridge]'"
        )
    if not longbridge_credentials_configured():
        raise RuntimeError(
            "Set LONGBRIDGE_APP_KEY, LONGBRIDGE_APP_SECRET, and LONGBRIDGE_ACCESS_TOKEN "
            "(模拟盘与实盘 Token 不同，请在开放平台开发者中心切换模拟账户获取)"
        )
    from longbridge.openapi import Config

    if hasattr(Config, "from_apikey_env"):
        return Config.from_apikey_env()
    return Config.from_env()
