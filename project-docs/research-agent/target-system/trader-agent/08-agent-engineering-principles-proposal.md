# 08 Agent Engineering Principles Proposal

版本：`v0.1`

状态：已采纳的项目工程原则 proposal。用于指导 trader-agent 后续 workflow、CLI/TUI、backend/shared、AI/RAG/MCP 和 agent worker 设计。

## 1. 背景

本文件沉淀我们从以下外部材料中吸收的工程原则，并映射到当前项目：

- Anthropic Claude Agent SDK research-agent demo: https://github.com/anthropics/claude-agent-sdk-demos/tree/main/research-agent
- Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Code execution with MCP: https://www.anthropic.com/engineering/code-execution-with-mcp
- Equipping agents for the real world with Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Claude think tool: https://www.anthropic.com/engineering/claude-think-tool
- Building effective agents: https://www.anthropic.com/engineering/building-effective-agents

这些材料对本项目的核心启发不是“迁移到 Claude Agent SDK”，而是：把 agent 能力产品化，靠 harness、上下文边界、工具接口、审计轨迹和人工 gate 控制复杂度。

## 2. 本项目采用的总原则

trader-agent 必须优先采用：

```text
deterministic workflow / LangGraph runtime
  + bounded LLM calls
  + backend/shared contracts
  + CLI/TUI operator surface
  + audit / approval / evidence trace
```

不得把核心系统变成：

```text
open-ended autonomous research agent
  -> arbitrary search
  -> arbitrary synthesis
  -> direct RulePack mutation or trade action
```

金融系统里的 agent autonomy 必须服务于候选生成、证据整理和解释，不得绕过规则、风控、审批和审计。

## 3. Workflow 优先，Agent Autonomy 受控

项目规则：

- 主链路优先写成 workflow graph，不优先写成开放式 autonomous agent。
- LLM 可以生成候选、解释、摘要、研究假设，但不能直接改变生产状态。
- Agent 不能静默激活 workflow、RulePack、model、memory 或交易动作。
- 每个 agentic 步骤必须有停止条件、输出 schema、审计事件和失败状态。

落地到当前项目：

- `InsightExplorationGraph` 可以探索 insight candidate。
- `AlphaResearchGraph` 只能把 insight 转成可验证 `RuleCandidate` 和 `LiteBacktestReport`。
- `ModelLearningGraph` 只能产出 challenger model evaluation 和 promotion recommendation。
- `Approval / Capability Gate` 成熟前，不得实现 workflow builder、agent-generated workflow activation 或 broker-like execution。

## 4. 长任务必须有 Harness，不靠聊天上下文续命

项目规则：

- 长运行 workflow 必须有 `run_id`、状态记录、artifact 输出和可恢复 checkpoint。
- 每次运行必须能从持久化事实重建，而不是依赖上一次对话。
- Run artifact 必须比模型上下文更权威。
- Worker 或 graph 完成时必须留下下一步可接手的结构化状态。

建议落地的 run artifact 结构：

```text
data/trader-workflows/runs/{run_id}/
  run.json
  events.jsonl
  artifacts/
    insight_candidates.json
    rule_candidates.json
    lite_backtest_reports.json
    evidence_refs.json
    evaluation_summary.json
```

短期不要强制所有 graph 立刻使用目录结构；先在 `AlphaResearchGraph v0` spec 中定义最小 artifact contract，再逐步统一。

## 5. 上下文是稀缺资源，默认渐进式披露

项目规则：

- Prompt 不应默认塞完整源码、完整文档树、完整 diff、完整市场数据。
- Workflow state 默认保存 id、summary、EvidenceRef，不保存大块原始文本或完整数据。
- 原始行情、新闻、财报、回测明细保留在 backend/artifact store，通过引用追溯。
- Agent 需要更多信息时，通过 scoped tool 调用加载，不通过预先注入所有内容解决。

落地到当前项目：

- `.agent-dev` 的 scoped reads / scoped diff 规则继续保留。
- `apps/trader-workflows` 的 parent state 保持小而稳定。
- `AlphaResearchGraph` 的 LLM 输入应是 compact evidence summary，而不是原始 K 线或全文新闻。

## 6. 工具面要小，工具结果要可压缩

项目规则：

- Tool Registry / MCP adapter 第一阶段只做低风险 read-only 工具。
- 不把大量 tool definitions 一次性暴露给模型。
- 不把大结果直接放入 LLM 上下文。
- 市场数据处理、回测统计、证据聚合先由 deterministic code 完成。
- LLM 只处理：结论候选、机制解释、缺失证据、风险与下一步。

