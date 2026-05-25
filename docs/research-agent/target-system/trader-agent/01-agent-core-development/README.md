# Agent Core Backend Development Index

本文档包是 `01-agent-core-backend-prd.md` 的实施拆解层。它只服务 `docs/research-agent/target-system/trader-agent/` 目标系统，不继承旧 `docs/research-agent/modules/` 路线。

## First Principles

Agent Core 的本质不是给出交易建议，也不是替用户操作账户，而是把四类输入转成可追溯、可审核、可失效的 `SignalCandidate`：

1. 交易员历史语料和 playbook。
2. 当前市场快照和 setup 证据。
3. 确定性规则、风控和工具权限。
4. 人工反馈、复盘结果和规则 proposal。

任何实现必须满足：

- 不执行实盘交易。
- 不扩大 MVP 股票池，除非 RulePack 和审批层明确放行。
- 不启用高风险工具，除非 Capability、Approval 和 Audit 三层都记录。
- `TradeTicket` 始终是条件型草案，默认进入人工审批状态。
- 每个 signal、tool call、rule hit、risk block 都要能回溯到证据。
- v1 自我进化必须产出候选规则、简版回测和精简说明报告，但不能自动上线规则。

## Decision Records

| Decision | Scope | Doc |
|---|---|---|
| Rule discovery requires lite backtest in v1 | Agent self-learning boundary | [00-rule-discovery-lite-backtest-decision.md](./00-rule-discovery-lite-backtest-decision.md) |

## Phase 0 Prerequisites

Phase 0 是所有模块的硬前置，不在本目录拆成单独模块文档：

- FastAPI backend skeleton: `apps/trader-agent/backend/app/main.py` 可启动。
- Local database migration: 默认 SQLite 或本地文件型存储，数据模型保持 PostgreSQL 兼容。
- Cache and event abstraction: 默认进程内缓存和本地事件日志，Redis adapter 延后到 Shared Platform production path。
- Configuration service: universe、RulePack、risk config、tool permissions 可加载。
- Structured logging and `agent_events`: 每个模块能写入可审计事件。
- Optional `docker-compose`: 用于生产化依赖，不阻塞本地 MVP。
- RulePack loader: `apps/trader-agent/shared/rulepacks/v0_1_0.yaml` 可解析并校验。

PostgreSQL、Redis、Vector DB 和分布式 worker 不是 Agent Core 第一版的必要条件。它们只有在多用户、跨进程事件、远程部署、大规模检索或共享 rate limit 成为真实瓶颈后才进入实施范围。

## Implementation Domains

| Domain | Modules | Purpose |
|---|---|---|
| Corpus learning chain | 1-6 | 从原始语料到 playbook 统计 |
| Market and opportunity chain | 7-14 | 从市场快照到 rule、score、risk 决策 |
| Tool and ticket chain | 15-17 | 工具网关、signal 生命周期、ticket 草案 |
| Reflection and runtime chain | 18-20 | 学习闭环、编排、解释和 chat |
| Rule discovery chain | 21 | 候选规则、证据需求、简版回测和人工审批前置 |

## Module Index

