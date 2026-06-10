/**
 * Tool Registry Bootstrap — 注册中心入口
 *
 * 在 CLI 启动时调用，注册所有分组工具到 toolRegistry。
 * 此后 buildAgentTools.ts 通过 resolveTools("chat") 获取工具集。
 *
 * 注册顺序：market → sentiment → longbridge → workflow → memory
 * 每组分组的 enable/disable 通过环境变量控制（future）。
 */

import { registerTools } from "./toolRegistry.js";
import { MARKET_TOOLS } from "./toolRegistry.market.js";
import { SENTIMENT_TOOLS } from "./toolRegistry.sentiment.js";
import { LONGBRIDGE_TOOLS } from "./toolRegistry.longbridge.js";
import { WORKFLOW_TOOLS } from "./toolRegistry.workflow.js";
import { MEMORY_TOOLS } from "./toolRegistry.memory.js";
import { isLongbridgeAgentReady } from "../services/longbridgeAgent.js";

let bootstrapped = false;

export async function bootstrapToolRegistry(): Promise<void> {
  if (bootstrapped) return;

  // 1. 核心组 — 始终注册
  registerTools(MARKET_TOOLS);
  registerTools(SENTIMENT_TOOLS);
  registerTools(WORKFLOW_TOOLS);
  registerTools(MEMORY_TOOLS);

  // 2. Longbridge — 仅在已登录时注册
  if (await isLongbridgeAgentReady()) {
    registerTools(LONGBRIDGE_TOOLS);
  }

  bootstrapped = true;
}
