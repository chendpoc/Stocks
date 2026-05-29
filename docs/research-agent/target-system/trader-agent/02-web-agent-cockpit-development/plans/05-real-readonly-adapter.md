# 05 — Real Readonly Adapter：Cockpit 接入 Agent Core 真实数据

Status: draft
Owner: cursor-composer
Created: 2026-05-28
Source PRD: [02-web-agent-cockpit-prd.md](../02-web-agent-cockpit-prd.md) §4, [01-agent-core-to-cockpit-contract-gap-review.md](../01-agent-core-to-cockpit-contract-gap-review.md)

## 1. 目标

创建 `real-readonly-adapter.ts`，将 Agent Core 后端新补齐的 4 个 REST endpoint 接入 Cockpit 的 `CockpitDataAdapter` 接口。同时更新 `adapter.ts` 的环境变量开关逻辑。

完成后，设置 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER=1` 即可让 Dashboard 显示真实信号数据而非 mock。

## 2. 非目标

- 不修改 Agent Core 后端代码
- 不修改 Dashboard UI 组件
- 不实现所有 adapter 方法（无后端的走 mock fallback）
- 不添加新 npm 依赖
- 不动 `fixtures.json` 或 `mock-adapter.ts`

## 3. 背景与现状

Agent Core 后端现提供以下只读 API（`http://127.0.0.1:8000`）：

| Endpoint | 返回 |
|---|---|
| `GET /api/agent/signals` | `{ signals: [...] }`，支持 `?symbol=&status=` |
| `GET /api/agent/signals/{id}` | 单条 signal 详情 |
| `GET /api/agent/market/gate` | `{ gate, summary, signal_count }` |
| `GET /api/agent/market/snapshot` | `{ total_signals, open_signal_count, ... }` |

Cockpit 当前全部使用 `mockCockpitAdapter`，需要新增一个 hybrid adapter：有后端的 3 个方法走 HTTP，其余 8 个走 mock fallback。

## 4. 数据映射规则

从前端 adapter 只关心 SignalSummary 需要的字段，其余 handle 在 mapping 层：

```
Backend signal row                        → SignalSummary
────────────────────────────────────────────────────────────
id                                        → id
symbol                                    → symbol
timeframe                                 → timeframe
setup_type                                → setup
score (number | null)                     → score (fallback 0)
status (string)                           → status (mapped enum)
market_gate                               → marketGate
trader_playbook_match (number | null)     → traderMatch (fallback 0)
entry_trigger                             → entryTrigger / thesis
invalidation                              → invalidation
updated_at                                → updatedAt

Backend market/gate                       → MarketIntentExplanation
────────────────────────────────────────────────────────────
gate                                      → marketGate
summary                                   → summary
signal_count                              → evidenceCount
```

## 5. 允许修改的文件

- `apps/trader-cockpit/lib/cockpit/real-readonly-adapter.ts` — 新建
- `apps/trader-cockpit/lib/cockpit/adapter.ts` — 更新 env 开关逻辑

## 6. 禁止修改的范围

- `apps/trader-agent/` — 后端代码
- `apps/trader-cockpit/components/` — UI 组件
- `apps/trader-cockpit/lib/cockpit/mock-adapter.ts`
- `apps/trader-cockpit/lib/cockpit/fixtures.ts`
- `apps/trader-cockpit/lib/cockpit/fixtures.json`
- `apps/trader-cockpit/lib/i18n/resources.json`
- `pnpm-lock.yaml`

## 7. 任务清单

- [ ] Task 1: 创建 `real-readonly-adapter.ts`，实现 3 个真实方法 + 8 个 mock fallback
- [ ] Task 2: 更新 `adapter.ts`，env var 开关引入 real adapter
- [ ] Task 3: lint + build + test 验证

## 8. 验收标准

- `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER=0`（默认）→ 全 mock，行为不变
- `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER=1` + 后端运行 → Dashboard 显示真实 signals 和 market gate
- `pnpm --filter trader-cockpit lint` 通过
- `pnpm --filter trader-cockpit build` 通过
- `node --test test/trader-cockpit-phase0.test.mjs` 不增加失败数

## 9. Cursor Composer 可执行 Prompts

以下三段 prompt 可直接复制粘贴给 Cursor Composer 2.5 执行。逐段运行，每段完成后验证。

---

### Cursor Prompt 1 — 创建 real-readonly-adapter.ts

