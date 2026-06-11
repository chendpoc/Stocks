# 25. Web & Desktop Agent Interface — 多端界面方案调研

> 状态: research | 优先级: 支线任务（可与主线 Phase 1 并行） | 更新: 2026-06-11

## 1. 背景

当前 Market AI Agent 只有 CLI/TUI 界面。用户希望增加 Web 或桌面应用界面，让 Agent 有更好的展示和使用体验。这是一个**支线任务**——与主线 Phase 1/2/3 并行。

**不是替代 CLI**：CLI 保留为开发/调试入口。Web/桌面是日常使用入口。

---

## 2. 当前架构

```
┌─────────────────────────────────────┐
│  CLI (apps/trader-cli)              │
│  ├─ ChatPage.tsx (Ink TUI)         │
│  ├─ chatReAct.ts (ReAct 循环)       │
│  ├─ Tool Registry                   │
│  └─ Daemon                          │
├─────────────────────────────────────┤
│  Backend (apps/trader-agent)        │
│  ├─ FastAPI (:8000)                 │
│  ├─ /api/intel/*                    │
│  └─ SQLite                          │
└─────────────────────────────────────┘

当前: CLI → fetchIntel() → Backend API
      ↑ 所有 Agent 逻辑在 CLI 进程内

新增界面:
      Web/Desktop → HTTP/SSE → Backend API
                               (Backend 新增 chat/stream 端点)
```

**关键约束**：Agent 逻辑（chatReAct、Tool Registry）在 TypeScript CLI 进程中。Web/桌面界面需要将这些逻辑**迁移到 Backend** 或 **在界面进程中复用**。

---

## 3. 五方案对比

### 3.1 方案总览

| # | 方案 | 技术栈 | 开发量 | 包大小 | 启动速度 |
|---|---|---|---|---|---|
| A | **Web UI (Vite+React)** | TypeScript + Vite + Tailwind | 小 | 0 | 秒级（浏览器） |
| B | **Web UI + PWA** | A + Service Worker | 小+ | 0 | 秒级 + 离线 |
| C | **Electron 桌面** | A + Electron 壳 | 中 | ~150MB | 3-5 秒 |
| D | **Tauri 桌面** | A + Rust 壳 | 大 | ~10MB | 1-2 秒 |
| E | **CLI + Web 双入口** | 保持 CLI + 新增 A | 小 | — | — |

### 3.2 详细对比

| 维度 | A: Web UI | B: Web+PWA | C: Electron | D: Tauri |
|---|---|---|---|---|
| **Agent 逻辑位置** | Backend (新增 chat/stream) | 同 A | Electron 内运行 chatReAct 或调 Backend | Rust 桥接 或调 Backend |
| **现有代码复用** | ⭐⭐⭐ `ChatPage.tsx` 逻辑可直迁 | ⭐⭐⭐ 同 A | ⭐⭐⭐ 同 A（壳内嵌 Web） | ⭐ 需要 Rust IPC |
| **Vercel AI SDK** | ✅ `useChat` hook 原生支持 | ✅ 同 A | ✅ Node.js 可直调 SDK | ❌ Rust 侧无 SDK |
| **流式响应 (SSE)** | ✅ 标准 | ✅ 标准 + 后台 | ✅ 同 | ⚠️ 需桥接 |
| **Tool 调用展示** | ✅ useChat 原生 | ✅ 同 A | ✅ 同 | ⚠️ 需桥接 |
| **WorkflowStatusPanel** | Web 版组件（同逻辑） | 同 A + 通知 | 同 A + 系统通知 | 同 A + 系统通知 |
| **系统托盘** | ❌ | ⚠️ 有限 | ✅ 原生 | ✅ 原生 |
| **快捷键唤醒** | ❌ | ⚠️ 有限 | ✅ 全局快捷键 | ✅ 全局快捷键 |
| **离线可用** | ❌ | ✅ | ❌（需 Backend） | ❌（需 Backend） |
| **多设备访问** | ✅ | ✅ | ❌ | ❌ |
| **自动更新** | 部署即更新 | 同 A | electron-updater | tauri-updater |
| **包大小** | 0 | 0 | ~150MB (Chromium) | ~10MB (系统 WebView) |
| **内存占用** | 浏览器 ~200MB | 同 A | ~300MB+ | ~50MB+ |
| **开发环境** | Vite + React | 同 A | Vite + Electron 插件 | Rust 工具链 + Vite |
| **团队技能匹配** | ✅ TS/React | ✅ TS/React | ✅ TS/React + Node | ❌ 需学 Rust |

