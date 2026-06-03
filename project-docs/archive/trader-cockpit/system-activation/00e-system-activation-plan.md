# System Activation Plan — 从代码到可运行系统

Status: done
Owner: codex
Created: 2026-05-29
Confirmed: 2026-05-29 (all 4 decisions resolved)

## Specification Gate Check

- [x] Source checked — summaries 1279 篇 ✓, Cockpit real-readonly-adapter ✓, 27 API endpoints ✓
- [x] Decisions frozen — 4 user ✓ + 3 technical ✓
- [x] Scope bounded — per-phase file list
- [x] Verification mapped — 端到端 checklist
- [x] Prompt self-contained — worker prompts per phase
- [x] Behavior preserved — 不改后端逻辑，只加连接

## Pre-plan Decision Inventory

| # | 决策 | 结论 |
|---|---|---|
| 1 | 导入规模 | 先 2026-05（34 篇），链路验证后全量 |
| 2 | Cockpit 接入范围 | 全部 16 个 knowledge endpoint |
| 3 | settings/memory 页面 | 做 |
| 4 | 端到端验证 | 全链路：scan → rebuild → search → extract → memory |

---

## 现状

```
已有但未连接的：
  docs/summaries/2026-05/  34 篇 Markdown 总结
  /api/knowledge/*         16 个 endpoint，全部 200 OK
  Cockpit                  7 个页面，其中 5 个还在 mock

已经接上的：
  /api/agent/signals       列表 + 详情
  /api/agent/market/*      快照 + gate
```

## Phase A: 语料导入（backend-only）

### 目标
将 `docs/summaries/2026-05/` 的 34 篇总结纳入 M0-M1 索引。

### 操作
```
1. POST /api/knowledge/scan-artifacts
   → M0 扫描 docs/summaries/2026-05/*.md → source_artifacts
   → 预期：34 discovered, 0 excluded

2. POST /api/knowledge/incremental-rebuild
   → M1 读取 pending/stale artifacts → 切 heading sections → FTS5 索引
   → 完成后 memory_candidates 可从 sections 提取

3. 验证：
   GET /api/knowledge/search?q=TSLA → 返回 section 结果
```

### 验收
- 34 篇 summary 进入 `source_artifacts`
- `document_sections` 有对应 section
- `/api/knowledge/search` 可返回中文关键词结果

---

## Phase B: Cockpit 接入全量 knowledge API（frontend-only）

### 目标
Cockpit 的 `real-readonly-adapter.ts` 补全所有 knowledge endpoint 的调用。

### 新增 adapter 方法

| Cockpit 功能 | 后端 endpoint |
|---|---|
| searchKnowledge | `GET /api/knowledge/search?q=&symbol=&source_type=&limit=` |
| listCandidates | `GET /api/knowledge/candidates?status=&candidate_type=&symbol=` |
| getCandidate | `GET /api/knowledge/candidates/{id}` |
| extractPreview | `POST /api/knowledge/extract-preview` |
| createMemoryItem | `POST /api/knowledge/memory-items` |
| listMemoryItems | `GET /api/knowledge/memory-items?status=&memory_type=&symbol=` |
| getMemoryItem | `GET /api/knowledge/memory-items/{id}` |
| updateMemoryItem | `PATCH /api/knowledge/memory-items/{id}` |
| activateCandidate | `POST /api/knowledge/candidates/{id}/activate` |
| rejectCandidate | `POST /api/knowledge/candidates/{id}/reject` |
| mergeCandidate | `POST /api/knowledge/candidates/{id}/merge` |
| batchCandidates | `POST /api/knowledge/candidates/batch` |
| selectContext | `POST /api/knowledge/select-context` |
| deprecateMemoryItem | `POST /api/knowledge/memory-items/{id}/deprecate` |
| backup | `POST /api/knowledge/backup` |
| incrementalRebuild | `POST /api/knowledge/incremental-rebuild` |

### 验收
- `real-readonly-adapter.ts` 导出所有 16 个方法
- 每个方法调用一个真实 API，不再 fallback 到 mock
- `next.config.ts` 已有 `/api/knowledge/*` 代理（如未配置则补上）

---

## Phase C: settings/memory 页面（frontend-only）

### 目标
在 Cockpit 新增 `/cockpit/settings/memory` 页面，管理 memory_items 和 candidates。

### 功能
```
Tab 1: Active Memory
  - 列表：title, memory_type, symbols, confidence, status, created_at
  - 操作：view detail, deprecate, edit

Tab 2: Candidates
  - 列表：title, candidate_type, symbols, confidence, review_flags, created_at
  - 操作：activate, reject, merge, batch select

Tab 3: Search / Extract
  - 搜索框 → 展示 document_sections 结果
  - 文本输入 → extract-preview → 预览 → 确认存入
```

### 验收
- `/cockpit/settings/memory` 可访问
- Active Memory tab 可展示已创建的 memory_items
- Candidate tab 可展示候选项并支持 activate/reject
- Extract tab 可输入文本 → 调 LLM 抽离 → 预览 → 确认写入

---

## Phase D: 端到端验证

### 全链路 checklist

```
[ ] scan-artifacts → 34 篇 cataloged
[ ] incremental-rebuild → sections + FTS5
[ ] search "TSLA 回调" → 返回 section 结果
[ ] search "财报前减持" → 返回 section 结果
[ ] Cockpit /settings/memory → 展示 active memory 列表
[ ] Cockpit extract-preview → 输入文本 → LLM 返回 preview
[ ] Cockpit 确认 → memory_items 新增一条
[ ] Cockpit activate candidate → candidate → active memory
[ ] Cockpit deprecate → memory_item 状态变为 deprecated
[ ] GET /api/knowledge/evidence-health → 返回当前证据健康状态
```

---

## 文件范围

| Phase | 文件 | 性质 |
|---|---|---|
| A | `data/trader-agent/` | 数据导入（运行命令） |
| B | `apps/trader-cockpit/lib/cockpit/real-readonly-adapter.ts` | 修改 |
| B | `apps/trader-cockpit/lib/cockpit/adapter.ts` | 可能修改（新增类型） |
| C | `apps/trader-cockpit/app/cockpit/settings/memory/page.tsx` | NEW |
| C | `apps/trader-cockpit/components/cockpit/settings/MemorySettings.tsx` | NEW |
| D | — | 人工验证 |

## 禁止修改

- 所有后端模块（`app/modules/*`）
- 所有后端 API（`app/api/agent.py`）
- `document_chunks` / `document_chunks_fts`
- 数据库 schema

---

## 完成后文档更新

- [x] 本 plan Status: done
