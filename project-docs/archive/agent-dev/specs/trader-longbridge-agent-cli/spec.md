# Longbridge CLI Agent 工具化（完整版）

## 背景与动机

`trader-cli` Chat 已通过 Vercel AI SDK 暴露 `INTEL_TOOLS`（intel API + DB）。本机已安装 **longbridge-terminal**，Dashboard `[l]`/`[L]` 为外挂全屏，**未进入 Agent 工具链**。

目标：在 Settings 增加 **`TRADER_LONGBRIDGE_AGENT=on|off`（默认 on）**，将 Longbridge CLI **只读**能力以 **~80% 覆盖** 注册给 Agent；客观行情事实 **优先长桥**，本系统信号/假设/Lesson 仍走 intel。

## 架构

```text
trader 启动 (index.ts / bootstrap-env)
  └─ env 仅读取（不阻塞 probe，D310 lazy）

首次 resolveAgentTools() / getAgentSystemPrompt()
  └─ ensureLongbridgeAgentOnStartup()    ← lazy 触发
        on + probe fail → setEnv(off) + bootstrapWarning
        cache 30s（probe_cache_ms）

Settings 区块2
  └─ 用户选 on → probe（强制 refresh） → 失败则拒绝 on + warning

buildAgentTools()
  └─ getIntelTools() + (isLongbridgeAgentEnabled() ? longbridgeTools : {})

longbridgeCli.run(subcommand, args)  ← execFile, --format json
  ├─ Tier1: 具名 zod tools
  └─ Tier2: longbridgeInvoke + GATEWAY_WHITELIST + invoke_subcommand_rules
```

### D301–D312

见 `decision-record.json`。新增 D309（probe 时机）、D310（lazy probe）、D311（quote 多 symbol）、D312（Invoke 子命令兜底白名单 + check 隔离）。

### D306 工具分工（prompt + description）

| 用户意图 | 优先工具 |
|----------|----------|
| 最新价、盘口、K 线、财报、新闻、估值、筛选、持仓快照 | 长桥 Tier1 / Invoke |
| 本系统信号、scan、ingest、buildContext、saveHypothesis | intel |
| 历史 bars 已 ingest 特征 | intel `getMarketBars`（非「现在多少钱」） |

## 环境变量

| 变量 | 值 | 默认 |
|------|-----|------|
| `TRADER_LONGBRIDGE_AGENT` | `on` \| `off` | `on` |

写入仓库根 `.env`（与 `MARKET_DATA_PROVIDER` 相同机制）。

## 启动探测（D307 + D309 + D310 lazy）

**lazy 模式**（RQ1=B 决议）：`trader` 启动只读取 env，不 await `ensureLongbridgeAgentOnStartup`，避免 `trader scan/signals/data` 等非长桥命令也被 1-3s probe 阻塞。

**首次 `resolveAgentTools()` 或 `getAgentSystemPrompt()`**（仅 chat/analyze/report 进入 Agent 路径才会触发）：

1. 若 `TRADER_LONGBRIDGE_AGENT` 归一化为 `on`
2. `probeLongbridge()`（复用 `longbridge.ts`），结果缓存 **30s（`probe_cache_ms`）**
3. 失败 → `setEnvValue("TRADER_LONGBRIDGE_AGENT", "off")`，设置模块级 `bootstrapWarning`（区分 `NOT_INSTALLED` / `AUTH_REQUIRED`）
4. Settings 进入时展示该 warning（并可在页内强制 `refresh` 重探）

**Settings 选 on（C）**：Enter 前 probe（**强制刷新 cache**）；失败 **不写入 on**，显示 `未检测到 longbridge CLI` 或 `请先 longbridge auth login`。

**Chat 中途**：不自动改 `.env`（仅 lazy 首次写 off 与 Settings 写 off）。

**性能验证**（A310 / V306）：`trader scan --help` 启动 <300ms（无 probe 开销）。

## Settings UI（D305）