---

## 4. 方案 A 深度分析：Web UI (Vite + React)

**推荐指数**：⭐⭐⭐⭐⭐

### 4.1 技术栈

```
apps/trader-web/
├─ package.json          → Vite + React + Tailwind
├─ src/
│  ├─ ChatPage.tsx       → useChat hook (Vercel AI SDK)
│  ├─ WorkflowPanel.tsx  → Web 版轮询组件
│  ├─ DashboardPage.tsx  → Agent 状态总览
│  └─ App.tsx
├─ public/
└─ index.html
```

### 4.2 关键：Vercel AI SDK `useChat` hook

```typescript
// 当前 CLI 版:
const result = await chatReAct({ model, system, tools, messages });
// 阻塞式，等待完整回复

// Web 版 — useChat:
import { useChat } from "@ai-sdk/react";

function ChatPage() {
  const { messages, input, handleSubmit, isLoading } = useChat({
    api: "/api/chat/stream",
    // 工具调用自动展示、流式响应、错误处理——全由 SDK 管
  });

  return (
    <div>
      {messages.map(m => <Message key={m.id} {...m} />)}
      <form onSubmit={handleSubmit}>
        <input value={input} ... />
      </form>
    </div>
  );
}
```

**SDK 自动处理**：流式 token 渲染、工具调用展示、loading 状态、错误恢复。

### 4.3 Backend 新增端点

```python
# apps/trader-agent/backend/app/api/chat.py (新建)

@router.post("/chat/stream")
async def chat_stream(body: ChatStreamRequest):
    """SSE 流式聊天端点——useChat hook 通过此端点调用 Agent"""
    return StreamingResponse(
        agent_chat_stream(body.messages, body.tools),
        media_type="text/event-stream",
    )
```

### 4.4 WorkflowStatusPanel Web 版

与 CLI 版完全同逻辑——`fetchIntel("/workflows/runs/{runId}")` 轮询 + 进度条。只是渲染用 React DOM 而非 Ink。

### 4.5 改动量

| 文件 | 改动 | 行数 |
|---|---|---|
| `apps/trader-web/` | **新建** Vite+React 项目 | ~200 |
| `apps/trader-web/src/ChatPage.tsx` | useChat 聊天页面 | ~100 |
| `apps/trader-web/src/WorkflowPanel.tsx` | Web 版状态面板 | ~60 |
| `apps/trader-agent/backend/app/api/chat.py` | SSE 流端点 | ~80 |
| **总计** | | **~440 行** |

### 4.6 优势

- **最快上线**：今天建项目，明天能用
- **零客户端安装**：发 URL 即可用
- **useChat 原生对接**：Vercel AI SDK 的 `useChat` 和我们已有的 `generateText` 同源
- **多设备**：手机、平板、电脑都能访问

### 4.7 劣势

- 需要打开浏览器
- 没有系统级通知/托盘
- 依赖 Backend 运行

---

## 5. 方案 C 深度分析：Electron 桌面

**推荐指数**：⭐⭐⭐（先有 Web UI，再考虑包装）

### 5.1 核心思路

```
Electron 壳 = 内嵌 Web UI + Node.js 进程

方案 C1: Electron 调 Backend API（同 Web UI） → 类似 Postman 桌面版
方案 C2: Electron 内运行 chatReAct（独立 Agent）  → 类似 Claude Desktop
```

