import datetime
import os
import subprocess
import pytz
from loguru import logger
from utils import (
    history_list_to_text,
    summary_prompt,
    get_response,
    get_history_posts,
    save_to_md,
    get_summary_config,
    hours_from_open,
    hours_from_close,
)
from utils._secrets import model_key as _model_key_list


def build_search_index():
    """构建搜索索引"""
    try:
        logger.info("正在构建搜索索引...")
        result = subprocess.run(
            ["python", "build_search_index.py"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        if result.returncode == 0:
            logger.info("搜索索引构建完成")
        else:
            logger.error(f"索引构建失败: {result.stderr}")
    except Exception as e:
        logger.error(f"索引构建异常: {e}")


def _maybe_git_push():
    now_pst = datetime.datetime.now(pytz.UTC).astimezone(
        pytz.timezone("America/Los_Angeles")
    )
    if os.environ.get("SKIP_GIT_PUSH") != "1":
        os.system(
            "cd . && git add docs/ && git commit -m \"Auto update: "
            + now_pst.strftime("%Y-%m-%d %H:%M:%S PST")
            + '" && git push origin master'
        )


def summary_run_core(limit: int, is_whole_day: bool, title: str, description: str) -> str:
    """
    执行一次完整总结流水线，返回本次归档 markdown 路径。
    """
    history_items, username_dict = get_history_posts(limit, is_whole_day=is_whole_day)
    big_text = history_list_to_text(history_items, username_dict)
    to_summary_text = summary_prompt + big_text
    model = _model_key_list[0]["model"]
    summary = get_response(to_summary_text, model=model)

    archive_path = save_to_md(
        summary=summary,
        title=title,
        description=description,
        model=model,
        output_dir="docs",
    )

    build_search_index()
    _maybe_git_push()
    return archive_path


def summary_run() -> str:
    """
    生成并保存总结（按当前美股时段自动选择 limit / 范围）。
    """
    limit, is_whole_day, title, description = get_summary_config()
    return summary_run_core(limit, is_whole_day, title, description)


def summary_run_daily() -> str:
    """
    定时任务用：每日固定口径（过去 24 小时内、最多千条），不受 __main__ 时段门控。
    """
    return summary_run_core(
        1000,
        True,
        "每日总结",
        "每日定时总结（过去24小时）",
    )


if __name__ == "__main__":
    # 本地手动跑一次：FORCE_SUMMARY=1 python whop_summary.py
    if os.environ.get("FORCE_SUMMARY") == "1":
        summary_run()
        raise SystemExit(0)

    hours_open = hours_from_open()
    hours_close = hours_from_close()

    # 判断是否应该执行
    if 4 <= hours_close < 5:
        pass
    elif 0 <= hours_close < 2:
        pass
    elif -1 <= hours_open < 7 and hours_close < 1:
        pass
    else:
        # 休市，检查是否是美东9点
        now_et = datetime.datetime.now(pytz.timezone("America/New_York"))
        logger.info(f"当前美东时间小时：{now_et.hour}")
        if now_et.hour != 7:
            exit(0)

    summary_run()
