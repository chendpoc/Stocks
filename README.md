# 群组消息实时总结

> 让群聊里的高价值信息不再被刷屏淹没。
> 1 分钟追上讨论进度，快速定位共识、分歧与下一步行动 🚀。
> 比特币波动在线预警，**声音**提示，提醒你及时操作

🔗 **线上站点（实时更新）**

👉 https://stock.autoin.me/

## ⏱ 更新规律

站点会根据市场开盘情况自动更新：

- **非交易时段**：每 **3 小时** 生成一次总结  
- **开盘前 1 小时 + 开盘期间**：每 **1 小时** 总结一次  
- **收盘后**：**立刻**总结过去 **24 小时** 的消息记录  

（如果你希望调整策略或频率，欢迎提 issue 讨论）

## 本地部署

### 定时总结

1. 设置local_secrets,其中包含了whop请求的header和访问模型的api密钥

   1. 在utils文件夹下新建local_secrets.py
   2. 在whop网页中打开开发者模式，在**网络**中找到``https://whop.com/api/graphql/MessagesFetchFeedPosts/`` 请求，复制该请求附带的headers，可以让gpt写成字典形式，以如下格式放到local_secrets.py中

   ```python
   whom_headers = {
      'baggage': '',
      'dpr': '',
      'priority': '',
      'sentry-trace': '',
      'x-deployment-id': '',
      'x-whop-force-new-permission-system': '',
      'Cookie': '',
      'content-type': 'application/json'
   }
   ```

   3. 再设置api密钥，支持google和openai格式的请求，在local_secrets.py中按照如下格式填写

   ```python
      model_key = [
        {
           'model': "Pro/deepseek-ai/DeepSeek-V3.2", #使用的模型，这里是deepseek
           "key": "密钥",
           "base_url": "https://api.siliconflow.cn/v1", # 如果使用了转发，需要填写baseurl，这里是硅基流动
           "app": "openai" # 使用openai库进行访问
        },
        {
           'model': "gemini-2.5-pro", #使用的模型
           'key': "google 密钥",
           'app': "google" # 使用google库进行访问
        },
      ]
   ```

2. 安装依赖

   ```bash
   npm install
   .venv\Scripts\pip.exe install -r requirements.txt
   ```

3. 本地自检（不拉 Whop、不调用模型、不推送企业微信）

   ```bash
   npm run daily:sync:dry
   ```

4. 手动执行一次每日同步

   ```bash
   npm run daily:sync
   ```

   该入口会执行：拉取最近 24 小时群聊、归档原始数据到 `data/raw/YYYY-MM-DD/`、生成结构化总结、更新 `docs/index.md` 与搜索索引、渲染单张总结图并推送企业微信群机器人。

5. 安装 Windows 每日 08:30 定时任务

   ```bash
   npm run daily:install-task
   ```

   自动化入口统一使用 Node.js，不再依赖 `ps1` 或 `sh` 脚本。

### btc预警

1. 运行crypto_monitor.py即可

## ✨ 这是什么？

这是一个为**群内财经讨论**做**实时总结**的网站。

无论你是：

- 刚进群想补课的新朋友  
- 错过了关键讨论的群成员  
- 想快速回顾重点、整理思路的人  

都可以在这里用极短时间**掌握群聊精华**。

## ✅ 你会看到什么？

每次总结都会输出：

- **讨论的核心结论**（发生了什么、结论是什么）  
- **关键共识 / 分歧点**（大家达成一致的地方 & 争议焦点）  
- **可执行的下一步**（接下来能做什么、该关注什么）  

目标是把群里一小时/一天的聊天，压缩成**好读、好找、好回溯的内容**。  
🌊 聊天流 ➜ 💎 结构化沉淀


## 🧠 为什么你可能会喜欢它？

它解决了社区聊天中最真实的痛点：

- 群聊太快，爬楼太累 😵‍💫  
- 热点话题回头找不到 😭  
- 新人完全不知道从哪补课 🫠  
- 重要结论被无关刷屏冲掉 🤡  

这个站点的目标很简单：

> **让每一段好的讨论都能留下痕迹。**


## ⭐ 支持项目

如果你觉得有用，欢迎点个 Star！  
这会给我很大动力继续优化 ❤️


## 🐛 反馈 & 贡献

遇到问题或有改进建议：

- 欢迎直接提 Issue  
- 也可以提交 PR 一起完善  

你的任何建议都会帮助这个工具变得更好！


## 📌 Roadmap

接下来可能会做的方向：

- xiaozhaoluck的操作思路总结
- 股票点位单独放到一个栏目中，可以更加方便的对比
- 更精准的主题聚类与热点追踪  
- 优化展现形式  
- 针对不同内容分开总结
