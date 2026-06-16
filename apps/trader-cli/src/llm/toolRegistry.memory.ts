/**
 * Memory 组工具 — 复盘记忆与假设管理
 *
 * 注册 toolRegistry 中的 memory 组工具。
 * 这些工具提供语料检索、假设管理、历史复盘查询和模式记忆访问能力。
 */

import { tool } from "ai";
import { z } from "zod";
import { safeFetchIntel } from "../api/client.js";
import { auditHypothesis } from "./auditor.js";
import type { ToolDef } from "./toolRegistry.js";

export const MEMORY_TOOLS: ToolDef[] = [
  {
    name: "searchCorpus",
    group: "memory",
    summary: "在 Whop 群聊与文档语料中做全文检索。",
    implementation: tool({
      description: "在 Whop 群聊与文档语料中做全文检索",
      parameters: z.object({
        query: z.string(),
        symbol: z.string().optional(),
        limit: z.number().default(5),
      }),
      execute: async ({ query, symbol, limit }) => {
        const params = new URLSearchParams({ query, limit: String(limit) });
        if (symbol) params.set("symbol", symbol);
        return safeFetchIntel(`/corpus/search?${params.toString()}`);
      },
    }),
  },

  {
    name: "getRelatedHypotheses",
    group: "memory",
    summary: "获取同标的的历史假设（最近 N 条），用于连续跟踪分析。",
    implementation: tool({
      description: "获取同标的的历史假设（最近 N 条），用于连续跟踪分析",
      parameters: z.object({
        symbol: z.string(),
        limit: z.number().default(3),
      }),
      execute: async ({ symbol, limit }) =>
        safeFetchIntel(`/hypotheses?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
    }),
  },

  {
    name: "getLessons",
    group: "memory",
    summary: "查询历史复盘 lesson。",
    implementation: tool({
      description: "查询历史复盘 lesson",
      parameters: z.object({
        symbol: z.string().optional(),
        limit: z.number().default(20),
      }),
      execute: async ({ symbol, limit }) => {
        const params = new URLSearchParams({ limit: String(limit) });
        if (symbol) params.set("symbol", symbol);
        return safeFetchIntel(`/lessons?${params.toString()}`);
      },
    }),
  },

  {
    name: "saveHypothesis",
    group: "memory",
    summary: "审计通过后写入交易假设（同时生成 predictions）。",
    implementation: tool({
      description:
        "审计通过后写入交易假设（同时生成 predictions），signalId 来自 getSignals/scanSignals",
      parameters: z.object({
        signalId: z
          .string()
          .describe("信号 ID，如 TSLA_2026_05_31_08_higher_low_candidate"),
        claim: z.string(),
        professional_explanation: z.string(),
        plain_language_explanation: z.string(),
        candidate_explanations: z.array(z.string()),
        evidence_for: z.array(z.string()),
        evidence_against: z.array(z.string()),
        reasoning_gap: z.string().optional(),
        missing_evidence: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        tradability: z.enum([
          "no_trade",
          "watchlist",
          "setup_forming",
          "trade_candidate",
        ]),
        invalidation_condition: z.string(),
        predictions: z.array(
          z.object({
            window: z.string(),
            expected_outcome: z.string(),
            invalid_if: z.string(),
          }),
        ),
      }),
      execute: async ({
        signalId,
        claim,
        professional_explanation,
        plain_language_explanation,
        candidate_explanations,
        evidence_for,
        evidence_against,
        reasoning_gap,
        missing_evidence,
        confidence,
        tradability,
        invalidation_condition,
        predictions,
      }) => {
        const hypothesis = {
          claim,
          professional_explanation,
          plain_language_explanation,
          candidate_explanations,
          evidence_for,
          evidence_against,
          reasoning_gap,
          missing_evidence,
          confidence,
          tradability,
          invalidation_condition,
          predictions,
        };
        const issues = auditHypothesis(hypothesis);
        if (issues.blockers.length > 0) {
          return { error: "audit_blocked", blockers: issues.blockers };
        }
        return safeFetchIntel("/hypotheses", {
          method: "POST",
          json: {
            signal_id: signalId,
            ...hypothesis,
            audit_warnings: issues.warnings,
          },
        });
      },
    }),
  },

  {
    name: "queryPatternHistory",
    group: "memory",
    summary: "历史模式检索——这个 setup 上次触发时发生了什么？",
    implementation: tool({
      description:
        "查询某个标的 + pattern/setup 的历史模式记忆（market-agent pattern-memory）。" +
        "Agent 在做实时判断时应优先查询此工具——历史规律比单一 K 线更有说服力。",
      parameters: z.object({
        symbol: z.string().describe("标的代码"),
        setupName: z.string().describe("pattern/setup 标识，如 VWAP_Reclaim"),
        limit: z.number().default(3).describe("返回最近几条记录"),
      }),
      execute: async ({ symbol, setupName, limit }) => {
        const params = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          pattern_id: setupName,
          limit: String(limit),
        });
        return safeFetchIntel(`/market-agent/pattern-memory?${params.toString()}`);
      },
    }),
  },
];