### 5.2 推荐 C1（壳模式）

不把 Agent 逻辑搬进 Electron——保持 Backend 为中心，Electron 只做展示层。

```
Electron 进程:
  Main Process: 窗口管理 + 系统托盘 + 全局快捷键
  Renderer: Web UI (同方案 A)
```

### 5.3 C1 改动量

| 文件 | 改动 | 行数 |
|---|---|---|
| `apps/trader-desktop/` | **新建** Electron 项目 | ~100 |
| `apps/trader-desktop/main.ts` | 窗口 + 托盘 + 快捷键 | ~80 |
| `apps/trader-desktop/renderer/` | 内嵌方案 A 的 Web UI | 0（复用） |
| **总计** | | **~180 行** |

### 5.4 优势

- **系统托盘**：后台常驻，右键菜单
- **全局快捷键**：`Ctrl+Shift+T` 唤醒
- **原生通知**：workflow 完成、Daemon 提醒
- **复用 Web UI**：不需要重写前端

### 5.5 劣势

- **包大**：150MB（Chromium 内嵌）
- **内存大**：300MB+
- **启动慢**：3-5 秒冷启动
- **多了一层**：调试比 Web 多一个进程

---

## 6. 方案 D 深度分析：Tauri 桌面

**推荐指数**：⭐⭐（不推荐，理由见下）

### 6.1 为什么不推荐

```
Tauri 的核心优势:
  ✅ 包小（~10MB vs Electron 150MB）
  ✅ 内存低（~50MB vs Electron 300MB+）
  ✅ Rust 后端的系统级性能

但对我们来说这些优势不成立:
  ❌ 包大小无所谓——我们的核心是 AI 模型调用，不在乎 150MB 的包
  ❌ 内存优势被 LLM 上下文窗口（128K tokens = ~300MB）淹没
  ❌ Rust 后端对我们零价值——Agent 逻辑全在 TypeScript
  ❌ 团队没有 Rust 经验——学习成本 > 收益
```

**唯一适用场景**：如果你特别在意"一个 exe 不到 10MB"的轻量感——但 Electron 也可以做到 50MB（用系统 WebView 的 Electron 变体）。

---

## 7. 推荐路径

```
Phase 1（当前，与主线并行）:
  方案 A: Web UI (Vite + React + useChat)
  └─ 最快，零安装，多设备

Phase 2（Web UI 稳定后，按需）:
  方案 C1: Electron 壳包装
  └─ 系统托盘 + 快捷键 + 原生通知
  └─ 内嵌 Web UI，几乎零额外开发

不做:
  方案 D: Tauri — Rust 学习成本 > 收益
  方案 C2: Electron 独立 Agent — 多进程 Agent 无必要
```

**方案 A 实施时间线**：

```
Day 1: Vite 项目初始化 + ChatPage 骨架           (~2h)
Day 2: useChat hook 集成 + SSE 流式端点           (~3h)
Day 3: WorkflowPanel + 样式 + 响应式              (~2h)
Day 4: 测试 + 部署 (Vercel / Cloudflare Pages)    (~1h)
```

---

## 8. 关键技术决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 首选界面 | Web UI (Vite+React) | 最快、零安装、useChat 原生对接 |
| 桌面包装 | Electron（壳模式） | 复用 Web UI，只加托盘+快捷键 |
| Agent 逻辑位置 | Backend（新增 SSE 端点） | 保持单点 Agent，避免多进程同步 |
| 流式协议 | SSE (Server-Sent Events) | 标准、useChat 原生支持 |
| 不推荐 | Tauri | Rust 学习成本 > 收益，Agent 不依赖系统 API |
| 不推荐 | Electron 独立 Agent | 多进程 Agent 增加复杂度，无收益 |

---

## 9. 与主线的关系

```
主线 Phase 1         支线（并行）
  ├─ 会话记忆          ├─ Web UI 开发
  ├─ 滑动窗口          ├─ SSE 流式端点
  ├─ Regime 注入       └─ WorkflowPanel Web 版
  └─ 缓存优化

不阻塞不依赖——两条线独立开发，可不同人并行
```

