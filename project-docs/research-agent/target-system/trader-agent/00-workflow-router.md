# 00 Workflow Router

版本：`v0.1`

范围：`trader-agent` 目标系统下所有后续 PRD、计划、实现、审查和 worker prompt。

本文件是进入 trader-agent 开发前的唯一流程入口。它不替代 PRD，也不替代 skill；它只回答：当前任务应该听哪个 source of truth、使用哪个主 workflow、何时必须让用户确认。

## 1. 指令优先级

当规则冲突时，按以下顺序处理：

| 优先级 | 来源 | 作用 |
|---:|---|---|
| 1 | 当前用户明确指令 | 当前回合的目标、范围和决策 |
| 2 | 当前系统/开发者指令、会话注入规则、真实存在的项目 `AGENTS.md` / `CLAUDE.md` | 协作和安全边界 |
| 3 | 本目录 PRD、roadmap、development README、implementation status | 产品、架构、阶段和验收真值 |
| 4 | 已确认的 `plans/*.md` 或 task spec | 单次实现契约 |
| 5 | 项目专项 skill | 执行方法和局部约束 |
| 6 | 通用 skill / superpowers | 技术方法、TDD、调试、审查 |
| 7 | 记忆、旧路线、历史 module docs | 背景线索；漂移时必须验证 |

规则：不要在 prompt 中引用未经确认存在的文件。当前 repo 根目录没有 `AGENTS.md` 时，不得要求 worker “先读项目 AGENTS.md”。

## 2. Source Of Truth Map

