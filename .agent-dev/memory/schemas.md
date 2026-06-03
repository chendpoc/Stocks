# Agent Dev Artifact Schemas v1.0

> **最终确认版** — 双文件（JSON + Markdown）分工原则：
> - **JSON**：卡点、约束、Agent 可解析的结构化输入。脚本/CI/review agent 直接消费。
> - **Markdown**：解释、上下文、完整 rationale。人读，不要求脚本解析。
> - **反模式**：把大段解释塞进 JSON；把路径/命令/枚举藏在散文里。

---

## Scope Execution Semantics

Do not add a separate `code_scope` field. Agents must execute code-reading,
editing, and review boundaries from existing schema fields:

- `spec.scope.create` and `spec.scope.modify`: allowed edit paths and the
  primary reading scope for implementation.
- `spec.scope.readonly_import`: readable dependency context only; never edit.
- `spec.scope.forbidden`: default no-read and no-edit boundary unless the user
  explicitly asks for a scoped audit.
- `task.steps[].files_expected`: slice-level first-read and scoped-diff default.
- `git status --short`: dirty worktree identification only.
- `git diff --name-only`: changed-file audit only; it does not replace scoped
  review.
- `git diff -- <scoped-path>` and `git diff --stat -- <scoped-path>`: allowed
  diff forms after scope has been derived.

## 1. clarification-questions.json + .md（新增）

grill-me 对 spec 做压力测试后产出。Phase 2 → Phase 3 的桥梁。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ClarificationQuestions",
  "type": "object",
  "required": ["spec_id", "questions"],
  "properties": {
    "spec_id": { "type": "string" },
    "generated_by": { "type": "string", "default": "grill-me" },
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "category", "question", "status"],
        "properties": {
          "id": { "type": "string", "description": "如 Q001" },
          "category": { "type": "string", "enum": ["scope_boundary", "architecture", "dependency", "data_model", "api_contract", "risk", "user_experience", "naming"] },
          "question": { "type": "string", "description": "一句话问题" },
          "option_refs": { "type": "array", "items": { "type": "string" }, "description": "选项 id 列表，对应 md 中的选项表格" },
          "status": { "type": "string", "enum": ["pending", "answered"] }
        }
      }
    }
  }
}
```

### Markdown（配套 .md 文件）

```markdown
## Q001: [一句话问题]

**类别**: scope_boundary

**上下文**: [当前架构状态、为什么会有这个问题]

**影响**: [选不同的答案会导致什么差异]

| 选项 | 含义 |
|------|------|
| A | [详细解释] |
| B | [详细解释] |

**你的决定**: ___
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `id`, `category`, `status` | ✅ 脚本统计 | — |
| `question`（一句话） | ✅ Agent 上下文注入 | — |
| `option_refs` | ✅ 校验回答是否在选项中 | — |
| 上下文、影响、选项详解 | — | ✅ 人读 |
| 你的决定（填空） | — | ✅ 交互 |

---

## 2. spec.json + spec.md

任务定义：边界、验收、约束。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Spec",
  "type": "object",
  "required": ["id", "title", "status", "scope", "acceptance", "non_goals", "verification"],
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "status": { "type": "string", "enum": ["draft", "review", "approved", "in_progress", "done", "archived"] },
    "source_docs": { "type": "array", "items": { "type": "string" }, "description": "引用文档路径" },
    "scope": {
      "type": "object",
      "required": ["create", "forbidden"],
      "properties": {
        "create": { "type": "array", "items": { "type": "string" }, "description": "允许新建/修改的文件 glob" },
        "modify": { "type": "array", "items": { "type": "string" }, "description": "允许修改的已有文件" },
        "forbidden": { "type": "array", "items": { "type": "string" }, "description": "禁止触碰的文件 glob。review agent 用 git diff --name-only 与此取交集" },
        "readonly_import": { "type": "array", "items": { "type": "string" }, "description": "只读引用的模块路径" }
      }
    },
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ref", "brief"],
        "properties": {
          "ref": { "type": "string", "description": "指向 decision-record.json 中的决策 id" },
          "brief": { "type": "string", "description": "一句话结论，供 review agent 快速对照" }
        }
      }
    },
    "acceptance": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "check"],
        "properties": {
          "id": { "type": "string", "description": "如 A001" },
          "check": { "type": "string", "description": "验收标准描述" },
          "verified_by": { "type": "array", "items": { "type": "string" }, "description": "指向 verification id 列表" }
        }
      }
    },
    "non_goals": { "type": "array", "items": { "type": "string" }, "description": "明确不做的事。review agent 检测 scope creep" },
    "verification": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "command", "blocking"],
        "properties": {
          "id": { "type": "string", "description": "如 V001" },
          "command": { "type": "string", "description": "可直接执行的验证命令" },
          "expect": { "type": "string", "description": "预期输出或行为" },
          "blocking": { "type": "boolean", "description": "是否为阻塞项（不通过则不能 merge）" }
        }
      }
    }
  }
}
```

### Markdown（配套 .md 文件）

```markdown
# [title]

