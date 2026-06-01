# .agent-dev/ — Agent Development Artifacts

> 所有开发任务的结构化产物。遵循 `docs/workflow.md` v2 流程。
> 配套：根 `CLAUDE.md`（开发规约）· `context/code_map.md`（项目结构定位）。

## 目录结构

```
.agent-dev/
├── README.md                                ← 本文件
├── memory/
│   ├── schemas.md                           ← 所有 JSON schema 定义（v1.0）
│   └── cursor-setup.md                      ← Cursor 配置说明
├── context/
│   └── code_map.md                          ← 项目结构快速定位（开发前必读）
│
├── specs/<feature>/
│   ├── spec.md                              ← 给人读
│   ├── spec.json                            ← 卡点 + 约束（scope/verification）
│   ├── dev-plan.md                          ← Plan Gate 开发计划（人审，可选）
│   ├── decision-record.json                 ← 决策持久化
│   └── clarification-questions.{md,json}    ← grill-me 产出（开发时生成）
│
├── tasks/
│   ├── T00X.{md,json}                       ← 可执行步骤 + 依赖图 + worker_prompt_path
│   └── T00X-slices/                         ← 大任务的分片清单（README.md + 每片单独 .md）
│
├── presentations/                           ← Code review 演示稿
├── <task>-worker-prompt.md                  ← Worker 实现指令（Composer 用）
│
├── plans/                                   ← Dev Plan JSON（可选，Phase 5 产出）
├── reviews/                                 ← Codex Review 产出（Phase 9）
├── changesets/                              ← 变更打包（Phase 12）
└── context/                                 ← Context Pack（CP001.json 等）
```

## 双文件 Artifact 原则

每个关键 artifact 同时出 `.md`（给人审阅）与 `.json`（给脚本/Review agent 校验）：

| Artifact | 路径模式 | Schema |
|---|---|---|
| Spec | `specs/<feature>/spec.{md,json}` | `memory/schemas.md §1` |
| Task | `tasks/T00X.{md,json}` | `memory/schemas.md §2` |
| Decision Record | `specs/<feature>/decision-record.json` | `memory/schemas.md §3` |
| Review Findings | `reviews/<task>-review-findings.json` | `memory/schemas.md §4` |
| Change Set | `changesets/CS00X.json` | `memory/schemas.md §5` |

## 使用方式

1. **新任务启动**: 先读 `specs/<feature>/spec.json`（`scope` + `decisions` + `verification`），再读 `tasks/T00X.json` 的 `steps[]`
2. **大任务分片**: 看 `tasks/T00X-slices/README.md` 拿到串/并行顺序，每片单独 `.md` 含 exit_criteria
3. **Worker 实现**: 用 `<task>-worker-prompt.md` 喂 Cursor Composer / Codex；prompt **绝不**在 chat 内 echo
4. **Review 时**: Codex 读 `spec.json` 的 `scope.forbidden` 与 `decisions`，对比 git diff 找漂移
5. **决策记录**: 任何有 >1 个合理答案的决策，先问用户，确认后写入 `decision-record.json`
6. **完成时**: 生成 `changesets/CS00X.json` 作为 PR 附件

## 当前任务全景（T001–T005）

| Task | Spec | 状态 | 标题 / 范围 | 关键产出 |
|---|---|---|---|---|
| **T001** | `forward-market-intel` | in_progress（核心 P0-P8 已落地） | Forward Market Intelligence MVP（P0 schema → P9 LLM provider） | 11 张表 + `/api/intel/*` 11 路由 + scanner/pattern/cross_asset + trader-cli 初版 |
| **T002** | `cli-tui-v2` | completed | Ink TUI 框架 + 报表/市场缓存 + 新闻爬虫 + 服务管理 | `tui/` P0 壳 + `report_cache` 表 + `ingested_at` TTL + `news_crawler.py` + `server start/stop/status` |
| **T003** | `cli-tui-integration` | approved（实现中） | 七页 TUI 接入 + `services/` 共享层 | `OpsPage` / `HypothesesPage` + Dashboard 指挥中心 + `GET /market/status` |
| **T004** | `trader-chart-ratatui` | done | Rust ratatui 全屏 K 线 + Ink handoff（方案 A） | `apps/trader-chart/` + `services/traderChart.ts` + Dashboard [c] handoff |
| **T005** | `trader-longbridge-agent-cli` | in_progress（audit + patch） | Longbridge CLI Agent 工具化（22 Tier1 + invoke） | `services/longbridgeCli.ts` + `services/longbridgeAgent.ts` + `llm/longbridgeTools.ts` + `llm/buildAgentTools.ts` |

详见各 `specs/<feature>/spec.md` 与 `tasks/T00X.md`。

## 强制 Gate

1. **Clarification Gate**: 任何 >1 个合理答案的决策，先 `clarification-questions.json` 问用户，确认后写 `decision-record.json`
2. **Plan Gate**: Dev Plan（`specs/<feature>/dev-plan.md`）展示后，用户确认才能开始实现
3. **Review Gate**: Codex review 的 blocker（`reviews/<task>-review-findings.json`）必须清零才能 merge

参考根目录 `CLAUDE.md` §Spec-Driven Development Workflow 与 `docs/workflow.md` v2。