- **区块 1**：现有 `MARKET_DATA_PROVIDER`（不变）
- **区块 2**：`TRADER_LONGBRIDGE_AGENT`
  - `on · Chat Agent 注册长桥 CLI 工具（只读）`
  - `off · 仅 Dashboard [l]/[L] 外挂`
  - 只读行：`longbridge --version` / check 摘要
  - 红色 warning：探测失败文案
- 焦点：`Tab` 或 `1`/`2` 切换区块（实现选型写入 worker prompt）

## Tier 1 — 具名工具（22）

均 `execute` → `runLongbridgeJson(command, args)`，symbol 经 `toLongbridgeSymbol`。

| Tool 名 | CLI | 默认分页/限制 |
|---------|-----|----------------|
| `getLongbridgeQuote` | `quote` | `symbol:string` 或 `symbols:string[]` 上限 10（D311） |
| `getLongbridgeKline` | `kline` | `--count 60` |
| `getLongbridgeIntraday` | `intraday` | 当日 |
| `getLongbridgeDepth` | `depth` | — |
| `getLongbridgeTrades` | `trades` | `--count 50` |
| `getLongbridgeStatic` | `static` | — |
| `getLongbridgeCalcIndex` | `calc-index` | — |
| `getLongbridgeNews` | `news` | `--count 20` |
| `getLongbridgeFinancialReport` | `financial-report` | 单表 + period |
| `getLongbridgeValuation` | `valuation` | — |
| `getLongbridgeConsensus` | `consensus` | — |
| `getLongbridgeForecastEps` | `forecast-eps` | — |
| `getLongbridgeDividend` | `dividend` | — |
| `getLongbridgeScreener` | `screener` | 需 strategy/limit 参数 |
| `getLongbridgeCompare` | `compare` | symbols ≤5 |
| `getLongbridgeMarketTemp` | `market-temp` | — |
| `getLongbridgeMarketStatus` | `market-status` | — |
| `getLongbridgePositions` | `positions` | — |
| `getLongbridgePortfolio` | `portfolio` | — |
| `getLongbridgeAssets` | `assets` | — |
| `listLongbridgeWatchlist` | `watchlist` | **仅 list** 子命令 |
| `getLongbridgeCapital` | `capital` | `--flow` 可选 |

## Tier 2 — `longbridgeInvoke`

```ts
longbridgeInvoke({
  command: string,  // 白名单顶层子命令
  args?: string[],  // 仅允许 --flag value 形式；禁止 shell 元字符
})
```

### 网关白名单（与 `spec.json` → `gateway.whitelist` 同步，共 44 项）

`brokers`, `option`, `warrant`, `business-segments`, `industry-rank`, `industry-peers`,
`institution-rating`, `finance-calendar`, `filing`, `topic`, `margin-ratio`, `max-qty`,
`exchange-rate`, `shareholder`, `company`, `executive`, `industry-valuation`, `operating`,
`corp-action`, `invest-relation`, `constituent`, `broker-holding`, `ah-premium`,
`trade-stats`, `anomaly`, `top-movers`, `rank`, `profit-analysis`, `fund-holder`,
`insider-trades`, `investors`, `short-positions`, `short-trades`, `financial-statement`,
`valuation-rank`, `participants`, `security-list`, `trading`, `subscriptions`, `cash-flow`,
`fund-positions`, `quant`, `sharelist`, `alert`

Tier1 已覆盖的顶层命令 **不得** 经 Invoke 调用（返回 `USE_NAMED_TOOL`）。

### Invoke 子命令约束（D303 + D312）

| 顶层命令 | 允许 args 首 token |
|----------|-------------------|
| `alert` | `list` 或空 |
| `sharelist` | `list`, `detail`, `show` |
| `watchlist` | 禁止 Invoke → 用 `listLongbridgeWatchlist` |
| **其他白名单命令** | args[0] **必须 ∈ `_default_allowed_first_args`**，或为 `--flag` 开头，或缺省 |

`_default_allowed_first_args`（D312 / RQ3 决议）：
`list`, `show`, `get`, `detail`, `query`, `chain`, `history`, `snapshot`, `search`, `summary`, `stats`, `info`, `rank`, `peers`, `calendar`, `holders`, `actions`, `topics`, `rating`, `premium`