---

## 10. 后台服务 + 通讯集成方案

### 10.1 最终架构愿景

```
┌─────────────────────────────────────────────────────┐
│  后台常驻进程（Daemon）— 永不退出                       │
│  ├─ wakeSchedule → Gate CoT → Agent 路由             │
│  ├─ PatternAutoDiscovery（每日自动因子挖掘）           │
│  └─ Backend API (:8000) 伴随启动                     │
├─────────────────────────────────────────────────────┤
│                     ↑ 所有 UI 通过 Backend API 通讯    │
│         ┌───────────┼───────────┐                   │
│         │           │           │                   │
│    ┌────┴────┐ ┌───┴───┐ ┌────┴─────┐              │
│    │Electron │ │Slack  │ │Feishu    │              │
│    │桌面应用  │ │Bot    │ │Bot       │              │
│    │         │ │       │ │          │              │
│    │· 托盘   │ │· @agent│ │· @agent  │              │
│    │· 聊天窗 │ │ 分析...│ │  分析... │              │
│    │· 面板   │ │       │ │          │              │
│    │· 配置   │ │       │ │          │              │
│    └────────┘ └───────┘ └──────────┘              │
└─────────────────────────────────────────────────────┘
```

**核心设计原则**：**一个后台进程，多种 UI 入口**。

### 10.2 后台服务：从 Daemon 到系统服务

**当前**：

```bash
trader daemon start    # 前台进程，关终端就停
```

**目标**：

| 平台 | 后台方式 | 开机自启 |
|---|---|---|
| **macOS** | `launchd` plist → `~/Library/LaunchAgents/com.trader.agent.plist` | ✅ |
| **Windows** | `nssm` 或 Windows Service Wrapper → 注册为 Windows 服务 | ✅ |

```
Daemon 作为系统服务运行:
  - 开机自动启动
  - 崩溃自动重启
  - 日志输出到文件 (logs/daemon.log)
  - 通过 Backend API 暴露状态: GET /api/daemon/status
  - 通过 Backend API 控制: POST /api/daemon/wake（手动唤醒）
```

**新增 Backend 端点**：

```
GET  /api/daemon/status     → { running, lastWake, runCount, nextWakeAt }
POST /api/daemon/wake       → 手动触发一次 Gate CoT + Agent 路由
POST /api/daemon/config     → 更新 wakeSchedule 配置
```

### 10.3 通讯集成：Slack / Feishu Bot

**目标**：在 Slack 或飞书中 @机器人，触发 Agent 任务。

```
用户 (Slack):  @market-agent 分析 TSLA 当前趋势
     ↓
Slack Bot (Events API) → POST /api/chat/message
     ↓
Backend chatReAct → Agent 回复
     ↓
Slack Bot → 回复到频道: "TSLA VWAP Reclaim 确认，conf=0.72..."
```

**技术实现**：

| 平台 | SDK | 接入方式 |
|---|---|---|
| **Slack** | `@slack/bolt` (Node.js) | Socket Mode（无需公网 IP）或 HTTP Events |
| **Feishu** | `@larksuiteoapi/node-sdk` | 事件订阅 + 机器人 Webhook |
| **企微** | 已有 `utils/wework_webhook.py` | 仅通知，扩展为双向通讯 |

**推荐 Slack**：
- Socket Mode 不需要公网 IP——本地开发即可
- `@slack/bolt` SDK 成熟，10 行代码创建 Bot
- 支持交互式消息（按钮、下拉菜单）

**最小实现**（Slack Bot ~50 行）：

```typescript
// apps/trader-bot/slack.ts
import { App } from "@slack/bolt";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

app.message(async ({ message, say }) => {
  const text = (message as { text: string }).text;
  const result = await fetch(`${BACKEND}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
  });
  await say(result.text);
});

