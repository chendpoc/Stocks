import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const ENTRY_DOCS = [
  "CLAUDE.md",
  ".agent-dev/context/ai-index.md",
  ".agent-dev/context/code_map.md",
  ".agent-dev/README.md",
];

const MOJIBAKE_MARKERS = [
  "鈹",
  "锛",
  "涓",
  "鍚",
  "鏃",
  "绂",
  "\uFFFD",
];

async function read(path) {
  return readFile(path, "utf8");
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
}

function parseRoutes(markdown) {
  const rows = markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith("| "))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

  const headerIndex = rows.findIndex((row) => row[0] === "task_type");
  assert.notEqual(headerIndex, -1, "Route table must include a task_type header");

  const headers = rows[headerIndex];
  const expectedHeaders = [
    "task_type",
    "read_first",
    "read_if_needed",
    "do_not_read",
    "spec_task_required",
    "code_map_required",
    "codegraph_when",
  ];
  assert.deepEqual(headers, expectedHeaders);

  return rows
    .slice(headerIndex + 2)
    .filter((row) => row.length === expectedHeaders.length)
    .map((row) => Object.fromEntries(row.map((cell, index) => [headers[index], cell])));
}

function routeEntries(value) {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

test("private AI entry docs stay within context budgets", async () => {
  const budgets = {
    "CLAUDE.md": 180,
    ".agent-dev/context/ai-index.md": 220,
    ".agent-dev/context/code_map.md": 140,
    ".agent-dev/README.md": 120,
  };

  for (const [path, maxLines] of Object.entries(budgets)) {
    const text = await read(path);
    assert.ok(lineCount(text) <= maxLines, `${path} exceeds ${maxLines} lines`);
  }
});

test("private AI route index exists outside public docs", async () => {
  await access(".agent-dev/context/ai-index.md");
  await assert.rejects(access("docs/ai-index.md"));
});

test("CLAUDE default read set does not force spec task code_map or source files", async () => {
  const doc = await read("CLAUDE.md");
  const defaultReadSet = doc.match(/Default read set:[\s\S]*?```text\s*([\s\S]*?)```/);
  assert.ok(defaultReadSet, "CLAUDE.md must define a default read set");

  const defaultBlock = defaultReadSet[1];
  assert.match(defaultBlock, /CLAUDE\.md/);
  assert.match(defaultBlock, /\.agent-dev\/context\/ai-index\.md/);
  assert.doesNotMatch(defaultBlock, /\.agent-dev\/context\/code_map\.md/);
  assert.doesNotMatch(defaultBlock, /\.agent-dev\/specs\//);
  assert.doesNotMatch(defaultBlock, /\.agent-dev\/tasks\//);
});

test("entry docs forbid broad project-docs reads and full dirty diffs by default", async () => {
  const claude = await read("CLAUDE.md");
  const index = await read(".agent-dev/context/ai-index.md");

  for (const [path, text] of [
    ["CLAUDE.md", claude],
    [".agent-dev/context/ai-index.md", index],
  ]) {
    assert.match(text, /Do not broad-read `project-docs\/\*\*`/, `${path} needs project-docs broad-read guard`);
    assert.match(text, /git status --short/, `${path} needs dirty worktree status rule`);
    assert.match(text, /Do not read a full\s+unrestricted `git diff` by default/, `${path} needs full diff guard`);
    assert.match(text, /git diff -- <path>/, `${path} needs scoped diff rule`);
  }
});

test("AI routes have small default read sets and avoid corpus or legacy by default", async () => {
  const routes = parseRoutes(await read(".agent-dev/context/ai-index.md"));
  const expectedRouteNames = new Set([
    "repo_orientation",
    "agent_dev_spec_task",
    "trader_agent_system",
    "trader_workflows",
    "trader_cli_tui",
    "trader_cockpit",
    "corpus_research",
    "legacy_migration",
  ]);

  assert.deepEqual(new Set(routes.map((route) => route.task_type)), expectedRouteNames);

  for (const route of routes) {
    const readFirst = routeEntries(route.read_first);
    assert.ok(
      readFirst.length >= 1 && readFirst.length <= 3,
      `${route.task_type} must have 1-3 read_first entries`,
    );

    if (route.task_type !== "corpus_research") {
      assert.doesNotMatch(route.read_first, /docs\/summaries\//);
      assert.doesNotMatch(route.read_first, /docs\/opportunities\//);
      assert.doesNotMatch(route.read_first, /docs\/trading-experiences\//);
    }

    if (route.task_type !== "legacy_migration") {
      assert.doesNotMatch(route.read_first, /docs\/research-agent\/modules\//);
      assert.doesNotMatch(route.read_first, /docs\/research-agent\/trading-workbench-master-plan\.md/);
      assert.doesNotMatch(route.read_first, /project-docs\/research-agent\/modules\//);
      assert.doesNotMatch(
        route.read_first,
        /project-docs\/research-agent\/trading-workbench-master-plan\.md/,
      );
    }

    assert.doesNotMatch(route.read_first, /\.agent-dev\/context\/code_map\.md/);
    assert.doesNotMatch(route.read_first, /docs\/assets\//);
    assert.doesNotMatch(route.read_first, /docs\/search_index\.json/);
  }
});

test("code map is not a docs router or workflow replacement", async () => {
  const codeMap = await read(".agent-dev/context/code_map.md");
  assert.doesNotMatch(codeMap, /\| task_type \|/);
  assert.doesNotMatch(codeMap, /Route Table/);
  assert.doesNotMatch(codeMap, /Spec-Driven Development Workflow/);
  assert.doesNotMatch(codeMap, /docs\/workflow\.md/);
  assert.doesNotMatch(codeMap, /project-docs\/workflows\/agent-dev-workflow\.md/);
});

test("private AI entry docs are free of obvious mojibake", async () => {
  for (const path of ENTRY_DOCS) {
    const text = await read(path);
    for (const marker of MOJIBAKE_MARKERS) {
      assert.equal(text.includes(marker), false, `${path} contains mojibake marker ${marker}`);
    }
  }
});

test("research-agent docs expose small boundary entrypoints", async () => {
  const boundaries = {
    "project-docs/research-agent/README.md": [
      "Do not broad-read this tree",
      "target-system/trader-agent/",
      "modules/",
    ],
    "project-docs/research-agent/target-system/README.md": [
      "Active target-system definitions",
      "trader-agent/README.md",
      "Legacy files",
    ],
    "project-docs/research-agent/modules/README.md": [
      "historical module plans",
      "not the current trader-agent source-of-truth",
      "Do not add new active plans here",
    ],
  };

  for (const [path, requiredSnippets] of Object.entries(boundaries)) {
    const text = await read(path);
    assert.ok(lineCount(text) <= 60, `${path} should stay concise`);
    for (const snippet of requiredSnippets) {
      assert.ok(text.includes(snippet), `${path} should include ${snippet}`);
    }
  }
});

test("internal project docs are separated from VitePress docs", async () => {
  const movedDocs = [
    ["docs/research-agent/README.md", "project-docs/research-agent/README.md"],
    ["docs/superpowers", "project-docs/plans/superpowers"],
    ["docs/adr/0001-langgraph-minimal-stage1.md", "project-docs/adr/0001-langgraph-minimal-stage1.md"],
    ["docs/project-overview.md", "project-docs/overview.md"],
    ["docs/workflow.md", "project-docs/workflows/agent-dev-workflow.md"],
    [
      "docs/deep-research-report.md",
      "project-docs/research-reports/deep-research-report.md",
    ],
  ];

  for (const [oldPath, newPath] of movedDocs) {
    await assert.rejects(access(oldPath), `${oldPath} should not remain under docs`);
    await access(newPath);
  }

  const projectDocsReadme = await read("project-docs/README.md");
  assert.ok(lineCount(projectDocsReadme) <= 80, "project-docs/README.md should stay concise");
  assert.match(projectDocsReadme, /Internal project documentation lives here/);
  assert.match(projectDocsReadme, /Keep VitePress site content in `docs\/`/);
});