任何不匹配的子命令（如 `option create-...`、`quant deploy`）即使被 `blocked_arg_tokens` 漏过，也由此白名单兜住。

### 硬拒绝顶层（`gateway.blocked_top_level`）

`auth`, `init`, `update`, `tui`, `completion`, `order`, `withdrawals`, `deposits`,
`bank-cards`, `dca`, `ipo`, `statement`

> **注意**：`check` **已移出** blocked_top_level（D312 / RQ2）。它是 `probeLongbridge` 内部使用的基础设施命令（`longbridge check --json`），不经 `longbridgeInvoke` 暴露给 LLM。`infrastructure_only_commands.check` 字段在 spec.json 中文档化这一隔离。如果 LLM 显式 `longbridgeInvoke({ command: "check" })`，由于 `check` 不在 `whitelist` 内，会被 `NOT_WHITELISTED` 拦截（A314）。

### 硬拒绝 args token（任意位置）

`buy`, `sell`, `cancel`, `replace`, `create`, `delete`, `subscribe`, `pin`

## 执行层 `longbridgeCli.ts`

- `runLongbridgeJson(command, args, opts?)`
- 始终追加 `--format json`；`windowsHide: true`
- `maxStdoutBytes` 262144，超出 → `{ ok: false, truncated: true, preview }`
- `timeoutMs` 默认 30000；`financial-report`, `filing`, `screener` 60000
- 校验 `args` 中 `--count`/`--limit` ≤ 500
- 校验 `args[0]` 兜底（见 `_default_allowed_first_args`）
- 解析 JSON；非 JSON 退出码非 0 → `{ ok: false, code, stderr }`

## 模块布局

| 文件 | 职责 |
|------|------|
| `longbridgeCli.ts` | exec、截断、超时、参数消毒 |
| `longbridgeAgent.ts` | env 读写、启动 probe、enabled 判断、bootstrapWarning |
| `longbridgeTools.ts` | Tier1 + Invoke + 白名单 |
| `buildAgentTools.ts` | 合并 INTEL + 长桥 |
| `tools.ts` | 导出 `INTEL_TOOLS`；`SYSTEM_PROMPT` 补丁 |

`chat.ts` / `analyze` 等改为 `buildAgentTools()` 而非裸 `INTEL_TOOLS`。

## SYSTEM_PROMPT 补丁（摘要）

- `TRADER_LONGBRIDGE_AGENT=on` 时：**具体客观事实**（现价、盘口、财报、持仓、新闻标题）**优先**长桥工具。
- 不得用长桥输出直接替代 `buildContext`/`saveHypothesis` 所需的本系统 ingest 证据，除非用户要求「对比长桥 vs 本系统」。
- 禁止调用任何交易、下单、出入金类工具（工具集本身不提供）。

## 验收详解

### A301 / A302

- 模拟 probe 失败 → `.env` 为 `off`，Settings 显示 warning。
- 模拟 probe 成功 → 选 on 写入成功。

### A306 80% 覆盖定义

以 `longbridge -h` 顶层命令数为分母 **N**；Tier1 直接覆盖 + Tier2 白名单只读子命令覆盖数 **≥ 0.8×N**，且 **所有** Tier3 写操作族为 0。

当前 N≈75，目标覆盖 ≥60 个族或等价子命令（单测维护 `GATEWAY_WHITELIST` 与 `BLOCKLIST`）。

### A308

`longbridge.ts` 外挂 spawn **不修改** 行为。

## 工具结果契约

所有 Tier1 / Invoke 经 `runLongbridgeJson` 返回统一形状（见 `spec.json` → `tool_result_contract`）。

### 成功

```json
{ "ok": true, "data": <CLI --format json 解析结果> }
```

### 失败（常见 code）

