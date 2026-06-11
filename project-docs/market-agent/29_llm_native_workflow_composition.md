# 29. LLM-Native Workflow Composition — LLM 自主组建 Workflow 的设计范式

> 状态: design | 依赖: `14_llm_reasoning_strategy.md`, `19_planning_mode_design.md` | 优先级: Phase 2-3 | 更新: 2026-06-11

## 1. 设计哲学

**从"开发者预定义 Pipeline"到"LLM 在约束框架内自主组合 Workflow"。**

当前 DecisionGraph 的 10 个节点是开发者写死的。方案 B 的轻量 Pipeline 只保留确定性外壳（数据清洗、DB 读写、格式输出），其余思考节点由 LLM 根据任务内容动态决定步序。

但纯 PSEV（LLM 自由发挥）有不可控风险。更好的方案是"三明治架构"——LLM 在预设模板的基础上微调，每次输出必须过 Schema 校验层。这样既保留了 LLM 的动态自主性，又用确定性的校验层兜底。

---

## 2. 核心范式：Plan-Select-Execute-Validate (PSEV)

```
用户输入 → [P] 分析任务 → 生成节点序列
              ↓
          [S] 选择每个节点的工具子集
              ↓
          [E] 按顺序执行节点
              ↓
          [V] 验证输出质量 → 通过/重试
```

**这不是 Planning 模式的替代品**——Planning 模式（19 号文档）管的是"把一个大任务拆成几个子问题"。PSEV 管的是"每个子问题内部怎么组织思考步骤"。

```
Planning 层（粗粒度）:     "分析 TSLA" → [Step 1: 数据收集] [Step 2: 证据分析] [Step 3: 结论]
PSEV 层（细粒度）:          每个 Step 内部 → [P] 想步骤 → [S] 选工具 → [E] 执行 → [V] 验证
```

---

## 3. 三明治架构

**LLM 的自由度被严格限制**：不是"随便设计一个 workflow"，而是"在现有模板基础上做有限修改，且每个修改必须过校验层"。

```
Layer 1 — 预设模板（确定性，不可破坏）
  ├─ DecisionGraph 模板
  ├─ OutcomeGraph 模板
  ├─ EvaluationGraph 模板
  └─ 用户可自定义新模板
      ↓ LLM 从这里选择/参考

Layer 2 — LLM 动态组合（在约束框架内）
  ├─ 从模板中选节点 + 自定义新节点
  ├─ 声明每个节点的 I/O schema
  └─ 声明节点间依赖关系
      ↓ 生成的 workflow 在这里校验

Layer 3 — 系统校验（确定性，不可绕过）
  ├─ 节点级: 输入 schema 校验 → 执行 → 输出 schema 校验
  ├─ 流程级: 依赖检查、数据源 ≥3、搜索后验证
  └─ 不通过 → 拒绝执行 + 反馈给 LLM 重新规划
```

### 3.1 Layer 1 — 预设模板（从 LangGraph 迁移的标准 recipe）

```typescript
const PRESET_WORKFLOWS: Record<string, WorkflowTemplate> = {
  decision: {
    name: "DecisionGraph - 标准决策流程",
    nodes: [
      { id: "normalize_input",       type: "DETERMINISTIC", schema: normalizeInputSchema },
      { id: "build_context_snapshot", type: "DETERMINISTIC", schema: buildContextSnapshotSchema },
      { id: "build_evidence",        type: "LLM",           schema: evidenceSchema },
      { id: "generate_contra",       type: "LLM",           schema: contraSchema },
      { id: "generate_envelope",     type: "DETERMINISTIC", schema: envelopeSchema },
      { id: "validate_envelope",     type: "VALIDATION",    schema: validateEnvelopeSchema },
      { id: "persist",               type: "DETERMINISTIC", schema: persistSchema },
    ],
    edges: [
      { from: "normalize_input", to: "build_context_snapshot" },
      { from: "build_context_snapshot", to: "build_evidence" },
      { from: "build_evidence", to: "generate_contra" },
      { from: "generate_contra", to: "generate_envelope" },
      { from: "generate_envelope", to: "validate_envelope" },
      { from: "validate_envelope", to: "persist" },
    ],
    rules: [
      "evidence_sources >= 3",
      "confidence_contribution: 0.0-1.0",
      "contra_text: non-empty",
    ],
  },
  
  outcome: {
    name: "OutcomeGraph - 标准回标流程",
    nodes: [ /* ... */ ],
    edges: [ /* ... */ ],
    rules: [ /* ... */ ],
  },
};
```

