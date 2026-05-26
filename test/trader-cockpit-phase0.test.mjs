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
    "@tanstack/react-query",
    "@heroui/react",
    "@heroui/styles",
    "framer-motion",
    "zustand",
    "lucide-react",
    "next",
    "react",
    "react-dom",
    "i18next",
    "react-i18next",
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

  const dashboard = readText("apps", "trader-cockpit", "components", "cockpit", "dashboard", "LiveDashboard.tsx");
  const signals = readText("apps", "trader-cockpit", "components", "cockpit", "signals", "SignalsWorkspace.tsx");
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

test("trader-cockpit shell keeps sidebar fixed while main content scrolls", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");

  assert.match(shell, /flex h-dvh flex-col overflow-hidden/);
  assert.match(shell, /shrink-0 border-b/);
  assert.match(shell, /min-h-0 flex-1[\s\S]*overflow-hidden/);
  assert.match(shell, /h-full w-16 overflow-y-auto/);
  assert.match(shell, /h-full w-56 overflow-y-auto/);
  assert.match(shell, /<main className="min-w-0 overflow-y-auto p-4"/);
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

test("trader-cockpit dashboard uses v4 L1 L2 L3 structure", () => {
  const dashboard = readText("apps", "trader-cockpit", "components", "cockpit", "dashboard", "LiveDashboard.tsx");

  assert.match(dashboard, /dashboardL1StatusRow/);
  assert.match(dashboard, /dashboardL2MarketIntentSummary/);
  assert.match(dashboard, /dashboardL3TodayFocusQueue/);
  assert.match(dashboard, /dashboardMarketGateCard/);
  assert.match(dashboard, /xl:grid-cols-4/);
  assert.match(dashboard, /cockpitKeys\.todayFocus/);
  assert.match(dashboard, /listTodayFocus/);
  assert.doesNotMatch(dashboard, /xl:col-span-3 grid gap-3 md:grid-cols-4/);
  assert.doesNotMatch(dashboard, /dashboardStatusStack/);
  assert.doesNotMatch(dashboard, /dashboardSummaryStrip/);
  assert.doesNotMatch(dashboard, /xl:grid-cols-\[360px_minmax\(0,1fr\)_360px\]/);
  assert.match(dashboard, new RegExp("dashboardL2MarketIntentSummary[\\s\\S]*<MockMarketChart />"));
});

test("trader-cockpit dashboard reads market intent explanation from adapter data", () => {
  const adapter = readText("apps", "trader-cockpit", "lib", "cockpit", "adapter.ts");
  const mockAdapter = readText("apps", "trader-cockpit", "lib", "cockpit", "mock-adapter.ts");
  const fixtures = JSON.parse(readText("apps", "trader-cockpit", "lib", "cockpit", "fixtures.json"));
  const dashboard = readText("apps", "trader-cockpit", "components", "cockpit", "dashboard", "LiveDashboard.tsx");
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
  const dashboard = readText("apps", "trader-cockpit", "components", "cockpit", "dashboard", "LiveDashboard.tsx");
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
  assert.match(dashboard, /onClick=\{\(\) => openTodayFocusDetail\(item\)\}/);
  assert.doesNotMatch(dashboard, /<Link\s+key=\{item\.id\}/);
  assert.match(dashboard, /href=\{buildTodayFocusHref\(selectedTodayFocusItem\)\}/);
  assert.match(dashboard, /function\s+bindTodayFocusContext/);
  assert.match(dashboard, /setSelectedSymbol\(item\.symbol\)/);
  assert.match(dashboard, /item\.target\.queryKey === "signalId"/);
  assert.match(dashboard, /setSelectedSignalId\(item\.target\.queryValue\)/);
  assert.match(dashboard, /setSelectedSignalId\(null\)/);
  assert.match(dashboard, /item\.target\.route/);
  assert.match(dashboard, /item\.target\.queryKey/);
  assert.match(dashboard, /item\.target\.queryValue/);
  assert.match(dashboard, /selectedTodayFocusItem\.target\.label/);
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
      "todayFocusOpenFullDetail",
      "todayFocusCloseDetail",
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

test("trader-cockpit dashboard no longer renders old standalone watchlist opportunity next-watch areas", () => {
  const dashboard = readText("apps", "trader-cockpit", "components", "cockpit", "dashboard", "LiveDashboard.tsx");

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
    assert.match(page, new RegExp(`${contract.param}["']\\]`), `${contract.route.join("/")} should read ${contract.param}`);
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
  assert.match(signals, /<Table>/);
  assert.match(signals, /<Table\.ScrollContainer>/);
  assert.match(signals, /<Table\.Content/);
  assert.match(signals, /<Table\.Header>/);
  assert.match(signals, /<Table\.Column/);
  assert.match(signals, /<Table\.Body>/);
  assert.match(signals, /<Table\.Row/);
  assert.match(signals, /<Table\.Cell/);
  assert.doesNotMatch(signals, /from "@\/components\/ui\/table"/);
  assert.doesNotMatch(signals, /<table\b/);
  assert.doesNotMatch(signals, /<thead\b|<tbody\b|<tr\b|<th\b|<td\b/);
  assert.match(signals, /initialSignalId\?: string/);
  assert.match(signals, /initialSignalId \?\? selectedSignalId/);
  assert.match(signals, /setSelectedSignalId\(effectiveSignalId\)/);
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
  const signals = readText("apps", "trader-cockpit", "components", "cockpit", "signals", "SignalsWorkspace.tsx");

  assert.match(signals, /function statusClass/);
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
