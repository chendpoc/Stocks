# 01 — Phase 0D-2 Read-only Agent Activity Graph

Status: in_progress
Created: 2026-05-27
Source PRD: [16-agent-console-dlite-v3.md](../16-agent-console-dlite-v3.md) §4

## 1. 目标

用 `@xyflow/react` 实现只读 `AgentActivityGraphPanel`，替换 `ActivityTracePreview`，在 Agent Console 中展示 market/news 并行合流到 rule_match 的 DAG。

## 2. 非目标

- workflow builder、节点编辑、拖拽连线、重跑
- 真实 Agent Core 接入
- 任务下发、审批、交易、订单

## 3. 背景与现状

- Phase 0D-1 **已完成**：`getAgentConsole`、`AgentConsoleWorkspace`、`ActivityTracePreview`（compact list）
- `components/cockpit/activity-graph/**` scaffold 已存在
- `@xyflow/react` **未在 package.json 声明**
- `AgentConsoleWorkspace` 当前仍使用 `ActivityChainPanel`
- fixtures 已有 `nodes` / `edges` 满足 DAG 场景

## 4. 方案摘要

新建 `components/cockpit/activity-graph/`：

- `AgentActivityGraphPanel.tsx`
- `AgentActivityNodeCard.tsx`
- `AgentActivityGraphLegend.tsx`
- `activity-graph-types.ts`
- `activity-graph-layout.ts`

React Flow 类型仅允许出现在 `activity-graph/**` 内。业务层继续使用 `AgentActivityNode` / `AgentActivityEdge`。

Props：`nodes`, `edges`, `selectedNodeId`, `onSelectNode`

禁用：`nodesDraggable`, `nodesConnectable`, `edgesReconnectable`，无 add/delete/run/retry/publish。

## 5. 允许修改的文件

- `apps/trader-cockpit/components/cockpit/activity-graph/**`（新建）
- `apps/trader-cockpit/components/cockpit/chat/AgentConsoleWorkspace.tsx`
- `apps/trader-cockpit/components/cockpit/chat/ActivityTracePreview.tsx`（删除或保留为 fallback，plan 实施时决定）
- `apps/trader-cockpit/package.json`
- `pnpm-lock.yaml`
- `test/trader-cockpit-phase0.test.mjs`

## 6. 禁止修改的范围

- `apps/trader-agent/**`
- `docs/**`（完成后单独更新 status）
- adapter 契约变更（0D-2 不需要改 adapter）

## 7. 任务清单

- [ ] 安装并声明 `@xyflow/react`
- [x] 实现 graph module scaffold（只读）
- [ ] 在 `AgentConsoleWorkspace` 替换 preview
- [ ] 扩展 phase0 tests：dependency 隔离、read-only props、无 banned controls
- [ ] lint + build + test

## 8. 验收标准

- `/cockpit/chat` 显示 DAG 图，点击节点更新 Node Inspector
- `@xyflow/react` 仅 activity-graph 模块 import
- 无 workflow builder / 编辑控件
- 16-agent-console-dlite-v3.md §4.5 验收项满足

## 9. 验收命令

```powershell
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
```

## 10. 完成后文档更新

- [x] `00-implementation-status.md` — 0D-2 标记为 in_progress，并记录 scaffold 未接入
- [x] `16-agent-console-dlite-v3.md` — 标记 Phase 0D-2 in_progress
