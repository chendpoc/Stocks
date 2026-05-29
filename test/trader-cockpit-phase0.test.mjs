import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cockpitRoot = path.join(repoRoot, "apps", "trader-cockpit");

function repoPath(...segments) {
  return path.join(repoRoot, ...segments);
}

function readText(...segments) {
  return fs.readFileSync(repoPath(...segments), "utf8");
}

function assertFile(...segments) {
  const target = repoPath(...segments);
  assert.equal(fs.existsSync(target), true, `Expected file to exist: ${path.relative(repoRoot, target)}`);
}

function assertMissing(...segments) {
  const target = repoPath(...segments);
  assert.equal(fs.existsSync(target), false, `Expected file to be absent: ${path.relative(repoRoot, target)}`);
}

function readDashboardSources() {
  return [
    ["components", "cockpit", "dashboard", "LiveDashboard.tsx"],
    ["components", "cockpit", "dashboard", "DashboardHeader.tsx"],
    ["components", "cockpit", "dashboard", "DashboardMarketIntentStrip.tsx"],
    ["components", "cockpit", "dashboard", "DashboardSignalsQueue.tsx"],
    ["components", "cockpit", "dashboard", "DashboardStatusCards.tsx"],
    ["components", "cockpit", "dashboard", "DashboardTodayFocus.tsx"],
  ]
    .map((segments) => readText("apps", "trader-cockpit", ...segments))
    .join("\n");
}

function readSignalsSources() {
  return [
    ["components", "cockpit", "signals", "SignalsWorkspace.tsx"],
    ["lib", "cockpit", "style-utils.ts"],
  ]
    .map((segments) => readText("apps", "trader-cockpit", ...segments))
    .join("\n");
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

test("trader-cockpit package declares HeroUI cockpit dependencies", () => {
  const pkg = JSON.parse(readText("apps", "trader-cockpit", "package.json"));
  const dependencies = pkg.dependencies ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  const expected = [
    "@heroui/react",
    "@heroui/styles",
    "@tanstack/react-query",
    "framer-motion",
    "i18next",
    "lucide-react",
    "next",
    "react",
    "react-dom",
    "react-i18next",
    "zustand",
  ];

  assert.deepEqual(Object.keys(dependencies).sort(), expected.sort());
  for (const dependency of expected) {
    assert.ok(dependencies[dependency], `Missing dependency ${dependency}`);
  }

  assert.match(devDependencies.tailwindcss, /^\^4\./, "HeroUI v3 requires Tailwind CSS v4");
  assert.match(devDependencies["@tailwindcss/postcss"], /^\^4\./, "Tailwind v4 requires @tailwindcss/postcss");
  assert.equal(devDependencies.autoprefixer, undefined, "Tailwind v4 handles prefixing without autoprefixer");
});

test("trader-cockpit configures HeroUI v3 with Tailwind v4", () => {
  const globals = readText("apps", "trader-cockpit", "app", "globals.css");
  const postcss = readText("apps", "trader-cockpit", "postcss.config.mjs");
  const tailwindConfig = readText("apps", "trader-cockpit", "tailwind.config.ts");
  const providers = readText("apps", "trader-cockpit", "lib", "cockpit", "providers.tsx");

  assert.match(globals, /@import\s+"tailwindcss"/);
  assert.doesNotMatch(globals, /node_modules\/@heroui\/styles\/dist\/heroui\.min\.css/);
  assert.doesNotMatch(globals, /@heroui\/styles\/dist\/heroui\.min\.css/);
  assert.match(globals, /@import\s+"@heroui\/styles"/);
  assert.match(globals, /@config\s+"\.\.\/tailwind\.config\.ts"/);
  assert.match(globals, /@custom-variant\s+dark/);
  assert.doesNotMatch(globals, /--card|--panel|--positive/);
  assert.doesNotMatch(globals, /rgb\(var\(--/);
  assert.doesNotMatch(tailwindConfig, /rgb\(var\(--/);
  assert.doesNotMatch(tailwindConfig, /\bcard:|\bpanel:|\bpositive:/);
  assert.match(postcss, /"@tailwindcss\/postcss"/);
  assert.doesNotMatch(postcss, /autoprefixer/);
  assert.match(providers, /I18nProvider/);
  assert.match(providers, /from "@heroui\/react"/);
  assert.match(providers, /locale=\{language\}/);
});

test("trader-cockpit cockpit UI consumes HeroUI semantic tokens instead of legacy local color tokens", () => {
  const files = walkFiles(cockpitRoot).filter((file) => /\.(css|ts|tsx)$/.test(file));
  const legacyPatterns = [
    /\bbg-card\b/,
    /\bbg-card\//,
    /\bbg-panel\b/,
    /\bbg-panel\//,
    /\btext-positive\b/,
    /\bbg-positive\b/,
    /\bbg-positive\//,
    /\bborder-positive\b/,
    /\bborder-positive\//,
    /--card/,
    /--panel/,
    /--positive/,
    /rgb\(var\(--/,
  ];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of legacyPatterns) {
      assert.doesNotMatch(text, pattern, `Legacy local color token ${pattern} found in ${path.relative(repoRoot, file)}`);
    }
  }

  const dashboard = readDashboardSources();
  const signals = readSignalsSources();
  assert.match(dashboard, /bg-surface/);
  assert.match(dashboard, /bg-surface-secondary/);
  assert.match(dashboard, /text-success/);
  assert.match(signals, /market_intent[\s\S]*border-success/);
});

test("trader-cockpit wires lightweight react-i18next with zh-CN resources", () => {
  assertFile("apps", "trader-cockpit", "lib", "i18n", "resources.json");
  assertFile("apps", "trader-cockpit", "lib", "i18n", "i18n.ts");

  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));
  assert.ok(resources["zh-CN"], "Missing zh-CN resource namespace");
  assert.equal(resources["zh-CN"].translation.nav.live, "实时");

  const i18n = readText("apps", "trader-cockpit", "lib", "i18n", "i18n.ts");
  const providers = readText("apps", "trader-cockpit", "lib", "cockpit", "providers.tsx");
  assert.match(i18n, /initReactI18next/);
  assert.match(i18n, /fallbackLng:\s*"zh-CN"/);
  assert.match(providers, /I18nextProvider/);
});

test("trader-cockpit keeps mock data in json instead of business js files", () => {
  assertFile("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json");

  const fixtureBridge = readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.ts");
  assert.match(fixtureBridge, /from\s+"\.\/fixtures\.json"/);
  assert.doesNotMatch(fixtureBridge, /export const mockWatchlist:\s*WatchlistItem\[\]\s*=\s*\[/);
});

test("trader-cockpit exposes only first-version route shells", () => {
  const requiredRoutes = [
    ["apps", "trader-cockpit", "app", "cockpit", "dashboard", "live", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "signals", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "chat", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "inbox", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "playbook-theories", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "learning", "page.tsx"],
    ["apps", "trader-cockpit", "app", "cockpit", "settings", "page.tsx"],
  ];
  const removedRoutes = ["approvals", "tasks", "rules", "capabilities", "playbooks", "journal", "audit"];

  for (const route of requiredRoutes) {
    assertFile(...route);
  }
  assertMissing("apps", "trader-cockpit", "app", "(cockpit)");
  for (const route of removedRoutes) {
    assertMissing("apps", "trader-cockpit", "app", "cockpit", route);
  }
});

test("trader-cockpit nav lists only first-version routes", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");
  const expectedHrefs = [
    "/cockpit/dashboard/live",
    "/cockpit/signals",
    "/cockpit/chat",
    "/cockpit/inbox",
    "/cockpit/playbook-theories",
    "/cockpit/learning",
    "/cockpit/settings",
  ];
  const forbiddenHrefs = [
    "/approvals",
    "/tasks",
    "/rules",
    "/capabilities",
    "/playbooks",
    "/journal",
    "/audit",
  ];

  for (const href of expectedHrefs) {
    assert.match(shell, new RegExp(`href:\\s*"${href}"`), `Missing nav href ${href}`);
  }
  for (const href of forbiddenHrefs) {
    assert.doesNotMatch(shell, new RegExp(`href:\\s*"${href}"`), `Forbidden nav href ${href}`);
  }
});

test("trader-cockpit shell exposes chat as both workspace route and floating dock", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");

  assert.match(shell, /href:\s*"\/cockpit\/chat"/);
  assert.match(shell, /AgentChatDock/);
  assertFile("apps", "trader-cockpit", "components", "cockpit", "chat", "AgentChatDock.tsx");

  const dock = readText("apps", "trader-cockpit", "components", "cockpit", "chat", "AgentChatDock.tsx");
  assert.match(dock, /chatDockMode/);
  assert.match(dock, /setChatDockMode/);
  assert.match(dock, /streamChat/);
  assert.match(dock, /selectedSymbol/);
  assert.match(dock, /selectedSignalId/);
  assert.match(dock, /chat\.dockExpand/);
  assert.match(dock, /chat\.dockMinimize/);
});

test("trader-cockpit shell pins sidebar while allowing workspace page scroll", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");

  assert.match(shell, /grid h-dvh min-h-0 grid-cols-\[auto_1fr\] overflow-hidden/);
  assert.match(shell, /h-dvh w-16 overflow-y-auto/);
  assert.match(shell, /h-dvh w-72 overflow-y-auto/);
  assert.match(shell, /pendingHref/);
  assert.match(shell, /optimisticPathname/);
  assert.match(shell, /data-testid="cockpitRouteLoading"/);
  assert.match(shell, /aria-busy=\{routePending\}/);
  assert.match(shell, /prefetch=\{true\}/);
  assert.match(shell, /setPendingHref\(item\.href\)/);
  assert.match(shell, /<main className="relative flex h-dvh min-h-0 min-w-0 flex-col overflow-y-auto p-4"/);
  assert.doesNotMatch(shell, /<main className="[^"]*overflow-hidden/);
});

