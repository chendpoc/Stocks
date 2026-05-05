# 复制为 utils/.local_secrets.py（推荐）或 utils/local_secrets.py 并填入真实值（二者均在 .gitignore）

whom_headers = {
    "baggage": "",
    "dpr": "",
    "priority": "",
    "sentry-trace": "",
    "x-deployment-id": "",
    "x-whop-force-new-permission-system": "",
    "Cookie": "",
    "content-type": "application/json",
}

# whop_summary 默认使用的模型须在此列表中能找到同名 model
model_key = [
    {
        "model": "Pro/deepseek-ai/DeepSeek-V3.2",
        "key": "your-api-key",
        "base_url": "https://api.siliconflow.cn/v1",
        "app": "openai",
    },
]

# 企业微信群机器人 Webhook 完整 URL（daily_summary_notify.py 使用，可选）
# wework_webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
