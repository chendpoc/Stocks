# 02 — Agent Market Cockpit PRD

版本：`v0.3`

文档定位：Layer 2 Web 工作台，用于市场意图解释、机会关注、Agent 对话、交易规律学习和只读证据追踪。

建议读者：前端开发 agent、Agent Core 集成 agent、交互设计 agent。

---

## 1. 第一性目标

Agent Market Cockpit 不是交易执行系统，也不是传统行情页。它的本质目标是：

```text
把 Agent Core 已产生的市场判断、signal、规则命中、证据和学习结果，
组织成一个可追问、可验证、可持续关注的交易研究工作台。
```

第一版重点服务这些用户动作：

- 查看固定股票池和 Agent 当前市场判断。
- 发现 Agent 认为值得关注的机会。
- 追问机会背后的市场意图、新闻、规则和证据。
- 将一个机会整理成 `Scenario Plan / 关注计划`。
- 后续对照真实市场结果，帮助 Agent 学习。
- 浏览 Playbook Theory 和其下的可执行规则数组。

## 2. 非目标

第一版明确不做：

- 交易执行类能力。
- 账户交易类能力。
- 订单类对象。
- 订单审批中心。
- 复杂权限后台。
- 任务调度中心。
- 规则编辑器。
- 独立规律浏览库。
- 独立 Journal / Audit 中心。
- 浏览器内实现策略判断。
- LangGraph / LangChain agent tool loop。

自然语言回答中可以引用用户或来源文本里的“买入、加仓、仓位”等词，但结构化 UI 字段不能把它们做成交易动作或执行按钮。

## 3. 第一版页面范围

| Route | First-version role |
|---|---|
| `/dashboard/live` | 市场意图首页：固定股票池、市场状态、机会摘要、图表证据、Agent 状态 |
| `/signals` | 机会与关注计划中心：signal 状态、触发条件、失效条件、情景树、证据 |
| `/chat` | Agent 对话：基于只读上下文和 DeepSeek direct 的解释与查验 |
| `/inbox` | Agent 主动提醒：机会、市场 gate、风险/失效、学习摘要 |
| `/playbook-theories` | 交易规律库：PlaybookTheory 和 PlaybookRule 数组 |
| `/learning` | 有信息量时展示新规律、低置信候选、自我反思 |
| `/settings` | 轻量偏好和 Tool Settings |

第一版不提供旧版控制台管理类 route。工具设置并入 `/settings`；规则与规律库统一为 `/playbook-theories`。

## 4. 数据接入策略

第一版采用：

```text
真实只读 Agent Core 接入 + mock fallback
```

优先接入：

- `GET /api/agent/status`
- `GET /api/agent/events`
- `GET /api/agent/runs`
- `GET /api/agent/runs/{run_id}`
- `GET /api/agent/signals/{signal_id}/explanation`
- `GET /api/knowledge/search`

需要 gap review 后才能承诺：

- signal list/detail 标准 API
- market snapshot 标准 API
- learning summary 标准 API
- PlaybookTheory 标准 API
- polling delta API
- chat context aggregation API

## 5. 实时策略

第一版不以完整 WebSocket Event Bus 起步。

| Surface | First-version update model |
|---|---|
| dashboard | polling，默认 1 分钟，可调 5/15 分钟，支持手动刷新 |
| signals | polling + 手动刷新 |
| inbox | polling + unread state |
| chat | stream response |
| learning | 手动刷新或页面进入时刷新 |
| playbook theories | read-only fetch |

WebSocket / event bus 留作后续增强，不作为第一版验收前置。

## 6. Signal 与关注计划

Signal 是 Agent 发现的市场机会或需要关注的市场状态。第一版 Signal 必须表达：

- market intent：Agent 对市场意图的解释。
- scenario tree：如果 A 发生，则关注 B；如果 C 发生，则失效。
- trigger conditions：触发关注的条件。
- invalidation conditions：失效条件。
- evidence：行情、新闻、语料、规则、工具来源。
- uncertainty：风险和不确定性。
- next watch：下一步关注。

### Signal status

