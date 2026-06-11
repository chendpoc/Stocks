# 26. Kocoro Architecture Reference — 垂直领域 Agent vs 通用 Agent 平台

> 状态: reference | 来源: Kocoro-lab/Kocoro + Shannon | 更新: 2026-06-11

## 1. 文档目的

Kocoro（https://github.com/Kocoro-lab/Kocoro）是当前 Agent 桌面应用领域的 SOTA——macOS 原生 AI cowork agent，基于 Shannon 多 Agent 编排框架。

我们最终架构（25 号文档 §10）与 Kocoro 高度同构：Daemon 后台服务 + 桌面托盘 + 消息 Bot。本文档对比两者的设计哲学差异，明确**什么该借鉴、什么永远不需要**。

**核心结论**：Kocoro 是通用 Agent 平台（Bloomberg Terminal vs Claude Desktop 的区别），我们是垂直交易 Agent。架构模式可以借鉴，但功能取舍截然不同。

---

## 2. Kocoro 架构

```
Shannon Daemon (Go) — 后台编排引擎
  ├─ Temporal workflows — 容错、重试、超时、补偿
  ├─ Multi-agent orchestration — 多 Agent 调度和委托
  ├─ Token budget control — 框架级 token 预算管理
  ├─ Human approval workflows — 内置审批流程
  └─ WASI sandbox — 代码执行隔离

Kocoro Desktop (macOS 原生)
  ├─ 系统托盘 + 菜单
  ├─ 聊天窗口
  ├─ Agent 管理面板
  └─ 一键导入 ~/.claude/

ShanClaw Agent Harness
  ├─ Go orchestrator — 编排层
  ├─ Rust agent core — 执行层
  └─ Python LLM layer — 推理层

通讯:
  └─ Slack / Discord Bot
```

---

## 3. 架构对照

```
Kocoro (通用 Agent 平台)        我们 (垂直交易 Agent)

┌──────────────────────┐        ┌──────────────────────┐
│ Shannon Daemon (Go)  │        │ marketAgentDaemon    │
│ · Temporal 容错       │        │ · wakeSchedule      │
│ · 多 Agent 调度       │        │ · Gate CoT          │
│ · Token budget       │        │ · Agent 路由         │
│ · WASI sandbox       │        │ · PatternAutoDisc..  │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
    ┌──────┼──────┐                  ┌──────┼──────┐
┌───┴──┐ ┌─┴──┐ ┌┴────────┐  ┌──────┴┐ ┌───┴──┐ ┌┴──────┐
│Kocoro│ │Slack│ │Discord  │  │Electron│ │Slack │ │Feishu │
│Desktop│ │Bot │ │Bot      │  │Desktop │ │Bot   │ │Bot    │
│(原生) │ │    │ │         │  │(Web壳) │ │      │ │       │
└──────┘ └────┘ └─────────┘  └───────┘ └──────┘ └───────┘

  三层 Agent Harness:              两层 Agent Runtime:
   Go + Rust + Python               TypeScript + Python
   通用、可插拔                      交易专用、深度集成
```

---

## 4. 他们有的、我们不需要的

| 能力 | Kocoro/Shannon | 为什么我们不需要 |
|---|---|---|
| **Temporal workflows** | 内置容错、重试、超时、补偿 | 我们的 workflow 是日级别的——DecisionGraph 执行不到 30 秒，不需要 Temporal 的重试编排。简单 try/catch + `Stage1Runtime` checkpoint 够用 |
| **WASI sandbox** | 隔离执行用户代码 | 我们不会在 Agent 里执行任意代码。因子发现是纯 SQL，不需要沙箱 |
| **Claude 迁移** | 一键导入 `~/.claude/` agents/skills | 我们不是 Claude Code 替代品。用户不会在 Claude 里定义交易 Agent |
| **多租户多 Agent** | 同时运行多个独立 Agent 实例 | 当前单用户。Phase 3+ 如果多用户才需要 |
| **Go 编排引擎** | 高性能、并发、系统级 | TypeScript 对我们的业务完全够用——最大的瓶颈是 LLM API 延迟，不是编排器性能 |
| **macOS 原生 UI** | Swift + AppKit | Electron 跨平台。放弃 Windows 用户不值得用 Swift 换 |

---