test("trader-cockpit v5 shell exposes identity, context switcher, and read-only runtime status", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");
  const store = readText("apps", "trader-cockpit", "lib", "cockpit", "use-cockpit-ui-store.ts");
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(shell, /data-testid="cockpitIdentityBlock"/);
  assert.match(shell, /brand\.agentMarketCockpit/);
  assert.match(shell, /brand\.personalQuant/);
  assert.match(shell, /data-testid="cockpitContextSwitcher"/);
  assert.match(shell, /selectedMarketContextId/);
  assert.match(shell, /setSelectedMarketContextId/);
  assert.match(shell, /contextSwitcherOptions/);
  assert.match(shell, /Core Watchlist/);
  assert.match(shell, /SPY, QQQ, AAPL, NVDA/);
  assert.match(shell, /FOMC/);
  assert.match(shell, /Jobs/);
  assert.match(shell, /Inflation/);
  assert.match(shell, /Put\/Call/);
  assert.match(shell, /ChevronDown/);
  assert.match(shell, /data-testid="cockpitRuntimeStatus"/);
  assert.match(shell, /data-testid="cockpitRuntimeStrip"/);
  assert.doesNotMatch(shell, /const selectedSymbol = useCockpitUiStore/);
  assert.match(shell, /SQLite FTS5/);
  assert.match(shell, /Agent Mock response/);
  assert.match(shell, /DeepSeek/);
  assert.match(shell, /configured inactive/);
  assert.match(shell, /runtimeData/);
  assert.match(shell, /runtimeAgent/);
  assert.match(shell, /runtimeWrite/);
  assert.match(shell, /runtimeDisplay/);
  assert.match(shell, /readOnlyRuntimePill/);
  assert.doesNotMatch(shell, /\bScan\b/);
  assert.doesNotMatch(shell, /\bMonitor\b/);
  assert.doesNotMatch(shell, /\bRun\b/);
  assert.doesNotMatch(shell, /\bTask\b/);
  assert.doesNotMatch(shell, /href:\s*"\/cockpit\/tasks"/);
  assert.doesNotMatch(shell, /href:\s*"\/cockpit\/approvals"/);

  assert.match(store, /selectedMarketContextId/);
  assert.match(store, /setSelectedMarketContextId/);

  for (const locale of ["zh-CN", "en-US"]) {
    const translation = resources[locale].translation;
    assert.equal(typeof translation.brand.agentMarketCockpit, "string", `${locale} missing brand.agentMarketCockpit`);
    assert.equal(typeof translation.brand.personalQuant, "string", `${locale} missing brand.personalQuant`);
    for (const key of [
      "contextSwitcher",
      "runtimeStatus",
      "readOnlyRuntime",
      "agentObserving",
      "runtimeData",
      "runtimeAgent",
      "runtimeWrite",
      "runtimeDisplay",
      "routeLoading",
    ]) {
      assert.equal(typeof translation.shell[key], "string", `${locale} missing shell.${key}`);
    }
  }
});

test("trader-cockpit settings exposes zh-CN and en-US language switching", () => {
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));
  assert.ok(resources["zh-CN"], "Missing zh-CN resources");
  assert.ok(resources["en-US"], "Missing en-US resources");
  assert.equal(resources["en-US"].translation.nav.live, "Live");

  const store = readText("apps", "trader-cockpit", "lib", "cockpit", "use-cockpit-ui-store.ts");
  assert.match(store, /language:\s*readStoredLanguage\(\)/);
  assert.match(store, /setLanguage/);
  assert.match(store, /localStorage/);

  const settings = readText("apps", "trader-cockpit", "components", "cockpit", "settings", "SettingsWorkspace.tsx");
  assert.match(settings, /changeLanguage/);
  assert.match(settings, /settings\.language/);
  assert.match(settings, /zh-CN/);
  assert.match(settings, /en-US/);
});

