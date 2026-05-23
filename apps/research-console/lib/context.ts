import fs from "node:fs/promises";
import path from "node:path";
import type { ResearchContextStatus, ResearchContextSummary } from "@stock-summary/summary-core";

type StructuredSummary = {
  event_summary?: unknown[];
  overview?: unknown[];
  admin_core?: unknown[];
  admin_symbols?: unknown[];
  key_symbols?: unknown[];
  risks?: unknown[];
};

const STRUCTURED_DATA_PARTS = ["data", "structured"];
const OPPORTUNITIES_PARTS = ["docs", "opportunities"];
const SUMMARIES_PARTS = ["docs", "summaries"];

function workspaceRoot() {
  return process.env.STOCK_SUMMARY_ROOT
    ? path.resolve(process.env.STOCK_SUMMARY_ROOT)
    : path.resolve(process.cwd(), "../..");
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return Object.entries(item)
          .filter(([, raw]) => raw !== undefined && raw !== null && String(raw).trim())
          .map(([key, raw]) => `${key}: ${raw}`)
          .join("; ");
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

function extractSymbols(summary: StructuredSummary) {
  const source = Array.isArray(summary.admin_symbols) && summary.admin_symbols.length
    ? summary.admin_symbols
    : summary.key_symbols ?? [];
  return source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const symbol = String(record.symbol ?? record.ticker ?? record.code ?? "").trim();
        const detail = String(record.summary ?? record.name ?? record.reason ?? "").trim();
        if (symbol && detail) return `${symbol}: ${detail}`;
        if (symbol) return symbol;
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean)
    .slice(0, 12);
}

function validateDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid research date: ${day}`);
  }
}

function researchPaths(root: string, day: string) {
  const month = day.slice(0, 7);
  return {
    structuredPath: path.join(root, ...STRUCTURED_DATA_PARTS, day, `${day}.json`),
    opportunityPath: path.join(root, ...OPPORTUNITIES_PARTS, month, `${day}-机会观察.md`),
    sourceSummaryPath: path.join(root, ...SUMMARIES_PARTS, month, `${day}-每日总结-local.md`),
  };
}

function relativePath(root: string, filePath: string) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function readTextIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "";
    throw error;
  }
}

export async function inspectResearchContext(day: string): Promise<ResearchContextStatus> {
  validateDay(day);
  const root = workspaceRoot();
  const paths = researchPaths(root, day);
  const [hasStructuredSummary, hasOpportunityObservation, hasSourceSummary] = await Promise.all([
    exists(paths.structuredPath),
    exists(paths.opportunityPath),
    exists(paths.sourceSummaryPath),
  ]);
  const summary = hasStructuredSummary
    ? JSON.parse(await fs.readFile(paths.structuredPath, "utf8")) as StructuredSummary
    : {};
  const adminSymbols = extractSymbols(summary);
  const missing = [
    hasStructuredSummary ? "" : "structured_summary",
    hasOpportunityObservation ? "" : "opportunity_observation",
    hasSourceSummary ? "" : "local_summary_markdown",
  ].filter(Boolean);

  return {
    day,
    hasStructuredSummary,
    hasOpportunityObservation,
    hasSourceSummary,
    structuredSummaryPath: relativePath(root, paths.structuredPath),
    opportunityPath: relativePath(root, paths.opportunityPath),
    sourceSummaryPath: relativePath(root, paths.sourceSummaryPath),
    eventSummaryCount: asTextList(summary.event_summary).length,
    overviewCount: asTextList(summary.overview).length,
    adminCoreCount: asTextList(summary.admin_core).length,
    adminSymbolCount: adminSymbols.length,
    riskCount: asTextList(summary.risks).length,
    adminSymbolsPreview: adminSymbols.slice(0, 5),
    missing,
  };
}

export async function loadResearchContext(day: string): Promise<ResearchContextSummary> {
  validateDay(day);

  const root = workspaceRoot();
  const { structuredPath, opportunityPath, sourceSummaryPath } = researchPaths(root, day);

  const rawSummary = await fs.readFile(structuredPath, "utf8");
  const summary = JSON.parse(rawSummary) as StructuredSummary;
  const opportunityMarkdown = await readTextIfExists(opportunityPath);

  return {
    day,
    sourceSummaryPath: relativePath(root, sourceSummaryPath),
    opportunityPath: relativePath(root, opportunityPath),
    eventSummary: asTextList(summary.event_summary),
    overview: asTextList(summary.overview),
    adminCore: asTextList(summary.admin_core),
    adminSymbols: extractSymbols(summary),
    risks: asTextList(summary.risks),
    opportunityMarkdown,
  };
}
