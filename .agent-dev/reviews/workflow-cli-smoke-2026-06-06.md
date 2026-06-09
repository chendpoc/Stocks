# Workflow + CLI 核心命令终端冒烟（2026-06-06）

环境：Windows PowerShell，仓库根 `D:\workspace\01-products\stock-community-summary`，backend `:8000` ok（`intel_route_count=47`），`@langchain/langgraph-checkpoint-sqlite@1.0.1`。

## 阶段 0

| 检查项 | 结果 |
|--------|------|
| `pnpm install` | pass |
| `npm run backend:verify` | pass |
| `apps/trader-workflows` `npm test` | 119/119 pass |

## Workflows 直连（`npx tsx src/index.ts` 或 `npm run trader-workflows --`，后者对 `--limit` 等 flag 会被 npm 吃掉）

| 命令 | ok | run_id / 备注 | 失败分类 |
|------|-----|---------------|----------|
| `decide TSLA.US --json` | yes | `run_c7d0ddb5…`，action `NO_TRADE`，snap `snap-7e3401a1…` | — |
| `runs list --limit 10 --json` | yes | 含上述 run；用 tsx 直连时 `--limit` 生效 | npm 嵌套时 `--limit` 被吞（见发现） |
| `runs show run_c7d0ddb5…` | yes | status `succeeded`，LangGraph `checkpoint_ref` 有值 | Stage1 `checkpoints[]` 为空（设计：LG checkpoint 与 Stage1 store 分离） |
| `runs monitor --limit 10` | yes | `checkpoint_count: 0`，`latest_checkpoint_ref` 有值 | 同上 |
| `runs trace run_c7d0ddb5…` | yes | `output_summary` 含 decision | 同上 |
| `context snapshots list --symbol TSLA.US` | yes | count 2 | — |
| `context snapshots show snap-7e3401a1…` | yes | `top_items` 3 条 lesson | — |
| `outcomes run --due --limit 50` | yes | `processed_count: 0` | **数据**：无到期 outcome |
| `eval summary --symbol TSLA.US` | yes | `needs_more_data` | **数据**：无 labeled outcomes |
| `insights explore --symbol TSLA.US --window 30d` | yes | `ins_1a17d3c6…`，pending | — |

## Trader CLI 包装

| 命令 | ok | 备注 | 失败分类 |
|------|-----|------|----------|
| `decide NVDA.US --json` | yes | `run_c543e766…` | — |
| `runs list --limit 5` | yes* | *需 `cd apps/trader-cli && npx tsx …`；`npm run trader-cli -- runs list --limit 5` 丢 flag | **环境/工具**：根 `npm run` 吞 `--flag` |
| `runs show run_c543e766…` | yes | 与 workflows 一致 | — |
| `outcomes run --due --limit 50` | yes | 需 tsx 直连 trader-cli | 根 npm 路径失败 |
| `eval summary --symbol TSLA.US` | yes | 根 npm 丢 `--symbol` 时仍可能跑通（用默认） | 见上 |
| `insights explore --symbol TSLA.US --window 30d` | yes | 需 tsx 直连 | 根 npm 路径失败 |

推荐操作员入口：

```powershell
cd apps/trader-cli
npx tsx src/index.ts decide TSLA.US --json
```

或 `cd apps/trader-workflows && npx tsx src/index.ts …`

## M2 Market Plane + M4 Guided Paper

| 命令 | ok | 备注 | 失败分类 |
|------|-----|------|----------|
| `server status` | yes | health ok | — |
| `market-plane symbols` | yes | 5 只 M2 标的 | — |
| `market-plane ingest AAPL.US` | no | Longbridge transport 未配置 | **环境**：backend 默认无 `market_data.longbridge` capability |
| `market-plane state AAPL.US` | no | 404 无 snapshot | **数据**：未 ingest |
| `market-plane stream-status` | yes | `sdk_available: false`，`credentials_configured: true` | — |
| `market-plane stream-start` | no | 503 SDK 未安装 | **依赖**：`longbridge` PyPI 无 1.x，venv 未装 4.x |
| `guided-paper policy-register` | yes | fixture `execution-policy-demo.json` | 路径须相对 repo 或 `../../apps/...` |
| `guided-paper policy-get ep-demo-001` | yes | — | — |
| `guided-paper run … AAPL.US` | no | 400 无 MarketStateSnapshot | **数据**：M2 未就绪 |

## 发现（非本次阻塞）

1. **根目录 `npm run trader-workflows` / `npm run trader-cli`**：嵌套 npm 会吞掉 `--limit`、`--due`、`--symbol` 等，导致子命令参数错位。应用 `npx tsx` 在包目录执行，或改根 `package.json` 传参方式。
2. **M2 生产 backend**：默认 `enabled_tool_capabilities` 仅 fixture；Longbridge ingest/stream 需 capability + SDK（`pyproject` 约束 `longbridge>=1.0,<2` 与 PyPI 可用版本不一致，当前仅 0.2.x / 4.x）。
3. **历史 runs**：多次 `failed`（缺 `LLM_API_KEY`）与 `running` 卡住记录为修复前遗留，不影响本次成功路径。

## 后续

- 安装匹配版本的 `longbridge` SDK 并启用 `market_data.longbridge` 后重跑 M2 stream + M4 `guided-paper run` 完整路径。
- 修复根 npm 脚本 flag 传递（可选 T017/CLI 任务）。
