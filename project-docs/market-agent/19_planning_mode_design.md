# 19. Agent Planning Mode — ChatAgent 多步任务规划

> 状态: design | 依赖: `14_llm_reasoning_strategy.md`, `16_ai_agent_book_reference.md`, `18_memory_and_conversation_design.md`

## 1. 文档目的

`chatReAct` 的 ReAct 循环在大多数场景下足够——Agent 边想边做，动态决策每一步。但当任务涉及明确的"先 X 后 Y"依赖链时（如"先检索胜率最高的 setup，再对它做深度分析"），ReAct 的效率下降：Agent 可能反复检索、上下文膨胀、步骤混乱。

本文档定义 **Planning 模式**——在 ChatAgent 的 ReAct 循环之前插入一个轻量规划步骤，把多步依赖链变成"先规划再执行"。设计参考 LangGraph Plan-and-Execute 和 AutoGPT 的规划机制，结合我们系统的特点（交易分析场景、已有 Swarm 复杂度评分）量身定制。

---

## 2. Planning 的三个核心问题

### 2.1 如何分解？

**把模糊需求变成具体子任务。**

| 维度 | 规则 |
|---|---|
| **分解粒度** | 每步 = "一次有意义的 ReAct 会话"，不是单次工具调用。涉及 ≥2 个工具或 ≥1 个工具的多次使用 |
| **范围边界** | 每步必须有明确的"完成标志"（`expectedOutput`），两个步骤的产出不能相同 |
| **最大步数** | `max_plan_steps = 5`（防止过度分解） |
| **最小描述** | 每条 description ≥ 30 字符且包含具体标的/setup/操作 |

**Plan 结构**：

```typescript
interface Plan {
  steps: PlanStep[];
}

interface PlanStep {
  index: number;                    // 步骤编号（1-based）
  description: string;              // 自然语言描述（≥30 字符）
  toolHints: string[];              // 建议使用的工具名列表
  expectedOutput: string;           // 完成标志：产出什么 artifact
  dependsOn: number[];              // 依赖的前置步骤 index
  maxRetries: number;               // 最大重试次数（默认 1）
}
```

**示例**：用户说"找出近一个月胜率最高的 setup，然后对这个 setup 做深度分析"：

```json
{
  "steps": [
    {
      "index": 1,
      "description": "检索过去 30 天所有活跃 setup 的胜率数据，找出胜率最高的 setup 及其标的",
      "toolHints": ["queryPatternHistory", "getSignals"],
      "expectedOutput": "最高胜率 setup 名称 + 标的 + 胜率数值",
      "dependsOn": [],
      "maxRetries": 1
    },
    {
      "index": 2,
      "description": "对 Step 1 找到的标的和 setup 做深度证据收集",
      "toolHints": ["fetchMarketBars", "fetchRegime", "webSearch", "fetchUrl"],
      "expectedOutput": "该 setup 在 current market regime 下的完整证据链 + 置信度",
      "dependsOn": [1],
      "maxRetries": 1
    }
  ]
}
```

### 2.2 如何执行？

**确定依赖关系和执行顺序。并行 vs 串行、失败重试。**

```
Plan → 拓扑排序 → 依赖图分层
    │
    ├─ Layer 1（无依赖步骤）→ Promise.all 并行
    │
    ├─ Layer 2（依赖 Layer 1）→ 获取前置结果后并行
    │
    └─ Layer N → ...

每步执行：
  1. 启动 chatReAct 子会话（独立上下文）
  2. system prompt 注入 Plan 上下文 + 当前步骤的 description 和 toolHints
  3. 完成后验证 expectedOutput
     ├─ 符合 → 标记 done → 下一步
     └─ 偏离 → 触发 Re-plan（最多 1 次）
```

**防依赖错误**（坑 4）：`dependsOn` 强制拓扑排序，前一步的输出作为下一步的 context 注入。

### 2.3 何时停止？

**评估当前进度，决定继续还是结束。**

| 停止条件 | 触发 | 行为 |
|---|---|---|
| **全部步骤完成** | 所有 step.status = "done" | 综合报告 → 返回用户 |
| **Re-plan 耗尽** | round ≥ 2 | 返回已完成步骤的结果 + 未完成步骤的描述 |
| **步骤失败不可恢复** | step.maxRetries 耗尽 且 Re-plan 无法替换 | 跳过该步，标记 failed，继续执行其余步骤 |
| **Token 超限** | 累计 LLM token > 阈值 | 返回已完成步骤的结果 + 摘要 |
| **用户中断** | Ctrl+C | 返回已完成步骤的结果 |

**防无限迭代**（坑 3）：`max_plan_rounds = 2`（初始 1 次 + Re-plan 1 次），单步 `maxRetries = 1`。

---

## 3. Planning 的四个常见坑及对策

### 坑 1：过度分解

**症状**：分解出 20+ 个子任务，每个都很小。协调成本比执行成本还高。

**对策**：
- `max_plan_steps = 5`
- 每步 `description` ≥ 30 字符
- Plan Generator 的 system prompt 要求"如果任务不需要分解（单标的分析、单次对比），返回单步骤计划"