test("trader-cockpit dashboard uses v5 L1 L2 L3 structure", () => {
  const dashboard = readDashboardSources();
  const marketChart = readText("apps", "trader-cockpit", "components", "cockpit", "charts", "MockMarketChart.tsx");

  assert.match(dashboard, /flex h-full min-h-0 flex-col gap-3 overflow-hidden/);
  assert.match(dashboard, /dashboardLiveHeader/);
  assert.match(dashboard, /dashboard\.liveCommandTitle/);
  assert.match(dashboard, /dashboard\.headerSearchPlaceholder/);
  assert.match(dashboard, /headerSearchDraft/);
  assert.match(dashboard, /commitHeaderSearch/);
  assert.match(dashboard, /onCommitSearch=\{commitHeaderSearch\}/);
  assert.match(dashboard, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*onCommitSearch\(\)/);
  assert.match(dashboard, /mockSignalsQuery\.refetch/);
  assert.match(dashboard, /signalsQueueQueryResult\.refetch/);
  assert.match(dashboard, /marketIntentQuery\.refetch/);
  assert.match(dashboard, /todayFocusQueryResult\.refetch/);
  assert.match(dashboard, /value=\{headerSearchDraft\}/);
  assert.match(dashboard, /onHeaderSearchDraftChange=\{setHeaderSearchDraft\}/);
  assert.match(dashboard, /onHeaderSearchDraftChange\(event\.target\.value\)/);
  assert.doesNotMatch(dashboard, /headerSearchPlaceholder[\s\S]{0,500}setTodayFocusQuery\(event\.target\.value\)/);
  assert.match(dashboard, /dashboardL1StatusRow/);
  assert.match(dashboard, /dashboardL1StatusRow" className="shrink-0/);
  assert.match(dashboard, /dashboardL2MarketIntentSummary/);
  assert.match(dashboard, /dashboardL2MarketIntentSummary[\s\S]*className="shrink-0/);
  assert.match(dashboard, /dashboardL3TodayFocusQueue/);
  assert.match(dashboard, /dashboardL3TodayFocusQueue" className="flex min-h-0 flex-1 flex-col/);
  assert.match(dashboard, /dashboardMarketGateCard/);
  assert.match(dashboard, /xl:grid-cols-4/);
  assert.match(dashboard, /cockpitKeys\.todayFocus/);
  assert.match(dashboard, /listTodayFocus/);
  assert.match(dashboard, /data-testid="dashboardTodayFocusScrollRegion"[\s\S]*overflow-y-auto/);
  assert.match(dashboard, /dashboardTodayFocusSearch[\s\S]*aria-label=\{t\("dashboard\.todayFocusSearchPlaceholder"\)\}/);
  assert.match(dashboard, /dashboard\.nextWatchCondition/);
  assert.match(dashboard, /(?:marketIntentExplanation|explanation)\?\.nextWatchCondition/);
  assert.match(dashboard, /dashboardL2MarketIntentStrip/);
  assert.match(dashboard, /(?:marketIntentExplanation|explanation)\?\.whyNow\.slice\(0, 3\)/);
  assert.match(dashboard, /(?:marketIntentExplanation|explanation)\?\.whyWait\.slice\(0, 2\)/);
  assert.match(marketChart, /h-28/);
  assert.doesNotMatch(dashboard, /xl:col-span-3 grid gap-3 md:grid-cols-4/);
  assert.doesNotMatch(dashboard, /dashboardStatusStack/);
  assert.doesNotMatch(dashboard, /dashboardSummaryStrip/);
  assert.doesNotMatch(dashboard, /xl:grid-cols-\[360px_minmax\(0,1fr\)_360px\]/);
  assert.match(dashboard, new RegExp("dashboardL2MarketIntentSummary[\\s\\S]*<MockMarketChart />"));
});

test("trader-cockpit dashboard v5 renders compact market intent strip and table-first focus queue", () => {
  const dashboard = readDashboardSources();
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(dashboard, /dashboardL2MarketIntentStrip/);
  assert.match(dashboard, /min-h-\[76px\]/);
  assert.match(dashboard, /flex-wrap/);
  assert.doesNotMatch(dashboard, /dashboardL2MarketIntentStrip" className="[^"]*overflow-x-auto/);
  assert.match(dashboard, /activeMarketIntentChip/);
  assert.match(dashboard, /(?:marketIntentExplanation|explanation)\?\.whyNow\.slice\(0, 3\)/);
  assert.match(dashboard, /(?:marketIntentExplanation|explanation)\?\.whyWait\.slice\(0, 2\)/);
  assert.match(dashboard, /dashboard\.whyNowShort/);
  assert.match(dashboard, /dashboard\.whyWaitShort/);
  assert.match(dashboard, /SPY/);
  assert.match(dashboard, /12\s*\+\s*3/);
  assert.match(dashboard, /dashboardTodayFocusTable/);
  assert.match(dashboard, /<Table(?:\s|>)/);
  assert.match(dashboard, /<Table\.ScrollContainer className="[^"]*overflow-x-auto/);
  assert.match(dashboard, /<Table\.Content className="[^"]*min-w-\[/);
  assert.match(dashboard, /<Table\.Column[\s\S]*className="whitespace-nowrap"/);
  assert.match(dashboard, /w-\[228px\] whitespace-nowrap/);
  assert.match(dashboard, /<Table\.Cell key=\{column\.key\}[\s\S]*className="whitespace-nowrap"/);
  assert.match(dashboard, /todayFocusColumns/);
  assert.match(dashboard, /const todayFocusColumns: TodayFocusColumn\[\]/);
  assert.doesNotMatch(dashboard, /useMemo<TodayFocusColumn/);
  assert.match(dashboard, /dashboard\.focusColumnPriority/);
  assert.match(dashboard, /dashboard\.focusColumnStatus/);
  assert.match(dashboard, /dashboard\.focusColumnReason/);
  assert.match(dashboard, /dashboard\.focusColumnLocalState/);
  assert.match(dashboard, /dashboard\.focusColumnActions/);
  assert.match(dashboard, /dashboard\.todayFocusLocalFollow/);
  assert.match(dashboard, /dashboard\.todayFocusLocalIgnore/);
  assert.match(dashboard, /dashboard\.queueLensTopWatchlist/);
  assert.match(dashboard, /dashboard\.queueLensTopOpportunities/);
  assert.match(dashboard, /dashboard\.queueLensNextWatch/);
  assert.match(dashboard, /activeQueueLens/);
  assert.match(dashboard, /setActiveQueueLens/);
  assert.match(dashboard, /setTodayFocusType\("all"\)/);
  assert.match(dashboard, /typeFilterDisabled/);
  assert.match(dashboard, /isDisabled=\{typeFilterDisabled\}/);
  assert.match(dashboard, /<CockpitSelect/);
  assert.doesNotMatch(dashboard, /<select\b/);
  assert.match(dashboard, /dashboardTodayFocusEffectiveLens/);
  assert.match(dashboard, /dashboard\.todayFocusLensActive/);
  assert.match(dashboard, /priorityClass\(item\.priority\)/);
  assert.match(dashboard, /focusStatusClass\(item\.status\)/);
  assert.match(dashboard, /line-clamp-2/);

  for (const locale of ["zh-CN", "en-US"]) {
    const dashboardCopy = resources[locale].translation.dashboard;
    for (const key of [
      "whyNowShort",
      "whyWaitShort",
      "focusColumnPriority",
      "focusColumnStatus",
      "focusColumnReason",
      "focusColumnLocalState",
      "focusColumnActions",
      "todayFocusLocalFollow",
      "todayFocusLocalIgnore",
      "todayFocusLocalFollowed",
      "todayFocusLocalIgnored",
      "liveCommandTitle",
      "liveCommandSubtitle",
      "refresh",
      "headerSearchPlaceholder",
      "queueLensAll",
      "queueLensTopWatchlist",
      "queueLensTopOpportunities",
      "queueLensNextWatch",
      "marketIntentStripSymbol",
    ]) {
      assert.equal(typeof dashboardCopy[key], "string", `${locale} missing dashboard.${key}`);
    }
  }
});

test("trader-cockpit dashboard reads market intent explanation from adapter data", () => {
  const adapter = readText("apps", "trader-cockpit", "lib", "cockpit", "adapter.ts");
  const mockAdapter = readText("apps", "trader-cockpit", "lib", "cockpit", "mock-adapter.ts");
  const fixtures = JSON.parse(readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json"));
  const dashboard = readDashboardSources();
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(adapter, /MarketIntentExplanation/);
  assert.match(adapter, /getMarketIntentExplanation/);
  assert.match(mockAdapter, /mockMarketIntentExplanation/);
  assert.ok(fixtures.mockMarketIntentExplanation, "Missing mock market intent explanation fixture");
  assert.equal(typeof fixtures.mockMarketIntentExplanation.marketGate, "string");
  assert.equal(typeof fixtures.mockMarketIntentExplanation.summary, "string");
  assert.ok(Array.isArray(fixtures.mockMarketIntentExplanation.whyNow));
  assert.ok(Array.isArray(fixtures.mockMarketIntentExplanation.whyWait));
  assert.ok(Array.isArray(fixtures.mockMarketIntentExplanation.evidenceLabels));

  assert.match(dashboard, /cockpitKeys\.marketIntentExplanation/);
  assert.match(dashboard, /getMarketIntentExplanation/);
  assert.match(dashboard, /marketIntentExplanation\?\.marketGate/);
  assert.doesNotMatch(dashboard, />\s*CAUTION\s*</);
  assert.match(dashboard, /dashboard\.marketIntentExplanation/);
  assert.match(dashboard, /dashboard\.whyNow/);
  assert.match(dashboard, /dashboard\.whyWait/);
  assert.match(dashboard, /dashboard\.relatedEvidence/);

  for (const locale of ["zh-CN", "en-US"]) {
    const dashboardCopy = resources[locale].translation.dashboard;
    for (const key of ["marketIntentExplanation", "whyNow", "whyWait", "relatedEvidence", "evidenceCount"]) {
      assert.equal(typeof dashboardCopy[key], "string", `${locale} missing dashboard.${key}`);
    }
  }
});

test("trader-cockpit exposes Today Focus Queue data contract and query key", () => {
  const adapter = readText("apps", "trader-cockpit", "lib", "cockpit", "adapter.ts");
  const mockAdapter = readText("apps", "trader-cockpit", "lib", "cockpit", "mock-adapter.ts");
  const fixturesBridge = readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.ts");
  const queryKeys = readText("apps", "trader-cockpit", "lib", "cockpit", "query-keys.ts");

  for (const contractName of ["TodayFocusItem", "TodayFocusListInput", "TodayFocusListViewModel"]) {
    assert.match(adapter, new RegExp(`type\\s+${contractName}\\b`), `Missing adapter contract ${contractName}`);
  }

  assert.match(adapter, /listTodayFocus\(input\?: TodayFocusListInput\): Promise<TodayFocusListViewModel>/);
  assert.match(mockAdapter, /listTodayFocus/);
  assert.match(fixturesBridge, /mockTodayFocusItems/);
  assert.match(queryKeys, /todayFocus\s*:/);
});

test("trader-cockpit dashboard renders Today Focus Queue controls and drawer detail entry", () => {
  const dashboard = readDashboardSources();
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(dashboard, /dashboardTodayFocusSearch/);
  assert.match(dashboard, /dashboardTodayFocusTypeFilters/);
  assert.match(dashboard, /dashboardTodayFocusStatusFilters/);
  assert.match(dashboard, /dashboardTodayFocusPagination/);
  assert.match(dashboard, /todayFocusTypeLabels/);
  assert.match(dashboard, /todayFocusStatusLabels/);
  assert.match(dashboard, /totalTodayFocus === 0 \? 0/);
  assert.match(dashboard, /todayFocusPage/);
  assert.match(dashboard, /setTodayFocusPage/);
  assert.match(dashboard, /selectedTodayFocusItem/);
  assert.match(dashboard, /dashboardTodayFocusDrawer/);
  assert.match(dashboard, /from "@heroui\/react"/);
  assert.match(dashboard, /<Drawer/);
  assert.match(dashboard, /<Drawer\.Backdrop/);
  assert.match(dashboard, /<Drawer\.Content/);
  assert.match(dashboard, /<Drawer\.Dialog/);
  assert.match(dashboard, /<Drawer\.Header/);
  assert.match(dashboard, /<Drawer\.Body/);
  assert.match(dashboard, /<Drawer\.Footer/);
  assert.match(dashboard, /<Button/);
  assert.match(dashboard, /<Chip/);
  assert.match(dashboard, /function\s+openTodayFocusDetail/);
  assert.match(dashboard, /onOpenDetail=\{openTodayFocusDetail\}/);
  assert.match(dashboard, /onClick=\{\(\) => onOpenDetail\(item\)\}/);
  assert.doesNotMatch(dashboard, /<Link\s+key=\{item\.id\}/);
  assert.match(dashboard, /todayFocusLocalFollow/);
  assert.match(dashboard, /todayFocusLocalIgnore/);
  assert.match(dashboard, /setLocalFocusState/);
  assert.match(dashboard, /localFocusStates/);
  assert.doesNotMatch(dashboard, /function setLocalFocusState[\s\S]*bindTodayFocusContext/);
  assert.match(dashboard, /function\s+bindTodayFocusContext/);
  assert.match(dashboard, /setSelectedSymbol\(item\.symbol\)/);
  assert.match(dashboard, /item\.target\.queryKey === "signalId"/);
  assert.match(dashboard, /setSelectedSignalId\(item\.target\.queryValue\)/);
  assert.match(dashboard, /setSelectedSignalId\(null\)/);
  assert.match(dashboard, /item\.target\.queryKey/);
  assert.match(dashboard, /item\.target\.queryValue/);
  assert.match(dashboard, /selectedItem\.target\.label/);
  assert.match(dashboard, /item\.summary/);
  assert.match(dashboard, /item\.reason/);
  assert.match(dashboard, /item\.symbol/);

  for (const locale of ["zh-CN", "en-US"]) {
    const dashboardCopy = resources[locale].translation.dashboard;
    for (const key of [
      "todayFocusTitle",
      "todayFocusKicker",
      "todayFocusSearchPlaceholder",
      "todayFocusAllTypes",
      "todayFocusAllStatuses",
      "todayFocusLensActive",
      "todayFocusShowing",
      "todayFocusPrev",
      "todayFocusNext",
      "todayFocusEmptyTitle",
      "todayFocusEmptyDescription",
      "todayFocusTarget",
      "todayFocusInspect",
      "todayFocusDrawerTitle",
      "todayFocusSummary",
      "todayFocusReason",
      "todayFocusTags",
      "todayFocusCloseDetail",
      "todayFocusLocalFollow",
      "todayFocusLocalIgnore",
      "todayFocusLocalFollowed",
      "todayFocusLocalIgnored",
      "todayFocusLocalStateNote",
      "todayFocusTriggerConditions",
      "todayFocusInvalidationConditions",
      "todayFocusEvidence",
      "todayFocusRelatedAgentNodes",
      "nextWatchCondition",
    ]) {
      assert.equal(typeof dashboardCopy[key], "string", `${locale} missing dashboard.${key}`);
    }
    for (const key of ["opportunity", "watchlist", "newsEvent", "ruleMatch", "nextWatch", "outcomeReview"]) {
      assert.equal(typeof dashboardCopy.todayFocusTypes[key], "string", `${locale} missing dashboard.todayFocusTypes.${key}`);
    }
    for (const key of ["active", "waiting", "triggered", "invalidated", "reviewed"]) {
      assert.equal(
        typeof dashboardCopy.todayFocusStatuses[key],
        "string",
        `${locale} missing dashboard.todayFocusStatuses.${key}`,
      );
    }
  }
});

test("trader-cockpit dashboard v5 drawer is a right slide-over with Agent explanation sections", () => {
  const dashboard = readDashboardSources();
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(dashboard, /dashboardTodayFocusDrawer/);
  assert.match(dashboard, /<Drawer\.Content placement="right" className="fixed bottom-0 right-0 top-16 z-50">/);
  assert.match(dashboard, /className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black\/10"/);
  assert.match(dashboard, /max-w-\[560px\]/);
  assert.match(dashboard, /todayFocusDrawerMeta/);
  assert.match(dashboard, /dashboard\.todayFocusAgentReason/);
  assert.match(dashboard, /dashboard\.todayFocusTriggerConditions/);
  assert.match(dashboard, /dashboard\.todayFocusInvalidationConditions/);
  assert.match(dashboard, /dashboard\.todayFocusEvidence/);
  assert.match(dashboard, /dashboard\.todayFocusRelatedAgentNodes/);
  assert.match(dashboard, /dashboard\.todayFocusReadOnlyNote/);
  assert.match(dashboard, /dashboard\.todayFocusLocalStateNote/);
  assert.match(dashboard, /selectedItem\.updatedAt/);
  assert.match(dashboard, /selectedItem\.reason/);
  assert.match(dashboard, /selectedItem\.summary/);
  assert.match(dashboard, /selectedItem\.target\.label/);
  assert.doesNotMatch(dashboard, /buildTodayFocusHref/);
  assert.doesNotMatch(dashboard, /approval/i);
  assert.doesNotMatch(dashboard, /order execution/i);
  assert.doesNotMatch(dashboard, /Trade Ticket/i);

  for (const locale of ["zh-CN", "en-US"]) {
    const dashboardCopy = resources[locale].translation.dashboard;
    for (const key of ["todayFocusAgentReason", "todayFocusWhyOpen", "todayFocusWhyNotAction", "todayFocusReadOnlyNote", "todayFocusUpdatedAt"]) {
      assert.equal(typeof dashboardCopy[key], "string", `${locale} missing dashboard.${key}`);
    }
  }
});

test("trader-cockpit dashboard no longer renders old standalone watchlist opportunity next-watch areas", () => {
  const dashboard = readDashboardSources();

  assert.doesNotMatch(dashboard, /watchlistTitle/);
  assert.doesNotMatch(dashboard, /watchlistKicker/);
  assert.doesNotMatch(dashboard, /signalQueue/);
  assert.doesNotMatch(dashboard, /selectedSignal/);
  assert.doesNotMatch(dashboard, /common\.nextWatch/);
});

test("trader-cockpit Today Focus Queue fixtures cover item kinds and drill-down targets", () => {
  const fixtures = JSON.parse(readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json"));
  const items = fixtures.mockTodayFocusItems;
  const requiredTypes = ["opportunity", "watchlist", "news_event", "rule_match", "next_watch", "outcome_review"];
  const targetByType = {
    opportunity: ["/cockpit/signals", "signalId"],
    watchlist: ["/cockpit/signals", "signalId"],
    news_event: ["/cockpit/inbox", "eventId"],
    rule_match: ["/cockpit/playbook-theories", "theoryId"],
    next_watch: ["/cockpit/signals", "signalId"],
    outcome_review: ["/cockpit/learning", "reviewId"],
  };
  const idsByRoute = {
    "/cockpit/signals": new Set(fixtures.mockSignals.map((item) => item.id)),
    "/cockpit/inbox": new Set(fixtures.mockInboxMessages.map((item) => item.id)),
    "/cockpit/playbook-theories": new Set(fixtures.mockPlaybookTheories.map((item) => item.id)),
    "/cockpit/learning": new Set(fixtures.mockLearningItems.map((item) => item.id)),
  };

  assert.ok(Array.isArray(items), "Missing mockTodayFocusItems fixture array");
  assert.ok(items.length >= 8, "Today focus fixtures should include at least 8 items");

  for (const type of requiredTypes) {
    assert.ok(items.some((item) => item.type === type), `Missing Today Focus item type ${type}`);
  }

  for (const item of items) {
    const [route, queryKey] = targetByType[item.type] ?? [];
    assert.ok(item.id, "Today Focus item missing id");
    assert.ok(item.title, `${item.id} missing title`);
    assert.ok(item.summary, `${item.id} missing summary`);
    assert.ok(item.reason, `${item.id} missing reason`);
    assert.ok(Array.isArray(item.tags), `${item.id} missing tags`);
    assert.equal(item.target?.route, route, `${item.id} has wrong target route`);
    assert.equal(item.target?.queryKey, queryKey, `${item.id} has wrong target query key`);
    assert.ok(item.target?.queryValue, `${item.id} missing target id`);
    assert.ok(item.target?.label, `${item.id} missing target label`);
    assert.ok(idsByRoute[route].has(item.target.queryValue), `${item.id} target id does not exist`);
  }
});

test("trader-cockpit detail pages pass supported search params into workspaces", () => {
  const routeContracts = [
    {
      route: ["apps", "trader-cockpit", "app", "cockpit", "signals", "page.tsx"],
      param: "signalId",
      prop: "initialSignalId",
      component: "SignalsWorkspace",
    },
    {
      route: ["apps", "trader-cockpit", "app", "cockpit", "inbox", "page.tsx"],
      param: "eventId",
      prop: "initialEventId",
      component: "AgentInbox",
    },
    {
      route: ["apps", "trader-cockpit", "app", "cockpit", "playbook-theories", "page.tsx"],
      param: "theoryId",
      prop: "initialTheoryId",
      component: "PlaybookTheoriesWorkspace",
    },
    {
      route: ["apps", "trader-cockpit", "app", "cockpit", "learning", "page.tsx"],
      param: "reviewId",
      prop: "initialReviewId",
      component: "LearningWorkspace",
    },
  ];

  for (const contract of routeContracts) {
    const page = readText(...contract.route);
    assert.match(page, /searchParams/);
    assert.match(
      page,
      new RegExp(`searchParams\\.get\\("${contract.param}"\\)|${contract.param}["']\\]`),
      `${contract.route.join("/")} should read ${contract.param}`,
    );
    assert.match(
      page,
      new RegExp(`<${contract.component}\\s+${contract.prop}=\\{`),
      `${contract.route.join("/")} should pass ${contract.prop}`,
    );
  }
});

test("trader-cockpit signals supports signalId deep-link selection and detail sections", () => {
  const signals = readText("apps", "trader-cockpit", "components", "cockpit", "signals", "SignalsWorkspace.tsx");
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(signals, /from "@heroui\/react"/);
  assert.match(signals, /<Table(?:\s|>)/);
  assert.match(signals, /<Table\.ScrollContainer className="[^"]*overflow-x-auto/);
  assert.match(signals, /<Table\.Content[\s\S]*className="[^"]*min-w-\[/);
  assert.match(signals, /onRowAction=\{\(key\) => selectSignal\(String\(key\)\)\}/);
  assert.match(signals, /onSelectionChange=\{\(keys\) => \{/);
  assert.match(signals, /selectedKeys=\{selectedSignalKeys\}/);
  assert.match(signals, /<Table\.Content/);
  assert.match(signals, /<Table\.Header>/);
  assert.match(signals, /<Table\.Column[\s\S]*className="whitespace-nowrap"/);
  assert.match(signals, /isRowHeader=\{column\.key === "symbol"\}/);
  assert.match(signals, /<Table\.Body>/);
  assert.match(signals, /<Table\.Row/);
  assert.match(signals, /id=\{signal\.id\}/);
  assert.match(signals, /onClick=\{\(\) => selectSignal\(signal\.id\)\}/);
  assert.match(signals, /<Table\.Cell[\s\S]*key=\{column\.key\}[\s\S]*className="whitespace-nowrap"[\s\S]*onClick=\{\(\) => selectSignal\(signal\.id\)\}/);
  assert.match(signals, /flex flex-nowrap gap-1/);
  assert.match(signals, /overflow-y-auto[\s\S]*xl:overflow-hidden/);
  assert.doesNotMatch(signals, /from "@\/components\/ui\/table"/);
  assert.doesNotMatch(signals, /<table\b/);
  assert.doesNotMatch(signals, /<thead\b|<tbody\b|<tr\b|<th\b|<td\b/);
  assert.match(signals, /initialSignalId\?: string/);
  assert.match(signals, /activeSignalId \?\? selectedSignalId \?\? signals\[0\]\?\.id/);
  assert.match(signals, /<CockpitSelect/);
  assert.doesNotMatch(signals, /<select\b/);
  assert.match(signals, /setActiveSignalId\(signal\.id\)/);
  assert.match(signals, /setSelectedSignalId\(signal\.id\)/);
  assert.match(signals, /setSelectedSignalId\(detailQuery\.data\.id\)/);
  assert.match(signals, /setSelectedSymbol\(detailQuery\.data\.symbol\)/);
  assert.match(signals, /signals\.evidence/);
  assert.match(signals, /signals\.triggerInvalidation/);
  assert.match(signals, /signals\.relatedRules/);

  for (const locale of ["zh-CN", "en-US"]) {
    const copy = resources[locale].translation.signals;
    for (const key of ["evidence", "triggerInvalidation", "relatedRules"]) {
      assert.equal(typeof copy[key], "string", `${locale} missing signals.${key}`);
    }
  }
});

test("trader-cockpit inbox supports eventId deep-link selection and event detail sections", () => {
  const inbox = readText("apps", "trader-cockpit", "components", "cockpit", "inbox", "AgentInbox.tsx");
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(inbox, /initialEventId\?: string/);
  assert.match(inbox, /initialEventId \?\? selectedId/);
  assert.doesNotMatch(inbox, /useState\("inbox-signal-tsla"\)/);
  assert.match(inbox, /inbox\.eventDetail/);
  assert.match(inbox, /inbox\.contextImpact/);
  assert.match(inbox, /inbox\.relatedSignals/);
  assert.match(inbox, /function\s+contextImpact/);
  assert.match(inbox, /function\s+relatedSignals/);

  for (const locale of ["zh-CN", "en-US"]) {
    const copy = resources[locale].translation.inbox;
    for (const key of ["eventDetail", "contextImpact", "relatedSignals"]) {
      assert.equal(typeof copy[key], "string", `${locale} missing inbox.${key}`);
    }
  }
});

test("trader-cockpit playbook theories supports theoryId deep-link selection and detail sections", () => {
  const theories = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "playbook-theories",
    "PlaybookTheoriesWorkspace.tsx",
  );
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(theories, /initialTheoryId\?: string/);
  assert.match(theories, /initialTheoryId \?\? selectedTheoryId/);
  assert.match(theories, /setSelectedTheoryId\(selectedTheory\.id\)/);
  assert.match(theories, /theories\.theoryDetail/);
  assert.match(theories, /theories\.rulesArray/);
  assert.match(theories, /theories\.matchedSignals/);
  assert.match(theories, /theories\.validationNotes/);

  for (const locale of ["zh-CN", "en-US"]) {
    const copy = resources[locale].translation.theories;
    for (const key of ["theoryDetail", "rulesArray", "matchedSignals", "validationNotes"]) {
      assert.equal(typeof copy[key], "string", `${locale} missing theories.${key}`);
    }
  }
});

test("trader-cockpit learning supports reviewId deep-link selection and review detail sections", () => {
  const learning = readText("apps", "trader-cockpit", "components", "cockpit", "learning", "LearningWorkspace.tsx");
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(learning, /initialReviewId\?: string/);
  assert.match(learning, /initialReviewId \?\? selectedId/);
  assert.match(learning, /learning\.planVsOutcome/);
  assert.match(learning, /learning\.hitMissAnalysis/);
  assert.match(learning, /learning\.lessonLearned/);
  assert.match(learning, /learning\.ruleImprovement/);
  assert.match(learning, /function\s+reviewDetail/);

  for (const locale of ["zh-CN", "en-US"]) {
    const copy = resources[locale].translation.learning;
    for (const key of ["planVsOutcome", "hitMissAnalysis", "lessonLearned", "ruleImprovement"]) {
      assert.equal(typeof copy[key], "string", `${locale} missing learning.${key}`);
    }
  }
});

test("trader-cockpit mock Today Focus Queue supports search filters and pagination", () => {
  const mockAdapter = readText("apps", "trader-cockpit", "lib", "cockpit", "mock-adapter.ts");

  assert.match(mockAdapter, /function\s+filterTodayFocusItems/);
  assert.match(mockAdapter, /title[\s\S]*summary[\s\S]*reason[\s\S]*symbol[\s\S]*tags/);
  assert.match(mockAdapter, /input\?\.type[\s\S]*item\.type/);
  assert.match(mockAdapter, /input\?\.status[\s\S]*item\.status/);
  assert.match(mockAdapter, /pageSize/);
  assert.match(mockAdapter, /slice\(startIndex,\s*startIndex \+ pageSize\)/);
  assert.match(mockAdapter, /total:\s*filteredItems\.length/);
});

test("trader-cockpit signals express status and semantic tag color mapping", () => {
  const signals = readSignalsSources();

  assert.match(signals, /function signalStatusClass/);
  assert.match(signals, /function tagClass/);
  assert.match(signals, /opportunity_watch[\s\S]*border-danger/);
  assert.match(signals, /market_intent[\s\S]*border-success/);
  assert.match(signals, /rule_learning[\s\S]*border-accent/);
  assert.match(signals, /risk_or_invalidation[\s\S]*border-warning|risk_or_invalidation[\s\S]*border-danger/);
  assert.match(signals, /triggered_for_attention/);
  assert.match(signals, /invalidated/);
  assert.match(signals, /detailQuery\.data\.status/);
  assert.match(signals, /detailQuery\.data\.tags\.map/);
  assert.match(signals, /scenarioPlan\.triggerConditions/);
  assert.match(signals, /scenarioPlan\.invalidationConditions/);
  assert.match(signals, /detailQuery\.data\.evidence\.length/);
});

test("trader-cockpit floating chat exposes contextual quick prompts and still streams", () => {
  const dock = readText("apps", "trader-cockpit", "components", "cockpit", "chat", "AgentChatDock.tsx");
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(dock, /quickPrompts/);
  assert.match(dock, /chat\.quickPrompts\.marketIntent/);
  assert.match(dock, /chat\.quickPrompts\.waitingReason/);
  assert.match(dock, /chat\.quickPrompts\.triggerInvalidation/);
  assert.match(dock, /void runStream\(prompt\)|setInput\(prompt\)/);
  assert.match(dock, /streamChat/);
  assert.match(dock, /context:\s*\{\s*symbol:\s*selectedSymbol,\s*signalId:\s*selectedSignalId/);
  assert.match(dock, /chat\.pageContext/);
  assert.match(dock, /usePathname/);

  for (const locale of ["zh-CN", "en-US"]) {
    const chatCopy = resources[locale].translation.chat;
    assert.equal(typeof chatCopy.pageContext, "string", `${locale} missing chat.pageContext`);
    assert.equal(typeof chatCopy.quickPrompts.marketIntent, "string", `${locale} missing market intent quick prompt`);
    assert.equal(typeof chatCopy.quickPrompts.waitingReason, "string", `${locale} missing waiting quick prompt`);
    assert.equal(
      typeof chatCopy.quickPrompts.triggerInvalidation,
      "string",
      `${locale} missing trigger/invalidation quick prompt`,
    );
  }
});

test("trader-cockpit exposes Agent Console adapter contract and mock implementation", () => {
  const adapter = readText("apps", "trader-cockpit", "lib", "cockpit", "adapter.ts");
  const mockAdapter = readText("apps", "trader-cockpit", "lib", "cockpit", "mock-adapter.ts");
  const fixturesBridge = readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.ts");
  const queryKeys = readText("apps", "trader-cockpit", "lib", "cockpit", "query-keys.ts");

  for (const contractName of [
    "AgentWorkstream",
    "AgentConsoleMessage",
    "AgentActivityNode",
    "AgentActivityEdge",
    "AgentActivityTrace",
    "ContextUsedSummary",
    "AgentConsoleViewModel",
  ]) {
    assert.match(adapter, new RegExp(`type\\s+${contractName}\\b`), `Missing adapter contract ${contractName}`);
  }

  assert.match(adapter, /getAgentConsole\(input\?: AgentConsoleInput\): Promise<AgentConsoleViewModel>/);
  assert.match(mockAdapter, /getAgentConsole/);
  assert.match(mockAdapter, /mockAgentConsole/);
  assert.match(fixturesBridge, /mockAgentConsole/);
  assert.match(queryKeys, /agentConsole\s*:/);
});

test("trader-cockpit Agent Console fixtures cover breadth skeleton data", () => {
  const fixtures = JSON.parse(readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json"));
  const consoleFixture = fixtures.mockAgentConsole;
  const requiredNodeKinds = [
    "user_question",
    "market_snapshot",
    "news_scan",
    "rule_match",
    "risk_check",
    "learning_candidate",
  ];

  assert.ok(consoleFixture, "Missing mockAgentConsole fixture");
  assert.ok(Array.isArray(consoleFixture.workstreams), "Missing Agent Console workstreams");
  assert.ok(consoleFixture.workstreams.length >= 3, "Agent Console should include at least 3 workstreams");
  assert.ok(Array.isArray(consoleFixture.messages), "Missing Agent Console messages");
  assert.ok(consoleFixture.messages.length >= 4, "Agent Console should include at least 4 messages");
  assert.ok(consoleFixture.messages.some((message) => message.role === "agent_push"), "Missing agent_push message");
  assert.ok(consoleFixture.trace, "Missing Agent Console activity trace");
  assert.ok(consoleFixture.trace.nodes.length >= 6, "Agent Console should include at least 6 activity nodes");
  assert.ok(consoleFixture.trace.edges.length >= 4, "Agent Console should include activity edges");
  assert.ok(consoleFixture.contextUsed, "Missing Agent Console context summary");
  assert.ok(Array.isArray(consoleFixture.contextUsed.marketFacts), "Missing contextUsed.marketFacts");
  assert.ok(Array.isArray(consoleFixture.contextUsed.activeLearnings), "Missing contextUsed.activeLearnings");
  assert.ok(Array.isArray(consoleFixture.contextUsed.preferences), "Missing contextUsed.preferences");
  assert.ok(Array.isArray(consoleFixture.contextUsedByWorkstream), "Missing contextUsedByWorkstream fixture array");
  assert.equal(
    consoleFixture.contextUsedByWorkstream.length,
    consoleFixture.workstreams.length,
    "Each workstream should have fixture-backed context",
  );

  for (const kind of requiredNodeKinds) {
    assert.ok(consoleFixture.trace.nodes.some((node) => node.kind === kind), `Missing activity node kind ${kind}`);
  }

  for (const workstream of consoleFixture.workstreams) {
    assert.ok(
      consoleFixture.contextUsedByWorkstream.some((context) => context.workstreamId === workstream.id),
      `Missing context fixture for ${workstream.id}`,
    );
  }

  const marketNode = consoleFixture.trace.nodes.find((node) => node.kind === "market_snapshot");
  const newsNode = consoleFixture.trace.nodes.find((node) => node.kind === "news_scan");
  const ruleNode = consoleFixture.trace.nodes.find((node) => node.kind === "rule_match");
  assert.ok(marketNode, "Missing market snapshot node");
  assert.ok(newsNode, "Missing news scan node");
  assert.ok(ruleNode, "Missing rule match node");
  assert.ok(
    consoleFixture.trace.edges.some((edge) => edge.source === marketNode.id && edge.target === ruleNode.id),
    "Market snapshot should converge into rule match",
  );
  assert.ok(
    consoleFixture.trace.edges.some((edge) => edge.source === newsNode.id && edge.target === ruleNode.id),
    "News scan should converge into rule match",
  );
});

test("trader-cockpit chat route renders D-lite v3.3 Agent Console workspace", () => {
  const page = readText("apps", "trader-cockpit", "app", "cockpit", "chat", "page.tsx");
  const workspace = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "chat",
    "AgentConsoleWorkspace.tsx",
  );
  const priorityPushStrip = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "chat",
    "PriorityPushStrip.tsx",
  );
  const conversationPanel = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "chat",
    "AgentConversationPanel.tsx",
  );
  const activityChainPanel = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "chat",
    "ActivityChainPanel.tsx",
  );
  const inspectorPanel = readText(
    "apps",
    "trader-cockpit",
    "components",
    "cockpit",
    "chat",
    "NodeInspectorPanel.tsx",
  );
  const resources = JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"));

  assert.match(page, /AgentConsoleWorkspace/);
  assert.doesNotMatch(page, /AgentChatShell/);
  assert.match(workspace, /min-h-\[760px\]/);
  assert.doesNotMatch(workspace, /max-h-full/);
  assert.doesNotMatch(workspace, /h-\[(?:96|104|112|136)px\]\s+shrink-0\s+overflow-hidden/);
  assert.match(workspace, /grid min-h-0 flex-1 gap-3/);
  assert.match(workspace, /xl:grid-cols-\[34%_30%_36%\]/);
  assert.doesNotMatch(workspace, /<WorkstreamRail/);
  assert.doesNotMatch(workspace, /WorkstreamRail/);
  assert.doesNotMatch(workspace, /<AgentActivityGraphPanel/);
  assert.doesNotMatch(workspace, /AgentActivityGraphPanel/);
  assert.match(workspace, /<section className="min-h-0 overflow-hidden">/);
  for (const componentName of [
    "PriorityPushStrip",
    "AgentConversationPanel",
    "ActivityChainPanel",
    "NodeInspectorPanel",
  ]) {
    assert.match(workspace, new RegExp(componentName), `Agent Console missing ${componentName}`);
  }

  assert.match(workspace, /cockpitKeys\.agentConsole/);
  assert.match(workspace, /getAgentConsole/);
  assert.match(workspace, /setSelectedActivityNodeId/);
  assert.match(workspace, /setSelectedAgentWorkstreamId\(message\.workstreamId\)/);
  assert.match(workspace, /setSelectedAgentMessageId\(message\.id\)/);
  assert.match(priorityPushStrip, /slice\(0,\s*3\)|pushes\.map/);
  assert.match(priorityPushStrip, /<Card/);
  assert.match(priorityPushStrip, /<Button/);
  assert.match(priorityPushStrip, /<Chip/);
  assert.match(priorityPushStrip, /lg:grid-cols-3/);
  assert.match(priorityPushStrip, /min-h-\[92px\]/);
  assert.match(priorityPushStrip, /shrink-0 border border-border/);
  assert.doesNotMatch(workspace, /@xyflow\/react/);
  assert.doesNotMatch(conversationPanel, /@xyflow\/react/);
  assert.match(conversationPanel, /<Card/);
  assert.match(conversationPanel, /<TextArea/);
  assert.match(conversationPanel, /<Button/);
  assert.match(conversationPanel, /workstreams:\s*AgentWorkstream\[\]/);
  assert.match(conversationPanel, /selectedWorkstreamId:\s*string/);
  assert.match(conversationPanel, /onSelectWorkstream:\s*\(workstreamId: string\) => void/);
  assert.match(conversationPanel, /data-testid="workstreamTabs"/);
  assert.match(conversationPanel, /workstream:\s*AgentWorkstream \| null/);
  assert.doesNotMatch(conversationPanel, /chat\.consoleTitle/);
  assert.doesNotMatch(conversationPanel, /common\.mockFallback/);
  assert.match(conversationPanel, /role="button"/);
  assert.match(conversationPanel, /onKeyDown/);
  assert.match(conversationPanel, /flex h-full min-h-0 flex-col/);
  assert.match(conversationPanel, /min-h-0 flex-1 space-y-3 overflow-y-auto/);
  assert.doesNotMatch(conversationPanel, /min-h-\[640px\]/);
  assert.doesNotMatch(conversationPanel, /<Button[\s\S]{0,800}relatedNodeIds/);
  assert.match(activityChainPanel, /ActivityChainPanel/);
  assert.match(activityChainPanel, /<ScrollShadow/);
  assert.match(activityChainPanel, /nodes\.map/);
  assert.match(activityChainPanel, /statusChipClass/);
  assert.match(activityChainPanel, /onSelectNode\(node\.id\)/);
  assert.match(activityChainPanel, /selectedNodeId/);
  assert.match(activityChainPanel, /chat\.activityChain/);
  assert.doesNotMatch(activityChainPanel, /@xyflow\/react|ReactFlow|ReactFlowProvider/);
  assert.match(inspectorPanel, /flex h-full min-h-0 flex-col/);
  assert.match(inspectorPanel, /<Card/);
  assert.match(inspectorPanel, /<Button/);
  assert.match(inspectorPanel, /<TextArea/);
  assert.match(inspectorPanel, /askDraft/);
  assert.match(inspectorPanel, /setAskDraft\(prompt\)/);
  assert.match(inspectorPanel, /contextUsed:\s*ContextUsedSummary \| null/);
  assert.match(inspectorPanel, /chat\.contextUsed/);
  assert.match(inspectorPanel, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(conversationPanel, /<form\b/);
  assert.doesNotMatch(conversationPanel, /onSubmit/);
  assert.match(conversationPanel, /chat\.send/);
  assert.match(conversationPanel, /chat\.promptPreview/);

  for (const locale of ["zh-CN", "en-US"]) {
    const chatCopy = resources[locale].translation.chat;
    for (const key of [
      "priorityPush",
      "workstreams",
      "workstreamTabs",
      "contextUsed",
      "conversation",
      "activityChain",
      "nodeInspector",
      "noSelectedNodeTitle",
      "askPrompts",
      "nodeQuestion",
      "nodeQuestionDescription",
      "promptPreview",
      "promptPreviewDescription",
    ]) {
      assert.equal(typeof chatCopy[key], "string", `${locale} missing chat.${key}`);
    }
  }
});

test("trader-cockpit chat Agent Console uses lightweight Activity Chain instead of React Flow", () => {
  const chatFiles = walkFiles(path.join(cockpitRoot, "components", "cockpit", "chat")).filter((file) =>
    /\.tsx?$/.test(file),
  );

  for (const file of chatFiles) {
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /@xyflow\/react|ReactFlow|ReactFlowProvider|Background|Controls/,
      `${path.relative(repoRoot, file)} must keep the chat console on the lightweight Activity Chain`,
    );
  }
});

test("trader-cockpit Agent Console code avoids excluded 0D-1 language", () => {
  const files = [
    repoPath("apps", "trader-cockpit", "app", "cockpit", "chat", "page.tsx"),
    ...walkFiles(path.join(cockpitRoot, "components", "cockpit", "chat")),
  ].filter((file) => /\.(tsx?|json)$/.test(file));
  const consoleFixtureText = JSON.stringify(
    JSON.parse(readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json")).mockAgentConsole,
  );
  const banned = [
    /workflow builder/i,
    /\u4efb\u52a1\u4e0b\u53d1/,
    /\u8282\u70b9\u7f16\u8f91/,
    /\u4ea4\u6613/,
    /\u8ba2\u5355/,
    /\u5ba1\u6279/,
  ];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      assert.doesNotMatch(text, pattern, `${path.relative(repoRoot, file)} contains excluded 0D-1 language ${pattern}`);
    }
  }

  for (const pattern of banned) {
    assert.doesNotMatch(consoleFixtureText, pattern, `mockAgentConsole contains excluded 0D-1 language ${pattern}`);
  }
});

test("trader-cockpit uses Chinese-first cockpit copy", () => {
  const resources = JSON.stringify(
    JSON.parse(readText("apps", "trader-cockpit", "lib", "i18n", "resources.json"))["zh-CN"],
  );

  for (const label of ["实时", "信号", "对话", "收件箱", "规律库", "学习", "设置"]) {
    assert.match(resources, new RegExp(label), `Missing Chinese nav label: ${label}`);
  }

  for (const requiredCopy of ["市场意图", "关注计划", "触发条件", "失效条件", "证据", "工具来源"]) {
    assert.match(resources, new RegExp(requiredCopy), `Missing Chinese cockpit copy: ${requiredCopy}`);
  }
});

test("trader-cockpit route and component code does not import fixtures directly", () => {
  const files = walkFiles(path.join(cockpitRoot, "app"))
    .concat(walkFiles(path.join(cockpitRoot, "components")))
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"));

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /from\s+["'].*fixtures["']|require\(["'].*fixtures["']\)/,
      `${path.relative(repoRoot, file)} should use CockpitDataAdapter instead of fixtures`,
    );
  }
});

test("trader-cockpit business code stays in ts and tsx files", () => {
  const businessRoots = [
    path.join(cockpitRoot, "app"),
    path.join(cockpitRoot, "components"),
    path.join(cockpitRoot, "lib"),
  ];
  const files = businessRoots.flatMap((root) => walkFiles(root));

  for (const file of files) {
    assert.doesNotMatch(
      file,
      /\.(mjs|js)$/,
      `${path.relative(repoRoot, file)} should not introduce business JavaScript files`,
    );
  }
});

test("trader-cockpit app code uses tsconfig alias instead of parent traversal imports", () => {
  const files = walkFiles(path.join(cockpitRoot, "app"))
    .concat(walkFiles(path.join(cockpitRoot, "components")))
    .concat(walkFiles(path.join(cockpitRoot, "lib")))
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"));

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /from\s+["']\.\.\//,
      `${path.relative(repoRoot, file)} should use @/* alias instead of parent traversal imports`,
    );
  }
});

