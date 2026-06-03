# Research Agent Opportunity Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first opportunity research workbench that turns daily summaries into auditable trading observations, with a floating React agent, policy-gated external data tools, and reproducible evidence trails.

**Architecture:** Keep the daily summary pipeline stable and treat the React `research-console` as a separate local research surface. The agent kernel may plan tool calls, but every external tool must pass a policy gate, use bounded local caching, and return sanitized summaries with source attribution. Public VitePress builds remain lightweight; richer research surfaces stay local until deployment boundaries are explicitly designed.

**Tech Stack:** Node 20-22, pnpm workspace, Next.js 15 / React 19, TypeScript, VitePress, Python summary modules, Node test runner, optional external APIs through explicit environment variables.

---

## Current Snapshot

The repository is already moving toward a light monorepo:

- Root workspace files exist: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `.node-version`.
- React app exists at `apps/research-console`.
- Shared types live in `packages/summary-core`.
- Local opportunity pages live under `docs/opportunities/`.
- Daily summary generation and notification scripts remain in `scripts/`.
- `test/daily-summary-assets.test.mjs` is the main Node behavioral test surface.

The agent pipeline currently has these boundaries:

- `apps/research-console/lib/agent-kernel.ts` runs bounded multi-round tool planning.
- `apps/research-console/lib/agent-provider.ts` supports local deterministic and OpenAI-compatible providers.
- `apps/research-console/lib/tool-policy.ts` blocks unknown or disabled tools.
- `apps/research-console/lib/agent-tools.ts` executes local tools, `score_opportunities`, and opt-in external tools.
- `news_search` is implemented as a policy-gated external tool. It requires explicit opt-in, a configured endpoint, and an allowed-host list.
- `score_opportunities` is implemented as a local deterministic triage tool over admin watchlist symbols.

## Implementation Status

Completed on 2026-05-22:

- Tasks 1-4: `news_search` red tests, policy, executor, and kernel coverage.
- Task 5: narrow model-facing `news_search` tool contract.
- Task 6: `project-docs/research-agent/tooling.md`.
- Task 7: Agent panel displays used context and tool reasons.
- Task 8: `score_opportunities` local scoring tool, provider planning contract, kernel coverage, and compact score-row UI.
- Task 9: selected-day context preflight API and AgentPanel status card.
- Task 10: main-page Opportunity Board with local deterministic score rows and bounded browser payload.
- Task 11: `ResearchWorkspace` owns the selected-day state and passes it into both `OpportunityBoard` and `AgentPanel`.
- Task 12: `apps/research-console/lib/opportunity-reasoning.ts` provides a pure local staged reasoning skeleton for opportunity observation.
- Task 13: `apps/research-console/lib/market-data-sources.ts` and `/api/research/data-sources` expose safe market-data provider readiness without leaking secrets or querying networks.
- Task 14: public VitePress build excludes `project-docs/research-agent/**`; research-agent docs remain local/development documentation.
- Task 15: `yfinance_quote` is implemented as an explicit opt-in external evidence tool. It runs through local Python, writes sanitized quote cache entries, appears in tool readiness, and is covered by fixture-based tests.
- Task 16: agent run evidence trail writes sanitized local JSONL records under `.cache/research-agent/runs/` and returns a bounded `run_id` plus relative evidence log path to the browser.
- Task 17: agent run evidence viewer reads `.cache/research-agent/runs/YYYY-MM-DD.jsonl`, exposes bounded run summaries through `/api/agent/runs`, and renders compact recent-run cards in the React AgentPanel.
- Task 18: research-console API routes use shared `apps/research-console/lib/api-auth.ts` production token guard instead of route-local copies.
- Task 19: `longbridge_quote` is implemented as an explicit opt-in external evidence tool. It requires server-side Longbridge credentials, writes sanitized quote cache entries, appears in tool readiness and market-data readiness, and is covered by fixture-based tests.

## Module Development Protocol

Every new research-console module or behavior slice must start with a module development document under:

```text
project-docs/research-agent/modules/YYYY-MM-DD-<module-slug>.md
```

The document must define:

- Purpose: the product behavior being added and why it belongs in the React research console.
- Boundaries: what the module may read, write, expose to the browser, or call externally.
- Files: expected write scope for implementation, tests, and docs.
- Tests: the red/green verification commands that prove the behavior.
- Agent split: which low-decision tasks can be delegated, and which review or integration work stays with the main agent.
- Risks: policy, privacy, performance, determinism, and trading-instruction risks.

Implementation should not begin until the module document exists. Small follow-up fixes may update the existing module document instead of creating a new one.

Representative module documents:

This list captures the main tracked module docs for orientation. The authoritative list is the directory `project-docs/research-agent/modules/`.

- `project-docs/research-agent/modules/2026-05-22-yfinance-quote-tool.md`
- `project-docs/research-agent/modules/2026-05-23-agent-reasoning-context.md`
- `project-docs/research-agent/modules/2026-05-23-agent-run-evidence-trail.md`
- `project-docs/research-agent/modules/2026-05-23-agent-evidence-log-viewer.md`
- `project-docs/research-agent/modules/2026-05-23-shared-api-auth-guard.md`
- `project-docs/research-agent/modules/2026-05-23-longbridge-quote-tool.md`
- `project-docs/research-agent/modules/2026-05-23-agent-answer-evidence-digest.md`
- `project-docs/research-agent/modules/2026-05-23-agent-response-evidence-panel.md`
- `project-docs/research-agent/modules/2026-05-23-agent-structured-answer-contract.md`
- `project-docs/research-agent/modules/2026-05-23-agent-evidence-needs.md`
- `project-docs/research-agent/modules/2026-05-23-evidence-driven-tool-planning.md`
- `project-docs/research-agent/modules/2026-05-23-model-prompt-evidence-needs.md`
- `project-docs/research-agent/modules/2026-05-23-model-prompt-context-sections.md`
- `project-docs/research-agent/modules/2026-05-23-agent-evidence-refresh-action.md`
- `project-docs/research-agent/modules/2026-05-23-agent-public-research-plan.md`
- `project-docs/research-agent/modules/2026-05-23-agent-research-plan-status.md`
- `project-docs/research-agent/modules/2026-05-23-agent-lifecycle-governance.md`
- `project-docs/research-agent/modules/2026-05-23-collaboration-retrospective-cadence.md`
- `project-docs/research-agent/modules/2026-05-23-card-cover-availability-wait.md`
- `project-docs/research-agent/modules/2026-05-23-optional-deploy-hook.md`
- `project-docs/research-agent/modules/2026-05-23-opportunity-reasoning-professional-fallbacks.md`
- `project-docs/research-agent/modules/2026-05-23-cloudflare-deploy-pnpm-build.md`
- `project-docs/research-agent/modules/2026-05-23-research-console-standalone-boundary.md`
- `project-docs/research-agent/modules/2026-05-23-agent-answer-section-cards.md`
- `project-docs/research-agent/modules/2026-05-23-research-console-deployment-boundary.md`