### 坑 2：范围重叠

**症状**：不同子任务产生重复内容。浪费 Token，综合时还要去重。

**对策**：
- Plan Generator prompt 中要求 `expectedOutput` 必须互斥
- Plan 生成后做去重检查：任意两个步骤的 `expectedOutput` 的语义相似度 > 0.8 → 拒绝计划，要求重新生成

### 坑 3：无限迭代

**症状**：迭代 10 次还没停，Token 烧光了。LLM 总觉得"还可以更好"。

**对策**：
- `max_plan_rounds = 2`
- 每步 `maxRetries = 1`
- 总 Token 上限（默认 50K）

### 坑 4：忽略依赖顺序

**症状**：子任务 B 需要子任务 A 的输出，但 B 先执行了，拿到的是空数据。

**对策**：
- `dependsOn` 显式声明依赖
- 拓扑排序强制执行
- Plan Generator 的 few-shot 示例中强调"有数据依赖时必须声明 dependsOn"

---

## 4. 主流通用方案对比

| 维度 | LangGraph Plan-and-Execute | AutoGPT | 我们的方案 |
|---|---|---|---|
| **计划生成** | 静态（一次性）+ 动态（Re-planner）可选 | 动态生成，易无限重规划 | **静态为主 + 单次 Re-plan 兜底** |
| **执行方式** | Graph 节点：Planner → Executor → Replanner | Agent 循环内嵌 plan 步骤 | **复杂度触发：<0.3 走 ReAct，≥0.3 走 Planning** |
| **失败处理** | 分步回退，Re-planner 调整 | 容易无限迭代 | **单次 Re-plan + max_rounds=2** |
| **可视化** | Graph 节点可渲染 | 无 | **复用 WorkflowStatusPanel 进度条** |

**LangGraph 三种变体**：

| 变体 | 流程 | 适用场景 |
|---|---|---|
| **Static Plan** | 一次性生成计划 → 按序执行 | 任务明确、依赖清晰 |
| **Dynamic Plan** | 每步执行后 Re-planner 调整 | 任务不确定、需适应中间结果 |
| **HITL Plan** | 计划生成后等用户确认 | 高风险操作、需人工审核 |

我们的方案采纳 **Static Plan + 单次 Dynamic Re-plan**（失败时触发），不引入完整的 Dynamic Re-planner 循环——避免坑 3（无限迭代）。

---

## 5. 我们的设计：三阶段 Planning

```
用户输入
  ↓
[Phase 0: 复杂度评分]  ← Flash 模型，5 维度打分
  │
  ├── complexity < 0.3 → 直接 ReAct（走现有 chatReAct）
  │
  └── complexity ≥ 0.3 → 进入 Planning
       ↓
[Phase 1: Plan Generation]  ← Flash 模型，生成 ≤5 步结构化计划
       ↓
   用户确认？(HITL optional)
       ↓
[Phase 2: Step Execution]  ← 每步走 chatReAct 子调用
       │
       ├── 每步完成 → 验证 expectedOutput
       │     ├── 符合 → 标记 done → 下一步
       │     └── 偏离 → 触发 Re-plan（最多 1 次）
       │
       └── 全部完成 → 综合报告
```

### 5.1 复杂度评分 — 与 Swarm 共用机制

在 Daemon 中已有 `complexity_score` 判定（`≥ 0.3 → Swarm`），ChatAgent 的 Planning 共用同一套复杂度评分逻辑：

```typescript
async function chat(userInput: string): Promise<string> {
  // Phase 0: 复杂度评分
  const complexity = await scoreComplexity(userInput);
  
  if (complexity < 0.3) {
    return chatReAct({ ... });  // 简单任务 → 直接 ReAct
  }
  
  const plan = await generatePlan(userInput);
  return executePlan(plan);
}
```

**评分维度**（Flash 模型，结构化输出）：

| 维度 | 说明 | 示例 → 分数 |
|---|---|---|
| `multi_symbol` | 是否涉及 ≥2 个标的的独立分析？ | "对比 TSLA 和 NVDA" → 0.8 |
| `dependency_chain` | 是否有"先 X 后 Y"的依赖？ | "找最优 setup 然后分析" → 0.7 |
| `multi_setup` | 是否涉及 ≥2 种 setup 类型？ | "对比 VWAP 和 ORB 在 TSLA 上的表现" → 0.6 |
| `time_range` | 是否需要跨时间段查询？ | "近一个月表现" → 0.3 |
| `external_compare` | 是否需要外部知识交叉验证？ | "和机构报告对比" → 0.4 |

**加权公式**：
```
complexity = 0.35 × multi_symbol
           + 0.30 × dependency_chain
           + 0.15 × multi_setup
           + 0.10 × time_range
           + 0.10 × external_compare
```

### 5.2 Plan Generator Prompt 核心

