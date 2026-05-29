# Cloudflare Pages 发布说明

## 结论

当前仓库是 private，但 Cloudflare Pages 可以连接 private GitHub repo 构建公开静态站点。这个站点用于企业微信卡片的完整报告链接和封面图链接。

需要先确认一个前提：Pages 默认生成的是公网可访问站点。不要把不适合公开传播的群聊原文、图片或会员内容放到公开页面里。

## 推荐路径

1. 在 Cloudflare Dashboard 打开 `Workers & Pages`。
2. 选择 `Create application` -> `Pages` -> `Connect to Git`。
3. 授权当前 private GitHub repo。
4. 构建配置：
   - Project name: `stock-community-summary`
   - Build command: `npm run docs:build`
   - Build output directory: `docs/.vitepress/dist`
   - Root directory: 留空，使用仓库根目录
5. 首次发布后记录站点地址，例如 `https://stock-community-summary.pages.dev`。
6. 本地或定时任务中设置：
   - `SUMMARY_SITE_BASE_URL=https://stock-community-summary.pages.dev`
7. 推送卡片消息：
   - 预检查：`npm run notify:card:dry`
   - 真实推送：`npm run notify:card`

## 本地验证

本地只需要验证静态构建产物：

```bash
npm run pages:build
npm run public:build:audit
```

实际发布交给 Cloudflare Pages 的 Git 集成。仓库不再保留本地上传命令或单独的 Pages 配置文件，避免本地发布路径和 Dashboard 配置漂移。

## 与现有通知的关系

- 没有公网 URL 时，用 `npm run notify:brief`，它只发一条企业微信 Markdown。
- 有公网 URL 后，用 `npm run notify:card`，它发一张可点击卡片，点击进入完整网页。
- `notify:text` 继续保留为旧版纯文本兼容入口。
