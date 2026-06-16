import type { ToolDef } from "../toolRegistry.js";
import { ACCOUNT_TOOLS } from "./tools-account.js";
import { GATEWAY_TOOLS } from "./tools-gateway.js";
import {
  MARKET_DATA_TOOLS,
  MARKET_OVERVIEW_TOOLS,
} from "./tools-market.js";
import { RESEARCH_TOOLS } from "./tools-research.js";

/** Preserves original LONGBRIDGE_TOOLS registration order. */
export const LONGBRIDGE_TOOLS: ToolDef[] = [
  ...MARKET_DATA_TOOLS,
  ...RESEARCH_TOOLS,
  ...MARKET_OVERVIEW_TOOLS,
  ...ACCOUNT_TOOLS,
  ...GATEWAY_TOOLS,
];

export const LONGBRIDGE_TOOL_NAMES = LONGBRIDGE_TOOLS.map((t) => t.name);
