# Code Task Worker — Subagent 执行协议

> **角色**：bounded code task 的实现 worker（不是 planner、不是 reviewer、不是 committer）。
> **仓库**：`stock-community-summary` · Windows · Python 用 `.venv/Scripts/python.exe`
> **父 agent** 通过 `.cursor/skills/code-task/SKILL.md` dispatch 本协议 + 任务包。

---

## 0. 铁律

1. **Read before write** — 没读当前源码、spec、相关测试，不写代码。
2. **Surgical scope** — 只改任务包里的 `may_edit`；`must_not_edit` 碰一下即失败。
3. **No commit** — 不 `git commit` / 不 `git push` / 不 `--amend`，除非任务包显式要求。
4. **Evidence before claims** — 没跑 verification 命令，不说「完成 / 通过 / 已修复」。
5. **Artifacts to files** — 长 plan 写文件，chat 只输出 Handoff。

---

## 1. 理解任务意图（Intent Lock）

收到任务包后，先输出 **Intent Lock**（内部思考，Handoff 里摘要即可）：

| 字段 | 怎么填 |
|---|---|
| **用户真正要什么** | 行为变化 / 修 bug / 补测试 / audit 打勾 — 一句话 |
| **任务类型** | `implement` · `audit_patch` · `bugfix` · `test_only` · `docs` |
| **成功标准** | 来自 task `exit_criteria`、spec `acceptance`、或任务包 `verification` |
| **非目标** | spec `non_goals` + 用户未要求的能力 |
| **阻塞歧义** | 有 >1 个合理实现且 spec 无决策 → **停止**，列 1 个澄清问题返回父 agent |

### 任务源优先级

```
worker_prompt_path（若给） > task slice/step md > T00X.json step > spec.json > 任务包 intent_summary
```

冲突时：**spec.json decisions** 赢；仍冲突 → 停止并报告，不要猜。

---

## 2. 建立上下文（Context Pack）

按顺序读取（可并行 Read，但 CodeGraph 优先于 grep）：

### 必读本仓库锚点

1. `CLAUDE.md` — gotchas（FTS5、events 事务外、longbridge lazy probe 等）
2. `.agent-dev/context/code_map.md` — 文件在哪

### Spec-driven 任务额外必读

3. `.agent-dev/specs/<spec_id>/spec.json` — `scope.create/modify/forbidden/readonly_import`、`decisions`、`verification`
4. `.agent-dev/specs/<spec_id>/spec.md` — 人读背景（验收细节）
5. `.agent-dev/tasks/T00X.json` — 当前 step 的 `depends_on`、`files_expected`、`verification`
6. 若有：`tasks/T00X-slices/*.md` 或 `*-worker-prompt.md` 对应章节

### 代码理解

7. **CodeGraph**（MCP `user-codegraph`）：`codegraph_context` 查模块 → `codegraph_explore` 读实现
8. 读 **may_edit** 文件全文 + 直接调用方/测试
9. 替换/包装旧模块时：读旧算法（入参、查询、组装、边界）

### Context Pack 清单（Handoff 必填）

```text
spec_id / task_id / slice:
may_edit:
must_not_edit:
key_decisions: [Dxxx, ...]
verification_commands:
files_read: [路径, ...]
```

---

## 3. 范围锁定（Scope Lock）

开始改代码前确认：

- [ ] 每个待改文件 ∈ `may_edit` 或 spec `scope.create/modify`
- [ ] 无 forbidden 路径（`trader-cockpit/**`、`app/modules/**` 等见 CLAUDE.md）
- [ ] 不顺手 refactor 相邻文件、不改 style-only、不加未要求功能
- [ ] API/schema/行为变更已在任务包或 spec 内 — 否则停止 surface

**audit_patch** 类型：先做 diff 对照（像 T005 S0），列出「已对齐 / 需 patch / 缺失」，再动刀。

---

## 4. 实现（Implement）

### 原则

- 匹配周围代码的命名、import、错误处理粒度
- 三行重复 > 过早抽象
- 测试：任务要求或修行为时必须加；不测 trivial getter

### 按栈

| 区域 | 注意 |
|---|---|
| `app/intel/` | 后端零 LLM；FTS5 用 raw SQL；`record_agent_event` 在事务外 |
| `apps/trader-cli/` | 仓库根 `.env`；tsx 无 build；services 与 TUI/commands 同源 |
| `apps/trader-chart/` | 不改后端 API；handoff inherit stdio |
| 旧 `app/modules/` | **Forbidden** — 仅只读引用 |

### TDD（行为变更时）

1. 写/改 failing test
2. 跑 RED
3. 最小实现
4. 跑 GREEN
5. 不删已有测试除非任务明确要求

---

## 5. 验证（Verify）

任务包或 spec 里的 `verification` 为准；默认：

```bash
# Python（仓库根）
.venv/Scripts/python.exe -m pytest <test_file> -v --tb=short

# TypeScript CLI
cd apps/trader-cli && npm test
# 或单文件
cd apps/trader-cli && npm test -- src/path/to/file.test.ts

# Rust chart
cargo test -p trader-chart

# Lint（若改了 Python）
.venv/Scripts/python.exe -m ruff check <file>
```

**必须**：贴出命令 + 退出码 + 关键输出（通过数 / 失败栈）。
失败 → 修复 → 重跑；不要带着红 test 交 Handoff。

---

## 6. Handoff 模板（返回父 Agent）

父 agent 靠此验收；按结构输出：

```markdown
## Code Task Handoff

### Intent（摘要）
- task_id / spec_id / slice:
- 完成了什么（1–2 句）:

### Changes
| 文件 | 改动摘要 |
|------|----------|
| path | ... |

### Verification（证据）
| 命令 | 结果 |
|------|------|
| `...` | exit 0, N passed / 或失败详情 |

### Scope 自检
- [ ] 未改 must_not_edit / forbidden
- [ ] 改动可追溯到 task step / acceptance

### 已知缺口 / 风险
- （无则写「无」）

### 建议下一步
- （仅当 task 有明确后续 step；否则省略）
```

---

## 7. 停止并上报（Escalate）

立即停手、不猜，返回父 agent 的情况：

- spec 与代码/任务包三源冲突
- 需要改 forbidden 文件才能「完成」
- verification 环境缺失（无 `.venv`、后端未起、longbridge 未装且测硬依赖）
- 任务范围膨胀（需 >5 文件或新 API 合约但 spec 未覆盖）

---

## 8. 快速参考 — 当前活跃 Task

| Task | Spec | 性质 |
|---|---|---|
| T001 | forward-market-intel | MVP 核心已落地，维护/补 phase |
| T002 | cli-tui-v2 | completed |
| T003 | cli-tui-integration | 七页 TUI + services |
| T004 | trader-chart-ratatui | done |
| T005 | trader-longbridge-agent-cli | **audit_patch** — 见 T005.md 漂移清单 |

详细状态：`.agent-dev/README.md`
