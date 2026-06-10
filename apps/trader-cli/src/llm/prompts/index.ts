/**
 * Agent System Prompts 统一导出
 *
 * 持有各 Agent 的 system prompt，供 daemon 和测试共同读取。
 */

import { DAEMON_GATE_SYSTEM_PROMPT } from "./daemonGate.js";
import { PRE_MARKET_SYSTEM_PROMPT } from "./preMarket.js";
import { MID_DAY_DEEP_SYSTEM_PROMPT } from "./midDayDeep.js";
import { SWARM_LEAD_SYSTEM_PROMPT } from "./swarmLead.js";
import { POST_MARKET_SYSTEM_PROMPT } from "./postMarket.js";
import { MACRO_SYSTEM_PROMPT } from "./macro.js";

export {
  DAEMON_GATE_SYSTEM_PROMPT,
  MACRO_SYSTEM_PROMPT,
  MID_DAY_DEEP_SYSTEM_PROMPT,
  POST_MARKET_SYSTEM_PROMPT,
  PRE_MARKET_SYSTEM_PROMPT,
  SWARM_LEAD_SYSTEM_PROMPT,
};

export type AgentId =
  | "daemon"
  | "pre-market"
  | "mid-day-deep"
  | "swarm-lead"
  | "post-market"
  | "macro";

export type AgentIO = {
  produces: string[];
  consumes: string[];
};

export const AGENT_IO: Record<AgentId, AgentIO> = {
  daemon: {
    produces: ["handoff"],
    consumes: ["market_snapshot", "dynamic_tasks", "gate_decision"],
  },
  "pre-market": {
    produces: ["evidence_text", "alerts"],
    consumes: ["market_snapshot", "events", "watchlist"],
  },
  "mid-day-deep": {
    produces: ["evidence_text", "confidence_contribution"],
    consumes: ["market_snapshot", "symbol_setup", "events"],
  },
  "swarm-lead": {
    produces: ["worker_outcomes", "decision_envelope"],
    consumes: ["symbols", "setups", "market_snapshot"],
  },
  "post-market": {
    produces: ["outcomes", "lessons", "portfolio_updates"],
    consumes: ["decision_envelope", "events", "market_snapshot"],
  },
  macro: {
    produces: ["regime", "macro_view"],
    consumes: ["market_snapshot", "rates", "economic_events"],
  },
};

/**
 * 根据 Agent ID 返回对应 system prompt。不存在的 ID 返回空字符串。
 */
export function getAgentSystemPromptById(agentId: string): string {
  const prompts: Record<AgentId | string, string> = {
    daemon: DAEMON_GATE_SYSTEM_PROMPT,
    "pre-market": PRE_MARKET_SYSTEM_PROMPT,
    "mid-day-deep": MID_DAY_DEEP_SYSTEM_PROMPT,
    "swarm-lead": SWARM_LEAD_SYSTEM_PROMPT,
    "post-market": POST_MARKET_SYSTEM_PROMPT,
    macro: MACRO_SYSTEM_PROMPT,
  };

  return prompts[agentId] ?? "";
}
