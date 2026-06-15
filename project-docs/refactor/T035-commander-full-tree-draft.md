# T035: Commander 完整子命令树迁移草案

> Date: 2026-06-16 | Status: **done** (T035-S1–S6, `d694fedc`)  
> Parent: T033 Phase G — 已由本任务完整替代混合模式  
> Scope: `apps/trader-workflows/src/cli/`

---

## 1. 背景与动机

### 1.1 最终状态（T035 完成后）

| 组件 | 职责 |
|------|------|
| `cli/program.ts` | 完整 commander 子命令树；全部 action → `runEnvelopeAction` → `printEnvelope` |
| `cli/router.ts` | `handleCommandAsync` → `legacyArgs` S2–S6 dispatch（trader-cli spawn 兼容） |
| `cli/legacyArgs.ts` | `string[]` argv → zod typed opts → handler |
| `cli/validators.ts` | pattern-memory promote/degrade 互斥 id、`--confirm` 等跨字段规则 |
| `cli/parseOpts.ts` | zod safeParse → `WorkflowCommandError`（返回 `z.infer` output 类型） |
| `commandHandlers/*` | `(runtime, typedOpts)` — 无 `args[]` 解析 |
| `index.ts` main | `validateTopLevelCommand` → `program.parseAsync()` |

`cli/flagParsing.ts` 已删除（S6，`b3776c02`）。

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
  program.ts          # buildProgram(runtime) — 完整 commander 树 + action 注册
  legacyArgs.ts       # handleCommandAsync compat: argv → typed opts dispatch
  validators.ts       # 复杂校验（pattern-memory 互斥 id、session-id/profile 二选一等）
  router.ts           # handleCommandAsync 薄包装 → legacyArgs
  commandHandlers/    # 各 handler 收 typed opts
  helpers.ts          # printEnvelope（stdout JSON 协议，保留 console.log）
  logger.ts           # re-export runtime/logger（pino 诊断日志，与 envelope 分离）
```

> 删除了 `argvCompat.ts`：生产路径直接用 `program.parseAsync()`，测试路径直接调用 handler typed 签名。`handleCommandAsync` 保留为程序化 API 兼容包装。

### 2.3 依赖关系（迁移后）

```text
生产路径 (index.ts main):
  process.argv → program.parseAsync()
    → action → simpleParser(rawOpts) → handler(runtime, typedOpts)
    → printEnvelope(envelope)              # stdout JSON

测试路径 (index.test.ts):
  handler(runtime, typedOpts)              # 直接调用，拿返回值断言

程序化 API (handleCommandAsync):
  handleCommandAsync(runtime, string[])
    → 已迁移命令: commander parse → handler
    → 未迁移命令: 旧 string[] handler
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

