import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./lib/local-env.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultSiteBaseUrl = "https://stocks-emw.pages.dev/";
const workflowName = "Daily Summary Publish";

loadLocalEnv(rootDir);

function parseArgs(argv) {
  const options = {
    dryRun: false,
    date: "",
    siteBaseUrl: process.env.SUMMARY_SITE_BASE_URL || defaultSiteBaseUrl,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--date") {
      options.date = argv[++index] || "";
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg === "--site-base-url") {
      options.siteBaseUrl = argv[++index] || "";
    } else if (arg.startsWith("--site-base-url=")) {
      options.siteBaseUrl = arg.slice("--site-base-url=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.siteBaseUrl = normalizeSiteBaseUrl(options.siteBaseUrl);
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error("--date must use YYYY-MM-DD format.");
  }

  return options;
}

function normalizeSiteBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("SUMMARY_SITE_BASE_URL must be a valid http(s) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SUMMARY_SITE_BASE_URL must use http or https.");
  }
  parsed.search = "";
  parsed.hash = "";
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  return parsed.toString();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}${output ? `\n${output}` : ""}`);
  }

  return String(result.stdout || "").trim();
}

function checkCleanWorktree() {
  const status = run("git", ["status", "--short"]);
  if (status) {
    throw new Error(`working tree is not clean; release verification requires committed changes\n${status}`);
  }
  console.log("ok: git status --short is clean");
}

function parseLsRemoteHead(output) {
  const [sha] = output.split(/\s+/);
  if (!/^[0-9a-f]{40}$/i.test(sha || "")) {
    throw new Error(`git ls-remote origin refs/heads/main returned an invalid SHA\n${output}`);
  }
  return sha;
}

function checkHeadMatchesOrigin() {
  const localHead = run("git", ["rev-parse", "HEAD"]);
  const originHead = run("git", ["rev-parse", "origin/main"]);
  const remoteHead = parseLsRemoteHead(run("git", ["ls-remote", "origin", "refs/heads/main"]));
  if (localHead !== originHead) {
    throw new Error(`local HEAD does not match origin/main\nHEAD=${localHead}\norigin/main=${originHead}`);
  }
  if (localHead !== remoteHead) {
    throw new Error(`local HEAD does not match remote main\nHEAD=${localHead}\nremote main=${remoteHead}`);
  }
  console.log(`ok: git rev-parse HEAD matches git rev-parse origin/main and git ls-remote origin refs/heads/main (${localHead})`);
  return localHead;
}

function latestWorkflowRun() {
  const output = run("gh", [
    "run",
    "list",
    "--repo",
    "Facefall/Stocks",
    "--workflow",
    workflowName,
    "--branch",
    "main",
    "--limit",
    "1",
    "--json",
    "databaseId,headSha,status,conclusion,url",
  ]);
  let runs;
  try {
    runs = JSON.parse(output);
  } catch {
    throw new Error(`gh run list returned invalid JSON\n${output}`);
  }
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error(`no GitHub Actions runs found for ${workflowName}`);
  }
  return runs[0];
}

function checkWorkflowRun(expectedHeadSha) {
  const runInfo = latestWorkflowRun();
  if (runInfo.status !== "completed" || runInfo.conclusion !== "success") {
    throw new Error(
      `${workflowName} latest run is not successful: status=${runInfo.status}, conclusion=${runInfo.conclusion}, url=${runInfo.url}`,
    );
  }
  if (runInfo.headSha !== expectedHeadSha) {
    throw new Error(`${workflowName} headSha does not match local HEAD\nheadSha=${runInfo.headSha}\nHEAD=${expectedHeadSha}`);
  }
  console.log(`ok: ${workflowName} succeeded for headSha ${runInfo.headSha}`);
  return runInfo;
}

async function checkHttpOk(url, label) {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" }).catch(async () => {
    return fetch(url, { method: "GET", redirect: "follow" });
  });
  if (!response || response.status >= 400) {
    throw new Error(`${label} is not reachable: ${url} returned ${response?.status ?? "no response"}`);
  }
  console.log(`ok: ${label} reachable (${response.status}) ${url}`);
}

function summaryUrl(siteBaseUrl, date) {
  const month = date.slice(0, 7);
  const path = `summaries/${month}/${date}-每日总结.html`;
  return new URL(encodeURI(path), siteBaseUrl).toString();
}

function printPlan(options) {
  console.log("production release verification plan");
  console.log("read_only: true");
  console.log("checks:");
  console.log("- git status --short");
  console.log("- git rev-parse HEAD");
  console.log("- git rev-parse origin/main");
  console.log("- git ls-remote origin refs/heads/main");
  console.log(`- gh run list for ${workflowName} and compare headSha`);
  console.log(`- public site HTTP check: ${options.siteBaseUrl}`);
  if (options.date) {
    console.log(`- public daily summary HTTP check: ${summaryUrl(options.siteBaseUrl, options.date)}`);
  }
  console.log(`args: --dry-run ${options.date ? `--date ${options.date}` : ""}`.trim());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  printPlan(options);

  if (options.dryRun) {
    console.log("dry_run: true");
    return;
  }

  checkCleanWorktree();
  const headSha = checkHeadMatchesOrigin();
  const runInfo = checkWorkflowRun(headSha);
  await checkHttpOk(options.siteBaseUrl, "public site");
  if (options.date) {
    await checkHttpOk(summaryUrl(options.siteBaseUrl, options.date), "public daily summary");
  }
  console.log(`release verify ok: run=${runInfo.databaseId}, url=${runInfo.url}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
