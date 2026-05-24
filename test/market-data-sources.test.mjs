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

test("alpha vantage requires opt-in and env without leaking the key", async () => {
  const { listMarketDataSources } = await importMarketDataSources();
  const secret = "alpha-secret-value";

  const closedSources = listMarketDataSources({ ALPHA_VANTAGE_API_KEY: secret });
  const closedAlpha = closedSources.find((source) => source.name === "alpha-vantage");

  assert.ok(closedAlpha);
  assert.equal(closedAlpha.status.enabled, false);
  assert.equal(closedAlpha.status.reason, "missing-required-env");
  assert.match(JSON.stringify(closedAlpha.status.missingEnv), /RESEARCH_ENABLE_EXTERNAL_TOOLS/);
  assert.equal(closedAlpha.requiresSecret, true);
  assert.doesNotMatch(JSON.stringify(closedAlpha), new RegExp(secret));

  const openSources = listMarketDataSources({
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
    ALPHA_VANTAGE_API_KEY: secret,
  });
  const openAlpha = openSources.find((source) => source.name === "alpha-vantage");

  assert.ok(openAlpha);
  assert.equal(openAlpha.status.enabled, true);
  assert.equal(openAlpha.status.reason, "configured");
  assert.doesNotMatch(JSON.stringify(openAlpha), new RegExp(secret));
});

test("news search requires opt-in, endpoint, and allowed hosts", async () => {
  const { listMarketDataSources } = await importMarketDataSources();

  const closedSources = listMarketDataSources({
    NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
    NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com,www.reuters.com",
  });
  const closedNews = closedSources.find((source) => source.name === "news-search");

  assert.ok(closedNews);
  assert.equal(closedNews.status.enabled, false);
  assert.equal(closedNews.status.reason, "missing-required-env");
  assert.match(JSON.stringify(closedNews.status.missingEnv), /RESEARCH_ENABLE_EXTERNAL_TOOLS/);

  const missingHostSources = listMarketDataSources({
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
    NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
  });
  const missingHostNews = missingHostSources.find((source) => source.name === "news-search");
  assert.ok(missingHostNews);
  assert.equal(missingHostNews.status.enabled, false);
  assert.match(JSON.stringify(missingHostNews.status.missingEnv), /NEWS_SEARCH_ALLOWED_HOSTS/);

  const openSources = listMarketDataSources({
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
    NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
    NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com,www.reuters.com",
  });
  const openNews = openSources.find((source) => source.name === "news-search");

  assert.ok(openNews);
  assert.equal(openNews.status.enabled, true);
  assert.equal(openNews.status.reason, "configured");
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
