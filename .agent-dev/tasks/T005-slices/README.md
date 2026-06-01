# T005 slices — Longbridge CLI Agent · Audit + Patch

**Task**: [T005.json](../T005.json) · **Spec**: [spec.json](../../specs/trader-longbridge-agent-cli/spec.json) · **Guide**: [T005.md](../T005.md) · **Review**: `c:\Users\31089\.cursor\plans\t005_开发计划深度_review_53319747.plan.md`

> **任务性质改变**：从「实现」改为「**Audit + Patch**」。深度 review 后 spec 已 `approved`，~85% 代码已落地，本任务负责修 4 个 Blocker（B1-B4）+ 4 个 Major（M1-M4）+ Minor。

| Slice | 类型 | 内容 | 依赖 | 预估文件 | 验证 |
|-------|------|------|------|----------|------|
| **S0** | Audit | 漂移清单逐项打勾，填 T005.md | — | 1 md | manual |
| **S1** | Patch | longbridgeCli 加 `_default_allowed_first_args` 兜底；test 加 3 项（B2/B3/D312） | S0 | 2 | V305 |
| **S2** | Patch | longbridgeAgent 加 probe cache 30s；index.ts 移除 top-level await；buildAgentTools lazy 调用（B4/M1/M4/D310） | S0 | 3 | V302/V306 |
| **S3** | Patch | longbridgeTools getLongbridgeQuote 多 symbol（m1/D311） | S0 | 1 | V305 |
| **S4** | Test | longbridgeAgent.test 加 3 mock 场景 + cache 测试（M2） | S2 | 1 | V301 |
| **S5** | Test | 新建 longbridgeTools.test.ts（M3） | S3 | 1 | V305 |
| **S6** | Patch | SettingsPage 接入 probe cache（B4） | S2 | 1 | V301 |
| **S7** | Docs | .env.example / package.json test / PROMPT_PATCH 句子 / code_map（m5/m6/m7） | S4,S5,S6 | 6 | V302 |
| **S8** | Manual | 启动延迟 + chat eval + Dashboard l/L | S7 | 0 | V303/V304/V306 |

## 并行建议

- **S1 / S2 / S3** 三步**只依赖 S0**，可在同一工作日并行。
- **S4** 等 S2；**S5** 等 S3；**S6** 等 S2。
- **S7** 等 S4+S5+S6。

## Worker prompt

`.agent-dev/trader-longbridge-agent-worker-prompt.md`（Plan Gate 已通过 → 已生成；含 audit + patch 步骤）。

## 当前阶段

- `spec.status=approved`（深度 review + RQ1-RQ4 决议落地）
- `T005.status=in_progress`
- 下一步：执行 S0 audit；S1/S2/S3 可并行启动