```text
watching
waiting_trigger
near_trigger
triggered_for_attention
invalidated
needs_more_evidence
```

### Scenario Plan / 关注计划

`Scenario Plan` 是观察框架，不表达订单。

```ts
type ScenarioPlan = {
  plan_id: string;
  signal_id: string;
  summary: string;
  watch_conditions: string[];
  trigger_conditions: string[];
  invalidation_conditions: string[];
  expected_paths: string[];
  evidence_refs: string[];
  confidence: "low" | "medium" | "high";
  tags: CockpitTag[];
  validation_due?: string;
};
```

## 7. Tag taxonomy

Tag 用于表达内容属性，不替代 Signal 生命周期状态。

| Tag | Meaning | Color token |
|---|---|---|
| `opportunity_watch` | 机会/关注计划 | `tag.opportunity` |
| `market_intent` | 市场意图解释 | `tag.intent` |
| `rule_learning` | 规则学习 | `tag.learning` |
| `news_event` | 新闻/公告/宏观事件 | `tag.news` |
| `risk_or_invalidation` | 风险或失效 | `tag.risk` |
| `post_validation` | 后置验证 | `tag.validation` |
| `external_unverified` | 外部未验证来源 | `tag.unverified` |

颜色建议由设计系统实现，不在 PRD 中硬编码具体色值。

## 8. Playbook Theory 与 Rule

第一版统一使用 `PlaybookTheory` 作为父级知识单元。

```text
PlaybookTheory
  ├── source evidence
  ├── applicable market context
  ├── failure modes
  ├── PlaybookRule[]
  ├── current matched signals
  └── validation history
```

`PlaybookRule` 是某个 theory 下的机器可执行条件。每个 rule 必须有 `parentTheoryId`。

```ts
type PlaybookRule = {
  id: string;
  parentTheoryId: string;
  name: string;
  condition: string;
  effect:
    | "create_signal"
    | "update_status"
    | "increase_confidence"
    | "decrease_confidence"
    | "invalidate_signal"
    | "add_explanation";
  explain_text: string;
};
```

旧版规则编辑器和独立规律浏览库不进入第一版。

## 9. Chat 与模型边界

第一版允许 Next.js API route 直连 DeepSeek direct，但只用于 presentation/chat assistant boundary。

允许：

- 聚合只读 Agent Core 上下文。
- 调用 DeepSeek 解释 signal、新闻、市场意图、规则命中。
- 使用只读工具来源：market snapshot、news search、web search、knowledge search。
- 显示工具来源、URL、去重摘要和 `external_unverified` 标记。

禁止：

- Web 直接创建 signal。
- Web 直接创建 rule。
- Web 直接写 learning proposal。
- Web 直接触发交易或订单。
- Web 直接绕过 Agent Core 的 schema validation 和 audit。

Agent 回答结构：

```text
结论
市场意图解释
证据
触发条件
失效条件
下一步关注
风险/不确定性
工具来源
```

## 10. Learning 展示原则

Learning Center 只在有信息量时展示：

- 新 PlaybookTheory candidate。
- 新 PlaybookRule candidate。
- 低置信待人工确认。
- Agent 自我反思。
- 后置验证结果。

如果没有新规则、新市场规律或有效反思，不强迫生成每日学习内容。

## 11. 第一版验收标准

- `dashboard/live` 能展示固定股票池、市场状态、机会摘要、图表证据和 Agent 状态。
- `signals` 能展示 status、tag、market intent、scenario tree、trigger、invalidation、evidence。
- `chat` 能以 stream 形式回答，并展示工具来源和证据。
- `inbox` 能展示 signal、market gate、risk/invalidation、learning 类型主动消息。
- `playbook-theories` 能展示 theory、source evidence、rule array 和当前命中 signal。
- `learning` 不生成无信息量日报，只展示真实新增或待确认内容。
- `settings` 能展示轻量 Tool Settings，默认启用只读工具。
- 所有页面能在真实只读 API 不完整时使用 mock fallback。
- `pnpm --filter trader-cockpit build` 和类型检查通过。
- Playwright route smoke 覆盖第一版所有 route。
