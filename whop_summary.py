import datetime
import pytz
import os
import subprocess
from loguru import logger
from utils import history_list_to_text, summary_prompt, get_response, get_history_posts, save_to_md, get_summary_config, hours_from_open, hours_from_close
from utils._secrets import model_key as _model_key_list

def build_search_index():
    """构建搜索索引"""
    try:
        logger.info("正在构建搜索索引...")
        result = subprocess.run(
            ['python', 'build_search_index.py'],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            logger.info("搜索索引构建完成")
        else:
            logger.error(f"索引构建失败: {result.stderr}")
    except Exception as e:
        logger.error(f"索引构建异常: {e}")

def summary_run():
    """
    生成并保存总结
    
    参数：
        summary_limit: 获取消息条数
        is_whole_day: 是否只获取过去24小时的消息
    """
    limit, is_whole_day, title, description = get_summary_config()
    # limit, is_whole_day, title, description = 1000, True, "盘后总结", "盘后全天总结（收盘后4-5小时内）"
    history_items, username_dict = get_history_posts(limit, is_whole_day=is_whole_day)
    big_text = history_list_to_text(history_items, username_dict)
    to_summary_text = summary_prompt + big_text
    model = _model_key_list[0]["model"]
    summary = get_response(to_summary_text, model=model)

    save_to_md(
        summary=summary,
        title=title,
        description=description,
        model=model,
        output_dir="docs",
    )
    
    # 构建搜索索引
    build_search_index()
    
    now_pst = datetime.datetime.now(pytz.UTC).astimezone(pytz.timezone('America/Los_Angeles'))
    # Git 推送（本地调试设 SKIP_GIT_PUSH=1 可跳过）
    if os.environ.get("SKIP_GIT_PUSH") != "1":
        os.system(f'cd . && git add docs/ && git commit -m "Auto update: ' + now_pst.strftime("%Y-%m-%d %H:%M:%S PST") + '" && git push origin master')
    # os.system(
    #     '''
    #     BRANCH=$(git rev-parse --abbrev-ref HEAD)
    #     STASHED=0
    #     if [ -n "$(git status --porcelain)" ]; then
    #     git stash push -u -m "auto-update pre-switch"
    #     STASHED=1
    #     fi
    #     git switch master
    #     git add docs/
    #     git commit -m "Auto update: <timestamp>"
    #     git push origin master
    #     git switch "$BRANCH"
    #     if [ "$STASHED" = 1 ]; then
    #     git stash pop --index || true
    #     fi
    #     '''
    # )

if __name__ == "__main__":
    # 本地手动跑一次：FORCE_SUMMARY=1 python whop_summary.py
    if os.environ.get("FORCE_SUMMARY") == "1":
        summary_run()
        raise SystemExit(0)

    hours_open = hours_from_open()
    hours_close = hours_from_close()

    # 判断是否应该执行
    if 4 <= hours_close < 5:
        # 盘后总结  
        pass
    elif 0 <= hours_close < 2:
        # 收盘总结
        pass
    elif -1 <= hours_open < 7 and hours_close < 1:
        # 盘前/盘中总结
        pass
    else:
        # 休市，检查是否是美东9点
        now_et = datetime.datetime.now(pytz.timezone('America/New_York'))
        logger.info(f"当前美东时间小时：{now_et.hour}")
        if now_et.hour != 7:
            exit(0)
    
    summary_run()