```text
Implement Task 1 from docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/05-real-readonly-adapter.md.

Goal: create apps/trader-cockpit/lib/cockpit/real-readonly-adapter.ts that implements CockpitDataAdapter with real HTTP calls for listSignals, getMarketIntentExplanation, and getSignal. The remaining 8 methods delegate to mockCockpitAdapter.

API base URL: read from process.env.NEXT_PUBLIC_AGENT_API_BASE, default "http://127.0.0.1:8000".

Real endpoints to call:
- GET /api/agent/signals?symbol=&status=  → maps to SignalListViewModel
- GET /api/agent/signals/{id}             → maps to SignalDetail
- GET /api/agent/market/gate              → maps to MarketIntentExplanationViewModel

Backend signal row shape (key fields for mapping):
  id, symbol, timeframe, setup_type, score (number|null), status (string),
  market_gate, trader_playbook_match (number|null), entry_trigger, invalidation,
  evidence (object), risk_flags (string[]), tool_outputs (object),
  rule_version, agent_version, created_at, updated_at

Mapping rules:
- SignalSummary.status maps: watching→watching, waiting_trigger→waiting_trigger, near_trigger→near_trigger, triggered_for_attention→triggered_for_attention, invalidated→invalidated, needs_more_evidence→needs_more_evidence. Default: watching.
- score falls back to 0 when null.
- trader_playbook_match falls back to 0 when null.
- riskLevel: score >= 70 ? "medium" : "low"
- scenarioPlan: use entry_trigger as summary and triggerConditions[0], invalidation as invalidationConditions[0].
- MarketIntentExplanation.whyNow: ["Agent signals detected"] when gate != "block", else [].
- MarketIntentExplanation.whyWait: ["Market gate blocked"] when gate == "block", else [].
- SignalDetail.thesis = entry_trigger. Rule hits and missing conditions return empty arrays.

Use a shared fetchJson<T> helper that throws on non-ok responses.

Hard boundaries:
- Do not modify Agent Core backend code.
- Do not change UI components in apps/trader-cockpit/components/.
- Do not import from mock-adapter except for the fallback delegation (import { mockCockpitAdapter }).
- Do not call real endpoints for listTodayFocus, listInboxMessages, listAgentEvents, listPlaybookTheories, listLearningItems, getToolSettings, streamChat, getAgentConsole — these all delegate to mockCockpitAdapter.
- Use @/* import alias. No relative parent traversal.

Required verification:
- pnpm --filter trader-cockpit lint

Return the changed files and any failed command output.
```

---

### Cursor Prompt 2 — 更新 adapter.ts 开关

```text
Implement Task 2 from docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/05-real-readonly-adapter.md.

Goal: update apps/trader-cockpit/lib/cockpit/adapter.ts to wire in the real adapter from real-readonly-adapter.ts when NEXT_PUBLIC_COCKPIT_REAL_ADAPTER === "1".

Current code at the bottom of adapter.ts (replace entirely):
  import { mockCockpitAdapter } from "./mock-adapter";
  ...
  export const cockpitAdapter = ...;
  export { mockCockpitAdapter };

New logic:
- import { realReadonlyAdapter } from "./real-readonly-adapter";
- const useRealAdapter = typeof window !== "undefined" && process.env.NEXT_PUBLIC_COCKPIT_REAL_ADAPTER === "1";
- export const cockpitAdapter = useRealAdapter ? realReadonlyAdapter : mockCockpitAdapter;
- export { mockCockpitAdapter }; // keep for direct imports

Hard boundaries:
- Do not modify the CockpitDataAdapter interface.
- Do not touch any file outside apps/trader-cockpit/lib/cockpit/.
- Do not change fixture imports or mock-adapter code.

Required verification:
- pnpm --filter trader-cockpit lint
- pnpm --filter trader-cockpit build

Return the changed files and any failed command output.
```

---

### Cursor Prompt 3 — 全量验证

```text
Verify Tasks 1-2 from docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/05-real-readonly-adapter.md.

Goal: run the full verification pipeline and confirm no regressions.

Commands to run (in order):
1. pnpm --filter trader-cockpit lint
2. pnpm --filter trader-cockpit build
3. node --test test/trader-cockpit-phase0.test.mjs

Report: all three command outputs. If any test fails, report the failing test name and the diff between expected and actual.

Do not modify any files. Do not commit.
```

---

## 10. 完成后文档更新

- [ ] 更新 `00-implementation-status.md`：标注 Phase 1 real-readonly-adapter 完成
- [ ] 本 plan `Status: done`
