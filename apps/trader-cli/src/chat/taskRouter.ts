import type { TaskMode } from "./processedContext.js";
import type { WorkspaceState } from "./processedContext.js";

export interface TaskClassification {
  mode: TaskMode;
  confidence: number;
  requiredTools: string[];
  contextBudget: number;
  reason: string;
}

const QUICK_PATTERNS = [
  /现在多少|多少钱|股价|quote|price|当前价/i,
  /^(TSLA|AAPL|NVDA|MSFT|GOOG|AMZN|META|BABA|700\.HK|\d{6}\.(SH|SZ))/i,
];

const DECISION_PATTERNS = [
  /加仓|减仓|买入|卖出|建仓|止损|should i (buy|sell)|decision/i,
  /根据.*信号|操作建议|值得买吗/i,
];

const REVIEW_PATTERNS = [
  /复盘|回顾|lesson|教训|今天决策|review|总结今天/i,
];

const ANALYSIS_PATTERNS = [
  /分析|走势|适合入场|技术面|基本面|analyze|analysis/i,
];

function hasTicker(message: string): boolean {
  return /\b[A-Z]{1,5}(?:\.(?:US|HK|SH|SZ|SG))?\b|\b\d{6}\.(?:SH|SZ)\b|\b\d{4,5}\.HK\b/i.test(message);
}

export function classifyTask(userMessage: string, _workspace?: WorkspaceState): TaskClassification {
  const msg = userMessage.trim();

  for (const pattern of REVIEW_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        mode: "review",
        confidence: 0.9,
        requiredTools: ["getLessons", "queryPatternHistory", "searchCorpus", "describeTools", "describeTool"],
        contextBudget: 8_000,
        reason: "rule: review intent keywords",
      };
    }
  }

  for (const pattern of DECISION_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        mode: "decision",
        confidence: 0.85,
        requiredTools: [],
        contextBudget: 16_000,
        reason: "rule: decision intent keywords",
      };
    }
  }

  // ANALYSIS 必须在 QUICK 之前匹配。
  // "TSLA 走势分析" 应命中分析意图，不能因以 ticker 开头被 QUICK 误判。
  for (const pattern of ANALYSIS_PATTERNS) {
    if (pattern.test(msg)) {
      return {
        mode: "analysis",
        confidence: 0.8,
        requiredTools: [],
        contextBudget: 10_000,
        reason: "rule: analysis intent keywords",
      };
    }
  }

  for (const pattern of QUICK_PATTERNS) {
    if (pattern.test(msg) && msg.length < 80) {
      return {
        mode: "quick",
        confidence: hasTicker(msg) ? 0.92 : 0.75,
        requiredTools: ["getMarketBars", "getLongbridgeQuote", "describeTools", "describeTool"],
        contextBudget: 4_000,
        reason: "rule: short quote-style query",
      };
    }
  }

  if (hasTicker(msg) && msg.length < 40) {
    return {
      mode: "quick",
      confidence: 0.7,
      requiredTools: ["getMarketBars", "getLongbridgeQuote", "describeTools", "describeTool"],
      contextBudget: 4_000,
      reason: "rule: short ticker-only message",
    };
  }

  return {
    mode: "analysis",
    confidence: 0.55,
    requiredTools: [],
    contextBudget: 10_000,
    reason: "fallback: ambiguous input → analysis",
  };
}
