# CLI TUI Integration (T003) — Worker Prompt

**Spec:** `.agent-dev/specs/cli-tui-integration/` · **Task:** `T003.json` · **Slices:** `.agent-dev/tasks/T003-slices/`

## 硬约束

| ID | 规则 |
|----|------|
| D201 | 业务逻辑仅在 `apps/trader-cli/src/services/` |
| D202 | 菜单 7 项，键 `1-7` / `Ctrl+1-7` |
| D203 | Dashboard `focusedSymbol` + `[s]` scan + `[g]` report + chart |
| D204 | `GET /api/intel/market/status` 只读；`data status` 不得 POST ingest |
| D205 | `server start` 用 `findRepoRoot()` 作 cwd |
| D206 | 一次只做一个 slice；I0→I1→I2→I3 串行 |

**禁止：** `app/modules/**`, `app/core/**`, `intel/db/schema.py`, 编辑 plan 文件

## 验收索引

| 命令 | ID |
|------|-----|
| `pytest .../test_intel_market_status.py` | V303 |
| `cd apps/trader-cli && npm test` | V302 |
| 本机 TTY `npx tsx src/index.ts` | V301 |

## Slice 顺序

见 `T003-slices/README.md`。每个 slice 文件含 **May edit / Do NOT / Depends on / Acceptance**。