await app.start();
```

### 10.4 Electron 桌面：系统托盘 + 控制面板

```
系统托盘图标:
  ├─ Agent 状态: ● 运行中 / ○ 空闲 / ◌ 休眠
  ├─ 最近一条决策摘要
  ├─ ──────────────
  ├─ 打开聊天窗口
  ├─ 打开控制面板
  ├─ 手动唤醒（立即触发 Gate CoT）
  ├─ ──────────────
  └─ 退出

控制面板（独立窗口）:
  ├─ Daemon 状态 / 运行日志
  ├─ 最近 workflow runs
  ├─ PatternMemory 浏览
  └─ 配置 (wakeSchedule / 关注列表 / 通知偏好)
```

**技术栈**：Electron + React（复用 Web UI 组件）。

**托盘实现**（~30 行）：

```typescript
// electron main.ts
const tray = new Tray(path.join(__dirname, "icon.png"));
tray.setContextMenu(Menu.buildFromTemplate([
  { label: `状态: ${status}`, enabled: false },
  { type: "separator" },
  { label: "打开聊天", click: () => openChatWindow() },
  { label: "控制面板", click: () => openDashboard() },
  { label: "手动唤醒", click: () => fetch(`${BACKEND}/daemon/wake`, { method: "POST" }) },
  { type: "separator" },
  { label: "退出", click: () => app.quit() },
]));
```

### 10.5 完整交互流程

```
场景 1: 定时自动分析
  Daemon 按 wakeSchedule 醒来
    → Gate CoT 判断是否需要分析
    → 需要 → 路由到 DecisionGraph
    → 完成后 → Slack/Feishu 推送通知
    → Electron 托盘更新最近决策摘要

场景 2: Slack 即时请求
  用户在 Slack @agent 分析 TSLA
    → Slack Bot → Backend API
    → chatReAct 推理 → 回复到 Slack 频道
    → 同时持久化到 chat_sessions 表
    → Electron 可查看对话历史

场景 3: 桌面控制面板触发的批量分析
  用户在 Electron 面板点击"扫描全部标的"
    → POST /api/daemon/wake（手动触发）
    → Gate CoT → Swarm 多标的并行分析
    → 进度在面板实时展示
    → 完成后 Slack/Feishu 通知
```

### 10.6 改动量估算

| 组件 | 文件 | 行数 |
|---|---|---|
| 系统服务注册 | `scripts/install-daemon-service.sh` (macOS) + `.ps1` (Windows) | ~30 |
| Daemon API 端点 | `apps/trader-agent/backend/app/api/daemon.py` | ~50 |
| Slack Bot | `apps/trader-bot/slack.ts` | ~50 |
| Electron 托盘 | `apps/trader-desktop/main.ts` (扩展现有) | ~30 |
| 控制面板 | `apps/trader-desktop/src/Dashboard.tsx` | ~100 |
| **总计** | | **~260 行** |

### 10.7 分步实施

```
Phase 1 — 后台服务（与主线 Phase 1 并行）:
  [ ] Daemon 注册为 macOS launchd / Windows Service
  [ ] GET /api/daemon/status + POST /api/daemon/wake 端点
  [ ] 验证: 重启电脑后 Daemon 自动启动

Phase 2 — Slack Bot（主线 Phase 2 期间）:
  [ ] Slack App 创建 + Socket Mode 配置
  [ ] 基础消息收发
  [ ] 交互式按钮（确认操作）
  [ ] 通知推送（workflow 完成时）

Phase 3 — Electron 桌面（主线 Phase 2 后）:
  [ ] 系统托盘 + 菜单
  [ ] 聊天窗口（内嵌 Web UI 聊天页）
  [ ] 控制面板（Daemon 状态 + 最近 runs）
```

---

## 11. 参考源

- **Vercel AI SDK useChat**: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- **assistant-ui (React Chat UI)**: https://www.assistant-ui.com/
- **Electron**: https://www.electronjs.org/
- **Tauri**: https://tauri.app/
- **Vite**: https://vitejs.dev/
