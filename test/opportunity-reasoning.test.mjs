import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
let researchTsHookInstalled = false;

function installResearchTsHook() {
  if (researchTsHookInstalled) return;
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
        resolveJsonModule: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };

  researchTsHookInstalled = true;
}

function loadResearchConsoleModule(relativePath) {
  installResearchTsHook();
  return require(path.resolve(relativePath));
}

function collectKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }

  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectKeys(child, keys);
  }
  return keys;
}

const fixtureInput = {
  summary: {
    day: "2026-05-22",
    overview: ["Admin theme: AI infrastructure capex remains the dominant market narrative."],
    eventSummary: ["NVDA supply-chain checks and hyperscaler capex commentary are the current evidence base."],
    risks: ["If capex guidance weakens or inventory builds, the theme should be re-evaluated."],
  },
  opportunity: {
    title: "AI infra follow-through watch",
    symbols: ["NVDA", "ANET"],
    hypothesis: "AI infrastructure demand may continue to support adjacent suppliers.",
    supportingEvidence: ["Admin summary links the theme to hyperscaler spending."],
    contradictingEvidence: ["Valuation sensitivity remains high."],
    trigger: ["Confirm with next earnings call demand commentary."],
    invalidation: ["Invalidate if capex commentary turns down or order growth stalls."],
    watchPlan: ["Check official filings and earnings transcripts before any escalation."],
  },
  context: {
    adminCore: ["AI infra is the core admin theory."],
    adminSymbols: ["NVDA", "ANET"],
    notes: ["Local deterministic test fixture."],
  },
};

test("buildOpportunityReasoning returns the staged reasoning contract", () => {
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning(fixtureInput);

  assert.deepEqual(Object.keys(result), [
    "context",
    "adminTheory",
    "marketIntelNeeds",
    "evidenceNeeds",
    "candidateOpportunities",
    "invalidationPlan",
    "nextChecks",
    "researchPlan",
    "reasoningSummary",
  ]);
  assert.equal(result.context.day, "2026-05-22");
  assert.ok(result.adminTheory.summary.includes("研究观察"));
  assert.ok(result.reasoningSummary.every((item) => item.includes("不是交易指令")));
});

test("buildOpportunityReasoning exposes a public research plan without private chain-of-thought", () => {
  const coreTypes = readFileSync("packages/summary-core/src/index.ts", "utf8");
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning(fixtureInput);

  assert.match(coreTypes, /interface ResearchPlanStep/);
  assert.match(coreTypes, /researchPlan:\s*ResearchPlanStep\[\]/);
  assert.deepEqual(
    result.researchPlan.map((step) => step.stage),
    ["hypothesis", "evidence", "falsification", "data_plan", "synthesis"],
  );
  for (const step of result.researchPlan) {
    assert.ok(step.title);
    assert.ok(step.question);
    assert.ok(step.method);
    assert.ok(step.expectedOutput);
    assert.ok(Array.isArray(step.toolHints));
  }
  assert.ok(result.researchPlan.every((step) => !/chain.of.thought|private cot|hidden reasoning/i.test(JSON.stringify(step))));
  assert.ok(result.researchPlan.every((step) => !/buy|sell|long|short/i.test(`${step.method} ${step.expectedOutput}`)));
});

test("buildOpportunityReasoning creates structured evidence needs before tool execution", () => {
  const coreTypes = readFileSync("packages/summary-core/src/index.ts", "utf8");
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning(fixtureInput);
  const kinds = new Set(result.evidenceNeeds.map((need) => need.kind));
  const symbols = new Set(result.evidenceNeeds.map((need) => need.symbol));

  assert.match(coreTypes, /interface EvidenceNeed/);
  assert.match(coreTypes, /kind:\s*"quote"\s*\|\s*"history"\s*\|\s*"news"\s*\|\s*"fundamental"/);
  assert.ok(kinds.has("quote"));
  assert.ok(kinds.has("history"));
  assert.ok(kinds.has("news"));
  assert.ok(kinds.has("fundamental"));
  assert.ok(symbols.has("NVDA"));
  assert.ok(symbols.has("ANET"));
  assert.ok(result.evidenceNeeds.every((need) => need.question));
  assert.ok(result.evidenceNeeds.every((need) => need.preferredTools.length > 0));
  assert.ok(result.evidenceNeeds.every((need) => need.required === true));
  assert.ok(result.evidenceNeeds.every((need) => !/buy|sell|long|short/i.test(need.question)));
});