| code | 含义 |
|------|------|
| `NOT_INSTALLED` | PATH 无 longbridge |
| `AUTH_REQUIRED` | 未 `longbridge auth login` |
| `FORBIDDEN_COMMAND` | 顶层 blocked 或 Tier1 重复 Invoke |
| `NOT_WHITELISTED` | Invoke 不在白名单（含 `check` — 它属于 `infrastructure_only_commands`） |
| `FORBIDDEN_SUBCOMMAND` | args 含 buy/sell/create 等，或 args[0] 不在 `_default_allowed_first_args` |
| `LIMIT_EXCEEDED` | --count/--limit > 500 |
| `MULTI_SYMBOL_LIMIT` | `getLongbridgeQuote` symbols 数组 > 10 |
| `TRUNCATED` | stdout > 256KB |
| `TIMEOUT` | 超过 30s/60s |
| `CLI_ERROR` | 非零退出码 |
| `PARSE_ERROR` | 非 JSON 输出 |

## 80% 覆盖计算公式

```
numerator = |tier1_cli_commands| + |gateway.whitelist| = 22 + 44 = 66
denominator ≈ longbridge -h 数据/研究/账户相关顶层命令 ≈ 75
ratio = 66 / 75 ≈ 88% ≥ 80%
```

单测 [`longbridgeCli.test.ts`](apps/trader-cli/src/services/longbridgeCli.test.ts) 断言 `GATEWAY_WHITELIST.size >= 40`；[`longbridgeTools.test.ts`](apps/trader-cli/src/llm/longbridgeTools.test.ts)（待建）断言 22 个 Tier1 工具名与 `spec.json` 一致。

**Tier3 排除（不计入覆盖，且必须 blocked）**：`order` 写操作、`withdrawals`/`deposits`、`dca`、`ipo` 订阅、`statement` 导出、`auth`/`tui`/`update`。

## 实现文件地图

| 路径 | 职责 | 状态 |
|------|------|------|
| `services/longbridgeCli.ts` | exec、白名单、截断、超时 | 可能已存在 |
| `services/longbridgeAgent.ts` | env、启动 probe 写 off、tryEnable | 可能已存在 |
| `llm/longbridgeTools.ts` | Tier1 22 + longbridgeInvoke | 可能已存在 |
| `llm/buildAgentTools.ts` | resolveAgentTools + getAgentSystemPrompt | 可能已存在 |
| `llm/tools.ts` | INTEL_TOOLS + LONGBRIDGE_AGENT_PROMPT_PATCH | 可能已补丁 |
| `index.ts` | await ensureLongbridgeAgentOnStartup | 可能已接线 |
| `tui/pages/SettingsPage.tsx` | 双区块 Tab | 可能已改 |
| `commands/chat.ts`, `ChatPage.tsx`, `analyze.ts`, `report.ts` | consumers | 可能已改 |
| `services/longbridge.ts` | 外挂 [l]/[L]，只读引用 | 不变 |

## 代码漂移清单（S0 审计用）

实现前对照 `spec.json` → `code_drift`：

- [ ] 启动时 `on` + probe 失败是否 **写 .env off** 且设置 `bootstrapWarning`
- [ ] Settings 选 **on** 是否 **先 probe**，失败不写入 on
- [ ] `resolveAgentTools` 是否在 4 个 consumer 全部替换 `INTEL_TOOLS`
- [ ] Tier1 是否 **22** 个且与 `tier1_tools` 表一致
- [ ] `longbridgeTools.test.ts` 是否存在并通过
- [ ] `package.json` test 脚本是否包含 `longbridgeCli` + `longbridgeTools` 测试
- [ ] 根 `.env.example` 是否有 `TRADER_LONGBRIDGE_AGENT=on`
- [ ] Dashboard `[l]`/`[L]` 未改 spawn 逻辑

## Plan Gate

- 本 spec `status` 为 **`approved`**（深度 review 后 RQ1-RQ4 决议落地）。
- Worker 路径：`.agent-dev/trader-longbridge-agent-worker-prompt.md`（含 audit + patch 步骤）。
- T005 task 性质：从「实现」改为「**audit + patch**」（~85% 代码已落地，补 B1-B4 + M1-M5 + 测试）。

## Phase 2（非本期）

- `MARKET_DATA_PROVIDER=longbridge` + `longbridge_adapter` 入库
- `TRADER_LONGBRIDGE_DEFAULT_MARKET=HK|US`
- `TRADER_LONGBRIDGE_TRADING=on`（单独 grill）