Agent lifecycle governance:

- 默认本地执行；只有明确低耦合、低决策、低冲突风险的任务才下发 agent。
- 同一阶段默认最多保留 2 个活跃 agent；超过时必须先关闭已完成或失效 agent。
- 每个 agent 必须有明确任务边界、写入范围和交付物。
- agent 完成后必须 close agent，除非下一步明确依赖同一个 agent 的上下文继续工作。
- 主 agent 负责 review、审计、集成和最终验证；不能直接信任 agent 自述。
- 不允许把阻塞主路径的关键决策任务下发给 agent。

Collaboration retrospective cadence:

- 默认每 10 个用户-助手交互轮次，或每完成一个有意义模块后，进行一次短复盘。
- 若正在执行关键验证、修复失败构建或处理用户明确的紧急请求，先完成当前关键步骤，再补复盘。
- 复盘必须回答：本阶段做对了什么。
- 复盘必须回答：本阶段暴露了什么协作或工程风险。
- 复盘必须回答：下一阶段应调整什么规则或流程。
- 复盘必须回答：是否需要写入项目文档或记忆。
- 复盘不得替代实现、测试或用户要求的交付物。
- 只有用户明确要求保存为长期记忆时，才写入本地 memory。

Security decision:

- `news_search` does not cache the full provider response. The executor filters by allowed host and drops provider metadata before writing `.cache/research-tools/news_search/YYYY-MM-DD/<query-sha1>.json`.
- `score_opportunities` uses local summary and opportunity context only. It ranks research observations by theory alignment, trigger clarity, evidence quality, invalidation clarity, and liquidity risk. It is not a buy/sell instruction.
- `/api/research/context?day=YYYY-MM-DD` exposes only context availability, counts, relative paths, and bounded admin-symbol previews. Full Markdown, full JSON, absolute local paths, and credentials stay server-side.
- `/api/research/opportunities?day=YYYY-MM-DD` powers the visible workbench board. It calls local context/scoring only and keeps model responses, external tools, raw Markdown, and raw JSON out of the board payload.
- `/api/research/data-sources` reports whether Longbridge, Alpha Vantage, news search, and yfinance-style providers are configured or planned. It only returns capability state, never secret values and never market data.
- `buildOpportunityReasoning(input)` exposes structured reasoning summaries and staged opportunity checks. It deliberately does not expose raw chain-of-thought fields such as `raw`, `cot`, or `chain_of_thought`.
- `buildOpportunityReasoning(input)` also exposes `evidenceNeeds` as missing-evidence planning metadata before external tool calls. It is not fetched evidence and cannot raise confidence by itself.
- The local provider maps `evidenceNeeds` into concrete external tool plans only when the user asks to refresh or validate missing evidence. Generic explanation requests remain local-only.
- OpenAI-compatible prompts include `evidenceNeeds` explicitly so model-backed tool planning sees the same missing-evidence contract as the local provider.
- `persistAgentRunEvidence(...)` appends local JSONL audit records only under `.cache/research-agent/runs/`. Records are sanitized, string-capped, workspace-relative, and exclude raw Markdown, raw JSON, absolute paths, and secrets.
- `listAgentRunEvidence(...)` returns recent run summaries only and sanitizes again on read. It does not return full `tool_trace.result_summary`, raw JSONL records, raw Markdown, raw structured JSON, absolute paths, headers, credentials, or environment variables.
- `isAuthorizedResearchConsoleRequest(...)` centralizes production route protection for all research-console API routes. Production requests require `RESEARCH_CONSOLE_ACCESS_TOKEN` and `x-research-console-token`; development requests remain open for local use.
- `longbridge_quote` uses only server-side Longbridge environment variables, requires `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`, and caches sanitized quote fields under `.cache/research-tools/longbridge_quote/`. It must not expose raw provider metadata or credentials.

Resolved on 2026-05-22:

- `build_search_index.py` now defaults to public-only indexing. It indexes only the latest monthly directory's public daily summary files and skips `*-local.md`, timed legacy files, older months, and flat legacy files. Use `SimpleContentIndexer(..., public_only=False)` for local/full indexing tests or tooling.
- After regeneration, `docs/search_index.json` contains 10 current-month daily summary documents and is about 46.7 KB.

## Product Decision

Use the React console as the research workbench, not VitePress.

Why:

- VitePress is correct for static daily reports, public summary pages, and local archival browsing.
- A contextual trading agent needs mutable conversation state, tool traces, API calls, policy decisions, and eventually richer panels. That is application behavior, not documentation behavior.
- Keeping VitePress and the console separate reduces blast radius: summary publishing remains stable while research tooling evolves behind local/protected routes.

## Web / Deep Research Boundary

Codex can use web search or deep research during development sessions, but that should not become the production automation dependency.

Production-safe rule:

- Development research may use Codex browsing to inspect docs, API behavior, or market context.
- The app runtime should call explicit tools such as `news_search`, `alpha_vantage_quote`, `longbridge_quote`, or later `yfinance_quote`.
- Every runtime external tool must be opt-in, source bounded, cached, and sanitized.

Reason:

- Codex web/deep research is useful for human-in-the-loop investigation.
- GitHub Actions and the deployed app need reproducible execution. A deterministic tool contract is easier to test, cache, audit, and disable.

## File Structure

Create or modify only these files for the next implementation phase:

- Modify `test/daily-summary-assets.test.mjs`
  - Add behavior tests for `news_search`, source filtering, cache reuse, and non-leaking secrets.
- Modify `apps/research-console/lib/tool-policy.ts`
  - Allow `news_search` only when explicitly enabled and configured.
- Modify `apps/research-console/lib/agent-tools.ts`
  - Implement `news_search` execution, cache, source whitelist, and sanitized result summaries.
- Modify `apps/research-console/lib/agent-provider.ts`
  - Tighten model-facing tool description after `news_search` is executable.
- Modify `apps/research-console/lib/agent-kernel.ts`
  - Keep the current bounded multi-round planner; only change if tests prove the policy or trace surface is incomplete.
- Modify `apps/research-console/components/AgentPanel.tsx`
  - Add visible tool evidence and blocked-tool explanations if current UI is insufficient.
- Modify `apps/research-console/app/page.tsx`
  - Keep the floating agent layout local-first; add opportunity context links if needed.
- Modify `docs/opportunities/index.md`
  - Link the research console only for local/dev readers.