```
你是任务分解器。将用户需求分解为 ≤5 个步骤。

规则:
1. 每步必须是一个完整的工作单元——涉及 ≥2 个工具调用或 ≥1 个工具的多次使用
2. 每步的 expectedOutput 必须唯一（不能与其他步骤产生相同内容）
3. 有数据依赖的步骤必须声明 dependsOn
4. 无依赖的步骤可以并行执行（执行层自动并行）
5. 如果任务不需要分解（单标的分析、单次对比），返回单步骤计划

输出 JSON: { "steps": [ { "index": 1, "description": "...", ... } ] }
```

### 5.3 Plan Executor 核心逻辑

```typescript
function executePlan(plan: Plan, context: ChatContext): Promise<string> {
  // 1. 拓扑排序
  const layers = topologicalSort(plan.steps);

  for (const layer of layers) {
    // 同层并行
    const results = await Promise.all(
      layer.map((step) => executeStep(step, context))
    );
    
    // 验证 expectedOutput
    for (const result of results) {
      if (!satisfiesExpectedOutput(result)) {
        if (round < MAX_PLAN_ROUNDS) {
          triggerReplan(step, context);  // 单次重规划
        }
      }
    }
  }
  
  return synthesizeResult(results);
}
```

---

## 6. 与现有系统的衔接

| 组件 | 改动 | 说明 |
|---|---|---|
| `chatReAct.ts` | **不修改** | 仍作为单步执行的原子单元 |
| `chat.ts` | **新增入口逻辑** | 插入 Phase 0 复杂度评分 → 决定走哪种模式 |
| `planGenerator.ts`（新建） | **新增** | Flash 模型调用 + Plan JSON 生成 + 去重校验 |
| `planExecutor.ts`（新建） | **新增** | 拓扑排序 + 同层并行 + `expectedOutput` 验证 + Re-plan |
| `complexityScorer.ts`（新建/共用） | **共用** | 与 Swarm 共用同一个复杂度评分器 |
| `ChatPage.tsx` | **小改** | 显示 Plan 的进度条（复用 WorkflowStatusPanel 机制） |

---

## 7. 实施优先级

**Phase 2-3（中期）**，暂不纳入 Phase 1。

理由：
1. Phase 1 已有足够工作量：ta 库迁移 + 会话记忆 Schema + 滑动窗口压缩
2. ChatAgent 当前场景的 complexity_score 普遍 < 0.3——大多数用户输入是"分析 TSLA"、"TSLA 和 NVDA 对比"——不需要 Planning
3. DecisionGraph 已经有隐式 Planning：Pipeline 编排（build_evidence → generate_contra）就是固定计划
4. Swarm 的 complexity_score 机制已验证可用，Planning 可等到有具体需求时通过同一个判定触发

**触发实施信号**（当以下任一出现时）：
- 用户反馈"Agent 在多步任务时步骤混乱"
- Chat 日志中出现 ≥3 个工具调用链的 error rate > 20%
- 用户明确要求"先做 A 再做 B"但 Agent 并行执行导致空数据

---

## 8. 核心决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| Planning 触发条件 | complexity_score ≥ 0.3 | 与 Swarm 共用同一套复杂度评分 |
| 计划生成模型 | Flash（低成本） | 结构化 JSON 输出，无需深度推理 |
| 计划稳定性 | 静态为主 + 单次 Re-plan | 避免无限迭代（坑 3） |
| 最大步骤数 | 5 | 防止过度分解（坑 1） |
| 最大重试 | 1（单步）+ 1（Re-plan） | 防无限迭代 |
| 拓扑排序 | `dependsOn` 显式声明 | 防忽略依赖顺序（坑 4） |
| 去重机制 | `expectedOutput` 语义相似度检查 | 防范围重叠（坑 2） |
| 依赖关系检查 | 拓扑排序 | 防忽略依赖顺序（坑 4） |

---

## 9. 与 14_llm_reasoning_strategy.md 的关系

`14_llm_reasoning_strategy.md` 定义了 **DecisionGraph 内部的推理策略**（build_evidence 的 ReAct 5 steps、generate_contra 的 Debate+ToT 三角色）。本文档定义了 **ChatAgent 外层的多步任务规划**——在 ChatAgent 和 DecisionGraph 之间的衔接层：

```
ChatAgent
  ├─ complexity < 0.3 → chatReAct（自由对话）
  └─ complexity ≥ 0.3 → Planning
       └─ 每步 → chatReAct 子会话
            └─ 如果涉及 setup 分析 → 触发 DecisionGraph
```

---

## 10. 参考源

- **LangGraph Plan-and-Execute**：Static / Dynamic / HITL 三种变体，LangChain Blog 文章
- **AutoGPT**：Plan-then-Execute 模式，验证了动态 Planning 的"无限迭代"问题
- **AI Agent Goal Decomposition and Hierarchical Planning**：Zylos Research 的分解方法分析
- **Plan-then-Execute (P-t-E)**：arXiv 2509.08646 论文——将规划与执行分离的架构原则
- **16_ai_agent_book_reference.md §3.8**：Planning 模式的理论基础
- **14_llm_reasoning_strategy.md §11**：复杂度路由矩阵（complexity_score → Agent → Pattern → Cost）