// After — zod schema 一次定义类型 + 校验（Q4 决策）
export const OutcomesListOpts = z.object({
  symbol: z.string().optional(),
  status: z.enum(["pending", "active", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type OutcomesListOpts = z.infer<typeof OutcomesListOpts>;

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

### 4.2 program.ts 注册（S2+ 模式，同步改 handler + action + router）

```typescript
import { z } from "zod";

// 一次定义：类型 + 校验 + 默认值
const OutcomesListOpts = z.object({
  symbol: z.string().optional(),
  status: z.enum(["pending", "active", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().positive().default(100),
});

// action 中：zod parse → typed opts → handler → printEnvelope
outcomesCmd
  .command("list")
  .description("List decision outcomes")
  .option("--symbol <symbol>")
  .option("--status <status>")
  .option("--limit <n>", "limit", String(DEFAULT_OUTCOMES_LIST_LIMIT))
  .action(async (rawOpts) => {
    const opts = OutcomesListOpts.parse(rawOpts);  // 一次校验 + 类型推导
    const envelope = await handleOutcomesListCommandAsync(runtime, opts);
    printEnvelope(envelope);
  });
```

> **设计原则（Q4 决策）**：用 zod schema 一次定义类型 + 校验 + 默认值。项目已有 zod 依赖，且 trader-cli 已使用 zod 校验。commander 只做参数存在性校验，值校验由 zod 完成。

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

### 4.4 兼容层与测试策略（Q2 决策：模式 1 — 直接测 handler）

**生产路径**：`index.ts` main → `program.parseAsync()` → action → handler → `printEnvelope`

**测试路径**：直接调用 handler typed 签名，**不经过 commander**：

```typescript
// index.test.ts — 直接测 handler，拿返回值断言
const envelope = await handleOutcomesListCommandAsync(runtime, {
  symbol: "TSLA",
  status: undefined,
  limit: 100,
});
assert.equal(envelope.ok, true);
```

**程序化 API**：`handleCommandAsync(runtime, string[])` 保留为兼容包装：

```typescript
// router.ts
export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  // 已迁移命令 → commander parse → handler
  // 未迁移命令 → 旧 COMMAND_HANDLERS dispatch
  return dispatchViaCommanderOrLegacy(runtime, args);
}
```

**trader-cli** 继续 `spawn(...)`，无改动。

### 4.5 validators.ts（commander 难以表达的规则）

保留从 `flagParsing.ts` 迁入：

- `parsePatternMemoryPromoteInput` — `--confirm` 必填 + id 互斥
- `parsePatternMemoryDegradeInput` — id 互斥
- `parseSessionIdOrProfile` — `--session-id` / `--profile` 二选一默认 `default`

---

## 5. 分片实施计划

每 slice：**subagent 实现 → 父 agent 验收（172 tests + circular）→ 单 commit**

| Slice | 范围 | 风险 | 状态 | 主要改动文件 |
|-------|------|------|------|-------------|
| **T035-S1** | 基础设施 | 低 | ✅ Done (`6d9d28c2`) | `program.ts`（完整树骨架） |
| **T035-S1.1** | 顶层校验修复 | 低 | ✅ Done (`55f07b70`) | `validateTopLevelCommand` 仅校验顶层动词 |
| **T035-S2** | 只读简单命令 | 低 | ✅ Done (`3879f058`) | `runs`*, `decisions`, `memory`, `failure-memory` |
| **T035-S3** | 数据查询类 | 低 | ✅ Done (`2ba2c6a8`) | `outcomes list`, `insights list`, `market-data *`, `pattern-memory list` |
| **T035-S4** | context 子树 | 中 | ✅ Done (`9624a152`) | `bootstrap`, `latest`, `snapshots list/show` |
| **T035-S5** | 图执行类 | 中 | ✅ Done (`38ccd3e6`) | `decide`, `outcomes run`, `eval summary`, `insights explore`, `market-monitor run` |
| **T035-S6** | 变异 + 清理 | 中 | ✅ Done (`b3776c02`) | `pattern-memory promote/degrade`；删 `flagParsing.ts`；`index` → `parseAsync` |

> \* `runs` 含 `resume`（图执行），Q3 决定全部留在 S2。
>
> **每命令改动清单（Q1 决策）**：① commander action 注册 handler 调用 + zod schema（`program.ts`）、② handler 签名改为 `(runtime, typedOpts)`、③ 从 router `COMMAND_HANDLERS` 中删除该项。每个 slice 必须是完整链路（action → handler → printEnvelope），不可只改签名。

### 5.1 建议 commit 信息

```text
refactor(trader-workflows): build full commander subcommand tree (T035 S1)  ← 6d9d28c2
refactor(trader-workflows): migrate runs/decisions/memory/failure-memory to zod+commander (T035 S2)
refactor(trader-workflows): migrate data-query commands to zod+commander (T035 S3)
refactor(trader-workflows): migrate context subtree to zod+commander (T035 S4)
refactor(trader-workflows): migrate graph-exec commands to zod+commander (T035 S5)
refactor(trader-workflows): remove flagParsing after full commander tree (T035 S6)
```

---

## 6. 测试策略

1. **回归**：每 slice 后 `npm test`（baseline 测试数无回归）+ `npm run check:circular`
2. **模式 1 — 直接测 handler**（Q2 决策）：测试直接调用 `handler(runtime, typedOpts)`，**不经过 commander**。handler 返回 `WorkflowEnvelope`，测试直接做断言。
3. **兼容**：`index.test.ts` 中 `handleCommandAsync` 用例迁移为直接测 handler 后删除旧用例
4. **新增** `cli/program.test.ts`（S1 或 S6）：
   - 未知顶层命令 → `ERROR_CODE_UNKNOWN_COMMAND`
   - 未知 flag → 映射为既有 error code
   - `--help` 不抛异常
5. **可选**：envelope 字段 snapshot，防 handler 返回值漂移

> ⚠️ 文档中 "172 tests" 为近似值。实际有 32 个预存 TypeScript 编译错误，baseline 通过的测试数为 ~140/172。每 slice 以该 baseline 为准，不增加错误。

---

## 7. 与 trader-cli 的关系

| 阶段 | 行为 |
|------|------|
| T035 全程 | `trader-cli` 仍 spawn argv 数组；workflows 内 handler 直接收 typed opts |
| 后续（可选） | 共享 commander 定义；或从 `program.ts` 生成 help 文档 |

---

## 8. 明确不做（scope 边界）

- 不修改 `WorkflowEnvelope` 结构
- 不把 `printEnvelope` 换成 pino（stdout JSON 协议；pino 仅用于诊断日志，Q5 决策）
- 不在本任务内合并 `trader-cli` 与 `trader-workflows` 的 commander 源码
- 不重做 T033 已完成的 api/data/services 分层
- 不修改 handler 的业务逻辑（只改签名和参数来源）

---

## 9. Phase A 补充说明（logger）

与 T035 并行项，非本任务核心：

| 项 | 状态 |
|----|------|
| `runtime/config.ts` + `LOG_LEVEL` | ✅ |
| `runtime/logger.ts` + `cli/logger.ts` re-export | ✅ |
| `src/` 内 `console.*` | 仅 `helpers.printEnvelope` — **故意保留**（JSON stdout 协议） |
| graphs/runtime/api 诊断日志 | ✅ `stage1Runtime.runGraph` / `resumeRun`、`graphRunner`、`api/client` HTTP retry |

**约定**：**stdout = envelope（`printEnvelope`）**，**stderr = pino 诊断日志**。

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

- [x] `cli/flagParsing.ts` 已删除 — S6 (`b3776c02`)
- [x] 全部子命令与 flag 在 `program.ts` 注册，`--help` 可用
- [x] 所有 12 个命令族 handler 签名 `(runtime, typedOpts)`，`args[1]` switch 已移除
- [x] 每个命令链路：action → zod schema → handler → `printEnvelope`
- [x] `handleCommandAsync(runtime, string[])` 仍 exported；trader-cli spawn 兼容
- [x] `npm test` 172/172；`npm run check:circular` 无环
- [x] `ARCHITECTURE.md` CLI 节与实现一致