| 任务面 | 先读 | 再读 |
|---|---|---|
| 全系统定位 | [README.md](./README.md), [00-system-overview.md](./00-system-overview.md) | 对应 layer 的 PRD |
| Agent Core backend | [01-agent-core-backend-prd.md](./01-agent-core-backend-prd.md), [01-agent-core-implementation-plan.md](./01-agent-core-implementation-plan.md) | `apps/trader-agent/backend` 当前代码和测试 |
| Web Agent Cockpit | [02-web-agent-cockpit-prd.md](./02-web-agent-cockpit-prd.md), [02-web-agent-cockpit-development/README.md](./02-web-agent-cockpit-development/README.md) | Cockpit 局部 router 和当前 plan |
| Shared Agent Memory | [03-shared-agent-memory-prd.md](./03-shared-agent-memory-prd.md), [03-shared-agent-memory-development/README.md](./03-shared-agent-memory-development/README.md) | 具体 M0-M6 development doc 和后端现状 |
| Shared Platform / workflow orchestration | [03-shared-platform-roadmap-prd.md](./03-shared-platform-roadmap-prd.md), [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | 当前 implementation status 和 accepted plan |
| Self-learning market judgment / model learning | [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md), [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md) | future direction only; does not change Stage 1 scope or promotion safety gates |
| Backlog ordering | [07-backlog-roadmap-index.md](./07-backlog-roadmap-index.md) | Now / Next / Later / Blocked by Contract consolidation; links back to owning docs |
| AI / RAG / MCP | [04-ai-rag-mcp-platform-roadmap-prd.md](./04-ai-rag-mcp-platform-roadmap-prd.md) | 现有模型调用、tool registry、knowledge API |

旧 `project-docs/research-agent/modules/` 和 `apps/research-console/` 只能作为迁移素材，不能压过本目录目标系统文档。

## 3. Workflow Router

| 任务类型 | 主 workflow / skill | 必须产物 | 用户确认门槛 |
|---|---|---|---|
| 新 PRD、需求边界、范围变化 | `product-requirements-discussion` | PRD / decision note | yes |
| 修改产品行为、架构、存储、事件、API contract | `product-requirements-discussion` + 当前 PRD | confirmed decision | yes |
| 编写或审查 module plan、worker prompt、task spec | `module-spec-quality-gate` | context pack, confirmed decisions, acceptance-to-verification map | yes if blocking decision exists |
| 已通过规格门禁的后端/数据/Memory 实现 | TDD 或 `agent-module-development-loop` | code diff, tests, verification | only if scope/contract changes |
| 已通过规格门禁的 Cockpit 前端实现 | [02-web-agent-cockpit-development/00e-workflow-and-skill-routing.md](./02-web-agent-cockpit-development/00e-workflow-and-skill-routing.md) + `cockpit-frontend-workflow` | bounded diff, browser QA, lint/build/tests | yes for UX/product changes |
| 页面结构、视觉层级、交互模型变化 | [02-web-agent-cockpit-development/00b-visual-design-review-workflow.md](./02-web-agent-cockpit-development/00b-visual-design-review-workflow.md) | sketch/prompt, reviewed direction, implementation plan | yes |
| Worker agent 执行模块 | `agent-module-development-loop` | worker prompt, local review, review/fix loop, fresh verification | only if worker finds product question |
| 独立只读审查 | `phase-review-agent-workflow` | findings-first review | yes for product/UX decisions |
| Bug、测试失败、异常行为 | systematic debugging workflow | root cause, regression test/check, narrow fix | yes only if fix changes product behavior |
| 文档同步、typo、单文件机械修复 | local direct workflow | narrow patch, relevant check | no |

只选择一个主 workflow。辅助 skill 必须服务当前任务面，不得把流程变成角色堆叠。

## 4. Specification Gate

所有非平凡实现任务在写代码或派发 worker 前，必须在 plan 或 prompt 文档顶部完成以下检查。不通过不派发 worker。

```markdown
## Specification Gate Check

- [ ] Source checked — 已读取 PRD、dev doc、当前代码/测试、关联 plan
- [ ] Decisions frozen — 无阻塞性未决项（产品、架构、API、事件、路径、存储）
- [ ] Scope bounded — allowed files、forbidden files、非目标已明确列出
- [ ] Verification mapped — 每条验收标准映射到具体测试或命令
- [ ] Prompt self-contained — worker 不需要猜测来源、路径、事件名、接口
- [ ] Behavior preserved（仅 reconciliation/migration 类 plan） — 旧实现的每个行为都被追踪：保留/增强/移除。移除项在 confirmed decisions 中有 conscious rationale。默认假定旧行为有存在理由

未全部 [x] → 不准派发 worker，不准进入实现。
```

## 4.1 双文件 Artifact 规范

通过 Spec Gate 后，所有 artifact 按以下规范生成：

- **双文件**：每个 artifact 同时输出 `.md`（给人读）和 `.json`（给脚本/Agent 校验）
- **JSON Schema** 定义在 `.agent-dev/memory/schemas.md`（spec / task / decision-record / review-findings / change-set）
- **Decision Record** 独立于 spec，持久化在 `.agent-dev/specs/<feature>/decision-record.json`
- **存放位置**：遵循 `.agent-dev/` 目录结构（`specs/` `tasks/` `plans/` `reviews/` `changesets/` `memory/`）

验收时，review agent 应对比 `spec.json` 的 `scope.forbidden` 和 git diff，发现越界即报 blocker。

## 5. Plan And Prompt Rules

计划文档负责单次任务契约，不负责重复通用流程。

### 5.0 强制前置步骤：决策归属

**在创建 plan 文件之前**，列出本次 plan 涉及的每一个决策点。判断标准只有一条：

> 这个决策有超过一种合理答案吗？有 → 它是用户的决策。先问，再写 plan。

没有完成此步骤，不准创建 plan 文件，不准写 worker prompt。

### 5.1 Plan 内容要求

每个可执行 plan 应包含：

- source-of-truth links
- required workflow / skills
- confirmed decisions
- allowed files
- forbidden files
- implementation tasks
- tests and assertions
- acceptance-to-verification map
- final response requirements

Worker prompt 必须从当前 plan 生成；不得复制旧 prompt 后局部替换。旧 prompt 常见漂移包括事件名、路径语义、状态文档范围和不存在文件引用。

## 6. Review Rules

- Pre-code plan/spec review：用 `module-spec-quality-gate`。
- Post-code diff review：用 `phase-review-agent-workflow` 或代码审查。
- UI/UX review：用 Cockpit 设计门禁，reviewer 不得替用户决定交互偏好。
- Review finding 不是自动真理；主 agent 必须拒绝 stale、错误、越界或违背已确认决策的意见。

## 7. Completion Rules

完成前必须能用当前证据证明：

- scope 内要求全部完成
- forbidden scope 未被触碰
- 验收命令或测试已运行且覆盖对应要求
- status / plan 文档需要更新时已更新
- worker/review agent 已关闭或明确说明为何保留
- 未把用户既有 dirty work 当成自己的变更

不能用“没有发现问题”替代完成证明。
