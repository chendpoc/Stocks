#!/usr/bin/env python3
"""
每日一次：拉取 Whop → 生成 summary → 转为纯文本段落 → 企业微信群机器人（text）。

环境变量：
  SKIP_GIT_PUSH=1        默认已设，不向远端推送 git
  NOTIFY_SKIP_WEBHOOK=1  只生成总结，不调用 webhook（调试）
  NOTIFY_DRY_RUN=1       不发任何 HTTP：不拉 Whop、不调模型、不推 webhook，仅打印自检信息
  WEWORK_WEBHOOK_URL=…   若设置则优先于 utils/.local_secrets.py 中的 wework_webhook_url
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from loguru import logger

# loguru 默认写 stderr；PowerShell 对子进程 stderr 会标成 NativeCommandError（npm run daily:notify 经 ps1 管道时尤甚）。
logger.remove()
logger.add(sys.stdout, colorize=False)

ROOT = Path(__file__).resolve().parent


def main() -> int:
    os.chdir(ROOT)
    os.environ.setdefault("SKIP_GIT_PUSH", "1")

    if os.environ.get("NOTIFY_DRY_RUN") == "1":
        # 使用 print 而非 logger：loguru 默认写 stderr，WinPS 会把其当成 NativeCommandError。
        import numpy as _np
        import pandas as _pd

        print("NOTIFY_DRY_RUN=1: skip Whop / LLM / WeChat webhook (no HTTP)", flush=True)
        print(f"Python: {sys.executable}", flush=True)
        print(f"ROOT: {ROOT}", flush=True)
        print(f"numpy {_np.__version__}, pandas {_pd.__version__}", flush=True)
        print("dry run ok", flush=True)
        return 0

    try:
        from utils._secrets import wework_webhook_url as _secret_hook
    except ImportError as e:
        logger.error(f"加载密钥失败: {e}")
        return 1

    wework_webhook_url = os.environ.get("WEWORK_WEBHOOK_URL", "").strip() or _secret_hook

    skip_hook = os.environ.get("NOTIFY_SKIP_WEBHOOK") == "1"
    if not skip_hook and not wework_webhook_url:
        logger.error(
            "未配置 wework_webhook_url，请在 utils/.local_secrets.py 中设置完整 webhook URL"
        )
        return 1

    from whop_summary import summary_run_daily
    from utils.wework_webhook import md_file_to_plain_article, send_wework_text_article

    archive = summary_run_daily()
    logger.info(f"总结已归档: {archive}")

    plain = md_file_to_plain_article(archive)
    if skip_hook:
        logger.info("NOTIFY_SKIP_WEBHOOK=1，跳过企业微信推送")
        return 0

    n = send_wework_text_article(wework_webhook_url, plain)
    logger.info(f"企业微信推送完成，共 {n} 条消息")
    return 0


if __name__ == "__main__":
    sys.exit(main())
