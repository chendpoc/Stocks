import fs from "node:fs/promises";
import path from "node:path";
import type {
  ResearchContextStatus,
  ResearchContextSummary,
  ResearchSelectedDayStatus,
  ResearchSourceKey,
  ResearchSourceStatus,
} from "@stock-summary/summary-core";

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
    sourceSummaryCandidates: [
      path.join(root, ...SUMMARIES_PARTS, month, `${day}-每日总结-local.md`),
      path.join(root, ...SUMMARIES_PARTS, month, `${day}-每日总结.md`),
    ],
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

async function listDirectoryNames(directory: string) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function listFileNames(directory: string) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function collectDaysFromMarkdown(root: string, parts: string[], pattern: RegExp) {
  const base = path.join(root, ...parts);
  const months = await listDirectoryNames(base);
  const daySet = new Set<string>();
  for (const month of months) {
    const files = await listFileNames(path.join(base, month));
    for (const file of files) {
      const match = file.match(pattern);
      if (match?.[1]) daySet.add(match[1]);
    }
  }
  return daySet;
}

export async function listAvailableResearchDays(root = workspaceRoot()): Promise<string[]> {
  const structuredDays = (await listDirectoryNames(path.join(root, ...STRUCTURED_DATA_PARTS)))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const opportunityDays = await collectDaysFromMarkdown(
    root,
    OPPORTUNITIES_PARTS,
    /^(\d{4}-\d{2}-\d{2})-机会观察\.md$/,
  );
  const summaryDays = await collectDaysFromMarkdown(
    root,
    SUMMARIES_PARTS,
    /^(\d{4}-\d{2}-\d{2})-每日总结(?:-local)?\.md$/,
  );

  return Array.from(new Set([
    ...structuredDays,
    ...opportunityDays,
    ...summaryDays,
  ])).sort((left, right) => right.localeCompare(left));
}

async function firstExistingPath(paths: string[]) {
  for (const filePath of paths) {
    if (await exists(filePath)) return filePath;
  }
  return paths[0];
}

async function hasStructuredForDay(root: string, day: string) {
  return exists(researchPaths(root, day).structuredPath);
}

async function resolveResearchDay(root: string, requestedDay?: string) {
  const normalized = requestedDay?.trim();
  if (normalized && normalized !== "latest") {
    validateDay(normalized);
    return {
      day: normalized,
      requestedDay: normalized,
      availableDays: await listAvailableResearchDays(root),
    };
  }

  const availableDays = await listAvailableResearchDays(root);
  const structuredDays = [];
  for (const candidate of availableDays) {
    if (await hasStructuredForDay(root, candidate)) structuredDays.push(candidate);
  }

  return {
    day: structuredDays[0] ?? availableDays[0] ?? normalized ?? "latest",
    requestedDay: normalized || "latest",
    availableDays,
  };
}

function sourceStatus(
  root: string,
  key: ResearchSourceKey,
  label: string,
  candidatePaths: string[],
  resolvedPath: string,
  available: boolean,
): ResearchSourceStatus {
  return {
    key,
    label,
    available,
    path: relativePath(root, resolvedPath),
    resolvedPath: available ? relativePath(root, resolvedPath) : undefined,
    candidates: candidatePaths.map((candidate) => relativePath(root, candidate)),
  };
}

function selectedDayStatus(input: {
  requestedDay: string;
  hasStructuredSummary: boolean;
  hasOpportunityObservation: boolean;
  hasSourceSummary: boolean;
  availableDays: string[];
}): ResearchSelectedDayStatus {
  const ready = input.hasStructuredSummary && input.hasOpportunityObservation && input.hasSourceSummary;
  if (input.requestedDay === "latest") {
    if (ready && input.hasStructuredSummary) return "latest_with_structured_context";
    return input.availableDays.length ? "latest_partial" : "no_sources";
  }
  return ready ? "exact_ready" : "exact_partial";
}