### 3.2 Layer 2 — LLM 动态组合

在预设模板基础上，LLM 可以：
- 从模板中移除不适用的节点
- 添加新的 LLM 推理节点
- 调整部分节点顺序（受规则约束）
- 声明每个自定义节点的 I/O schema

但不能：
- 删除确定性节点（normalize_input, persist 等）
- 违反规则（跳过验证步骤、数据源不足 3 个等）

### 3.3 Layer 3 — 节点级 I/O 双端校验

```typescript
const evidenceSchema: NodeSchema = {
  input: z.object({
    symbol: z.string(),
    setupName: z.string(),
    features: z.record(z.unknown()).optional(),
    marketState: z.record(z.unknown()).optional(),
  }),
  output: z.object({
    evidenceText: z.string().min(50).max(300),
    confidenceContribution: z.number().min(0).max(1),
    evidenceSources: z.array(z.string()).min(3),
    dataQualityScore: z.number().min(0).max(100).optional(),
  }),
};

async function executeNode(node: WorkflowNode, input: unknown): Promise<unknown> {
  // 1. 输入校验
  const validatedInput = node.schema.input.parse(input);
  
  // 2. 执行
  const rawOutput = await node.executor(validatedInput);
  
  // 3. 输出校验
  const validatedOutput = node.schema.output.parse(rawOutput);
  
  return validatedOutput;
}
```

**校验失败不是报错——是反馈给 LLM 的具体修改建议**：

```
[校验失败] generate_contra:
  - contraText: 期望 min 50 字符，实际 32 字符 ← 太短，需要更具体的反驳
  - qualityScore: 期望 0.0-1.0，实际 1.5 ← 超范围，请修正
  - criteriaScores.riskIdentification: 缺失 ← 风险评估是必填项

请根据以上反馈重新生成此节点的输出。
```

---

## 4. 完整防护链

```
LLM 生成 workflow
  ↓
Layer 1 检查: 节点是否在模板库中存在？→ 存在 → 用模板的 schema
                                    → 不存在 → 要求 LLM 声明 schema
  ↓
Layer 2 执行: 每个节点执行前校验输入 → 执行 → 校验输出
  ↓
节点校验失败 → 反馈具体修改建议给 LLM → LLM 重新生成 → 再次校验
  ↓
全部通过 → Layer 3 全局校验 → 规则检查 → 通过 → 输出
```

**三道防线，LLM 每轮只能犯一个错误——被校验层拦截后必须修正才能继续。**

---

## 5. SOTA 对标

| 框架/Library | 输入校验 | 输出校验 | 流程校验 | 模板库 | 执行引擎 |
|---|---|---|---|---|---|
| **LangGraph SC Agents** | ❌ | ✅ Pydantic | ❌ | ❌ | StateGraph |
| **Instructor** | ❌ | ✅ Pydantic + 自动重试 | ❌ | ❌ | 无（纯 SDK） |
| **DSPy** | ✅ 类型签名 | ✅ 类型签名 | ❌ | ❌ | 无（纯 SDK） |
| **Vercel AI SDK** | ❌ | ✅ Zod (experimental_output) | ❌ | ❌ | generateText |
| **Guidance/LMQL** | ❌ | ✅ 正则约束生成 | ❌ | ❌ | 需修改推理栈 |
| **Shannon/ShanClaw** | ✅ | ✅ | ⚠️ 部分 | ❌ | Temporal |
| **我们的三明治架构** | ✅ Zod 双端 | ✅ Zod 双端 | ✅ 全局规则 | ✅ 预设模板库 | 30 行 Pipeline → Temporal |

