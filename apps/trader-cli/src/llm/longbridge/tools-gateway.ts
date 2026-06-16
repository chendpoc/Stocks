import { tool } from "ai";
import { z } from "zod";
import {
  runLongbridgeJson,
  validateLongbridgeInvoke,
} from "../../services/longbridgeCli.js";
import type { ToolDef } from "../toolRegistry.js";

export const GATEWAY_TOOLS: ToolDef[] = [
  {
    name: "longbridgeInvoke",
    group: "longbridge",
    summary: "调用白名单内只读 CLI 子命令。",
    implementation: tool({
      description:
        "【长桥·网关】调用白名单内只读 CLI 子命令（--format json）。禁止 order/交易。Tier1 已覆盖的命令请用具名工具。",
      parameters: z.object({
        command: z.string().describe("顶层子命令，如 option、filing、rank"),
        args: z
          .array(z.string())
          .optional()
          .describe("子命令参数，勿含 buy/sell/create 等"),
      }),
      execute: async ({ command, args }) => {
        const err = validateLongbridgeInvoke(command, args ?? []);
        if (err) return err;
        return runLongbridgeJson(command, args ?? []);
      },
    }),
  },
];
