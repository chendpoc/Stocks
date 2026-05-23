# Research Agent Tooling

This page documents the local research-console tool policy. It is not part of the public daily-summary publishing contract.

## Execution Modes

- Local deterministic provider: uses local summary and opportunity files only.
- OpenAI-compatible provider: can request tool calls, but every tool still passes through local policy.
- Context preflight: `/api/research/context?day=YYYY-MM-DD` exposes selected-day availability, counts, workspace-relative paths, and bounded symbol previews before an agent request is sent.
- Opportunity board: `/api/research/opportunities?day=YYYY-MM-DD` returns local deterministic score rows for the main workbench without calling a model or external data provider.
- Market data source registry: `/api/research/data-sources` reports provider capability and environment readiness only. It is not a quote, news, or historical-price query endpoint.
- Agent run evidence: each `/api/agent/chat` run appends a sanitized local JSONL record under `.cache/research-agent/runs/`.
- Agent run history: `/api/agent/runs?day=YYYY-MM-DD` reads that local JSONL file and returns bounded run summaries only.
- Visible answer digest: the local deterministic answer includes a compact `证据摘要`, optional `策略阻断`, and `研究边界` section so the reader can see evidence use without opening JSONL logs.
- Response evidence panel: the React agent panel summarizes the current answer's executed tools, blocked policy decisions, provider state, and workspace-relative evidence log path.
- Structured answer contract: local deterministic answers and model prompts use the same visible shape: `结论 / 证据 / 反证 / 下一步观察 / 研究边界`.
- Public research plan: opportunity reasoning exposes a bounded `researchPlan` with hypothesis, evidence, falsification, data-plan, and synthesis stages. This is a public workflow summary, not private chain-of-thought.
- Research plan status: the React agent panel derives each research-plan step status from the current `tool_trace` and `policy_decisions`, so a step can show `done`, `blocked`, `pending`, or `process` without adding backend schema.
- Evidence needs: opportunity reasoning emits structured missing-evidence requests before any external tool execution. These requests are shown separately from executed evidence.
- Model prompt evidence needs: OpenAI-compatible prompts include the same structured evidence-needs list, so model-backed planning sees missing evidence explicitly instead of inferring it from broad prose.
- Model prompt context sections: OpenAI-compatible prompts label `Market intel needs:`, `Research plan:`, `Evidence needs:`, `Invalidation plan:`, and `Next checks:` explicitly so model-backed planning can parse the same opportunity context deterministically.
- Evidence refresh action: the React AgentPanel exposes a one-click `刷新缺失证据` action. It submits a normal `/api/agent/chat` request with a provider-recognizable refresh prompt, so run history, tool policy, and evidence logs remain the source of truth.

All research-console API routes use the shared `apps/research-console/lib/api-auth.ts` guard. Development and local requests are open; production requests require `RESEARCH_CONSOLE_ACCESS_TOKEN` and the `x-research-console-token` request header.

## Environment Variables

