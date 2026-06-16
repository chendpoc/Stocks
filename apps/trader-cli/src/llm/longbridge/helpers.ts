import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { toLongbridgeSymbol } from "../../services/longbridge.js";
import { runLongbridgeJson } from "../../services/longbridgeCli.js";

export const sym = z.string().describe("标的代码，如 TSLA（无后缀补 .US）");

export function symTool(
  description: string,
  command: string,
  extra?: z.ZodRawShape,
  buildExtra?: (p: Record<string, unknown>) => string[],
): CoreTool {
  const shape = { symbol: sym, ...extra };
  return tool({
    description,
    parameters: z.object(shape),
    execute: async (params) => {
      const p = params as Record<string, unknown>;
      const args = [toLongbridgeSymbol(String(p.symbol))];
      if (buildExtra) args.push(...buildExtra(p));
      return runLongbridgeJson(command, args);
    },
  }) as CoreTool;
}
