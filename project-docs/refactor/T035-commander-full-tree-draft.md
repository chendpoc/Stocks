# T035: Commander 完整子命令树迁移草案

> Date: 2026-06-16 | Status: proposed  
> Parent: T033 Phase G（混合模式 — commander 仅校验顶层命令）  
> Scope: `apps/trader-workflows/src/cli/`

---

## 1. 背景与动机

### 1.1 当前状态（T033 Phase G 混合模式）

| 组件 | 职责 |
|------|------|
| `cli/program.ts` | commander 注册 12 个顶层命令；`validateTopLevelCommand()`；剥离 `--json` |
| `cli/router.ts` | `COMMAND_HANDLERS` 手动 dispatch；`handleCommandAsync(runtime, args[])` |
| `cli/flagParsing.ts` | 子命令 flag 手工解析（`indexOf`、`parseOptionalFlagValue` 等） |
| `commandHandlers/*` | `args[1]` / `switch` 子命令路由；从 `flagParsing` 取 flag |

commander 配置了 `allowUnknownOption(true)` + `allowExcessArguments(true)`，子命令与 flag **未**由 commander 管理。

### 1.2 混合模式的问题（长期维护）

- **双轨解析**：commander + `flagParsing` 两套规则，认知成本高
- **清单漂移**：`TOP_LEVEL_COMMANDS` 与 `COMMAND_HANDLERS` 需手动同步
- **无子命令 help**：`trader-workflows outcomes --help` 几乎无用
- **弱 flag 校验**：`--symobl` 等拼写错误透传到业务层才报错
- **扩展成本高**：新 flag 需改 `cliFlags` + `flagParsing` + handler
- **与 trader-cli 不对称**：`trader-cli` 已是完整 commander 树

### 1.3 混合模式可接受的原因（为何 T033 先这样做）

- `handleCommandAsync(runtime, args[])` 契约不变，`index.test.ts` 与 `trader-cli` spawn 无需改动
- 子命令树深，一次性迁移回归面大
- `WorkflowCommandError` + JSON envelope 已定型

---

## 2. 目标架构

### 2.1 原则

1. **单一真相源**：`cli/program.ts` = 完整子命令树 + 全部 options
2. **结构化 handler**：`(runtime, opts)` 替代 `(runtime, args: string[])`
3. **兼容层保留**：`handleCommandAsync(runtime, string[])` 薄包装，内部转 commander
4. **协议输出不变**：`printEnvelope` 仍 `console.log(JSON)` — 非 pino 日志
5. **错误语义不变**：commander 错误映射为 `WorkflowCommandError` + `ERROR_CODE_*`

### 2.2 目标目录结构

```text
cli/
  program.ts          # buildProgram(runtime) — 完整 commander 树
  argvCompat.ts         # string[] ↔ commander parse 适配（测试 / trader-cli）
  validators.ts         # pattern-memory 互斥 id 等复杂校验
  router.ts             # parse → dispatch → 变薄
  flagParsing.ts        # 删除（或仅剩 validators 迁入后删除）
  commandHandlers/      # 各 handler 收 typed opts
  helpers.ts            # printEnvelope（stdout 协议，保留 console.log）
  logger.ts             # pino（诊断日志，与 envelope 分离）
```

### 2.3 依赖关系（迁移后）

```text
index.ts
  → router.handleCommandAsync(runtime, argv)
      → argvCompat.toCommanderArgv(argv)   # 可选，兼容 string[]
      → program.parseAsync(...)
      → handler(runtime, opts)
      → printEnvelope(envelope)              # stdout JSON
```

---

## 3. 目标 CLI 树（与现实现 1:1）

