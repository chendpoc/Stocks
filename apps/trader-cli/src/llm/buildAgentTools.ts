import type { CoreTool } from "ai";
import { bootstrapToolRegistry } from "./toolRegistry.bootstrap.js";
import { resolveTools, createDescribeTools } from "./toolRegistry.js";
import {
  getSystemPrompt,
  getSystemPromptWithLongbridge,
} from "./tools.js";
import { isLongbridgeAgentReady } from "../services/longbridgeAgent.js";

let registryBooted = false;

async function ensureRegistry(): Promise<void> {
  if (!registryBooted) {
    await bootstrapToolRegistry();
    registryBooted = true;
  }
}

/** 获取 Chat Agent 可用的全部工具（market + sentiment + longbridge + workflow + memory + describe） */
export async function resolveAgentTools(): Promise<Record<string, CoreTool>> {
  await ensureRegistry();
  const hasLongbridge = await isLongbridgeAgentReady();

  const tools = resolveTools("chat");
  const describe = createDescribeTools();

  // Longbridge 已在 bootstrap 中根据登录状态注册，无需重复处理
  return { ...tools, ...describe };
}

/** 获取 Agent system prompt（根据 Longbridge 登录状态选择） */
export async function getAgentSystemPrompt(): Promise<string> {
  await ensureRegistry();
  if (await isLongbridgeAgentReady()) {
    return getSystemPromptWithLongbridge();
  }
  return getSystemPrompt();
}
