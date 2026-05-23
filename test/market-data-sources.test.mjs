import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

async function importMarketDataSources() {
  const sourcePath = path.resolve(
    "apps/research-console/lib/market-data-sources.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const tsModulePath = path.resolve(
    "apps/research-console/node_modules/typescript/lib/typescript.js",
  );
  const ts = await import(pathToFileURL(tsModulePath).href);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const tempDir = await mkdtemp(path.join(tmpdir(), "market-data-sources-"));
  const modulePath = path.join(tempDir, "market-data-sources.mjs");
  await writeFile(modulePath, compiled, "utf8");

  try {
    return await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

test("external providers are disabled by default without secrets", async () => {
  const { listMarketDataSources } = await importMarketDataSources();

  const sources = listMarketDataSources({});
  const externalProviders = sources.filter(
    (source) => source.source === "external",
  );

  assert.ok(externalProviders.length > 0);
  assert.ok(
    externalProviders.every((source) => source.status.enabled === false),
  );
});

test("alpha vantage is enabled by env without leaking the key", async () => {
  const { listMarketDataSources } = await importMarketDataSources();
  const secret = "alpha-secret-value";

  const sources = listMarketDataSources({ ALPHA_VANTAGE_API_KEY: secret });
  const alphaVantage = sources.find((source) => source.name === "alpha-vantage");

  assert.ok(alphaVantage);
  assert.equal(alphaVantage.status.enabled, true);
  assert.equal(alphaVantage.requiresSecret, true);
  assert.doesNotMatch(JSON.stringify(alphaVantage), new RegExp(secret));
});

test("yfinance is registered as planned or local-python", async () => {
  const { listMarketDataSources } = await importMarketDataSources();

  const sources = listMarketDataSources({});
  const yfinance = sources.find((source) => source.name === "yfinance");

  assert.ok(yfinance);
  assert.match(yfinance.source, /^(planned|local-python)$/);
  assert.equal(yfinance.requiresSecret, false);
});

test("yfinance becomes configured only after explicit external-tool opt-in", async () => {
  const { listMarketDataSources } = await importMarketDataSources();

  const closed = listMarketDataSources({});
  const closedYfinance = closed.find((source) => source.name === "yfinance");
  assert.ok(closedYfinance);
  assert.equal(closedYfinance.status.enabled, false);

  const open = listMarketDataSources({ RESEARCH_ENABLE_EXTERNAL_TOOLS: "1" });
  const openYfinance = open.find((source) => source.name === "yfinance");
  assert.ok(openYfinance);
  assert.equal(openYfinance.status.enabled, true);
  assert.equal(openYfinance.status.reason, "configured");
  assert.equal(openYfinance.requiresSecret, false);
});