```text
trader-workflows [--json]

memory
  init

runs
  list       [--limit <n>]                         default 50
  show       <run_id>
  resume     <run_id>
  monitor    [--limit] [--status] [--graph-name]
  trace      <run_id>

decide <symbol> [--setup <name>] [--gate-json <json>]

decisions
  list       [--symbol] [--model-version] [--limit]    default 500

context
  bootstrap  [--session-id|--profile] [--symbol] [--max-chars] [--output]
  latest     [--session-id|--profile] [--symbol]
  snapshots
    list     --symbol <sym> [--limit]                  default 20
    show     <snapshot_id>

outcomes
  list       [--symbol] [--status] [--limit]           default 100
  run        --due [--symbol]

eval
  summary    [--symbol] [--model-version] [--limit]    default 500

insights
  explore    --symbol <sym> --window <window>
  list       [--symbol] [--verification-status] [--limit]   default 50

pattern-memory
  list       [--symbol] [--pattern-id] [--status] [--limit]
  promote    --confirm (--pattern-memory-id <id> | --candidate-id <id>)
  degrade    (--pattern-memory-id <id> | --pattern-id <id>) [--reason]

failure-memory
  list       [--symbol] [--type|--failure-type] [--setup] [--status] [--limit]

market-monitor
  run        --symbols <csv> --timeframes <csv>
             [--limit] [--min-required] [--allow-live-fallback]

market-data
  fetch      --symbol <sym> [--timeframe] [--limit] [--min-required] [--allow-live-fallback]
  health     [--symbol]
  quality    --symbol <sym> [--timeframe] [--limit] [--min-required]
```

---

## 4. 代码形态示例

### 4.1 Handler 签名迁移

```typescript
// Before
export async function handleOutcomesListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const status = parseOptionalOutcomeStatus(args);
  const limit = parsePositiveLimitFlag(args, DEFAULT_OUTCOMES_LIST_LIMIT);
  ...
}

// After
export type OutcomesListOpts = {
  symbol?: string;
  status?: OutcomeListStatus;
  limit: number;
};

export async function handleOutcomesListCommandAsync(
  _runtime: Stage1Runtime,
  opts: OutcomesListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listDecisionOutcomes({
    symbol: opts.symbol,
    status: opts.status,
    limit: opts.limit,
  });
  ...
}
```

### 4.2 program.ts 注册

```typescript
const outcomesCmd = program.command("outcomes").description("Decision outcomes");

outcomesCmd
  .command("list")
  .description("List decision outcomes")
  .option("--symbol <symbol>")
  .option("--status <status>")
  .option("--limit <n>", "positive integer", String(DEFAULT_OUTCOMES_LIST_LIMIT))
  .action(async (opts) => {
    const envelope = await handleOutcomesListCommandAsync(runtime, {
      symbol: opts.symbol,
      status: parseOutcomeStatus(opts.status),
      limit: parsePositiveInt(opts.limit, DEFAULT_OUTCOMES_LIST_LIMIT),
    });
    printEnvelope(envelope);
  });
```

### 4.3 错误映射

```typescript
program.exitOverride((err) => {
  if (err instanceof CommanderError) {
    throw mapCommanderErrorToWorkflowError(err);
  }
  throw err;
});
```

保持 JSON envelope 的 `error.code` / `error.message` 与现实现一致。

### 4.4 兼容层（index.test.ts / trader-cli）

```typescript
export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  return runProgramAsync(runtime, args, { json: args.includes("--json") });
}
```

`trader-cli` 继续 `spawn(["outcomes", "list", "--symbol", "TSLA", "--json"])`，无需改动。

### 4.5 validators.ts（commander 难以表达的规则）

保留从 `flagParsing.ts` 迁入：

- `parsePatternMemoryPromoteInput` — `--confirm` 必填 + id 互斥
- `parsePatternMemoryDegradeInput` — id 互斥
- `parseSessionIdOrProfile` — `--session-id` / `--profile` 二选一默认 `default`

---

## 5. 分片实施计划

每 slice：**subagent 实现 → 父 agent 验收（172 tests + circular）→ 单 commit**