- Create `project-docs/research-agent/tooling.md`
  - Document environment variables, external tool policy, cache locations, and usage.

Do not modify these surfaces in this phase:

- `daily_summary_structured.py`
- `utils/structured_summary.py`
- `scripts/daily-summary.mjs`
- `scripts/notify-card.mjs`
- GitHub Actions publishing workflows

Those are summary production surfaces. They should only change when a task explicitly targets daily generation or notification.

---

## Task 1: Lock The `news_search` Safety Tests

**Files:**

- Modify: `test/daily-summary-assets.test.mjs`

- [ ] **Step 1: Add failing policy and execution test**

Append this test near the existing Alpha Vantage external tool tests:

```js
test("research console news search tool is opt-in, host-filtered, cached, and sanitized", async (t) => {
  const root = await createResearchFixture(t);
  const day = "2026-05-22";
  const context = {
    day,
    eventSummary: ["LITE and IREN were discussed around post-earnings momentum."],
    overview: [],
    adminCore: ["Only treat news as supporting evidence, not as a trading trigger by itself."],
    adminSymbols: ["LITE", "IREN"],
    risks: ["News confirmation can lag price action."],
  };
  const secret = "secret-news-key";
  const calls = [];

  const { authorizeResearchTool } = await loadResearchConsoleModule("lib/tool-policy.ts");
  const { executeResearchTool } = await loadResearchConsoleModule("lib/agent-tools.ts");

  assert.equal(authorizeResearchTool("news_search").status, "blocked");

  await withEnv(
    {
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
      NEWS_SEARCH_API_KEY: secret,
      NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com,www.reuters.com",
    },
    async () => {
      assert.equal(authorizeResearchTool("news_search").status, "allowed");

      await withFetch(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        assert.ok(String(url).startsWith("https://search.example.test/news"));
        assert.ok(String(url).includes("q=LITE+earnings"));
        assert.equal(init.headers.Authorization, `Bearer ${secret}`);
        assert.equal(String(url).includes(secret), false);
        assert.equal(JSON.stringify(init.body ?? "").includes(secret), false);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                title: "Yahoo Finance LITE earnings update",
                url: "https://finance.yahoo.com/news/lite-earnings",
                source: "Yahoo Finance",
                published_at: "2026-05-22T09:30:00Z",
                snippet: "LITE moves after earnings and guidance.",
              },
              {
                title: "Reuters IREN market context",
                url: "https://www.reuters.com/markets/iren-context",
                source: "Reuters",
                published_at: "2026-05-22T10:00:00Z",
                snippet: "Infrastructure names remain volatile.",
              },
              {
                title: "Blocked mirror result",
                url: "https://evil-finance.yahoo.com/news/lite",
                source: "Unknown Blog",
                snippet: "This result must not enter the summary.",
              },
            ],
          }),
        };
      }, async () => {
        const first = await executeResearchTool(
          { name: "news_search", input: { query: "LITE earnings" } },
          context,
        );

        assert.equal(first.name, "news_search");
        assert.match(first.result_summary, /Yahoo Finance/);
        assert.match(first.result_summary, /Reuters/);
        assert.match(first.result_summary, /finance\.yahoo\.com/);
        assert.doesNotMatch(first.result_summary, /evil-finance/);
        assert.doesNotMatch(first.result_summary, new RegExp(secret));
      });

      await withFetch(async () => {
        throw new Error("news_search should read the second call from cache");
      }, async () => {
        const second = await executeResearchTool(
          { name: "news_search", input: { query: "LITE earnings" } },
          context,
        );

        assert.match(second.result_summary, /cache/);
        assert.doesNotMatch(second.result_summary, new RegExp(secret));
      });

      assert.equal(calls.length, 1);
      const cacheFiles = await fs.readdir(
        path.join(root, ".cache", "research-tools", "news_search", day),
      );
      assert.equal(cacheFiles.length, 1);
      const cachedPayload = await fs.readFile(
        path.join(root, ".cache", "research-tools", "news_search", day, cacheFiles[0]),
        "utf8",
      );
      assert.equal(cachedPayload.includes(secret), false);
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test --test-name-pattern "news search" test/daily-summary-assets.test.mjs
```

Expected:

- FAIL because `authorizeResearchTool("news_search")` remains blocked after env setup, or because `executeResearchTool` falls back to `extract_watchlist`.

- [ ] **Step 3: Do not change implementation until the failure is observed**

If the test passes before implementation, inspect whether an earlier change already implemented `news_search`. Record that in the final task notes before proceeding.

---

## Task 2: Implement `news_search` Policy

**Files:**

- Modify: `apps/research-console/lib/tool-policy.ts`

- [ ] **Step 1: Add `news_search` to executable tool names**

Change:

```ts
const executableToolNames = new Set([
  ...LOCAL_RESEARCH_TOOLS.map((tool) => tool.name),
  "alpha_vantage_quote",
]);
```

to:

```ts
const executableToolNames = new Set([
  ...LOCAL_RESEARCH_TOOLS.map((tool) => tool.name),
  "alpha_vantage_quote",
  "news_search",
]);
```

- [ ] **Step 2: Add explicit `news_search` authorization**

Insert this branch after the Alpha Vantage branch:

```ts
if (
  name === "news_search" &&
  externalToolsEnabled() &&
  process.env.NEWS_SEARCH_ENDPOINT &&
  process.env.NEWS_SEARCH_ALLOWED_HOSTS
) {
  return {
    name,
    status: "allowed",
    reason:
      "news_search has explicit external-tool opt-in, a configured endpoint, and an allowed-host list; execution will cache filtered responses and return sanitized citations.",
  };
}
```

- [ ] **Step 3: Run targeted test**

Run:

```powershell
node --test --test-name-pattern "news search" test/daily-summary-assets.test.mjs
```

Expected:

- Still FAIL because the tool executor does not yet implement `news_search`.

---

## Task 3: Implement `news_search` Executor

**Files:**

- Modify: `apps/research-console/lib/agent-tools.ts`

- [ ] **Step 1: Expand external tool type**

Change:

```ts
export type ExternalResearchToolName = "alpha_vantage_quote";
```

to:

```ts
export type ExternalResearchToolName = "alpha_vantage_quote" | "news_search";
```

- [ ] **Step 2: Import crypto**

Add at the top:

```ts
import crypto from "node:crypto";
```

- [ ] **Step 3: Add query and host helpers**

Insert these helpers near `normalizeSymbol`:

```ts
function normalizeQuery(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function newsSearchCacheKey(query: string) {
  return crypto.createHash("sha1").update(query).digest("hex");
}

function allowedNewsHosts() {
  return (process.env.NEWS_SEARCH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedNewsUrl(url: string, allowedHosts: string[]) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((allowedHost) => (
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    ));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Add news payload formatter**

Insert this formatter after `formatAlphaVantageQuote`:

```ts
function formatNewsSearch(payload: unknown, fromCache: boolean, allowedHosts: string[]) {
  const rawResults =
    (payload as { results?: unknown[] })?.results ??
    (payload as { articles?: unknown[] })?.articles ??
    [];

  const results = rawResults
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? "").trim();
      const url = String(record.url ?? record.link ?? "").trim();
      const source = String(record.source ?? record.publisher ?? "").trim();
      const publishedAt = String(record.published_at ?? record.publishedAt ?? record.date ?? "").trim();
      const snippet = String(record.snippet ?? record.description ?? record.summary ?? "").trim();
      if (!title || !url || !isAllowedNewsUrl(url, allowedHosts)) return [];
      const hostname = new URL(url).hostname;
      return [{ title, url, source, publishedAt, snippet, hostname }];
    })
    .slice(0, 5);

  if (!results.length) {
    return `news_search${fromCache ? " cache" : ""}: no allowed-source results`;
  }

  return [
    `news_search${fromCache ? " cache" : ""}: ${results.length} allowed-source result(s)`,
    ...results.map((item, index) => {
      const meta = [
        item.source || item.hostname,
        item.publishedAt,
        item.hostname,
      ].filter(Boolean).join(", ");
      const snippet = item.snippet ? ` - ${item.snippet.slice(0, 180)}` : "";
      return `${index + 1}. ${item.title} (${meta}) ${item.url}${snippet}`;
    }),
  ].join("\n");
}
```

- [ ] **Step 4a: Add safe-cache sanitizer**

Insert this helper after `formatNewsSearch`:

```ts
function sanitizeNewsSearchPayload(payload: unknown, allowedHosts: string[]) {
  const rawResults =
    (payload as { results?: unknown[] })?.results ??
    (payload as { articles?: unknown[] })?.articles ??
    [];

  const results = rawResults.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = String(record.title ?? "").trim();
    const url = String(record.url ?? record.link ?? "").trim();
    const source = String(record.source ?? record.publisher ?? "").trim();
    const published_at = String(record.published_at ?? record.publishedAt ?? record.date ?? "").trim();
    const snippet = String(record.snippet ?? record.description ?? record.summary ?? "").trim();
    if (!title || !url || !isAllowedNewsUrl(url, allowedHosts)) return [];
    return [{ title, url, source, published_at, snippet }];
  });

  return { results };
}
```

- [ ] **Step 5: Add executor**

Insert this function after `executeAlphaVantageQuote`:

```ts
async function executeNewsSearch(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const query = normalizeQuery(call.input?.query) || normalizeQuery(context.adminSymbols[0]);
  const input = { query };

  if (!query) {
    return {
      name: "news_search",
      reason: "External news search requires a query derived from the user question or admin watchlist.",
      input,
      result_summary: "news_search skipped: missing query",
    };
  }

  const endpoint = process.env.NEWS_SEARCH_ENDPOINT;
  const allowedHosts = allowedNewsHosts();
  if (!endpoint || !allowedHosts.length) {
    return {
      name: "news_search",
      reason: "news_search requires NEWS_SEARCH_ENDPOINT and NEWS_SEARCH_ALLOWED_HOSTS.",
      input,
      result_summary: "news_search skipped: missing endpoint or allowed hosts",
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "news_search",
    context.day,
    `${newsSearchCacheKey(query)}.json`,
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "news_search",
      reason: "Read cached news search response to avoid repeated external queries.",
      input,
      result_summary: formatNewsSearch(cached, true, allowedHosts),
    };
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.NEWS_SEARCH_API_KEY) {
    headers.Authorization = `Bearer ${process.env.NEWS_SEARCH_API_KEY}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    return {
      name: "news_search",
      reason: "news_search request failed; the trace keeps the failure visible for audit.",
      input,
      result_summary: `news_search failed for ${query}: HTTP ${response.status}`,
    };
  }

  const payload = sanitizeNewsSearchPayload(await response.json(), allowedHosts);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    name: "news_search",
    reason: "Explicitly enabled external news search with source whitelist and local cache.",
    input,
    result_summary: formatNewsSearch(payload, false, allowedHosts),
  };
}
```

- [ ] **Step 6: Wire executor**

Add this branch before the default `extract_watchlist` fallback:

```ts
if (name === "news_search") {
  return executeNewsSearch(call, context);
}
```

- [ ] **Step 7: Run targeted test**

Run:

```powershell
node --test --test-name-pattern "news search" test/daily-summary-assets.test.mjs
```

Expected:

- PASS.

---

## Task 4: Add Kernel-Level News Tool Coverage

**Files:**

- Modify: `test/daily-summary-assets.test.mjs`

- [ ] **Step 1: Add kernel test**

Append this test near the existing kernel external quote test:

```js
test("research agent kernel executes opted-in news search from provider tool plan", async (t) => {
  const root = await createResearchFixture(t);
  const day = "2026-05-22";
  await writeResearchContextFixture(root, day);

  const { runResearchAgent } = await loadResearchConsoleModule("lib/agent-kernel.ts");
  const provider = {
    mode: "test-provider",
    selectToolPlan(input) {
      if (input.round > 0) return [];
      return [{ name: "news_search", input: { query: "LITE earnings" } }];
    },
    async generateResponse(input) {
      return {
        answer: input.toolTrace.map((tool) => tool.result_summary).join("\n"),
        reasoning_summary: ["news search was executed after policy approval"],
        next_watch_plan: ["compare news against admin theory before acting"],
        provider_status: "ready",
      };
    },
  };

  await withEnv(
    {
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
      NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com",
    },
    async () => {
      await withFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: "LITE earnings update",
              url: "https://finance.yahoo.com/news/lite-earnings",
              source: "Yahoo Finance",
              snippet: "Allowed source result.",
            },
          ],
        }),
      }), async () => {
        const result = await runResearchAgent({
          day,
          message: "Check whether LITE has confirming news.",
          provider,
        });

        assert.equal(result.tool_trace[0].name, "news_search");
        assert.match(result.answer, /LITE earnings update/);
        assert.equal(result.policy_decisions[0].status, "allowed");
      });
    },
  );
});
```

- [ ] **Step 2: Run kernel test**

Run:

```powershell
node --test --test-name-pattern "news search|opted-in news" test/daily-summary-assets.test.mjs
```

Expected:

- PASS.

---

## Task 5: Improve Model-Facing Tool Contract

**Files:**

- Modify: `apps/research-console/lib/agent-provider.ts`

- [ ] **Step 1: Update `news_search` tool metadata**

Change the `news_search` entry in `MODEL_PLANNING_TOOLS` to:

```ts
{
  name: "news_search",
  description:
    "Search recent market news for a specific ticker, company, or market event when external news evidence is needed. Use only for evidence gathering; policy may block it unless external tools are explicitly enabled.",
  input_schema: { query: "specific ticker, company, or event query" },
  source: "external",
  enabled: true,
},
```

- [ ] **Step 2: Add system instruction against vague news calls**

In the `selectToolPlan` request, change:

```ts
content: "You are planning research tool calls. Return tool_calls only when a tool is needed. Never include credentials.",
```

to:

```ts
content:
  "You are planning research tool calls. Return tool_calls only when a tool is needed. Never include credentials. For news_search, use a narrow query that includes a ticker, company name, or concrete market event.",
```

- [ ] **Step 3: Run provider tests**

Run:

```powershell
node --test --test-name-pattern "openai-compatible provider|tool_calls" test/daily-summary-assets.test.mjs
```

Expected:

- PASS.

---

## Task 6: Document Research Tool Environment

**Files:**

- Create: `project-docs/research-agent/tooling.md`

- [ ] **Step 1: Create the document**

Create `project-docs/research-agent/tooling.md` with this content:

```markdown
# Research Agent Tooling

This page documents the local research-console tool policy. It is not part of the public daily-summary publishing contract.

## Execution Modes

- Local deterministic provider: uses local summary and opportunity files only.
- OpenAI-compatible provider: can request tool calls, but every tool still passes through local policy.

## Environment Variables

| Variable | Required For | Purpose |
| --- | --- | --- |
| `AGENT_PROVIDER=openai-compatible` | model-backed agent | Enables OpenAI-compatible chat-completions provider. |
| `AGENT_API_BASE_URL` | model-backed agent | Base URL for `/chat/completions`. |
| `AGENT_MODEL` | model-backed agent | Model name used by the agent provider. |
| `AGENT_API_KEY` | model-backed agent | Server-side model API key. Never expose to browser code. |
| `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` | all external tools | Explicit opt-in for market/news tools. |
| `ALPHA_VANTAGE_API_KEY` | `alpha_vantage_quote` | Alpha Vantage quote API key. |
| `NEWS_SEARCH_ENDPOINT` | `news_search` | JSON news-search endpoint. |
| `NEWS_SEARCH_API_KEY` | `news_search` | Optional bearer token for the news endpoint. |
| `NEWS_SEARCH_ALLOWED_HOSTS` | `news_search` | Comma-separated source host whitelist, such as `finance.yahoo.com,www.reuters.com`. |

## Cache Locations

- Alpha Vantage quote cache: `.cache/research-tools/alpha_vantage_quote/YYYY-MM-DD/SYMBOL.json`
- News search cache: `.cache/research-tools/news_search/YYYY-MM-DD/<query-sha1>.json`

## Source Policy

`news_search` keeps only results whose URL hostname exactly matches or is a subdomain of a configured host. Example:

- Allowed: `finance.yahoo.com`
- Allowed if host is `yahoo.com`: `finance.yahoo.com`
- Blocked if host is `finance.yahoo.com`: `evil-finance.yahoo.com`

## Research Rule

External data is supporting evidence. It must not become a direct buy/sell instruction. The agent should compare external data against the admin theory, opportunity trigger, and risk invalidation conditions.
```

- [ ] **Step 2: Verify doc path is local-only or intentionally public**

Run:

```powershell
rg -n "research-agent|tooling" docs/.vitepress/config.mts docs
```

Expected:

- The new document exists.
- If it appears in public navigation, decide whether that is intended before shipping.

---

## Task 7: UI Evidence Pass

**Files:**

- Modify: `apps/research-console/components/AgentPanel.tsx`
- Modify: `apps/research-console/app/page.tsx`

- [ ] **Step 1: Inspect current UI**

Run:

```powershell
Get-Content -Raw apps\research-console\components\AgentPanel.tsx
Get-Content -Raw apps\research-console\app\page.tsx
```

Expected:

- Confirm whether tool trace, policy decisions, and used context are already visible enough.

- [ ] **Step 2: Add missing evidence display only if needed**

If tool traces are not visible, render each trace with:

```tsx
<section className="agent-evidence">
  <h3>工具证据</h3>
  {response.tool_trace.map((tool) => (
    <article key={`${tool.name}-${JSON.stringify(tool.input)}`}>
      <strong>{tool.name}</strong>
      <p>{tool.reason}</p>
      <pre>{tool.result_summary}</pre>
    </article>
  ))}
</section>
```

If blocked tools are not visible, render policy decisions with:

```tsx
<section className="agent-policy">
  <h3>工具策略</h3>
  {response.policy_decisions.map((decision) => (
    <article key={`${decision.name}-${decision.status}`}>
      <strong>{decision.name}: {decision.status}</strong>
      <p>{decision.reason}</p>
    </article>
  ))}
</section>
```

- [ ] **Step 3: Run console checks**

Run:

```powershell
npm run console:lint
npm run console:build
```

Expected:

- Both commands PASS.

---

## Task 8: Full Regression

**Files:**

- No direct code edits.

- [ ] **Step 1: Run summary tests**

Run:

```powershell
npm run test:summary
```

Expected:

- Node tests PASS.
- Python `unittest` tests PASS.

- [ ] **Step 2: Run console verification**

Run:

```powershell
npm run console:lint
npm run console:build
```

Expected:

- PASS.

- [ ] **Step 3: Run docs build**

Run:

```powershell
npm run pages:build
```

Expected:

- PASS.
- Public build remains current-month scoped.

- [ ] **Step 4: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected:

- No whitespace errors.
- CRLF warnings are acceptable only if they are the existing repository behavior and do not introduce invalid patches.

---

## Task 9: Optional Data Tool Roadmap

Do not implement these until `news_search` is green and the UI evidence pass is acceptable.

### Longbridge Quote Tool

Status: completed on 2026-05-23.

**Files:**

- Modify: `apps/research-console/lib/tool-policy.ts`
- Modify: `apps/research-console/lib/agent-tools.ts`
- Modify: `test/daily-summary-assets.test.mjs`

Policy:

- Require `RESEARCH_ENABLE_EXTERNAL_TOOLS=1`.
- Require Longbridge credentials through server-only environment variables.
- Cache under `.cache/research-tools/longbridge_quote/YYYY-MM-DD/SYMBOL.json`.
- Return price, change, timestamp, and market status only.

### yfinance Offline Calculation Tool

**Files:**

- Create: `scripts/research/yfinance_snapshot.py`
- Modify: `apps/research-console/lib/agent-tools.ts`
- Modify: `test/daily-summary-assets.test.mjs`

Policy:

- Keep Python as a bottom-layer calculation helper, not a scheduler.
- Node executor calls the Python helper only for explicit tool execution.
- Cache raw price history and derived metrics.

### Opportunity Scoring Tool

**Files:**

- Create: `packages/summary-core/src/opportunity-score.ts`
- Modify: `apps/research-console/lib/agent-tools.ts`
- Modify: `test/daily-summary-assets.test.mjs`

Output fields:

```ts
type OpportunityScore = {
  symbol: string;
  thesis_alignment: number;
  trigger_clarity: number;
  evidence_quality: number;
  invalidation_clarity: number;
  liquidity_risk: number;
  summary: string;
};
```

Rule:

- Score supports prioritization only.
- Score must not produce a buy/sell directive.

---

## Task 10: Integrate Opportunity Reasoning Into The Console

Status: completed on 2026-05-23.

**Files:**

- Modify: `apps/research-console/lib/context.ts`
- Modify: `apps/research-console/lib/opportunity-board.ts`
- Modify: `apps/research-console/components/OpportunityBoard.tsx`
- Modify: `apps/research-console/components/AgentPanel.tsx`
- Modify or create focused tests.

Goal:

- Convert selected-day local context into `buildOpportunityReasoning(input)`.
- Show staged output in the workbench as explainable research planning, not hidden CoT.
- Feed `marketIntelNeeds` and `nextChecks` into future model/tool planning prompts.

Constraints:

- Do not show raw local Markdown or full structured JSON in browser payloads.
- Do not expose raw chain-of-thought.
- Do not turn candidates into buy/sell/long/short instructions.

## Task 11: Add Market Data Source Status UI

Status: completed on 2026-05-22.

**Files:**

- Modify: `apps/research-console/components/AgentPanel.tsx` or create a child component.
- Modify: `apps/research-console/app/globals.css`.
- Use: `/api/research/data-sources`.

Goal:

- Show which evidence providers are configured, missing env, or planned.
- Keep the UI compact and diagnostic; it should not look like a trading terminal yet.

Constraints:

- Browser response must not include secret values.
- Status UI must not imply a provider has already queried live data.

## Task 12: Public Search Boundary Audit

Status: completed on 2026-05-22.

**Files:**

- Modify: `build_search_index.py`
- Modify: `test/test_structured_summary.py`

Goal:

- Decide whether public search should include only current-month public summaries.
- If yes, filter out old months, `*-local.md`, local audit records, and local-only research docs.

Why this matters:

- VitePress `srcExclude` controls generated pages, not necessarily generated JSON assets.
- Without this task, public search data can diverge from public page visibility.

Implementation evidence:

- `build_search_index.py` has `public_only=True` by default and explicit `public_only=False` escape hatch for local/full indexing.
- `test_search_index_public_mode_indexes_only_latest_month_public_daily_files` covers the public filter.
- `test_search_index_keeps_legacy_flat_summary_without_public_page_url` covers local/full mode.
- Verified with `npm run test:summary`, `npm run pages:build`, and `python build_search_index.py`.

---

## Task 20: Add YFinance History Evidence Tool

Status: completed on 2026-05-23.

**Files:**

- Added: `scripts/research/yfinance_history_snapshot.py`
- Modified: `apps/research-console/lib/agent-tools.ts`
- Modified: `apps/research-console/lib/tool-policy.ts`
- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `apps/research-console/lib/market-data-sources.ts`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `requirements.txt`
- Modified: `test/daily-summary-assets.test.mjs`

Goal:

- Add `yfinance_history` as an explicit opt-in external evidence tool for bounded historical trend, volatility, drawdown, and volume metrics.
- Keep Python as the calculation helper and Node as the policy/orchestration layer.
- Cache only sanitized metric snapshots under `.cache/research-tools/yfinance_history/YYYY-MM-DD/SYMBOL-PERIOD.json`.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "yfinance history" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.
- Direct executor calls without `RESEARCH_ENABLE_EXTERNAL_TOOLS=1` return blocked before reading cache.
- Fixture-driven tests verify metric-only output and cache content without contacting Yahoo Finance.

---

## Task 21: Plan YFinance History From Local Agent Intent

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-yfinance-history-planning.md`

Goal:

- Let the local deterministic provider plan `yfinance_history` when the user explicitly asks for historical validation, trend, drawdown, volatility, or volume expansion.
- Keep generic opportunity explanations local-only.
- Preserve the external-tool policy gate so history requests show as blocked when opt-in is missing.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "yfinance history for explicit historical validation|blocked yfinance history" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.

---

## Task 22: Render YFinance History Tool Trace Metrics

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-yfinance-history-trace-ui.md`

Goal:

- Render `yfinance_history` tool traces as compact metric cards in the agent panel.
- Keep the change browser-only and display-only; no API shape, cache, or external-tool behavior changes.
- Preserve plain-text fallback when a trace is malformed.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "yfinance history traces as metric cards" test\daily-summary-assets.test.mjs`.
- GREEN verified with `node --test --test-name-pattern "yfinance history traces as metric cards|score_opportunities traces" test\daily-summary-assets.test.mjs`.

---

## Task 23: Show Blocked Tools In Agent Run History

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-run-blocked-tools-ui.md`

Goal:

- Render `blocked_tools` in the run-history list so policy-gated evidence requests are visible without opening raw cache files.
- Keep blocked tools visually separate from executed `tool_names`.
- Avoid exposing raw traces, credentials, or local absolute paths.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "blocked tool tags" test\daily-summary-assets.test.mjs`.
- GREEN verified with `node --test --test-name-pattern "blocked tool tags|agent evidence log viewer" test\daily-summary-assets.test.mjs`.

---

## Task 24: Add Visible Evidence Digest To Agent Answers

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-answer-evidence-digest.md`

Goal:

- Add a compact visible evidence digest to local deterministic agent answers.
- Show executed tool summaries under `证据摘要`.
- Show blocked policy decisions under `策略阻断`.
- Keep the research-only boundary explicit in the answer text.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "evidence digest and blocked policy" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.

---

## Task 25: Add Current Response Evidence Detail Panel

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-response-evidence-panel.md`

Goal:

- Render a compact evidence-detail panel for the latest agent response.
- Show executed tool count, blocked policy count, provider state, workspace-relative evidence log path, bounded tool summaries, blocked policy rows, and research-only boundary.
- Keep full JSONL evidence local and avoid exposing raw Markdown, raw JSON, prompts, headers, secrets, or absolute local paths.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "current response evidence detail" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.

---

## Task 26: Add Structured Answer Contract

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-structured-answer-contract.md`

Goal:

- Stabilize local deterministic answers into `结论 / 证据 / 反证 / 下一步观察 / 研究边界`.
- Add the same structure requirement to the OpenAI-compatible prompt.
- Preserve newlines in the React answer display so the section contract is readable.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "stable research sections|agent contract supports multi-turn|server-only openai compatible" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.

---

## Task 27: Add Structured Evidence Needs

Status: completed on 2026-05-23.

**Files:**

- Modified: `packages/summary-core/src/index.ts`
- Modified: `apps/research-console/lib/opportunity-reasoning.ts`
- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `project-docs/research-agent/opportunity-reasoning.md`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `test/opportunity-reasoning.test.mjs`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-evidence-needs.md`

Goal:

- Add `EvidenceNeed` and `evidenceNeeds` to the shared opportunity-reasoning contract.
- Classify missing evidence as `quote`, `history`, `news`, or `fundamental` before external tool execution.
- Render evidence needs in the Agent panel separately from executed tool evidence.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "structured evidence needs|staged opportunity reasoning" test\opportunity-reasoning.test.mjs test\daily-summary-assets.test.mjs`.
- GREEN verified with the same command after implementation.

---

## Task 28: Plan Tools From Structured Evidence Needs

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `project-docs/research-agent/opportunity-reasoning.md`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-evidence-driven-tool-planning.md`

Goal:

- Use `opportunityReasoning.evidenceNeeds` as the default provider's structured planning source when the user asks to refresh or validate missing evidence.
- Map `quote`, `history`, `news`, and `fundamental` needs to existing external tools.
- Keep generic explanation requests local-only and preserve the existing external-tool policy gate.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "structured evidence needs|evidence needs|plans tools from structured evidence needs|plans yfinance only|plans yfinance history|blocked yfinance" test\daily-summary-assets.test.mjs test\opportunity-reasoning.test.mjs`.
- GREEN verified with the same focused command after implementation.

---

## Task 29: Include Evidence Needs In Model Prompts

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `project-docs/research-agent/opportunity-reasoning.md`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-model-prompt-evidence-needs.md`

Goal:

- Pass structured `evidenceNeeds` into the OpenAI-compatible prompt.
- Preserve server-side secret boundaries and the fixed answer format.
- Let model-backed planning see the same missing-evidence contract as the local provider.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "openai-compatible prompt includes structured evidence needs|openai-compatible provider parses model tool calls|server-only openai compatible" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.

---

## Task 30: Add One-Click Evidence Refresh In AgentPanel

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/research-agent/tooling.md`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-evidence-refresh-action.md`

Goal:

- Turn displayed `evidenceNeeds` into a low-friction UI action.
- Let the user click `刷新缺失证据` instead of manually entering the provider-recognized refresh prompt.
- Keep the action on the existing `/api/agent/chat` path so tool policy, evidence logs, and run history remain authoritative.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "one-click evidence refresh action" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.

---

## Task 31: Add Public Research Plan To Opportunity Reasoning

Status: completed on 2026-05-23.

**Files:**

- Modified: `packages/summary-core/src/index.ts`
- Modified: `apps/research-console/lib/opportunity-reasoning.ts`
- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/opportunity-reasoning.test.mjs`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/research-agent/tooling.md`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-public-research-plan.md`

Goal:

- Add a public, structured research workflow to the opportunity reasoning contract.
- Cover hypothesis mapping, evidence gaps, falsification, data planning, and synthesis boundaries.
- Keep this as public process metadata, not private chain-of-thought and not a trading instruction.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "public research plan" test\opportunity-reasoning.test.mjs`.
- RED verified with `node --test --test-name-pattern "renders staged opportunity reasoning|prompt includes structured evidence needs" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused commands after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.

---

## Task 32: Derive Research Plan Status In AgentPanel

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/research-agent/tooling.md`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-research-plan-status.md`

Goal:

- Derive each visible research-plan step status from the latest response's executed tools and blocked policy decisions.
- Keep status display-only: `done`, `blocked`, `pending`, or `process`.
- Avoid backend schema changes and keep full evidence details in the existing evidence log path.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "research plan status" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full checks passed: `npm run console:lint`, `npm run test:summary`, `npm run console:build`, `npm run pages:build`.

---

## Task 33: Add Agent Lifecycle Governance

Status: completed on 2026-05-23.

**Files:**

- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-lifecycle-governance.md`

Goal:

- Convert the "too many agents" problem into an explicit lifecycle contract.
- Set a default active-agent cap, close rule, delegation boundary, and main-agent review responsibility.
- Keep this as process governance; do not add runtime code or fake automation around subagent state.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "subagent lifecycle governance" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full relevant checks passed: `npm run test:summary`, `npm run pages:build`.

---

## Task 34: Add Collaboration Retrospective Cadence

Status: completed on 2026-05-23.

**Files:**

- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `project-docs/research-agent/modules/2026-05-23-collaboration-retrospective-cadence.md`

Goal:

- Convert the requested recurring collaboration review into an explicit project contract.
- Use a default cadence of every 10 user-assistant turns or after a meaningful module is completed.
- Keep retrospectives short and separate from implementation, testing, and deliverables.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "collaboration retrospective cadence" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full relevant checks passed: `npm run test:summary`, `npm run pages:build`.

---

## Task 35: Add Stable Model Prompt Context Sections

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/agent-provider.ts`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/research-agent/tooling.md`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/modules/2026-05-23-model-prompt-context-sections.md`

Goal:

- Make model-backed planning see stable section anchors for market-intel needs, invalidation plans, and next checks.
- Keep `Research plan:` and `Evidence needs:` as existing explicit sections.
- Avoid UI, provider schema, tool policy, or external-network changes.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "openai-compatible prompt includes structured evidence needs" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full relevant checks passed: `npm run test:summary`, `npm run console:build`, `npm run pages:build`.

---

## Task 36: Wait For Public Card Cover Before Webhook

Status: completed on 2026-05-23.

**Files:**

- Modified: `scripts/daily-publish.mjs`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/modules/2026-05-23-card-cover-availability-wait.md`

Goal:

- Avoid sending WeCom template-card payloads before the public summary-card cover image is deployed.
- Add a bounded and configurable URL availability wait before `sendWeWorkTemplateCard(...)`.
- Keep dry runs, `--skip-webhook`, and base64 image sending unaffected.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "public card cover" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Full relevant checks passed: `npm run test:summary`, `npm run daily:publish:dry`, `npm run pages:build`.

---

## Task 37: Add Optional Deploy Hook

Status: completed on 2026-05-23.

**Files:**

- Modified: `scripts/daily-publish.mjs`
- Modified: `.github/workflows/daily-publish.yml`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/modules/2026-05-23-optional-deploy-hook.md`

Goal:

- Allow `daily:publish` to explicitly trigger a public-site deployment after git publish and before WeCom webhook delivery.
- Keep the hook optional so existing local and GitHub Actions runs behave the same when `SUMMARY_DEPLOY_HOOK_URL` is unset.
- Avoid printing full hook URLs or secrets in logs.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "deploy hook" test\daily-summary-assets.test.mjs`.
- RED verified with `node --test --test-name-pattern "GitHub Actions schedules daily publish" test\daily-summary-assets.test.mjs`.
- GREEN verified with both focused commands after implementation.
- Full relevant checks passed: `npm run test:summary`, `npm run daily:publish:dry`, `npm run pages:build`, `git diff --check`.

---

## Task 38: Professionalize Opportunity Reasoning Fallbacks

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/lib/opportunity-reasoning.ts`
- Modified: `test/opportunity-reasoning.test.mjs`
- Modified: `project-docs/research-agent/opportunity-reasoning.md`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/modules/2026-05-23-opportunity-reasoning-professional-fallbacks.md`

Goal:

- Remove placeholder-like opportunity reasoning fallbacks from reader-facing output.
- Keep missing-evidence cases professional, Chinese-first, and explicitly research-only.
- Preserve the existing opportunity reasoning contract and no-trading-instruction boundary.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "fallback opportunity reasoning" test\opportunity-reasoning.test.mjs`.
- GREEN verified with `node --test test\opportunity-reasoning.test.mjs`.
- Full relevant checks passed: `npm run test:summary`, `npm run pages:build`, `git diff --check`.

---

## Task 39: Align Cloudflare Deploy Helper With PNPM Build

Status: completed on 2026-05-23.

**Files:**

- Modified: `scripts/deploy-cloudflare-pages.mjs`
- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/modules/2026-05-23-cloudflare-deploy-pnpm-build.md`

Goal:

- Keep local `pages:deploy` aligned with the pnpm workspace build path.
- Avoid falling back to `npm run docs:build` or requiring global `pnpm.cmd` after `package-lock.json` removal and pnpm migration.
- Preserve the existing `npx wrangler pages deploy ...` deploy step.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "cloudflare deploy helper builds" test\daily-summary-assets.test.mjs`.
- GREEN verified with `node --test --test-name-pattern "cloudflare deploy helper builds|cloudflare deploy dry run" test\daily-summary-assets.test.mjs`.
- Real dry-run verified with `npm run pages:deploy:dry`.
- Full relevant checks passed: `npm run test:summary`, `git diff --check`.

---

## Task 40: Lock Research Console Standalone Boundary

Status: completed on 2026-05-23.

**Files:**

- Added: `.github/workflows/research-console.yml`
- Added: `project-docs/research-agent/standalone-site-architecture.md`
- Added: `project-docs/research-agent/modules/2026-05-23-research-console-standalone-boundary.md`
- Modified: `test/daily-summary-assets.test.mjs`

Goal:

- Make the trading research workbench a separately verified application surface.
- Keep the public VitePress workflow focused on the daily report site.
- Record that future research-console hosting must be a separate protected deployment, not the existing public report deploy.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "research console.*separate|research console standalone" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Additional focused checks passed: `npm run console:lint`, `npm run console:build`.

---

## Task 41: Render Agent Answers As Section Cards

Status: completed on 2026-05-23.

**Files:**

- Modified: `apps/research-console/components/AgentPanel.tsx`
- Modified: `apps/research-console/app/globals.css`
- Modified: `test/daily-summary-assets.test.mjs`
- Added: `apps/research-console/lib/agent-answer-sections.ts`
- Added: `project-docs/research-agent/modules/2026-05-23-agent-answer-section-cards.md`

Goal:

- Render the visible structured answer sections as compact cards in the React agent panel.
- Keep parsing scoped to `结论 / 证据 / 反证 / 下一步观察 / 研究边界`.
- Preserve a plain-text fallback for malformed or model-backed free-form answers.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "structured agent answers as section cards" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Review fix: extracted `parseAgentAnswerSections(...)` into a pure module and added behavior coverage so free-form prefixes trigger full plain-text fallback instead of hiding text.
- Additional focused checks passed: `node --test --test-name-pattern "parses structured agent answers|structured agent answers as section cards|local research agent answer uses stable research sections|research console agent contract" test\daily-summary-assets.test.mjs`, `npm run console:build`.

---

## Task 42: Document Research Console Deployment Boundary

Status: completed on 2026-05-23.

**Files:**

- Modified: `test/daily-summary-assets.test.mjs`
- Modified: `project-docs/plans/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`
- Added: `project-docs/research-agent/research-console-deployment-boundary.md`
- Added: `project-docs/research-agent/modules/2026-05-23-research-console-deployment-boundary.md`

Goal:

- Record that the trading research workbench is a separate deployment from the VitePress public report site.
- Keep `stocks-emw.pages.dev` dedicated to static daily reports, current-month history, card covers, and WeCom public links.
- Require a protected deployment, separate environment scope, and server-side-only research secrets before any remote research-console hosting.

Implementation evidence:

- RED verified with `node --test --test-name-pattern "deployment boundary document" test\daily-summary-assets.test.mjs`.
- GREEN verified with the same focused command after implementation.
- Scope deliberately avoided changing `daily:publish`, VitePress routing, WeCom delivery, or actual deployment settings.

---

## Self-Review

Spec coverage:

- Local-first research console is covered by Tasks 7 and 8.
- `news_search` safety boundary is covered by Tasks 1-4.
- Model planning and tool-call behavior are covered by Task 5.
- Environment and usage documentation are covered by Task 6.
- Future Longbridge, Alpha Vantage, yfinance, and calculation direction is covered by Task 9.
- Daily summary publishing remains intentionally untouched in this plan.

Placeholder scan:

- The plan does not use placeholder markers or unspecified implementation tasks.
- Every code task includes exact files, code blocks, commands, and expected outcomes.

Type consistency:

- `NEWS_SEARCH_ALLOWED_HOSTS` is used consistently in tests, policy, implementation, and docs.
- `news_search` is consistently represented as an external tool name, policy-gated executor, and model-planning tool.
- Cache location is consistently `.cache/research-tools/news_search/YYYY-MM-DD/<query-sha1>.json`.

## Execution Recommendation

Use subagent-driven development for Tasks 1-4, with the main agent reviewing each patch before continuing.

Reason:

- These tasks have clear boundaries and are easy to test independently.
- The main risk is not implementation difficulty; it is policy leakage, source filtering, and accidental secret exposure.
- Review should focus on whether the code preserves deterministic, auditable behavior.