Alpha workflow 的数据路径应是：

```text
tool/backend fetch raw data
  -> deterministic aggregation / filtering
  -> compact evidence summary
  -> LLM hypothesis / explanation
  -> EvidenceRef links raw sources
```

## 7. Skills 是操作知识，不是生产逻辑

项目规则：

- Skill/doc 可以指导 agent 和 worker 如何做事。
- 生产规则、交易边界、RulePack 激活、审批状态不得藏在 skill 里。
- Skill 必须遵守 progressive disclosure：入口短，细节按需打开。
- Skill 可以包含 validator script 或 template，但最终行为必须由 code/tests 约束。

建议落地：

```text
apps/trader-workflows/skills/alpha-research/
  SKILL.md
  candidate-family-guide.md
  evidence-requirements.md
  scripts/validate_alpha_candidate.ts
```

该目录可以作为后续 worker/agent 使用的操作手册；不要把它当 runtime dependency。

## 8. 复杂工具链后必须有 Deliberation / Policy Check

项目规则：

- 每条会生成候选规则、模型晋升建议、审批请求或高风险工具调用的 graph，都必须有 policy check node。
- Policy check node 不获取新数据，只检查已有事实是否满足推进条件。
- Policy check 的输出必须写入 audit event 或 run artifact。

`AlphaResearchGraph v0` 至少需要这些 check：

```text
candidate_family_check
evidence_completeness_check
trigger_invalidation_check
backtest_readiness_check
promotion_boundary_check
```

## 9. Subagent 只用于隔离上下文，不用于绕过责任

项目规则：

- 多 agent 适合并行证据收集、独立评估、报告撰写、代码审查。
- 主 workflow 必须负责合成和边界判断。
- Subagent 结果只是输入，不是自动真理。
- Subagent tool calls 必须可追踪到 parent run / task。

映射到 Alpha workflow：

```text
AlphaResearchGraph
  -> evidence collector
  -> hypothesis normalizer
  -> lite backtest runner
  -> alpha report writer
  -> policy / approval gate
```

这些角色必须落到 typed artifacts 和 audit events，而不是自由聊天摘要。

## 10. 金融 Alpha 候选必须可解释、可证伪、可回测

每个 alpha candidate 至少必须包含：

```text
candidate_family
sub_family
mechanism
horizon
trigger
entry_condition
exit_condition
invalidation
required_evidence
backtest_plan
risk_notes
evidence_refs
```

禁止只有 “LLM 觉得可能有效” 的 candidate。候选必须能回答：

- 机制是什么？
- 触发条件是什么？
- 什么情况下失效？
- 需要哪些证据？
- 如何避免未来数据泄漏？
- 最小回测标准是什么？
- 为什么不能直接进入 active RulePack？

## 11. 改进 Feature / Plan

| Priority | Feature / Plan | Why |
|---|---|---|
| Now | AlphaResearchGraph v0 spec | 补齐 insight -> rule candidate -> lite backtest 的 alpha 研究闭环 |
| Now | Alpha candidate contract | 把 `candidate_family`、`sub_family`、`mechanism`、`horizon`、`required_evidence`、`invalidation` 从 loose JSON 收紧为可验证字段 |
| Now | Alpha run artifact contract | 让长运行 alpha workflow 可恢复、可审计、可交接 |
| Now | Policy check nodes for AlphaResearchGraph | 防止缺证据、缺失效条件、越权晋升或自动激活 |
| Next | Compact evidence summary builder | 让 LLM 只看聚合证据，原始数据通过 EvidenceRef 追溯 |
| Next | Workflow run trace alignment | 对齐 `Stage1Runtime` 与 backend `RuntimeOrchestrator` 的 run/event 语义 |
| Later | Alpha research skill pack | 给 worker/agent 提供 progressive-disclosure 操作手册，不作为生产逻辑 |

## 12. 实施顺序

推荐下一阶段顺序：

1. 写 `AlphaResearchGraph v0 spec`。
2. 在 spec 中定义 `AlphaCandidateContract` 和 run artifact contract。
3. 把 `candidate_family` 接入 `InsightCandidate` / `RuleCandidate` 的强校验。
4. 实现 policy check nodes。
5. 实现最小 AlphaResearchGraph wrapper，复用 backend Rule Discovery / Lite Backtest。
6. 再补 `CompactEvidenceSummary` 和 run trace alignment。

暂不推进：

- workflow builder；
- agent-generated workflow activation；
- broker / paper order workflow；
- automatic RulePack mutation；
- automatic model promotion；
- 大规模 MCP tool gateway；
- 开放式 web research agent 主链路。
