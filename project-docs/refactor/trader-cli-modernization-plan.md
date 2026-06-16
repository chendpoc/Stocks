# trader-cli Code Quality & Modernization Plan

> Date: 2026-06-16 | Status: **done** (TC1–TC3, 2026-06-10)
>
> 对标项目：`project-docs/refactor/nodejs-ecosystem-audit.md`（库推荐）
> 参考：`project-docs/refactor/agent-reasoning-and-utils-plan.md`（Track B：Utils 搬移）
> 目标模块：`apps/trader-cli/src/`

---

## 0. 现状诊断（子 agent 审计结果）

> 审计覆盖：123 个 TypeScript 源文件（排除测试），3 个子 agent 并行探索。

### 0.1 精确度量

| 问题类别 | 严重度 | 证据 |
|---------|--------|------|
| **手写 fetch** | 🔴 | 4 处调用点（3 个文件）。`api/client.ts` 62 行，`guidedPaper.ts` 和 `liveMarketPlane.ts` 各独立 wrapper。`safeFetchIntel` 仅 LLM 工具层用，CLI/TUI/daemon 直调 `fetchIntel`。`ky` 已安装未引用 |
| **裸 process.env** | 🔴 | 15 处（7 个文件），14 个唯一 env var。`config.ts` 仅定义 6 个，缺失 8 个 |
| **console.log 泛滥** | 🟡 | 91 处，20+ 文件。~70 处 CLI 输出（保留），~15 处诊断（迁 pino），~5 处启动（保留）。`logger.ts` 0 处 import |
| **无 utils 目录** | 🟡 | 5+ 重复模式散落各处 |
| **大文件** | 🟡 | `longbridgeCli.ts` 263 行、`tools.ts` 233 行、`longbridgeTools.ts` 231 行、`chatReAct.ts` 219 行、`daemon/wakeSchedule.ts` 231 行、`toolRegistry.longbridge.ts` 324 行、`marketAgentDaemon.ts` 372 行 |
| **库已安装但未使用** | 🟢 | `ky`、`pino`、`dotenv`、`env-var` 已安装（Phase A），— 但 `api/client.ts` 仍用裸 `fetch`，`config.ts` 和 `logger.ts` 存在但 **0 处 import** |

### 0.2 与 trader-workflows 的对比

| 维度 | trader-workflows | trader-cli |
|------|:---:|:---:|
| HTTP 客户端 | ✅ ky 已重写 | ❌ 仍手写 fetch |
| 配置管理 | ✅ config.ts（已接入） | ⚠️ config.ts 存在但未接入 |
| 日志 | ✅ logger.ts（pino） | ⚠️ logger.ts 存在但未接入 |
| Utils 目录 | 📄 计划中 | ❌ 不存在 |
| CLI 框架 | 🔄 Commander 迁移中 | ✅ Commander 已完整使用 |
| 输入校验 | ✅ Zod schema | ❌ 手写 |
| 类型集中 | ✅ `types/` 目录 | ❌ 类型散落 |

---

## 1. HTTP 客户端迁移：fetch → ky

### 1.1 待替换

| 文件 | 行数 | 当前实现 | ky 替代 |
|------|------|---------|---------|
| `api/client.ts` | 62 | `fetchIntel` 手写（含 404 特殊处理） | `ky.create` + hooks |
| `services/guidedPaper.ts:1` | 1 | `const BASE = process.env.TRADER_API_BASE?.replace(...)` | `config.traderApiBase` |
| `services/liveMarketPlane.ts:1` | 1 | 同上 | 同上 |
| `services/decisionWorkflow.ts` | ~10 | 裸 `fetch` 调用 | 通过 `api/client.ts` 调用 |

### 1.2 迁移方案

将 `api/client.ts` 重写为 ky 版本（参照 trader-workflows 的 `api/client.ts`）：

