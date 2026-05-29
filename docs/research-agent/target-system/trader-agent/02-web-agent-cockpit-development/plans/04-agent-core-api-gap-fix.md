# 04 — 01 Agent Core API Gap Fix

Status: draft
Owner: main-agent
Created: 2026-05-28
Source: [01-agent-core-to-cockpit-contract-gap-review.md](../01-agent-core-to-cockpit-contract-gap-review.md)

## 1. 目标

补齐 Agent Core 后端已有的模块对应的 REST endpoint，使 `02-web-cockpit` 的 `real-readonly-adapter.ts` 可以接入真实数据。

## 2. 非目标

- 不新增 Agent Core 模块或业务逻辑
- 不修改现有模块的接口
- 不动 cockpit 前端代码
- 不实现 signal 创建/修改（已有 `run-scan` 做这事）
- 不实现实时 market snapshot 构建（那是 `POST /api/agent/run-scan` 的事）

## 3. 背景与现状

现有 API（`apps/trader-agent/backend/app/api/agent.py`）提供 6 个 endpoint。缺失 3 个只读 endpoint，对应已有模块和已有数据库表：

| 缺失 endpoint | 后端模块 | 数据库表 | 备注 |
|---|---|---|---|
| `GET /api/signals` | `signal_manager.py` | `signals` | 表已存在、有数据、无只读 API |
| `GET /api/signals/{id}` | 同上 | `signals` | 同上 |
| `GET /api/market/gate` | `market_context.py` | `market_context_snapshots` | 可从已有数据推导 |
| `GET /api/market/snapshot` | `market_snapshot.py` | — | snapshot 是运行时构建的，不持久化；第一版用最新 signals 的 market_gate + events 作为简化实现 |

## 4. 方案摘要

在 `api/agent.py` 中新增 4 个 GET endpoint：

### `GET /api/signals`
- 查询 `signals` 表
- 支持 `?symbol=`、`?status=`、`?limit=` 过滤
- 返回 signal 摘要列表（不含 evidence/risk_flags/tool_outputs 的完整 JSON）

### `GET /api/signals/{signal_id}`
- 查询单条 signal
- 返回完整字段（含 evidence/risk_flags/tool_outputs 的反序列化）

### `GET /api/market/gate`
- 查询最近 N 条 signal 的 `market_gate` 字段
- 多数决：pass > caution > block
- 返回 `{gate, summary, evidence_count}`

### `GET /api/market/snapshot`
- 返回最近一次 agent run 的状态摘要
- 包含 `{latest_run, open_signals_count, invalidated_count, last_updated}`

## 5. 允许修改的文件

- `apps/trader-agent/backend/app/api/agent.py` — 新增 endpoint

## 6. 禁止修改的范围

- `apps/trader-agent/backend/app/modules/*` — 不动业务逻辑
- `apps/trader-agent/backend/app/db/models.py` — 不动 schema
- `apps/trader-agent/backend/tests/*` — 本次不改测试（后续补）
- `apps/trader-cockpit/*` — 不动前端

## 7. 任务清单

- [ ] 实现 `GET /api/signals`（列表 + 过滤）
- [ ] 实现 `GET /api/signals/{signal_id}`（详情）
- [ ] 实现 `GET /api/market/gate`（多数决推导）
- [ ] 实现 `GET /api/market/snapshot`（状态摘要）
- [ ] 本地启动 backend 验证 endpoint 返回正确数据
- [ ] 起独立 review agent 审查

## 8. 验收标准

- `GET /api/signals` 返回 JSON 数组，支持 `?symbol=NVDA&status=watching`
- `GET /api/signals/{id}` 返回完整 signal 对象或 404
- `GET /api/market/gate` 返回 `{gate, summary, evidence_count}`
- `GET /api/market/snapshot` 返回 `{latest_run, open_signals_count, ...}`
- 不影响现有 6 个 endpoint 的行为
- 不回写数据，不修改数据库

## 9. 验收命令

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/ -v --tb=short
```

## 10. 完成后文档更新

- [ ] 更新 `01-agent-core-to-cockpit-contract-gap-review.md` 标记已补齐的 endpoint
- [ ] Plan `Status: done`
