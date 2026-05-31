# .agent-dev/ — Agent Development Artifacts

> 所有开发任务的结构化产物。遵循 `docs/workflow.md` v2 流程。

## 目录结构

```
.agent-dev/
├── README.md                          ← 本文件
├── memory/
│   ├── schemas.md                     ← 所有 JSON schema 定义（v1.0）
│   └── cursor-setup.md                ← Cursor 配置说明
├── specs/<feature>/
│   ├── spec.md                        ← 给人读
│   ├── spec.json                      ← 卡点 + 约束（scope/verification）
│   ├── decision-record.json           ← 决策持久化
│   └── clarification-questions.json   ← grill-me 产出（开发时生成）
├── tasks/
│   ├── T001.md                        ← 给人读
│   └── T001.json                      ← 可执行步骤 + 依赖图
├── plans/
│   └── <task>-dev-plan.json           ← Dev Plan（Phase 5 产出）
├── reviews/
│   └── <task>-review-findings.json    ← Codex Review（Phase 9 产出）
├── changesets/
│   └── CS001.json                     ← 变更打包（Phase 12 产出）
└── context/
    └── CP001.json                     ← Context Pack（后续使用）
```

## 使用方式

1. **新任务启动**: 先读 `specs/<feature>/spec.json`（scope + decisions + verification）
2. **开发中**: 对照 `tasks/T001.json` 的 steps 逐一实现
3. **Review 时**: Codex 读取 spec.json 的 scope.forbidden 和 decisions，对比 git diff
4. **决策记录**: 所有 >1 个合理答案的决策写入 decision-record.json
5. **完成时**: 生成 change-set.json 作为 PR 附件

## 当前试点

`forward-market-intel` — Forward Market Intelligence MVP 系统。
