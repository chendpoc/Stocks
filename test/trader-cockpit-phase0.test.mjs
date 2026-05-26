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

test("trader-cockpit package declares lightweight cockpit dependencies", () => {
  const pkg = JSON.parse(readText("apps", "trader-cockpit", "package.json"));
  const dependencies = pkg.dependencies ?? {};
  const expected = [
    "@tanstack/react-query",
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
    ["apps", "trader-cockpit", "app", "(cockpit)", "dashboard", "live", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "signals", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "chat", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "inbox", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "playbook-theories", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "learning", "page.tsx"],
    ["apps", "trader-cockpit", "app", "(cockpit)", "settings", "page.tsx"],
  ];
  const removedRoutes = ["approvals", "tasks", "rules", "capabilities", "playbooks", "journal", "audit"];

  for (const route of requiredRoutes) {
    assertFile(...route);
  }
  for (const route of removedRoutes) {
    assertMissing("apps", "trader-cockpit", "app", "(cockpit)", route);
  }
});

test("trader-cockpit nav lists only first-version routes", () => {
  const shell = readText("apps", "trader-cockpit", "components", "cockpit", "shell", "CockpitShell.tsx");
  const expectedHrefs = [
    "/dashboard/live",
    "/signals",
    "/chat",
    "/inbox",
    "/playbook-theories",
    "/learning",
    "/settings",
  ];
  const forbiddenHrefs = ["/approvals", "/tasks", "/rules", "/capabilities", "/playbooks", "/journal", "/audit"];

  for (const href of expectedHrefs) {
    assert.match(shell, new RegExp(`href:\\s*"${href}"`), `Missing nav href ${href}`);
  }
  for (const href of forbiddenHrefs) {
    assert.doesNotMatch(shell, new RegExp(`href:\\s*"${href}"`), `Forbidden nav href ${href}`);
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