## 背景与动机
[从设计文档来的系统定位...]

## 架构决策详解
### D003: [brief]
- **为什么**: [rationale]
- **替代方案**: [被否决的选项及理由]
- **影响**: [这个决策导致哪些文件/模块变化]

## 验收标准详解
### A001: [check]
[为什么这条是必须的、怎么手动验证、边界条件...]
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `scope` 全字段 | ✅ review agent 自动对比 diff | — |
| `verification[].command` | ✅ CI 逐条执行 | ✅ 命令解释 |
| `verification[].blocking` | ✅ 阻止 merge | — |
| `acceptance[].verified_by` | ✅ 追踪验收覆盖率 | — |
| `non_goals` | ✅ 简短字符串供 quick check | ✅ 展开解释每条为什么不做 |
| `decisions[].brief` | ✅ review 时快速对照 | — |
| decision rationale | — | ✅ 人需要知道"为什么" |

---

## 3. task.json + task.md

spec 的可执行拆分。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Task",
  "type": "object",
  "required": ["id", "spec_id", "title", "status", "steps"],
  "properties": {
    "id": { "type": "string", "description": "如 T001" },
    "spec_id": { "type": "string" },
    "title": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "in_progress", "done", "blocked"] },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description"],
        "properties": {
          "id": { "type": "string" },
          "description": { "type": "string", "description": "一句话任务描述" },
          "status": { "type": "string", "enum": ["pending", "in_progress", "done", "blocked"] },
          "depends_on": { "type": "array", "items": { "type": "string" }, "description": "前置 step id 列表，可生成依赖图" },
          "verification": {
            "type": "object",
            "properties": {
              "ref": { "type": "string", "description": "指向 spec.json 的 verification id" },
              "blocking": { "type": "boolean" }
            }
          },
          "files_expected": { "type": "array", "items": { "type": "string" }, "description": "预期产出文件。实现后对比实际 diff" }
        }
      }
    },
    "worker_prompt_path": { "type": "string", "description": "给 AI 的可执行 worker prompt 文件路径" }
  }
}
```

### Markdown（配套 .md 文件）

```markdown
# T001: [title]

## 步骤概览
[依赖关系图或列表...]

## P0: [description]
### 实施指南
[创建内容、seed 数据、注意事项...]

### 验证方式
[手动验证步骤...]
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `depends_on` | ✅ 生成依赖图、判断并行度 | ✅ 可视化 |
| `verification.ref` | ✅ 指向 spec 单一真实源 | — |
| `files_expected` | ✅ 对比实际 diff 检测遗漏 | — |
| 实施指南 | — | ✅ 人读 |

---

## 4. decision-record.json + .md

独立持久化的决策记录。Phase 3 产出。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DecisionRecord",
  "type": "object",
  "required": ["spec_id", "decisions"],
  "properties": {
    "spec_id": { "type": "string" },
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "date", "question", "answer"],
        "properties": {
          "id": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "question": { "type": "string", "description": "待决策的问题（一句话）" },
          "answer": { "type": "string", "description": "用户确认的答案（一句话）" },
          "confirmed_by": { "type": "string", "enum": ["user", "spec_gate"] }
        }
      }
    }
  }
}
```

### Markdown（配套 .md 文件）

```markdown
## D003: [question]

**答案**: [answer]

**为什么**: [rationale]

**替代方案**: [被否决的选项及理由]