## 5. 我们有的、他们望尘莫及的

| 能力 | 我们 | Kocoro/Shannon | 差距原因 |
|---|---|---|---|
| **Regime Detection** | ADX/VIX/Bollinger 三分类 | ❌ | 通用框架不做市场状态识别 |
| **Setup 系统** | 5 种 setup + 衰减监控 | ❌ | 通用框架不做交易 setup |
| **Triple Barrier 回标** | profit/stop/time barrier | ❌ | 通用框架不做交易评估 |
| **PatternMemory** | 长期记忆 + 学习闭环 | ❌ | 通用框架只做短期上下文 |
| **Longbridge 券商** | 22 个行情/基本面/期权工具 | ❌ | 通用框架不做券商对接 |
| **跨平台** | Windows + macOS | macOS only | 他们选了原生，我们选了跨平台 |
| **TUI + Web + Desktop 三端** | Ink TUI + Vite Web + Electron | 只有 macOS 原生 | 他们的 Web 在 Shannon Cloud（SaaS） |
| **Whop 群聊语料** | 社区讨论 → 信号提取 | ❌ | 通用框架不做社区语料分析 |

---

## 6. Phase 3+ 可借鉴的

| 能力 | 当前状态 | 借鉴时机 | 改动量 |
|---|---|---|---|
| **Token budget 管理** | 只有 `maxTokens` 简单上限 | Phase 2-3 — 当 LLM 费用成为可见成本 | 中 |
| **Human approval workflow** | ❌ 无 | Phase 2-3 — 当 AlphaResearch 自动生成策略需要审批 | 中 |
| **多消息平台 Bot** | Slack/Feishu 已设计 | Phase 2 — 按需接入 | 小 |
| **Agent 迁移/导入机制** | ❌ 无 | Phase 3+ — 如果用户有多个 Agent 配置 | 小 |

---

## 7. 永远不需要的

| 能力 | 为什么 |
|---|---|
| **Go 重写编排引擎** | TypeScript 够用。瓶颈在 LLM API 延迟，不在编排器 |
| **macOS 原生 UI** | Electron 已跨平台。放弃 Windows 不值得 |
| **WASI sandbox** | 我们不会在 Agent 里执行用户代码 |
| **通用 Agent 市场** | 我们是工具，不是平台。不需要第三方 Agent 生态 |

---

## 8. 定位澄清

```
通用 Agent 平台 (Kocoro/Shannon/DeepAgents/Claude Desktop):
  "给你一个框架，你可以构建任何 Agent"
  ├─ 多租户
  ├─ 通用工具（文件、Shell、浏览器）
  ├─ 可插拔 Skills
  └─ Agent 市场/生态

垂直交易 Agent (我们):
  "开箱即用的交易情报助手"
  ├─ 单用户（当前）
  ├─ 领域工具（行情、券商、群聊语料）
  ├─ 内置交易知识（Regime、Setup、Triple Barrier）
  └─ 自闭环（决策 → 复盘 → 记忆 → 下一次决策）
```

**这不是"我们不如他们"——这是"我们在不同的赛道"。**

- Kocoro 的竞争对手是 Claude Desktop、Cursor、Copilot
- 我们的竞争对手是 Bloomberg Terminal 的 AI 版、TradingView 的智能分析

---

## 9. 关键决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 编排引擎 | TypeScript，不迁移 Go | 业务瓶颈不在此 |
| 桌面 UI | Electron（非 macOS 原生） | 跨平台 > 原生性能 |
| 沙箱执行 | 不需要 | 不做代码执行 |
| Token budget | Phase 2-3 引入 | 当前用量低，不是瓶颈 |
| Human approval | Phase 2-3 引入 | 先在 Factor Discovery 需要审批的场景 |
| Agent 市场 | 不做 | 我们是工具，不是平台 |

---

## 10. 参考源

- **Kocoro**: https://github.com/Kocoro-lab/Kocoro
- **Shannon**: https://github.com/Kocoro-lab/Shannon
- **ShanClaw**: https://github.com/Kocoro-lab/ShanClaw
- **AI Agent Architecture Book (第 33 章)**: https://www.waylandz.com/ai-agent-book-en/chapter-33-building-on-the-harness-shanclaw/
- 本仓库 `25_web_desktop_interface.md` — 我们最终架构设计
