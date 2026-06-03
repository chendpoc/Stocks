# Agent Dev Workflow v2

> **最终确认版** — 此后所有开发任务以本流程为准。

---

## 完整流程

```text
CodeGraph
  ↓
DeepSeek + OpenSpec + grill-me
  ↓
Clarification Questions
  ↓
你拍板关键决策
  ↓
spec.md + spec.json
task.md + task.json
  ↓
Cursor Composer 2.5 + Superpowers
  ↓
Dev Plan Presentation
  ↓
你确认实现计划
  ↓
Cursor 实现
  ↓
Test / Verify
  ↓
Codex Review
  ↓
Cursor Fix
  ↓
Codex Re-review
  ↓
GitHub PR / Merge
```

---

## Phase 详解

### Phase 1：语义理解

**工具：CodeGraph**

`codegraph index` 构建全仓库语义图。`codegraph serve` 启动 MCP server。

AI agent 通过 MCP 工具（`codegraph_context` / `codegraph_explore`）理解代码结构，不再靠 grep。

输出：语义索引文件（不入 git）。

---

### Phase 2：Spec 生成

**工具：DeepSeek + OpenSpec + grill-me**

输入：用户意图 + CodeGraph 上下文。

AI 读取项目规范（`CLAUDE.md`、`00-workflow-router.md`、已有 `spec.json`），生成初始 spec。

grill-me 对 spec 做压力测试：发现模糊决策、未定义边界、缺失验收标准。

输出：Clarification Questions（向用户提问）。

---

### Phase 3：决策确认

**角色：你（用户）**

对 AI 提出的 Clarification Questions 逐一拍板。

强约束：任何有超过一种合理答案的问题，必须先问。AI 不得自行假设。

输出：`decision-record.json`（持久化所有决策）。

---

### Phase 4：Spec + Task 双文件

在决策确认后，AI 生成：

```
.agent-dev/specs/<feature>/
  spec.md          ← 给人读
  spec.json        ← 给脚本/Agent 校验（scope / decisions / acceptance / non_goals）

.agent-dev/tasks/
  T001.md          ← 给人读
  T001.json        ← 给脚本/Agent 校验（steps / verification / depends_on）
```

JSON Schema 定义在 `.agent-dev/memory/schemas.md`。

`.agent-dev` 只保留活跃、未归档 artifact。已完成、被取代、损坏或仅作历史证据的 specs/tasks/prompts/reviews/presentations 应移动到 `project-docs/archive/agent-dev/`，避免新 agent 默认读取旧执行包。

---

### Phase 5：Dev Plan 展示

**工具：Cursor Composer 2.5 + Superpowers**

输入：spec.json + task.json + CodeGraph 上下文。

AI 生成 `dev-plan.md` + `dev-plan.json`：

```text
准备改什么
不改什么
改哪些文件
实现步骤
验证方案
风险
需要你拍板的问题
```

这是开发前的最后一次对齐会议。

---

### Phase 6：你确认实现计划

你审阅 Dev Plan。通过 → 允许开发。不通过 → 返回修改。

---

### Phase 7：Cursor 实现

**工具：Cursor Composer 2.5 + Superpowers**

Superpowers 流程：Brainstorm → Plan → Implement → Review → Verify。

开发过程中，AI agent 使用 CodeGraph MCP 工具理解代码结构，使用后端 API 端点验证功能。

---

### Phase 8：Test / Verify

运行：

```text
单元测试
集成测试
Lint
Build
```

输出：`test-result.json`（或 pytest 原生输出）。

---

### Phase 9：Codex Review

**工具：Codex**

输入：

```text
spec.json（scope / forbidden / decisions）
task.json（verification per step）
git diff
test results
```

Codex 不只看代码，而是看：

```text
是否符合 spec scope
是否触碰 forbidden files
是否违反 confirmed decisions
验收标准是否全部满足
```

输出：`review-findings.json`（blocker / warning / info 三级）。

---

### Phase 10：Cursor Fix

如果 Review 有 blocker 或 warning：

```text
Codex Review Findings → Cursor 逐条修复
```

修复范围控制在 review findings 内——不引入新功能，不扩大 scope。

---

### Phase 11：Codex Re-review

修复后重新提交 Codex review。

循环直到：所有 blocker 清零，warnings 被标注为 conscious decision 或已修复。

---

### Phase 12：GitHub PR / Merge

通过 Re-review 后：

```text
创建 PR（附 review-findings.json 和 change-set）
你最终审批
Merge
```

---

## 工具链一览

| 工具 | Phase | 用途 |
|---|---|---|
| CodeGraph | 1 | 代码库语义索引，MCP server |
| DeepSeek | 2 | LLM 推理（spec 生成、代码生成） |
| OpenSpec | 2 | Spec 规范化、结构化校验 |
| grill-me | 2 | Spec 压力测试、模糊决策发现 |
| Cursor Composer 2.5 | 5, 7 | Agent 开发 |
| Superpowers | 5, 7 | Brainstorm → Plan → Implement → Review → Verify |
| Codex | 9, 11 | 结构化 Code Review |

---

## 核心原则

### 1. 决策优先于 Spec

```text
错误: Intent → Spec → Task → Code
正确: Intent → Clarify → Decide → Spec → Task → Code
```

### 2. 双文件 Artifact

所有关键产物同时输出 `.md`（给人读）和 `.json`（给脚本/Agent 校验）。

### 3. 不确认不前进

每个 Phase 都有 gate：Clarification Gate → Spec Gate → Plan Gate → Review Gate → Merge Gate。

### 4. 减少 Information Drift

所有 Agent 共享同一份 CodeGraph 索引 + spec.json + task.json + CLAUDE.md。

---

## 禁止

- 跳过 Clarification Gate 直接写 spec
- AI 自行假设"有多个合理答案"的决策
- 修改 spec scope 之外的代码
- Review 只看代码不看 spec 合规性
- blocker 未清零就 merge
