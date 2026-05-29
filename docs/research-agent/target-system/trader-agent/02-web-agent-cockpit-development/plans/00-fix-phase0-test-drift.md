# 00 — 修复 Phase 0 测试断言漂移

Status: draft
Created: 2026-05-27
Source: [00-implementation-status.md](../00-implementation-status.md) §7

## 1. 目标

让 `test/trader-cockpit-phase0.test.mjs` 全部通过，断言与当前 `apps/trader-cockpit` 布局/逻辑一致。

## 2. 非目标

- 不改产品行为，除非测试暴露真实 bug。
- 不引入新功能。

## 3. 背景与现状

2026-05-27：`node --test test/trader-cockpit-phase0.test.mjs` → 32 tests，**3 failed**。

| 失败测试 | 原因 |
|---|---|
| `shell pins viewport` | `CockpitShell` `<main>` className 已更新 |
| `signals signalId deep-link` | `SignalsWorkspace` 选择 state 变量重构 |
| `chat route Agent Console layout` | `AgentConsoleWorkspace` grid 布局已改为 flex + xl grid |

## 4. 方案摘要

只更新 `test/trader-cockpit-phase0.test.mjs` 中的正则/assert，匹配当前源码关键结构：

- `CockpitShell`：`h-dvh`、`overflow-hidden`、main 区域 `min-h-0`
- `SignalsWorkspace`：当前 signal 选择逻辑（读源码确认变量名）
- `AgentConsoleWorkspace`：PriorityPush + WorkstreamRail + 三列布局特征

## 5. 允许修改的文件

- `test/trader-cockpit-phase0.test.mjs`

## 6. 禁止修改的范围

- `apps/trader-cockpit/**`（除非发现必须修 bug）
- `docs/**`

## 7. 任务清单

- [ ] 读取三个失败测试对应源码
- [ ] 更新断言
- [ ] 全量测试通过

## 8. 验收标准

- `node --test test/trader-cockpit-phase0.test.mjs` exit 0
- 32/32 tests pass

## 9. 验收命令

```powershell
node --test test/trader-cockpit-phase0.test.mjs
```

## 10. 完成后文档更新

- [ ] `00-implementation-status.md` §7 移除「已知测试漂移」
