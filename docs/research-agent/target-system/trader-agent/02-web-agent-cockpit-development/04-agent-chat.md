# 04 Agent Chat

## 目标与非目标

目标：实现 `/chat`，让用户围绕市场意图、signal、新闻、规则和学习结果与 Agent 对话。第一版支持 DeepSeek direct，但只使用只读上下文。

非目标：

- 不通过 chat 创建或修改 signal。
- 不通过 chat 创建或修改 PlaybookTheory。
- 不触发交易执行。
- 不实现 LangGraph/LangChain tool loop。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `ChatPage` | route composition |
| `ContextRibbon` | selected symbol/signal/theory and data freshness |
| `ChatComposer` | prompt input, send, stop, retry |
| `MessageList` | stream rendering |
| `AgentAnswerBlock` | conclusion, intent, evidence, triggers, invalidation, uncertainty |
| `ToolSourceCard` | tool name, source URL, freshness, confidence |
| `EvidenceCard` | linked knowledge/event/signal evidence |

## 数据输入输出

Inputs:

- selected symbol
- selected signal id
- selected theory id
- agent status
- signal explanation
- knowledge search results
- market snapshot fallback

Outputs:

- stream chat request
- stop current stream
- retry failed stream
- open linked signal/theory/source

## API 与模型边界

Frontend route:

- `POST /api/agent-chat`

The route may:

- fetch read-only context from Agent Core;
- call DeepSeek direct;
- return stream parts;
- include tool sources and evidence refs.

The route must not:

- mutate Agent Core objects;
- write learning results;
- create rules;
- trigger execution actions.

Read-only context sources:

- `GET /api/agent/status`
- `GET /api/agent/events`
- `GET /api/agent/signals/{signal_id}/explanation`
- `GET /api/knowledge/search`
- adapter-provided market snapshot fallback

## Agent 回答结构

Every complete answer should render:

- conclusion
- market intent
- evidence
- trigger conditions
- invalidation conditions
- next watch
- risk/uncertainty
- tool sources

## 工具来源

Allowed first-version tools:

- market snapshot
- news search
- web search
- knowledge search
- rulepack search
- DeepSeek chat

External sources must show URL when available, be deduped/summarized, and carry `external_unverified` until confirmed.

## 验收标准

- Chat can stream text, tool, source, evidence, warning and error parts.
- User can ask about selected signal and see the context ribbon.
- Tool sources are visible for model-supported claims.
- External web/news results show URL and unverified tag.
- There are no action buttons for execution, order, approval, task or rule mutation.

## 测试场景

- Component test answer block renders all required sections.
- Component test external source card displays URL and unverified tag.
- Component test stream error keeps prior parts visible.
- Playwright smoke: open chat with signal context and receive mock stream.
