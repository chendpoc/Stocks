/**
 * Tool Registry — 工具注册中心
 *
 * 所有 Agent 可调用的工具在此单点注册。
 * 工具按「组」分类，按「scope」选择。
 *
 * 设计原则：
 * - 注册中心自身是 Agent 可见的工具（describeTools / describeTool）
 * - 分组定义权限边界（market/sentiment/longbridge/workflow/memory）
 * - resolveTools(scope) 按场景返回不同的工具子集
 */

import type { CoreTool } from "ai";
import { z } from "zod";

// ─── 类型定义 ───────────────────────────────────────────────

export type ToolGroup =
  | "market"
  | "sentiment"
  | "longbridge"
  | "workflow"
  | "memory";

export type ToolScope = "chat" | "decisionGraph" | "evidence";

export interface ToolDef {
  /** 全局唯一标识，如 "fetchMarketBars" */
  name: string;
  /** 分组 */
  group: ToolGroup;
  /** 简短描述（用于 describeTools 摘要） */
  summary: string;
  /** 工具实现 */
  implementation: CoreTool;
}

/** Scope → 允许的 group 映射 */
const SCOPE_GROUPS: Record<ToolScope, ToolGroup[]> = {
  chat: ["market", "sentiment", "longbridge", "workflow", "memory"],
  decisionGraph: ["market", "sentiment", "memory"],
  evidence: ["market", "sentiment", "memory"],
};

// ─── 注册表 ─────────────────────────────────────────────────

const registry = new Map<string, ToolDef>();

export function registerTool(def: ToolDef): void {
  if (registry.has(def.name)) {
    throw new Error(`Tool "${def.name}" already registered`);
  }
  registry.set(def.name, def);
}

export function registerTools(defs: ToolDef[]): void {
  for (const d of defs) registerTool(d);
}

// ─── 查询 API ───────────────────────────────────────────────

/** 按 scope 返回该场景下 Agent 可直接调用的工具集 */
export function resolveTools(scope: ToolScope): Record<string, CoreTool> {
  const allowed = SCOPE_GROUPS[scope];
  const tools: Record<string, CoreTool> = {};
  for (const [name, def] of registry) {
    if (allowed.includes(def.group)) {
      tools[name] = def.implementation;
    }
  }
  return tools;
}

/** 返回注册中心中的所有工具元数据（不含 implementation） */
export function listAllTools(): Omit<ToolDef, "implementation">[] {
  return Array.from(registry.values()).map(({ name, group, summary }) => ({
    name,
    group,
    summary,
  }));
}

/** 获取单个工具的完整定义 */
export function getToolDef(name: string): ToolDef | undefined {
  return registry.get(name);
}

/** 获取某个分组的所有工具 */
export function listGroupTools(group: ToolGroup): ToolDef[] {
  return Array.from(registry.values()).filter((d) => d.group === group);
}

// ─── describeTools / describeTool — 注册中心自身暴露给 Agent ─

export function createDescribeTools(): Record<string, CoreTool> {
  return {
    describeTools: {
      description:
        "列出当前所有可用工具的摘要（name + 分组 + 简短描述）。" +
        "首次对话或不确定有哪些工具时调用，按分类了解能力边界。",
      parameters: z.object({}),
      execute: async () => {
        const all = listAllTools();
        const grouped: Record<string, { name: string; summary: string }[]> = {};
        for (const t of all) {
          if (!grouped[t.group]) grouped[t.group] = [];
          grouped[t.group].push({ name: t.name, summary: t.summary });
        }
        return { tools: grouped, total: all.length };
      },
    } as CoreTool,

    describeTool: {
      description:
        "获取单个工具的完整参数 schema。当你从 describeTools 中看到一个工具但不确定怎么用时，调用此工具获取详细说明。",
      parameters: z.object({
        name: z.string().describe("工具名称"),
      }),
      execute: async ({ name }) => {
        const def = getToolDef(name);
        if (!def) return { error: `Tool "${name}" not found` };
        // 提取 tool 的 JSON schema（由 Vercel AI SDK 的 tool() 自动生成）
        const impl = def.implementation as Record<string, unknown>;
        return {
          name: def.name,
          group: def.group,
          summary: def.summary,
          parameters: (impl.parameters ?? "no schema available"),
        };
      },
    } as CoreTool,
  };
}
