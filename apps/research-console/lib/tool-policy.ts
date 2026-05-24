import type {
  AgentToolDefinition,
  AgentToolPolicyDecision,
  ResearchToolReadiness,
} from "@stock-summary/summary-core";
import type { ResearchToolName } from "./agent-tools";

export const LOCAL_RESEARCH_TOOLS: AgentToolDefinition[] = [
  {
    name: "load_structured_summary",
    description: "读取本地结构化日报 JSON，提取事件、管理员理论、风险和标的。",
    input_schema: { day: "YYYY-MM-DD" },
    source: "local",
    enabled: true,
  },
  {
    name: "load_opportunity_observation",
    description: "读取本地机会观察 Markdown，保留交易向推演和来源文档。",
    input_schema: { day: "YYYY-MM-DD" },
    source: "local",
    enabled: true,
  },
  {
    name: "extract_watchlist",
    description: "从结构化日报中抽取管理员重点标的，避免普通用户热度污染。",
    input_schema: { day: "YYYY-MM-DD" },
    source: "local",
    enabled: true,
  },
  {
    name: "score_opportunities",
    description: "Score admin watchlist symbols against local summary context without external API calls.",
    input_schema: { symbol: "optional ticker symbol" },
    source: "local",
    enabled: true,
  },
  {
    name: "cli_execute",
    description:
      "Plan and execute a local CLI command for personal research automation. Execution is server-only and requires explicit approval before the command runs.",
    input_schema: {
      command: "executable path or command name",
      args: "optional JSON array or whitespace-separated arguments",
      cwd: "optional working directory under the local project root",
      timeoutMs: "optional timeout in milliseconds",
      envKeys: "optional comma-separated environment variable names to expose by name only",
    },
    source: "local",
    enabled: true,
    approvalRequired: true,
  },
];

export const DISABLED_EXTERNAL_MARKET_TOOLS: AgentToolDefinition[] = [
  {
    name: "longbridge_quote",
    description: "预留：Longbridge 行情查询。需要独立 API key、速率限制和审计。",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: false,
  },
  {
    name: "alpha_vantage_quote",
    description: "预留：Alpha Vantage 免费行情/指标查询。需要独立 API key 和缓存策略。",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: false,
  },
  {
    name: "news_search",
    description: "预留：新闻搜索。需要来源白名单和引用策略。",
    input_schema: { query: "string" },
    source: "external",
    enabled: false,
  },
  {
    name: "yfinance_quote",
    description: "Local Python yfinance quote lookup. It requires explicit external-tool opt-in because yfinance queries Yahoo Finance.",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: false,
  },
  {
    name: "yfinance_history",
    description: "Local Python yfinance history snapshot. It returns bounded metric-only trend, drawdown, volatility, and volume evidence.",
    input_schema: { symbol: "string", period: "optional yfinance period, default 30d" },
    source: "external",
    enabled: false,
  },
];

const allowedLocalToolNames = new Set(LOCAL_RESEARCH_TOOLS.map((tool) => tool.name));
const disabledExternalToolNames = new Set(DISABLED_EXTERNAL_MARKET_TOOLS.map((tool) => tool.name));
const allResearchTools = [...LOCAL_RESEARCH_TOOLS, ...DISABLED_EXTERNAL_MARKET_TOOLS];
const executableToolNames = new Set([
  ...LOCAL_RESEARCH_TOOLS.map((tool) => tool.name),
  "longbridge_quote",
  "alpha_vantage_quote",
  "news_search",
  "yfinance_history",
  "yfinance_quote",
]);

function externalToolsEnabled() {
  return process.env.RESEARCH_ENABLE_EXTERNAL_TOOLS === "1";
}

export function authorizeResearchTool(name: string): AgentToolPolicyDecision {
  if (allowedLocalToolNames.has(name)) {
    return {
      name,
      status: "allowed",
      reason: name === "cli_execute"
        ? "Local CLI tool is available for personal research, but every command requires explicit approval before execution."
        : "本地只读工具已在当前阶段允许执行。",
    };
  }

  if (
    name === "longbridge_quote" &&
    externalToolsEnabled() &&
    process.env.LONGBRIDGE_APP_KEY &&
    process.env.LONGBRIDGE_APP_SECRET &&
    process.env.LONGBRIDGE_ACCESS_TOKEN
  ) {
    return {
      name,
      status: "allowed",
      reason:
        "Longbridge quote has explicit external-tool opt-in and server-side credentials; execution writes only sanitized quote evidence to local cache.",
    };
  }

  if (name === "alpha_vantage_quote" && externalToolsEnabled() && process.env.ALPHA_VANTAGE_API_KEY) {
    return {
      name,
      status: "allowed",
      reason: "Alpha Vantage 行情工具已显式启用，且 API key 已配置；执行结果会写入本地缓存并隐藏密钥。",
    };
  }

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

  if (name === "yfinance_quote" && externalToolsEnabled()) {
    return {
      name,
      status: "allowed",
      reason:
        "yfinance_quote has explicit external-tool opt-in. It runs through local Python, caches the sanitized quote, and does not require a secret.",
    };
  }

  if (name === "yfinance_history" && externalToolsEnabled()) {
    return {
      name,
      status: "allowed",
      reason:
        "yfinance_history has explicit external-tool opt-in. It runs through local Python, caches only metric snapshots, and does not require a secret.",
    };
  }

  if (disabledExternalToolNames.has(name)) {
    return {
      name,
      status: "blocked",
      reason: "外部行情/新闻工具仍处于预留状态，必须先配置 API key、缓存、速率限制和引用策略。",
    };
  }

  return {
    name,
    status: "blocked",
    reason: "未注册工具不允许执行。",
  };
}

export function isResearchToolName(name: string): name is ResearchToolName {
  return executableToolNames.has(name);
}

export function listResearchToolReadiness(): ResearchToolReadiness[] {
  return allResearchTools.map((tool) => {
    const policy = authorizeResearchTool(tool.name);
    return {
      ...tool,
      enabled: policy.status === "allowed",
      status: policy.status,
      policy,
    };
  });
}