| Slice | 范围 | 风险 | 主要改动文件 |
|-------|------|------|-------------|
| **T035-S1** | 基础设施 | 低 | `program.ts`（完整树骨架）、`argvCompat.ts`、`router.ts` 接入；行为不变 |
| **T035-S2** | 只读简单命令 | 低 | `runs`, `decisions`, `memory`, `failure-memory` handlers |
| **T035-S3** | 数据查询类 | 低 | `outcomes list`, `insights list`, `market-data *`, `pattern-memory list` |
| **T035-S4** | context 子树 | 中 | `bootstrap`, `latest`, `snapshots list/show` |
| **T035-S5** | 图执行类 | 中 | `decide`, `outcomes run`, `eval summary`, `insights explore`, `market-monitor run` |
| **T035-S6** | 变异 + 清理 | 中 | `pattern-memory promote/degrade`；删 `flagParsing.ts`；更新 `ARCHITECTURE.md` |

### 5.1 建议 commit 信息

```text
refactor(trader-workflows): add commander argv compat layer (T035 S1)
refactor(trader-workflows): migrate runs/decisions/memory handlers to commander opts (T035 S2)
...
refactor(trader-workflows): remove flagParsing after full commander tree (T035 S6)
```

---

## 6. 测试策略

1. **回归**：每 slice 后 `npm test`（172）+ `npm run check:circular`
2. **契约**：`index.test.ts` 中所有 `handleCommandAsync(runtime, [...])` 用例必须继续通过
3. **新增** `cli/program.test.ts`（S1 或 S6）：
   - 未知顶层命令 → `ERROR_CODE_UNKNOWN_COMMAND`
   - 未知 flag → 映射为既有 error code
   - `--help` 不抛异常
4. **可选**：envelope 字段 snapshot，防 handler 返回值漂移

---

## 7. 与 trader-cli 的关系

| 阶段 | 行为 |
|------|------|
| T035 全程 | `trader-cli` 仍 spawn argv 数组，workflows 内 `argvCompat` 适配 |
| 后续（可选） | 共享 commander 定义；或从 `program.ts` 生成 help 文档 |

---

## 8. 明确不做（scope 边界）

- 不修改 `WorkflowEnvelope` 结构
- 不把 `printEnvelope` 换成 pino（stdout = 机器协议）
- 不在本任务内合并 `trader-cli` 与 `trader-workflows` 的 commander 源码
- 不重做 T033 已完成的 api/data/services 分层

---

## 9. Phase A 补充说明（logger）

与 T035 并行项，非本任务核心：

| 项 | 状态 |
|----|------|
| `runtime/config.ts` + `LOG_LEVEL` | ✅ |
| `cli/logger.ts`（pino） | ✅ 文件存在，**0 处 import** |
| `src/` 内 `console.*` | 仅 `helpers.printEnvelope` — **故意保留**（JSON stdout 协议） |
| graphs/runtime 诊断日志 | 未接入 logger |

**补全 Phase A 建议**：在 `stage1Runtime`、graph 节点、HTTP 重试等路径使用 `logger.debug/info/warn`，约定 **stdout = envelope，stderr = 日志**。

---

## 10. 工作量估算

| Slice | 估时 |
|-------|------|
| S1 | ~1h |
| S2–S3 | ~2h |
| S4–S5 | ~3h |
| S6 | ~1h |
| **合计** | **~7h** |

---

## 11. 验收标准

- [ ] `cli/flagParsing.ts` 已删除（逻辑迁入 `program.ts` + `validators.ts`）
- [ ] 全部子命令与 flag 在 `program.ts` 注册，`--help` 可用
- [ ] `handleCommandAsync(runtime, string[])` 仍 exported，测试与 trader-cli 兼容
- [ ] `npm test` 172/172；`npm run check:circular` 无环
- [ ] `ARCHITECTURE.md` CLI 节与实现一致
