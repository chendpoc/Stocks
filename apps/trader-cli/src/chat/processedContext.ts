import type { ChatMessage } from "../tui/types.js";

export type TaskMode = "quick" | "analysis" | "decision" | "review";

export interface CoreContract {
  identity: string;
  constraints: string[];
  language: string;
}

export interface MarketContext {
  regime?: string;
  focusSymbols: string[];
  keyEventsToday: string[];
  marketSummary?: string;
  updatedAt?: string;
}

export interface TaskContract {
  taskType: TaskMode;
  userQuestion: string;
  symbol?: string;
  successCriteria?: string;
}

export interface ToolView {
  name: string;
  group: string;
  summary: string;
  selected: boolean;
}

export interface RetrievedMemory {
  relatedDecisions: Array<Record<string, unknown>>;
  signalHistory: Array<Record<string, unknown>>;
  relevantNotes: string[];
  blocked?: string;
}

export interface WorkspaceState {
  sessionId: string;
  currentTopic?: string;
  openQuestions: string[];
  pendingActions: string[];
  stepCount: number;
  lastStep?: string;
}

export interface RiskPolicy {
  tradeActions: "blocked";
  longTermMemoryWrite: "confirm";
  externalNotification: "confirm";
  lowRiskLocalWrite: "auto_log";
  readOnlyData: "auto";
}

export interface SourceTrace {
  layer: keyof Omit<ProcessedContext, "id" | "version" | "asof" | "sourceTrace" | "tokenBudget">;
  source: string;
  asof: string;
}

export interface TokenBudgetReport {
  totalEstimated: number;
  byLayer: Record<string, number>;
  withinBudget: boolean;
  budgetLimit: number;
}

export interface ProcessedContext {
  id?: string;
  version: "chat-processed-context/v1";
  asof: string;
  core: CoreContract;
  marketContext: MarketContext;
  task: TaskContract;
  tools: ToolView[];
  retrieved: RetrievedMemory;
  workspace: WorkspaceState;
  riskPolicy: RiskPolicy;
  sourceTrace: SourceTrace[];
  tokenBudget: TokenBudgetReport;
}

export type BuildProcessedContextInput = {
  userMessage: string;
  messages: ChatMessage[];
  mode: TaskMode;
  toolViews: ToolView[];
  workspace: WorkspaceState;
  retrieved?: Partial<RetrievedMemory>;
  marketContext?: Partial<MarketContext>;
  budgetLimit?: number;
};

const DEFAULT_CORE: CoreContract = {
  identity: "trader-agent — 专注市场交易的 AI 助手",
  constraints: [
    "分析需有数据和证据支撑",
    "不确定时明确说明",
    "未经确认不执行交易操作",
  ],
  language: "zh-CN",
};

const DEFAULT_RISK: RiskPolicy = {
  tradeActions: "blocked",
  longTermMemoryWrite: "confirm",
  externalNotification: "confirm",
  lowRiskLocalWrite: "auto_log",
  readOnlyData: "auto",
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildProcessedContext(input: BuildProcessedContextInput): ProcessedContext {
  const asof = new Date().toISOString();
  const core = DEFAULT_CORE;
  const marketContext: MarketContext = {
    focusSymbols: input.marketContext?.focusSymbols ?? [],
    keyEventsToday: input.marketContext?.keyEventsToday ?? [],
    regime: input.marketContext?.regime,
    marketSummary: input.marketContext?.marketSummary,
    updatedAt: input.marketContext?.updatedAt ?? asof,
  };
  const task: TaskContract = {
    taskType: input.mode,
    userQuestion: input.userMessage,
    symbol: extractSymbol(input.userMessage),
    successCriteria: "给出有证据支撑的回答（含风险提示）",
  };
  const retrieved: RetrievedMemory = {
    relatedDecisions: input.retrieved?.relatedDecisions ?? [],
    signalHistory: input.retrieved?.signalHistory ?? [],
    relevantNotes: input.retrieved?.relevantNotes ?? [],
    blocked: input.retrieved?.blocked,
  };

  const layerPayloads: Record<string, string> = {
    core: JSON.stringify(core),
    marketContext: JSON.stringify(marketContext),
    task: JSON.stringify(task),
    tools: JSON.stringify(input.toolViews.map((t) => t.name)),
    retrieved: JSON.stringify(retrieved),
    workspace: JSON.stringify(input.workspace),
    riskPolicy: JSON.stringify(DEFAULT_RISK),
  };

  const budgetLimit = input.budgetLimit ?? 16_000;
  const byLayer: Record<string, number> = {};
  let totalEstimated = 0;
  for (const [layer, payload] of Object.entries(layerPayloads)) {
    const est = estimateTokens(payload);
    byLayer[layer] = est;
    totalEstimated += est;
  }

  const sourceTrace: SourceTrace[] = Object.keys(layerPayloads).map((layer) => ({
    layer: layer as SourceTrace["layer"],
    source: "chat/processedContext",
    asof,
  }));

  return {
    version: "chat-processed-context/v1",
    asof,
    core,
    marketContext,
    task,
    tools: input.toolViews,
    retrieved,
    workspace: input.workspace,
    riskPolicy: DEFAULT_RISK,
    sourceTrace,
    tokenBudget: {
      totalEstimated,
      byLayer,
      withinBudget: totalEstimated <= budgetLimit,
      budgetLimit,
    },
  };
}

export function hashProcessedContext(ctx: ProcessedContext): string {
  const payload = JSON.stringify({
    version: ctx.version,
    asof: ctx.asof,
    task: ctx.task,
    tools: ctx.tools.map((t) => t.name),
    workspace: ctx.workspace.sessionId,
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `pc_${hash.toString(16)}`;
}

function extractSymbol(message: string): string | undefined {
  const ticker = message.match(/\b[A-Z]{1,5}(?:\.(?:US|HK|SH|SZ|SG))?\b/);
  if (ticker) return ticker[0];
  const cn = message.match(/\b\d{6}\.(?:SH|SZ)\b/);
  if (cn) return cn[0];
  const hk = message.match(/\b\d{4,5}\.HK\b/i);
  if (hk) return hk[0].toUpperCase();
  return undefined;
}
