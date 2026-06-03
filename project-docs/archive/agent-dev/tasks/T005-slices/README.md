# T005 slices — Longbridge CLI Agent · Audit + Patch

**Task**: [T005.json](../T005.json) · **Spec**: [spec.json](../../specs/trader-longbridge-agent-cli/spec.json) · **Guide**: [T005.md](../T005.md)
**Deep Review**: [`.agent-dev/reviews/T005-deep-review.md`](../../reviews/T005-deep-review.md)

> **状态**: `done` · 全量 35/35 测试通过

| Slice | 类型 | 内容 | 状态 | 测试结果 |
|-------|------|------|------|----------|
| **S0** | Audit | 漂移清单 10 项逐项审计 | ✅ done | manual |
| **S1** | Patch | `DEFAULT_ALLOWED_FIRST_ARGS` 兜底白名单 (B2/B3/D312) | ✅ done | 7/7 pass |
| **S2** | Patch | probe cache 30s + lazy bootstrap + index.ts 解耦 (B4/M1/M4/D310) | ✅ done | 22/22 pass |
| **S3** | Patch | `getLongbridgeQuote` 多 symbol ≤10 (m1/D311) | ✅ done | 23 tools OK |
| **S4** | Test | `longbridgeAgent.test.ts` 重写 3 suites / 9 tests (M2) | ✅ done | 9/9 pass |
| **S5** | Test | `longbridgeTools.test.ts` 新建 7 tests (M3) | ✅ done | 7/7 pass |
| **S6** | Patch | SettingsPage 接 probe cache + `r` 键刷新 (B4) | ✅ done | tsc OK |
| **S7** | Docs | `.env.example` / `package.json` / PROMPT_PATCH / CLAUDE.md | ✅ done | 35/35 pass |
| **S8** | Manual | V306 确定性通过 · V303/V304 需用户验收 | ✅ done | — |

## 并行执行记录

```text
S0 (sequential) → S1 / S2 / S3 (parallel subagents)
                   S2 done → S4, S6 (parallel subagents)
                   S3 done → S5 (subagent)
                   S4 + S5 + S6 done → S7 (direct) → S8 (direct)
```

## Worker prompt

`.agent-dev/trader-longbridge-agent-worker-prompt.md`（执行完毕，步骤与实际一致）