export async function inspectResearchContext(day?: string): Promise<ResearchContextStatus> {
  const root = workspaceRoot();
  const resolved = await resolveResearchDay(root, day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved.day)) {
    return {
      day: "",
      requestedDay: resolved.requestedDay,
      selectedDayStatus: "no_sources",
      availableDays: [],
      hasStructuredSummary: false,
      hasOpportunityObservation: false,
      hasSourceSummary: false,
      structuredSummaryPath: "",
      opportunityPath: "",
      sourceSummaryPath: "",
      sourceRefs: [],
      missingSources: [],
      sourceStatuses: [],
      eventSummaryCount: 0,
      overviewCount: 0,
      adminCoreCount: 0,
      adminSymbolCount: 0,
      riskCount: 0,
      adminSymbolsPreview: [],
      missing: ["structured_summary", "opportunity_observation", "local_summary_markdown"],
    };
  }

  const { day: resolvedDay } = resolved;
  const paths = researchPaths(root, resolvedDay);
  const sourceSummaryPath = await firstExistingPath(paths.sourceSummaryCandidates);
  const [hasStructuredSummary, hasOpportunityObservation, hasSourceSummary] = await Promise.all([
    exists(paths.structuredPath),
    exists(paths.opportunityPath),
    exists(sourceSummaryPath),
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
  const sourceStatuses = [
    sourceStatus(
      root,
      "structured_summary",
      "结构化日报",
      [paths.structuredPath],
      paths.structuredPath,
      hasStructuredSummary,
    ),
    sourceStatus(
      root,
      "opportunity_observation",
      "机会观察",
      [paths.opportunityPath],
      paths.opportunityPath,
      hasOpportunityObservation,
    ),
    sourceStatus(
      root,
      "source_summary",
      "每日总结",
      paths.sourceSummaryCandidates,
      sourceSummaryPath,
      hasSourceSummary,
    ),
  ];
  const sourceRefs = sourceStatuses
    .filter((status) => status.available)
    .map((status) => status.resolvedPath ?? status.path);

  return {
    day: resolvedDay,
    requestedDay: resolved.requestedDay,
    selectedDayStatus: selectedDayStatus({
      requestedDay: resolved.requestedDay,
      hasStructuredSummary,
      hasOpportunityObservation,
      hasSourceSummary,
      availableDays: resolved.availableDays,
    }),
    availableDays: resolved.availableDays,
    hasStructuredSummary,
    hasOpportunityObservation,
    hasSourceSummary,
    structuredSummaryPath: relativePath(root, paths.structuredPath),
    opportunityPath: relativePath(root, paths.opportunityPath),
    sourceSummaryPath: relativePath(root, sourceSummaryPath),
    sourceRefs,
    missingSources: sourceStatuses.filter((status) => !status.available),
    sourceStatuses,
    eventSummaryCount: asTextList(summary.event_summary).length,
    overviewCount: asTextList(summary.overview).length,
    adminCoreCount: asTextList(summary.admin_core).length,
    adminSymbolCount: adminSymbols.length,
    riskCount: asTextList(summary.risks).length,
    adminSymbolsPreview: adminSymbols.slice(0, 5),
    missing,
  };
}

export async function loadResearchContext(day?: string): Promise<ResearchContextSummary> {
  const root = workspaceRoot();
  const resolved = await resolveResearchDay(root, day);
  validateDay(resolved.day);
  const { structuredPath, opportunityPath, sourceSummaryCandidates } = researchPaths(root, resolved.day);
  const sourceSummaryPath = await firstExistingPath(sourceSummaryCandidates);

  const rawSummary = await fs.readFile(structuredPath, "utf8");
  const summary = JSON.parse(rawSummary) as StructuredSummary;
  const opportunityMarkdown = await readTextIfExists(opportunityPath);
  const sourceRefs = [
    relativePath(root, structuredPath),
    relativePath(root, opportunityPath),
    relativePath(root, sourceSummaryPath),
  ];

  return {
    day: resolved.day,
    sourceSummaryPath: relativePath(root, sourceSummaryPath),
    structuredSummaryPath: relativePath(root, structuredPath),
    opportunityPath: relativePath(root, opportunityPath),
    sourceRefs,
    eventSummary: asTextList(summary.event_summary),
    overview: asTextList(summary.overview),
    adminCore: asTextList(summary.admin_core),
    adminSymbols: extractSymbols(summary),
    risks: asTextList(summary.risks),
    opportunityMarkdown,
  };
}
