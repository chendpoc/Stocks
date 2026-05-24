import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
let tsHookInstalled = false;

function installResearchTsHook() {
  if (tsHookInstalled) return;
  const typescriptPath = require.resolve("typescript", {
    paths: [path.resolve("apps/research-console")],
  });
  const ts = require(typescriptPath);

  require.extensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
        resolveJsonModule: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };

  tsHookInstalled = true;
}

function loadResearchConsoleModule(relativePath) {
  installResearchTsHook();
  const resolved = path.resolve(relativePath);
  delete require.cache[resolved];
  return require(resolved);
}

async function withTempWorkspace(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "research-context-"));
  const previousRoot = process.env.STOCK_SUMMARY_ROOT;
  process.env.STOCK_SUMMARY_ROOT = root;
  try {
    return await callback(root);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.STOCK_SUMMARY_ROOT;
    } else {
      process.env.STOCK_SUMMARY_ROOT = previousRoot;
    }
    await rm(root, { force: true, recursive: true });
  }
}

async function writeWorkspaceFile(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

test("research context defaults to latest structured research day and reports source availability", async () => {
  const { inspectResearchContext, loadResearchContext } = loadResearchConsoleModule(
    "apps/research-console/lib/context.ts",
  );

  await withTempWorkspace(async (root) => {
    await writeWorkspaceFile(
      root,
      "docs/summaries/2026-05/2026-05-23-每日总结.md",
      "# 2026-05-23 每日总结\n\n只有公开 summary，结构化机会观察尚未生成。",
    );
    await writeWorkspaceFile(
      root,
      "data/structured/2026-05-22/2026-05-22.json",
      JSON.stringify({
        event_summary: ["市场围绕 IREN 与 CIFR 分歧。"],
        overview: ["AI 基础设施仍是主线。"],
        admin_core: ["先看资金承接，再看价格触发。"],
        admin_symbols: [{ symbol: "IREN", summary: "算力基础设施观察" }],
        risks: ["如果成交量无法放大，观察失效。"],
      }),
    );
    await writeWorkspaceFile(
      root,
      "docs/opportunities/2026-05/2026-05-22-机会观察.md",
      "# 机会观察\n\nIREN 需要补充行情证据。",
    );
    await writeWorkspaceFile(
      root,
      "docs/summaries/2026-05/2026-05-22-每日总结.md",
      "# 2026-05-22 每日总结\n\n无 local 后缀，但应作为 source summary fallback。",
    );

    const latestStatus = await inspectResearchContext();

    assert.equal(latestStatus.day, "2026-05-22");
    assert.equal(latestStatus.requestedDay, "latest");
    assert.equal(latestStatus.selectedDayStatus, "latest_with_structured_context");
    assert.deepEqual(latestStatus.availableDays, ["2026-05-23", "2026-05-22"]);
    assert.equal(latestStatus.hasStructuredSummary, true);
    assert.equal(latestStatus.hasOpportunityObservation, true);
    assert.equal(latestStatus.hasSourceSummary, true);
    assert.match(latestStatus.sourceSummaryPath, /2026-05-22-每日总结\.md$/);
    assert.deepEqual(latestStatus.missingSources, []);
    assert.ok(latestStatus.sourceRefs.includes(latestStatus.structuredSummaryPath));
    assert.ok(latestStatus.sourceRefs.includes(latestStatus.opportunityPath));
    assert.ok(latestStatus.sourceRefs.includes(latestStatus.sourceSummaryPath));

    const context = await loadResearchContext();
    assert.equal(context.day, "2026-05-22");
    assert.match(context.sourceSummaryPath ?? "", /2026-05-22-每日总结\.md$/);
    assert.deepEqual(context.adminSymbols, ["IREN: 算力基础设施观察"]);
  });
});

test("research context explains an explicitly selected partial day instead of failing silently", async () => {
  const { inspectResearchContext } = loadResearchConsoleModule(
    "apps/research-console/lib/context.ts",
  );

  await withTempWorkspace(async (root) => {
    await writeWorkspaceFile(
      root,
      "docs/summaries/2026-05/2026-05-23-每日总结.md",
      "# 2026-05-23 每日总结\n\n公开 summary 已存在。",
    );

    const status = await inspectResearchContext("2026-05-23");

    assert.equal(status.day, "2026-05-23");
    assert.equal(status.requestedDay, "2026-05-23");
    assert.equal(status.selectedDayStatus, "exact_partial");
    assert.equal(status.hasSourceSummary, true);
    assert.equal(status.hasStructuredSummary, false);
    assert.equal(status.hasOpportunityObservation, false);
    assert.deepEqual(
      status.missingSources.map((source) => source.key),
      ["structured_summary", "opportunity_observation"],
    );
    assert.match(JSON.stringify(status.sourceStatuses), /每日总结\.md/);
  });
});