**我们的方案四个维度全齐**——不是因为比别人聪明，而是因为"交易领域"对可靠性的要求天然高于通用 Agent 领域。三个独特的差异化设计：

| 设计 | SOTA 中有吗 | 为什么独特 |
|---|---|---|
| **预设模板库** | ❌ | 通用框架不提供"DecisionGraph 应该包含哪些节点"——这是我们的领域知识 |
| **节点级 I/O 双端校验** | LangGraph/Shannon 有类似 | 我们的 Zod schema 同时校验输入和输出——大部分框架只校验输出 |
| **流程级全局规则** | ❌ | 这是我们的 EvidenceGuardrail 体系——通用框架不定义这些 |

---

## 6. LLM-Native Workflow 的失效场景与防护

| 失效场景 | 症状 | 防护 |
|---|---|---|
| **规划不合理** | 节点顺序错了、遗漏关键步骤 | [P] 阶段 5 条硬性规则约束 + [V] 阶段拒绝执行 |
| **工具调用失败传导** | VERIFY_URL 403 → 后续节点拿不到验证数据 | [V] 阶段逐节点检查，失败标记传递给下游 |
| **成本失控** | LLM 规划了太多 THINK 节点 | 全局 maxSteps + Token 上限护栏 |
| **语义漂移** | 第 5 步偏离了原始任务方向 | 每个节点的 system prompt 注入原始任务上下文 |
| **PSEV + Planning 嵌套炸** | 3 Step × 9 节点 = 27 次 LLM 调用 | Planning 层做去重和批处理 |

---

## 7. 执行引擎升级路线

```
Phase 1（当前）:
  保持 LangGraph — 先不折腾替换，把功能完整性做完

Phase 2（轻量替换）:
  DecisionGraph/OutcomeGraph/EvaluationGraph
    → 30 行 async Pipeline（去 LangGraph 依赖）
  原因: 这些 workflow 短（< 2min），不需要持久化

Phase 4（交易执行层 — 引入 Temporal）:
  Order Agent: DecisionEnvelope → Risk Engine → Human Approval → 下单
  原因: 跨时段执行链（信号 ≤ 秒 → 等待审批 ≤ 小时 → 下单 ≤ 秒）
  Temporal 的 durable execution 为这种场景而生
  已内置: 崩溃恢复、自动重试、超时控制、完整执行历史

远期（按需）:
  如果 Temporal 在 Order Agent 上表现好，考虑把 Daemon 定时唤醒
  也迁移到 Temporal Schedule/Cron — 统一 workflow 管理
```

### 7.1 Temporal 在三明治架构中的定位

Temporal 不替代我们的 Schema 校验层——它是执行层：

```
Layer 1 — 预设模板          ← 不变（我们的领域知识）
Layer 2 — LLM 动态组合       ← 不变（PSEV 范式）
Layer 3 — Schema 校验        ← 不变（Zod/Pydantic 双端校验）
Layer 4 — 执行引擎           ← LangGraph → 30 行 Pipeline → Temporal（渐进升级）
```

**Temporal 管的是"怎么可靠地执行"——重试、超时、崩溃恢复、执行历史。Schema 校验仍然是我们自己实现**——Temporal 不懂"evidence_sources >= 3"是什么意思。

### 7.2 Temporal vs 其他执行引擎

