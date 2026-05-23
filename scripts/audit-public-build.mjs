import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const distRoot = path.join(docsRoot, ".vitepress", "dist");
const summariesRoot = path.join(docsRoot, "summaries");

const forbiddenMarkers = [
  "research-agent",
  "superpowers",
  "opportunities",
  "机会观察",
  "群聊内容记录",
  "群聊图片记录",
  "原始发言记录",
  "本地链接",
  "chat-images",
];

function fail(message) {
  throw new Error(`public build audit failed: ${message}`);
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function latestMonth() {
  if (!fs.existsSync(summariesRoot)) {
    fail("docs/summaries does not exist");
  }

  const months = fs
    .readdirSync(summariesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  if (!months.length) {
    fail("no monthly summary directories found");
  }

  return months[0];
}

function assertDistReady() {
  if (!fs.existsSync(distRoot)) {
    fail("docs/.vitepress/dist does not exist; run npm run pages:build first");
  }

  const indexPath = path.join(distRoot, "index.html");
  const summariesIndexPath = path.join(distRoot, "summaries", "index.html");
  if (!fs.existsSync(indexPath)) {
    fail("public homepage is missing");
  }
  if (!fs.existsSync(summariesIndexPath)) {
    fail("public summaries index is missing");
  }
}

function assertNoForbiddenContent(files) {
  const textExtensions = new Set([".html", ".js", ".json", ".css", ".txt", ".xml"]);
  for (const file of files) {
    if (!textExtensions.has(path.extname(file))) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const marker of forbiddenMarkers) {
      if (content.includes(marker)) {
        fail(`${path.relative(root, file)} contains forbidden marker ${marker}`);
      }
    }
  }
}

function assertSummaryScope(files, month) {
  const summaryHtmlPrefix = path.join(distRoot, "summaries") + path.sep;
  const summaryPages = files
    .filter((file) => file.startsWith(summaryHtmlPrefix))
    .filter((file) => file.endsWith(".html"))
    .map((file) => path.relative(path.join(distRoot, "summaries"), file));

  const monthPages = summaryPages.filter((relative) => relative.startsWith(`${month}${path.sep}`));
  if (!monthPages.length) {
    fail(`no public summary pages found for latest month ${month}`);
  }

  for (const relative of summaryPages) {
    if (relative === "index.html") continue;
    if (!relative.startsWith(`${month}${path.sep}`)) {
      fail(`old or unexpected summary page found: summaries/${relative.replaceAll(path.sep, "/")}`);
    }
    if (relative.includes("-local")) {
      fail(`local audit summary page leaked: summaries/${relative.replaceAll(path.sep, "/")}`);
    }
  }
}

assertDistReady();
const files = walkFiles(distRoot);
const month = latestMonth();
assertNoForbiddenContent(files);
assertSummaryScope(files, month);

console.log(`public build audit ok: latest_month=${month}, files=${files.length}`);