**影响**: [这个决策导致的变化]
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `id`, `date`, `question`, `answer` | ✅ 脚本/Agent 检索 | — |
| `confirmed_by` | ✅ 区分用户拍板 vs gate 自动通过 | — |
| rationale, alternatives, impact | — | ✅ 人读 |

---

## 5. review-findings.json + .md

Codex 结构化 review 输出。Phase 9 产出。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ReviewFindings",
  "type": "object",
  "required": ["review_id", "spec_id", "task_id", "findings", "summary"],
  "properties": {
    "review_id": { "type": "string" },
    "spec_id": { "type": "string" },
    "task_id": { "type": "string" },
    "reviewer": { "type": "string", "description": "执行 review 的 agent/tool" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "severity", "rule", "file"],
        "properties": {
          "id": { "type": "string", "description": "如 F001" },
          "severity": { "type": "string", "enum": ["blocker", "warning", "info"] },
          "rule": {
            "type": "string",
            "enum": [
              "scope_violation",
              "decision_violation",
              "missing_verification",
              "untested_code",
              "api_contract_break",
              "dep_inversion",
              "missing_documentation"
            ]
          },
          "file": { "type": "string" },
          "line": { "type": "integer" }
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["blocker_count", "warning_count", "verdict"],
      "properties": {
        "blocker_count": { "type": "integer" },
        "warning_count": { "type": "integer" },
        "verdict": { "type": "string", "enum": ["pass", "fix_required"] }
      }
    }
  }
}
```

### 标准 rule 枚举定义

| rule | 检测方式 | severity |
|---|---|---|
| `scope_violation` | `git diff --name-only` ∩ `spec.scope.forbidden` | blocker |
| `decision_violation` | LLM 对比 diff 和 `decision-record.json` | blocker |
| `missing_verification` | `acceptance` 中 `verified_by` 为空或未覆盖 | blocker |
| `untested_code` | 新增文件无对应测试文件 | warning |
| `api_contract_break` | 已有 endpoint 签名变化（AST diff） | blocker |
| `dep_inversion` | `spec.scope.forbidden` 中的模块被 `spec.scope.create` import | blocker |
| `missing_documentation` | 新增公开 API 无 docstring | warning |

### Markdown（配套 .md 文件）

```markdown
## F001 [blocker] scope_violation

**文件**: app/modules/market_context.py:42
**规则**: scope_violation — spec.scope.forbidden 禁止修改 app/modules/**
**实际改动**: [diff 片段]
**修复建议**: [具体方案]
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `severity`, `rule`, `file`, `line` | ✅ 统计、过滤、趋势图 | — |
| `summary.verdict` | ✅ 脚本判断可否 merge | — |
| diff 片段、修复建议 | — | ✅ 人读 |

---

## 6. change-set.json + .md

任务完成后的变更打包。Phase 12 产出（PR 附件）。

### JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ChangeSet",
  "type": "object",
  "required": ["id", "spec_id", "files_changed", "verification_passed", "review_verdict"],
  "properties": {
    "id": { "type": "string", "description": "如 CS001" },
    "spec_id": { "type": "string" },
    "task_id": { "type": "string" },
    "files_changed": { "type": "array", "items": { "type": "string" } },
    "verification_passed": { "type": "array", "items": { "type": "string" }, "description": "通过的 verification id 列表" },
    "review_id": { "type": "string" },
    "review_verdict": { "type": "string", "enum": ["pass", "fix_required"] },
    "merged": { "type": "boolean", "default": false }
  }
}
```

### Markdown（配套 .md 文件）

```markdown
# CS001: [spec_id]

## 变更意图
[这个 change set 解决了什么]

## 关键决策回顾
[本次变更涉及的 decision 及实际执行情况]

## 风险说明
[已知风险、未覆盖的边界条件]
```

### 分工

| 字段 | JSON | Markdown |
|---|---|---|
| `files_changed`, `verification_passed`, `review_verdict`, `merged` | ✅ 可追溯、可统计 | — |
| 变更意图、风险说明 | — | ✅ 人读 |

---

## 附：Spec Kitty 已知问题

- Spec Kitty CLI v3.1.9 Windows 中文环境 GBK 编码 bug，`init` 不可用
- `spec-kitty` 命令行工具暂不使用，`.agent-dev/` 目录结构已手动创建
