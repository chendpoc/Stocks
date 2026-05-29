# Shared Agent Memory Development Plans

本目录存放 `03 Shared Agent Memory` 的可执行实施计划。

不要把 Shared Memory 的 M0-M6 实施计划放到 `02-web-agent-cockpit-development/plans/`。Cockpit 目录只承载 Web Cockpit 前端和其直接 API 接入计划。

## 状态索引

| Plan | Status | 说明 | 规格状态 |
|---|---|---|---|
| [00-m0-artifact-catalog.md](./00-m0-artifact-catalog.md) | done | M0 Artifact Catalog | revised to spec-gate format |
| [01-m1-markdown-section-index.md](./01-m1-markdown-section-index.md) | done | M1 Markdown Section Index + FTS5 reconciliation | 12/12 tests pass, M0 regression clean |
| [02-m2-corpus-search-api.md](./02-m2-corpus-search-api.md) | done | M2 Local Corpus Search API reconciliation | 12/12 tests + 22 regression pass |
| [03-m3-memory-candidate.md](./03-m3-memory-candidate.md) | done | M3 Memory Candidate Schema + Extraction | 23/23 tests + 34 regression pass |
| [04-m4-review-activation.md](./04-m4-review-activation.md) | done | M4 Candidate Review + Active Memory | **主流程 Path B**；M3 API 备用 |
| [05-m5-context-injection.md](./05-m5-context-injection.md) | done | M5 Active Memory Context Injection | 17/17 tests + 101 regression pass |
| [06-m6-audit-rebuild.md](./06-m6-audit-rebuild.md) | done | M6 Audit + Rebuild | 16/16 tests + 82 regression pass |

## M4 主流程说明

**M4 验收以 Path B 为主：** 对话文本 → `extract-preview` → 人工确认 → `POST /memory-items` 直接入库。

**M3 路径（`POST /candidates` 等批量扫描 → activate）保留为备用能力**，不作为 M4 主流程验收标准。

## 规格状态说明

| 状态 | 含义 |
|---|---|
| `revised to spec-gate format` | 已按新规格门禁修订，可继续审查或执行 |
| `spec-gated draft` | 已按规格门禁撰写，但执行前仍需最新代码盘点 |

## 创建规则

1. 先按 [../../00-workflow-router.md](../../00-workflow-router.md) 选择主 workflow。
2. 非平凡任务先使用 `module-spec-quality-gate`。
3. 每个 plan 必须包含 source-of-truth links、confirmed decisions、allowed/forbidden files、tests、acceptance-to-verification map。
4. worker prompt 必须自包含，不得引用不存在的文件、状态或路径。