| 能力 | LangGraph | 30 行 Pipeline | Temporal |
|---|---|---|---|
| 节点编排 | ✅ StateGraph | ✅ async/await | ✅ Workflow |
| 崩溃恢复 | ⚠️ MemorySaver 重启丢失 | ❌ 整个 workflow 丢失 | ✅ 从断点继续 |
| 重试策略 | ❌ | ❌ | ✅ 指数退避 + 最大重试 |
| 超时控制 | ❌ | ⚠️ 手动 setTimeout | ✅ activity 级别超时 |
| 执行历史 | ❌ | ❌ | ✅ 自动记录 |
| 补偿/回滚 | ❌ | ❌ | ✅ Saga 模式 |
| 定时触发 | ❌ | ❌ | ✅ Cron + Schedule |
| 依赖大小 | 300KB+ | 0KB | Temporal Server (Docker/进程) |
| 学习成本 | 中 | 零 | 中高 |
| 适用场景 | 短 workflow | 短 workflow | 需可靠性的长 workflow |

---

## 8. 渐进替换路线

```
Phase 2b（保留 LangGraph，验证可行性）:
  [ ] DecisionGraph 的 build_evidence / generate_contra 改为 PSEV 模式
  [ ] 其余 8 个确定性节点保持不变
  [ ] 对比: PSEV 版本 vs 原版 DecisionGraph 的决策质量

Phase 2c（验证成功后，去 LangGraph）:
  [ ] 30 行 async pipeline 替代 StateGraph
  [ ] PSEV 覆盖全部思考节点
  [ ] 确定性节点保持预定义
  [ ] 引入三明治架构的 Layer 1 模板库 + Layer 3 节点级校验

Phase 3（全面 LLM-Native）:
  [ ] 所有 workflow 统一走 PSEV 模式
  [ ] LLM 可以跨 workflow 组合节点（不再区分 Graph 边界）

Phase 4（交易执行层 — 引入 Temporal）:
  [ ] Order Agent 用 Temporal Workflow + Activities 实现
  [ ] 确定性节点 → Temporal Activity
  [ ] 依赖关系 → Workflow 代码中的 await 顺序
  [ ] 失败重试 → Temporal Retry Policy
  [ ] 超时控制 → Temporal Timeout
  [ ] 崩溃恢复 → Temporal Durable Execution
```

---

## 9. 关键决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| LLM 决定步序范围 | 仅思考节点 | 确定性节点（DB 读写/数据清洗）不能由 LLM 决定 |
| 节点类型 | 9 种（THINK/FETCH*/SEARCH*/VERIFY/QUERY/SYNTHESIZE/CONTRA/SWARM） | 覆盖所有思考场景 |
| 模板库 | 内置预设 + 用户扩展 | 提供最佳实践参考 + 降低 LLM 规划难度 |
| 校验方式 | Zod 双端（输入+输出）+ 全局规则 | LLM 输出不可信，每次输出必须验证 |
| 校验失败 | 反馈给 LLM 重新生成 | 不报错——给具体修改建议 |
| 执行引擎（短 workflow） | 30 行 async Pipeline | 够用——不需要 LangGraph 的 checkpoint |
| 执行引擎（长 workflow） | Temporal | Order Agent 需要 durable execution |
| 去 LangGraph 时机 | Phase 2c（验证 PSEV 可行后） | 先不做破坏性变更 |

---

## 10. 参考源

- 本仓库 `14_llm_reasoning_strategy.md` §3-4 — Evidence Builder + Contra Generator
- 本仓库 `19_planning_mode_design.md` — Planning 模式三阶段设计
- 本仓库 `decisionGraph.llmNodes.ts` — 现有 build_evidence / generate_contra 实现
- 本仓库 `26_kocoro_architecture_reference.md` — Shannon/ShanClaw 三层架构
- LangGraph Self-Correcting Agents: https://docs.langchain.com/oss/python/langchain/structured-output
- Instructor: https://python.useinstructor.com/
- DSPy: https://dspy.ai/
- Vercel AI SDK experimental_output: https://ai-sdk.dev/
- Temporal TypeScript SDK: https://docs.temporal.io/develop/typescript/
