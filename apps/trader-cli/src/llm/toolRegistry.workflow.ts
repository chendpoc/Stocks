/**
 * Workflow 组工具 — Agent 路由核心
 *
 * 注册 toolRegistry 中的 workflow 组工具。
 * Agent 通过 listWorkflows 了解可用 workflow，通过 runWorkflow 触发执行，
 * 通过 getWorkflowStatus 查询运行状态。
 *
 * 执行路径：全部走 POST /api/intel/{workflowId}（Backend API）
 * 设计依据: 14_llm_reasoning_strategy.md §9 工具注册中心
 */

import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../../api/client.js";
import type { ToolDef } from "./toolRegistry.js";

export const WORKFLOW_TOOLS: ToolDef[] = [
  {
    name: "listWorkflows",
    group: "workflow",
    summary: "获取所有可用 workflow 的目录（id、描述、输入、产出、预计耗时）。",
    implementation: tool({
      description:
        "列出系统中所有可用的 workflow（decision/outcome/evaluation/insightExploration/alphaResearch）。" +
        "每个 workflow 返回: id、描述、输入要求、产出内容、预计耗时。首次对话或不确定有哪些 workflow 时调用。",
      parameters: z.object({}),
      execute: async () => fetchIntel("/workflows"),
    }),
  },

  {
    name: "runWorkflow",
    group: "workflow",
    summary:
      "触发 workflow 运行。绿色/黄色级别自主触发，红色级别（alphaResearch）需用户确认。",
    implementation: tool({
      description:
        "触发指定 workflow 运行。decision/outcome 可自主触发（≥3 证据源 + signal_strength>0.3）。" +
        "evaluation/insightExploration/alphaResearch 需展示触发依据并等待用户回车确认。",
      parameters: z.object({
        workflowId: z
          .enum([
            "decision",
            "outcome",
            "evaluation",
            "insightExploration",
            "alphaResearch",
          ])
          .describe("workflow ID，来自 listWorkflows 返回值"),
        inputs: z
          .record(z.unknown())
          .describe(
            "workflow 输入参数，如 { symbols: ['TSLA'], regime: 'trending' }",
          ),
      }),
      execute: async ({ workflowId, inputs }) =>
        fetchIntel(`/workflows/${workflowId}`, {
          method: "POST",
          body: JSON.stringify(inputs),
        }),
    }),
  },

  {
    name: "getWorkflowStatus",
    group: "workflow",
    summary: "查询 workflow 运行状态（running/completed/failed）和结果。",
    implementation: tool({
      description:
        "查询指定 run 的状态和进度。runId 来自 runWorkflow 返回值。" +
        "返回: { status: 'running'|'completed'|'failed', progress?, result? }。" +
        "不要在短时间高频轮询——workflow 完成后再查一次即可。",
      parameters: z.object({
        runId: z.string().describe("runId，来自 runWorkflow 返回值"),
      }),
      execute: async ({ runId }) =>
        fetchIntel(`/workflows/runs/${encodeURIComponent(runId)}`),
    }),
  },
];
