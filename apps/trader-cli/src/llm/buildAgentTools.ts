import { isLongbridgeAgentReady } from "../services/longbridgeAgent.js";
import { createLongbridgeTools } from "./longbridgeTools.js";
import {
  getSystemPrompt,
  getSystemPromptWithLongbridge,
  INTEL_TOOLS,
} from "./tools.js";

export async function resolveAgentTools(): Promise<
  typeof INTEL_TOOLS & Partial<ReturnType<typeof createLongbridgeTools>>
> {
  if (!(await isLongbridgeAgentReady())) {
    return INTEL_TOOLS;
  }
  return { ...INTEL_TOOLS, ...createLongbridgeTools() };
}

export async function getAgentSystemPrompt(): Promise<string> {
  if (await isLongbridgeAgentReady()) {
    return getSystemPromptWithLongbridge();
  }
  return getSystemPrompt();
}