```typescript
// 参照 trader-workflows 的实现模式
import ky from "ky";
import { config } from "../config.js";

const intelApi = ky.create({
  prefixUrl: config.traderApiBase.replace(/\/$/, ""),
  timeout: 30_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: { beforeError: [/* ... */] },
});

export const fetchIntel = <T>(path: string, options?) =>
  options?.json
    ? intelApi.post(path, { json: options.json }).json<T>()
    : intelApi.get(path).json<T>();

// safeFetchIntel 保留，用 ky 的 HTTPError 替代 try/catch
```

**Lines deleted: ~50 | Lines added: ~20 | Risk: LOW**

---

## 2. 配置统一：process.env → config.ts

### 2.1 待替换

| 文件:行 | 变量 | 替换为 |
|---------|------|--------|
| `api/client.ts:1` | `process.env.TRADER_API_BASE` | `config.traderApiBase` |
| `services/guidedPaper.ts:1` | 同上 | 同上（改 import config） |
| `services/liveMarketPlane.ts:1` | 同上 | 同上 |
| `llm/provider.ts:4-18` | 6 处 `process.env.LLM_*` | `config.llmProvider / llmModel / llmApiKey / llmBaseUrl` |
| `services/traderChart.ts:24,57` | `TRADER_CHART_HANDOFF / TRADER_CHART_BIN` | `config.traderChartHandoff / traderChartBin` |
| `daemon/wakeSchedule.ts:71,162` | `MARKET_AGENT_DATA_DIR` | `config.marketAgentDataDir` |

### 2.2 config.ts 需补充的字段

```typescript
// 当前 config.ts 已有的字段: traderApiBase, logLevel, llmProvider, llmModel, llmApiKey, longbridgeCliPath
// 需补充:
export const config = {
  // ... 已有字段 ...

  // 新增
  traderChartHandoff: envVar.get("TRADER_CHART_HANDOFF").default("").asString(),
  traderChartBin: envVar.get("TRADER_CHART_BIN").default("").asString(),
  traderChartInterval: envVar.get("TRADER_CHART_INTERVAL").default("30d").asString(),
  marketAgentDataDir: envVar.get("MARKET_AGENT_DATA_DIR").default("").asString(),
  llmBaseUrl: envVar.get("LLM_BASE_URL").default("https://api.deepseek.com/v1").asUrlString(),
  longbridgeAgentEnabled: envVar.get("TRADER_LONGBRIDGE_AGENT").default("off").asString(),
} as const;
```

**Lines changed: ~30 (config.ts + import paths) | Risk: LOW**

---

## 3. 日志迁移：console.log → pino

### 3.1 现状

91 处 `console.log` / `console.error`，分布在 20+ 个文件中。`logger.ts` 已存在但 **0 处 import**。

### 3.2 分类处理

| 类别 | 文件 | 数量 | 迁移策略 |
|------|------|------|---------|
| **CLI 输出（用户可见）** | `commands/chat.ts`、`commands/analyze.ts`、`commands/chart.ts`、`ui/display.ts` | ~40 | **保留 console.log** — 这是 UI 协议 |
| **TUI 组件日志** | `tui/pages/DashboardPage.tsx` | 1 | → `logger.error` |
| **内部诊断日志** | `services/watchlist.ts`、`services/launch.ts`、`llm/chatReAct.ts` | ~10 | → `logger.info / logger.error` |
| **程序启动提示** | `tui/launch.ts`、`print-root-hint.ts` | 2 | **保留 console.error** — 启动阶段无 config |
| **后端状态检查** | `services/server.ts` | 3 | → `logger.info` |

### 3.3 迁移原则

```
stdout = CLI 用户输出（保留 console.log）
stderr = 错误提示（保留 console.error 仅启动阶段）
pino   = 结构化诊断日志（runtime/graph/debug）
```

**Lines changed: ~15 (仅内部诊断 + TUI 错误) | Risk: LOW**

---

## 4. Utils 目录创建（子 agent 审计：12 个候选，覆盖 123 个文件）

### 4.1 候选函数（精确数据）

