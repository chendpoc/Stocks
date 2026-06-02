# Cursor 配置说明

> 本文档说明如何配置 Cursor 以使用本项目的 workflow 工具链。

---

## 1. Superpowers Skill

已有 `.superpowers/` 目录（当前仅 brainstorm）。

### 开发时使用方式

在 Cursor Composer 中，通过 `@` 或 斜杠命令 开启 Superpowers：

```text
@superpowers 按 spec 实现 Phase 0
```

Superpowers 内部流程：**Brainstorm → Plan → Implement → Review → Verify**

### 建议扩展的 Skills

基于 `project-docs/workflows/agent-dev-workflow.md` 的 Phase 划分，后续可扩展以下 Superpowers skills：

| Skill | 对应 Phase | 用途 |
|---|---|---|
| `clarify` | Phase 2 | 发现模糊决策，生成 decision-record |
| `spec-writer` | Phase 3 | 生成 spec.md + spec.json |
| `task-split` | Phase 5 | 拆分工作包 |
| `dev-plan` | Phase 6 | 生成 dev-plan.md + dev-plan.json |
| `review` | Phase 9 | 对照 spec scope 做结构化 review |

---

## 2. CodeGraph MCP

### 已安装状态

```bash
npm list -g @colbymchenry/codegraph
# → @colbymchenry/codegraph (已安装)

codegraph index
# → 302 files, 5,382 nodes, 12,030 edges
```

### 启动 MCP Server

在开发前启动（或常驻后台）：

```bash
cd D:\workspace\01-products\stock-community-summary
codegraph serve --watch
```

`--watch` 模式会在文件变更时自动重建索引。

### Cursor MCP 连接

在 Cursor 设置中添加 MCP server：

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "npx",
      "args": ["-y", "@colbymchenry/codegraph", "serve"],
      "cwd": "D:\\workspace\\01-products\\stock-community-summary"
    }
  }
}
```

或直接通过 CLI `codegraph serve` 启动后 Cursor 自动发现。

### AI Agent 使用方式

连接后，Cursor Composer 中的 agent 自动获得以下 MCP 工具：

| MCP Tool | 用途 |
|---|---|
| `codegraph_context` | 获取指定模块/函数的上下文（上下游依赖） |
| `codegraph_explore` | 探索某个文件/目录的代码结构 |
| `codegraph_search` | 按名称搜索函数/类/符号 |
| `codegraph_callers` | 查找谁调用了某个函数 |
| `codegraph_callees` | 查找某个函数调用了谁 |
| ... | 共 45 个 MCP 工具 |

**使用规则**（建议写入 Cursor Rules）：

```text
规则：AI agent 在需要理解代码结构时，优先使用 codegraph_context + codegraph_explore，
而不是 grep_files 或逐个 read_file。
grep_files 只在需要搜索特定字符串（非语义查询）时使用。
```

---

## 3. Cursor Rules 建议

在 Cursor 的 Project Rules 中追加：

```text
## Spec-Driven Workflow

1. 任何非平凡任务，先读 .agent-dev/specs/<feature>/spec.json 确认 scope 和 forbidden files。
2. 修改文件前对比 spec.json 的 scope.create / scope.forbidden，发现越界立即停止并报告。
3. 实现完成后，生成 review-findings.json（按 .agent-dev/memory/schemas.md §4 格式）。
4. 决策点（超过一种合理答案）必须先询问用户，确认后写入 decision-record.json。

## CodeGraph 优先

1. 理解代码结构，先调 codegraph_context / codegraph_explore
2. grep_files 仅用于搜索特定字符串
3. read_file 仅用于读取已知路径的具体文件
```

---

## 4. 开发检查清单

在开始任何开发任务前，确认：

- [ ] CodeGraph MCP server 已启动（`codegraph serve --watch`）
- [ ] 已读取对应 `spec.json`（scope / forbidden / decisions / acceptance）
- [ ] 已读取对应 `task.json`（steps / verification / depends_on）
- [ ] 已读取 `worker-prompt.md`（如有）
- [ ] 已读取 `CLAUDE.md`（项目规则和 Gotchas）
- [ ] 已读取 `.agent-dev/context/code_map.md`（项目结构快速定位）
- [ ] Superpowers skill 已开启（如需要）