| # | Module | Phase | Development Doc |
|---:|---|---|---|
| 1 | Corpus Ingestion Service | Phase 1 MVP | [01-corpus-ingestion-service.md](./01-corpus-ingestion-service.md) |
| 2 | Semantic Extraction Service | Phase 1 MVP | [02-semantic-extraction-service.md](./02-semantic-extraction-service.md) |
| 3 | Ticker Alias Resolver | Phase 1 MVP | [03-ticker-alias-resolver.md](./03-ticker-alias-resolver.md) |
| 4 | Market Context Builder | Phase 1 MVP | [04-market-context-builder.md](./04-market-context-builder.md) |
| 5 | Outcome Labeling Service | Phase 1 MVP | [05-outcome-labeling-service.md](./05-outcome-labeling-service.md) |
| 6 | Playbook Engine | Phase 1 MVP | [06-playbook-engine.md](./06-playbook-engine.md) |
| 7 | Market Snapshot Service | Phase 1 MVP | [07-market-snapshot-service.md](./07-market-snapshot-service.md) |
| 8 | Setup Detection Engine | Phase 1 MVP | [08-setup-detection-engine.md](./08-setup-detection-engine.md) |
| 9 | Trader Brain | Phase 1.5 | [09-trader-brain.md](./09-trader-brain.md) |
| 10 | Market Brain | Phase 1.5 | [10-market-brain.md](./10-market-brain.md) |
| 11 | Opportunity Brain | Phase 1.5 | [11-opportunity-brain.md](./11-opportunity-brain.md) |
| 12 | Rule Engine | Phase 1 MVP | [12-rule-engine.md](./12-rule-engine.md) |
| 13 | Scoring Engine | Phase 1 MVP | [13-scoring-engine.md](./13-scoring-engine.md) |
| 14 | Risk Engine | Phase 1 MVP | [14-risk-engine.md](./14-risk-engine.md) |
| 15 | Tool Registry / MCP Adapter | Phase 2 platform dependency | [15-tool-registry-mcp-adapter.md](./15-tool-registry-mcp-adapter.md) |
| 16 | Signal Manager | Phase 1 MVP | [16-signal-manager.md](./16-signal-manager.md) |
| 17 | Trade Ticket Generator | Phase 4 control layer | [17-trade-ticket-generator.md](./17-trade-ticket-generator.md) |
| 18 | Reflection Engine | Phase 5 learning layer | [18-reflection-engine.md](./18-reflection-engine.md) |
| 19 | Agent Runtime Orchestrator | Phase 1 to Phase 2 bridge | [19-agent-runtime-orchestrator.md](./19-agent-runtime-orchestrator.md) |
| 20 | Agent Explanation Service | Phase 3 cockpit dependency | [20-agent-explanation-service.md](./20-agent-explanation-service.md) |
| 21 | Rule Discovery / Lite Backtest Engine | Phase 1.5 v1 self-learning gate | [21-rule-discovery-lite-backtest-engine.md](./21-rule-discovery-lite-backtest-engine.md) |

## Recommended Order

1. Phase 0 foundation: backend, local database, cache/event abstraction, RulePack, logging.
2. Corpus learning chain: modules 1, 3, 2, 4, 5, 6.
3. Market and deterministic decision chain: modules 7, 8, 12, 13, 14.
4. Signal lifecycle: module 16.
5. LocalToolAdapter contract: minimal module 15 adapter surface for historical bars, market snapshots, news or filing fixtures.
6. Runtime scan: module 19 using modules 7, 8, 12, 13, 14, 16.
7. V1 self-learning gate: module 21 before claiming rule discovery or autonomous rule improvement.
8. Brain composition: modules 9, 10, 11 after deterministic services return stable contracts.
9. Tools, ticket, reflection, explanation: modules 15, 17, 18, 20.

## Cross-Module Dependency Map

```text
Corpus Ingestion
  -> Ticker Alias Resolver
  -> Semantic Extraction
  -> Market Context Builder
  -> Outcome Labeling
  -> Playbook Engine
  -> Trader Brain

Market Snapshot
  -> Setup Detection
  -> Market Brain
  -> Opportunity Brain
  -> Rule Engine
  -> Scoring Engine
  -> Risk Engine
  -> Signal Manager
  -> Trade Ticket Generator

Tool Registry / MCP Adapter
  -> Market Context Builder
  -> Market Snapshot
  -> Market Brain
  -> Opportunity Brain
  -> Agent Runtime Orchestrator

Reflection Engine
  -> Playbook Engine
  -> Rule Engine
  -> Rule Discovery / Lite Backtest Engine
  -> human_feedback

Rule Discovery / Lite Backtest Engine
  -> LocalToolAdapter
  -> Rule Engine simulation
  -> approval_requests
  -> rule_proposals
  -> lite_backtest_reports

Agent Runtime Orchestrator
  -> agent_events
  -> WebSocket/SSE platform events
  -> Agent Explanation Service
```

## Shared Contract Rules

- Public API paths stay aligned with `01-agent-core-backend-prd.md`.
- Database objects stay aligned with `03-shared-platform-roadmap-prd.md`.
- Modules that call external services route through Tool Gateway once Phase 2 exists.
- Phase 0/1 modules may use LocalToolAdapter, but its interface must match future Tool Gateway input and output contracts.
- Modules that change signal, ticket, approval, rule, or tool state write `agent_events`.
- Risk Engine has veto priority over scoring, opportunity ranking, ticket generation, and explanation.
- Agent Explanation Service may summarize evidence, but cannot invent missing evidence.
- Rule Discovery / Lite Backtest Engine may propose candidates, but cannot activate RulePack entries.

## Documentation Quality Gate

Before implementation starts, run:

```powershell
rg --files docs/research-agent/target-system/trader-agent/01-agent-core-development
pnpm run docs:build
```

Expected result:

- Exactly one index, one decision record, and 21 module documents.
- No placeholder markers.
- VitePress build exits with code 0.