| # | 函数/模式 | 源文件（行） | 重复次数 | 目标 | 迁移风险 |
|---|----------|-------------|---------|------|---------|
| U1 | `normalizeSymbol` — `trim().toUpperCase()` | `tui/symbolSearch.ts:5`、`services/watchlist.ts:70`、`services/longbridge.ts`、`commands/chart.ts` 等 8+ 处 | **8+** | `utils/symbol.ts` | 低（纯函数，零依赖） |
| U2 | `todayDateString` — `new Date().toISOString().slice(0,10)` | `commands/report.ts:5`、`services/guidedPaper.ts:12` | 2 | `utils/date.ts` | 低 |
| U3 | BASE URL 构造 — `.replace(/\/api\/intel\/?$/, "")` | `api/client.ts:4`、`services/guidedPaper.ts:1`、`services/liveMarketPlane.ts:1` | 3 | 废弃（ky + config 替代） | 低（Phase TC1 消除） |
| U4 | `filterUndefined` | `api/client.ts` | 1 | `utils/object.ts` | 低 |

> 最关键的发现：`normalizeSymbol` 跨 8+ 处重复，是最优先搬移的候选。BASE URL 构造重复在 TC1（ky 迁移）后自然消除。

### 4.2 目录结构

```
src/utils/
├── index.ts          # barrel re-export
├── object.ts         # filterUndefined
├── symbol.ts         # normalizeSymbol
└── args.ts           # stripJsonFlag
```

---

## 5. 大文件拆分建议

| 文件 | 行数 | 拆分方案 |
|------|------|---------|
| `toolRegistry.longbridge.ts` | 324 | 按工具域拆：`toolRegistry.longbridge.quote.ts`、`toolRegistry.longbridge.financial.ts`、`toolRegistry.longbridge.portfolio.ts` |
| `marketAgentDaemon.ts` | 372 | 拆分：`daemon/scheduler.ts` + `daemon/agentFactory.ts`（已有） |
| `longbridgeCli.ts` | 263 | 拆分：`longbridge/parser.ts` + `longbridge/client.ts` + `longbridge/validators.ts` |
| `tools.ts` | 233 | 拆分：`tools/systemPrompt.ts` + `tools/contextBuilder.ts` |
| `chatReAct.ts` | 219 | 拆分：`chat/loop.ts` + `chat/compaction.ts` + `chat/tools.ts` |
| `wakeSchedule.ts` | 231 | 拆分：`daemon/wakeSchedule.ts` + `daemon/wakeTriggers.ts` |

> 大文件拆分是可选的长期优化，不阻塞 HTTP/日志/utils 迁移。

---

## 6. 实施路线图

### Phase TC1: HTTP + Config（~2h）

| Step | 内容 | 文件 |
|------|------|------|
| TC1.1 | 重写 `api/client.ts` 使用 ky | 1 file |
| TC1.2 | 更新 `config.ts` 补全字段 | 1 file |
| TC1.3 | 替换 20+ 处 `process.env` 为 `config.*` | ~8 files |
| TC1.4 | 验证 `npm test` | — |

### Phase TC2: Logger（~1h）

| Step | 内容 | 文件 |
|------|------|------|
| TC2.1 | 替换 ~10 处内部诊断日志为 `logger.info/error` | ~5 files |
| TC2.2 | 验证输出格式 | — |

### Phase TC3: Utils（~1h）

| Step | 内容 | 文件 |
|------|------|------|
| TC3.1 | 创建 `src/utils/` + barrel export | 4 new |
| TC3.2 | 搬移 `filterUndefined`、`stripJsonFlag` | 2 modify |

---

## 7. 与其他重构任务的关系

| 任务 | 状态 | 冲突？ |
|------|------|--------|
| trader-workflows Phase A-G | 🔄 进行中 | ✅ 无冲突 — 两个独立项目 |
| T035 Commander 迁移 | 🔄 S1 done | ✅ 无冲突 — trader-cli 已有完整 commander |
| Node.js 生态审计 | ✅ Done | 本计划是其 trader-cli 执行分支 |

---

## 8. 工作量估算

| Phase | Est. Time | Risk |
|-------|-----------|------|
| TC1 HTTP + Config | ~2h | Low（替换式修改） |
| TC2 Logger | ~1h | Low（选择性替换） |
| TC3 Utils | ~1h | Low（纯搬移） |
| **Total** | **~4h** | |