| Variable | Required For | Purpose |
| --- | --- | --- |
| `AGENT_PROVIDER=openai-compatible` | model-backed agent | Enables the OpenAI-compatible chat-completions provider. |
| `AGENT_API_BASE_URL` | model-backed agent | Base URL for `/chat/completions`. |
| `AGENT_MODEL` | model-backed agent | Model name used by the agent provider. |
| `AGENT_API_KEY` | model-backed agent | Server-side model API key. Never expose it to browser code. |
| `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | all external tools | Explicit opt-in for market and news tools. |
| `LONGBRIDGE_APP_KEY` | `longbridge_quote` | Server-side Longbridge app key. |
| `LONGBRIDGE_APP_SECRET` | `longbridge_quote` | Server-side Longbridge app secret. |
| `LONGBRIDGE_ACCESS_TOKEN` | `longbridge_quote` | Server-side Longbridge access token. |
| `LONGBRIDGE_QUOTE_ENDPOINT` | `longbridge_quote` | Optional quote endpoint override. |
| `ALPHA_VANTAGE_API_KEY` | `alpha_vantage_quote` | Alpha Vantage quote API key. |
| `YFINANCE_PYTHON_BIN` | `yfinance_quote`, `yfinance_history` | Optional Python executable override. Defaults to the repo `.venv` Python. |
| `NEWS_SEARCH_ENDPOINT` | `news_search` | JSON news-search endpoint. |
| `NEWS_SEARCH_API_KEY` | `news_search` | Optional bearer token for the news endpoint. |
| `NEWS_SEARCH_ALLOWED_HOSTS` | `news_search` | Comma-separated source host whitelist, such as `finance.yahoo.com,www.reuters.com`. |

## Cache Locations

- Alpha Vantage quote cache: `.cache/research-tools/alpha_vantage_quote/YYYY-MM-DD/SYMBOL.json`
- Longbridge quote cache: `.cache/research-tools/longbridge_quote/YYYY-MM-DD/SYMBOL.json`
- yfinance quote cache: `.cache/research-tools/yfinance_quote/YYYY-MM-DD/SYMBOL.json`
- yfinance history cache: `.cache/research-tools/yfinance_history/YYYY-MM-DD/SYMBOL-PERIOD.json`
- News search cache: `.cache/research-tools/news_search/YYYY-MM-DD/<query-sha1>.json`
- Agent run evidence log: `.cache/research-agent/runs/YYYY-MM-DD.jsonl`

`news_search` caches a filtered and redacted payload, not the full provider response. Disallowed source URLs and provider metadata are dropped before the cache file is written.

Agent run evidence stores one sanitized JSON object per line. It records `run_id`, selected day, provider status, bounded user-message preview, context counts, used context paths, tool trace summaries, policy decisions, opportunity reasoning, and the answer preview. It does not store raw Markdown, raw structured JSON, absolute local paths, authorization headers, or secret values.

The run-history API and sidebar do not expose the full JSONL record. They return only `run_id`, timestamp, provider status, bounded message/answer previews, tool names, blocked tool names, candidate symbols, and the workspace-relative evidence log path. Listing records applies a second sanitization pass, so old or hand-written cache lines cannot rely on the write-time sanitizer.

The local deterministic agent also writes a bounded evidence digest into the visible answer. Executed tools appear under `证据摘要`; blocked tools appear under `策略阻断`; the answer must keep the research-only boundary visible and must not turn evidence into a direct trading instruction.

The React agent panel mirrors the same boundary for the latest response. It shows counts and bounded summaries for executed tools and blocked tools, but it does not expose full JSONL records, raw Markdown, raw structured JSON, prompts, headers, secrets, or absolute paths.

The final answer body should keep a stable section order: `结论`, `证据`, `反证`, `下一步观察`, then `研究边界`. The browser uses pre-wrapped answer text so this structure remains readable instead of collapsing into a single paragraph.

`evidenceNeeds` sits before tool execution. It classifies missing evidence into `quote`, `history`, `news`, and `fundamental` checks, includes the related symbol, and names candidate tools that could satisfy the check. It is not fetched evidence and should not raise confidence by itself.

`researchPlan` is the public reasoning workflow. It explains what the agent will check and why, but it is not hidden reasoning, not fetched evidence, and not a confidence upgrade by itself.

In the AgentPanel, `researchPlan` status is display-only. `done` means at least one hinted tool ran for that step; `blocked` means at least one hinted tool was stopped by policy; `pending` means tool hints exist but no related tool has run; `process` means the step has no tool hint and is a synthesis or method step. These labels do not change the opportunity score and do not imply a trading decision.

The `刷新缺失证据` UI action does not bypass planning or policy. It picks the first available evidence symbol from the latest answer, falls back to the selected day's admin-symbol preview, and submits a normal prompt shaped like `refresh all missing evidence for SYMBOL before comparing the opportunity`.

## Local Tools

| Tool | Purpose | External Data |
| --- | --- | --- |
| `load_structured_summary` | Loads the structured daily summary JSON. | No |
| `load_opportunity_observation` | Loads the local opportunity-observation Markdown page. | No |
| `extract_watchlist` | Extracts admin-side watchlist symbols from the daily context. | No |
| `score_opportunities` | Scores admin watchlist symbols against local theory alignment, trigger clarity, evidence quality, invalidation clarity, and liquidity risk. | No |

`score_opportunities` is a research triage tool. It returns compact score rows for the React agent panel and must not be interpreted as an order, signal, or direct trading instruction.

## External Tools

| Tool | Purpose | Required Opt-in | Secret Required |
| --- | --- | --- | --- |
| `longbridge_quote` | Fetches a latest Longbridge quote for one symbol. | `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | Yes |
| `alpha_vantage_quote` | Fetches a latest Alpha Vantage global quote for one symbol. | `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | Yes |
| `yfinance_quote` | Runs local Python `yfinance` for latest price, change, volume, exchange, and currency context. | `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | No |
| `yfinance_history` | Runs local Python `yfinance` for bounded historical trend, drawdown, volatility, and volume metrics. | `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | No |
| `news_search` | Fetches source-filtered market news snippets from a configured endpoint. | `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | Optional |

