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


def should_auto_enable_longbridge_capability() -> bool:
    """Enable market_data.longbridge when credentials exist (skip under pytest)."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    if os.environ.get("TRADER_DISABLE_LONGBRIDGE_AUTO_ENABLE", "").lower() in {
        "1",
        "true",
        "yes",
    }:
        return False
    return longbridge_credentials_configured()


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
