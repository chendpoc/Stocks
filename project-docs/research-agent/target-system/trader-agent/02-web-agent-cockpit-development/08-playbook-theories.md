# 08 Playbook Theories

## 目标与非目标

目标：实现 `/playbook-theories`，展示 Agent 从赵哥语料、人工定义和市场观察中沉淀出的交易规律理论，以及每个理论下的机器可执行规则数组。

非目标：

- 不做规则编辑器。
- 不做独立历史规律浏览库。
- 不发布规则。
- 不做回测操作。

## 概念定义

`PlaybookTheory` 是父级知识单元。它回答：

- 这是什么市场规律？
- 来源证据是什么？
- 适用于什么市场环境？
- 失败模式是什么？
- 当前哪些 signal 命中了它？

`PlaybookRule` 是 theory 下的可执行条件。每个 rule 必须有 `parentTheoryId`。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `PlaybookTheoriesPage` | route composition |
| `TheoryList` | searchable theory list |
| `TheoryDetailPanel` | thesis, source evidence, market context, failure modes |
| `TheoryRuleArray` | child PlaybookRule list |
| `CurrentMatchesPanel` | current matched signals |
| `TheoryEvidencePanel` | Zhao source excerpts and external evidence |
| `TheoryValidationPanel` | validation summary when available |

## 数据输入输出

Inputs:

- `PlaybookTheory[]`
- `PlaybookRule[]`
- `EvidenceRef[]`
- `TheoryMatch[]`
- `SignalViewModel[]`

Outputs:

- filter theories
- select theory
- open matched signal
- open source evidence
- open chat with theory context

## API 与更新策略

Current state:

- no stable backend read endpoint yet
- use mock fallback

Phase 1 required:

- `GET /api/playbook-theories`
- `GET /api/playbook-theories/{theory_id}`

Update model:

- fetch on page entry
- manual refresh

## First-Version Theory Examples

- 减持三天理论
- BTC 先动，币股延迟反应
- 周五期权日多空双杀路径
- 回补缺口理论
- 节假日前被动减持
- 市值区间回归型波段逻辑

## 验收标准

- Theory is the primary object; rules are shown as child array.
- Every displayed rule has `parentTheoryId`.
- Source evidence is visible and linked.
- Current matched signals are visible.
- User can open Chat with selected theory context.
- No rule edit, publish, approval or backtest action appears.

## 测试场景

- Component test theory detail with multiple rules.
- Component test candidate theory state.
- Component test current matched signals panel.
- Playwright smoke: open theories, select theory, open matched signal.