`longbridge_quote` caches only normalized fields: symbol, price, change, change percent, volume, currency, market status, and timestamp. It does not cache raw provider metadata, request headers, or credentials. `LONGBRIDGE_QUOTE_ENDPOINT` is optional so the runtime can adapt if Longbridge endpoint shape changes.

`yfinance_quote` is still treated as an external data tool because the local Python package queries Yahoo Finance. It caches only sanitized quote fields and does not cache arbitrary provider metadata.

`yfinance_history` is also opt-in external evidence. The Python helper returns only metric snapshots: observations, date span, first/last close, close-change percent, max drawdown, realized volatility, average/latest volume, and latest-volume ratio. It drops raw rows before caching so the agent can cite market structure evidence without exposing a hidden historical data dump.

## Default Agent Planning

The local deterministic agent always starts with the local evidence chain:

1. `load_structured_summary`
2. `load_opportunity_observation`
3. `extract_watchlist`
4. `score_opportunities`

Opportunity reasoning then adds `evidenceNeeds` as a planning layer. These entries should guide future tool calls, but policy still decides whether a tool is allowed to run.

The OpenAI-compatible provider prompt uses stable section labels for model planning context: `Market intel needs:`, `Research plan:`, `Evidence needs:`, `Invalidation plan:`, and `Next checks:`. These labels are prompt anchors only; they do not bypass tool policy and do not expose raw local Markdown, raw JSON, prompts, paths, headers, or secrets to the browser.

When the user asks to refresh or validate missing evidence, the local provider maps `evidenceNeeds` into concrete tool calls before falling back to keyword-only planning. Generic explanation requests still use only the local evidence chain and do not trigger external tools.

When the user explicitly asks for market validation, latest price, quote, volume, 行情, 价格, 成交量, or 验证, the local provider also plans `yfinance_quote` for the first explicit ticker or admin watchlist symbol.

When the user explicitly asks for historical validation, trend, drawdown, volatility, volume expansion, or equivalent Chinese terms, the local provider also plans `yfinance_history` with a default `30d` period unless the message contains a bounded period such as `5d`, `1mo`, or `1y`.

Planning does not bypass policy. If `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` is missing, the kernel records `yfinance_quote:blocked` or `yfinance_history:blocked` and skips execution. This makes the evidence need visible without silently querying external data.

## Browser Data Boundary

The React console may show context status and small previews, but full local Markdown and raw structured JSON stay server-side.

Allowed in browser status:

- Workspace-relative paths under `data/` or `docs/`
- Existence flags for structured summary, local summary Markdown, and opportunity observation
- Counts for event summary, overview, admin theory, admin symbols, and risks
- A short admin-symbol preview

Not allowed in browser status:

- Full `opportunityMarkdown`
- Full structured summary JSON
- Absolute local paths such as `STOCK_SUMMARY_ROOT`
- Model, market-data, news, or webhook credentials
- Buy/sell/long/short style action language

Allowed in browser run history:

- Run id and ISO timestamp
- Provider mode and provider status
- Bounded message and answer previews
- Tool names and blocked tool names
- Candidate symbols from local opportunity reasoning
- Workspace-relative evidence log path

Not allowed in browser run history:

- Full `tool_trace.result_summary`
- Full JSONL evidence record
- Raw Markdown or raw structured summary JSON
- Absolute local paths
- Credentials, headers, model prompts, or environment variables

## Source Policy

`news_search` keeps only results whose URL hostname exactly matches or is a subdomain of a configured host.

Examples:

- Allowed: configured host `finance.yahoo.com`, result host `finance.yahoo.com`
- Allowed: configured host `yahoo.com`, result host `finance.yahoo.com`
- Blocked: configured host `finance.yahoo.com`, result host `evil-finance.yahoo.com`

## Research Rule

External data is supporting evidence. It must not become a direct buy or sell instruction. The agent should compare external data against the admin theory, opportunity trigger, and risk invalidation conditions.