test("buildOpportunityReasoning does not expose raw chain-of-thought fields", () => {
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning(fixtureInput);
  const forbiddenKeys = new Set(["raw", "cot", "chain_of_thought"]);
  const leakedKeys = collectKeys(result).filter((key) => forbiddenKeys.has(key.toLowerCase()));

  assert.deepEqual(leakedKeys, []);
});

test("candidate opportunities include source basis and invalidation", () => {
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning(fixtureInput);

  assert.ok(result.candidateOpportunities.length >= 2);
  for (const candidate of result.candidateOpportunities) {
    assert.ok(candidate.symbol);
    assert.ok(candidate.sourceBasis.length > 0);
    assert.ok(candidate.invalidation.length > 0);
    assert.ok(candidate.researchOnly);
  }
});

test("fallback opportunity reasoning uses professional Chinese research language", () => {
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning({
    summary: {
      day: "2026-05-22",
    },
  });
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(serialized, /placeholder|No source evidence|No explicit opportunity/i);
  assert.match(serialized, /研究观察，不是交易指令/);
  assert.match(serialized, /证据/);
  assert.match(serialized, /失效|反证|验证/);
  assert.ok(result.candidateOpportunities.every((candidate) => candidate.researchOnly));
});

test("candidate symbols prefer the normalized watchlist over prose tokens", () => {
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );

  const result = buildOpportunityReasoning({
    ...fixtureInput,
    opportunity: {
      ...fixtureInput.opportunity,
      symbols: ["LITE", "IREN"],
    },
    context: {
      ...fixtureInput.context,
      adminSymbols: [
        "LITE: wait for confirmation before a do T setup",
        "IREN: AI power line; A-share sentiment is only background context",
      ],
    },
  });

  assert.deepEqual(
    result.candidateOpportunities.map((candidate) => candidate.symbol),
    ["LITE", "IREN"],
  );
  assert.ok(result.marketIntelNeeds.every((need) => !need.startsWith("T:")));
  assert.ok(result.marketIntelNeeds.every((need) => !need.startsWith("A:")));
});

test("reasoning input can be built from bounded research context without raw markdown", () => {
  const { buildReasoningInputFromResearchContext, buildOpportunityReasoning } =
    loadResearchConsoleModule("apps/research-console/lib/opportunity-reasoning.ts");

  const input = buildReasoningInputFromResearchContext({
    day: "2026-05-22",
    sourceSummaryPath: "docs/summaries/2026-05/2026-05-22-每日总结-local.md",
    opportunityPath: "docs/opportunities/2026-05/2026-05-22-机会观察.md",
    eventSummary: ["LITE and IREN were the main observation lines."],
    overview: ["Admin theory prioritizes timing and capital acceptance."],
    adminCore: ["Only validate opportunities after price, time, and liquidity align."],
    adminSymbols: ["LITE: wait for confirmation window", "IREN: compute infrastructure theme"],
    risks: ["If volume fades, invalidate the observation."],
    opportunityMarkdown: "# 机会观察\n\nFull raw markdown should not be copied into reasoning input.",
  });
  const serialized = JSON.stringify(input);
  const result = buildOpportunityReasoning(input);

  assert.equal(input.summary.day, "2026-05-22");
  assert.deepEqual(input.opportunity.symbols, ["LITE", "IREN"]);
  assert.match(input.opportunity.hypothesis, /price, time, and liquidity/);
  assert.doesNotMatch(serialized, /Full raw markdown/);
  assert.equal(result.context.observationOnly, true);
  assert.deepEqual(
    result.candidateOpportunities.map((candidate) => candidate.symbol),
    ["LITE", "IREN"],
  );
});