test("trader-cockpit adapter exposes lightweight Phase 0A boundaries", () => {
  const adapter = readText("apps", "trader-cockpit", "lib", "cockpit", "adapter.ts");
  const queryKeys = readText("apps", "trader-cockpit", "lib", "cockpit", "query-keys.ts");

  for (const method of [
    "listSignals",
    "getSignal",
    "listInboxMessages",
    "listAgentEvents",
    "listPlaybookTheories",
    "listLearningItems",
    "getToolSettings",
    "streamChat",
  ]) {
    assert.match(adapter, new RegExp(`${method}\\(`), `Missing adapter method: ${method}`);
  }

  for (const key of [
    "signals",
    "signal",
    "inbox",
    "agentEvents",
    "playbookTheories",
    "learning",
    "settings",
    "chat",
  ]) {
    assert.match(queryKeys, new RegExp(`${key}\\s*:`), `Missing query key factory: ${key}`);
  }

  assert.doesNotMatch(adapter, /listApprovals|ApprovalRequest|ApprovalInput/);
  assert.doesNotMatch(queryKeys, /approvals/);
});

test("trader-cockpit app does not carry first-version excluded product language", () => {
  const banned = [
    /Trade Ticket/i,
    /TradeTicket/,
    /order execution/i,
    /Approval Center/i,
    /\/approvals/,
    /\/tasks/,
    /\/rules/,
    /\/capabilities/,
    /\/playbooks/,
    /\/journal/,
    /\/audit/,
  ];
  const files = walkFiles(cockpitRoot).filter((file) => {
    if (file.includes(`${path.sep}fixtures.ts`)) {
      return false;
    }
    return /\.(tsx?|json)$/.test(file);
  });

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      assert.doesNotMatch(text, pattern, `${path.relative(repoRoot, file)} contains excluded language ${pattern}`);
    }
  }
});
