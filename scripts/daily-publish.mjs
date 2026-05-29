import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWeWorkImagePayloadFromFile,
  renderSummaryPng,
  sendWeWorkImage,
} from "./lib/summary-image.mjs";
import {
  buildDailySummaryCard,
  buildSummaryCardDigest,
  sendWeWorkTemplateCard,
} from "./lib/summary-card.mjs";
import { loadLocalEnv } from "./lib/local-env.mjs";
import {
  pythonPath,
  run,
  parseArtifacts,
  currentGitBranch,
  readArgValue,
  readOptionalEnv,
  loadWebhookUrl,
} from "./lib/common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadLocalEnv(root);

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const dryRun = args.has("--dry-run") || args.has("--dry");
const skipWebhook = dryRun || args.has("--skip-webhook") || process.env.NOTIFY_SKIP_WEBHOOK === "1";
const skipGitPush = dryRun || args.has("--skip-git-push") || process.env.SKIP_GIT_PUSH === "1";
const skipCard = args.has("--skip-card");
const skipImage = args.has("--skip-image");
const themeName = process.env.SUMMARY_IMAGE_THEME || "light_report";
const deployHookUrl = readOptionalEnv("SUMMARY_DEPLOY_HOOK_URL");

const targetDate = readArgValue(rawArgs, "--date") || readOptionalEnv("SUMMARY_TARGET_DATE");
if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  throw new Error("--date or SUMMARY_TARGET_DATE must be formatted as YYYY-MM-DD");
}

const limit = readArgValue(rawArgs, "--limit") || readOptionalEnv("SUMMARY_FETCH_LIMIT");
if (limit && !/^\d+$/.test(limit)) {
  throw new Error("--limit or SUMMARY_FETCH_LIMIT must be a positive integer");
}

const siteBaseUrl =
  readArgValue(rawArgs, "--site-base-url") ||
  process.env.SUMMARY_SITE_BASE_URL ||
  process.env.SITE_BASE_URL ||
  "https://stock.autoin.me";

function syncCurrentBranchBeforePush(branch) {
  run(root, "git", ["fetch", "origin", branch]);
  run(root, "git", ["rebase", `origin/${branch}`]);
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.search) parsed.search = "?[redacted]";
    if (parsed.hash) parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

async function triggerDeployHook() {
  if (!deployHookUrl) return false;
  if (!/^https?:\/\//i.test(deployHookUrl)) {
    throw new Error("SUMMARY_DEPLOY_HOOK_URL must be a valid http(s) URL.");
  }

  const response = await fetch(deployHookUrl, { method: "POST" });
  console.log(`deploy hook response: ${response.status} ${maskUrl(deployHookUrl)}`);
  if (!response.ok) {
    throw new Error(`Deploy hook failed with status ${response.status}.`);
  }
  return true;
}

function sampleSummary() {
  return {
    day: "2026-05-20",
    event_summary: [
      "赵哥主线是先判断指数节奏，而不是追着单根K线猜方向。",
      "市场围绕 SPX 缓跌模型震荡，重点观察缺口、仓位和时间窗口。",
      "操作上只做低吸高抛，不追高、不赌财报。",
    ],
    overview: ["指数仍处于资金调仓窗口。", "重点关注管理员明确提到的标的和风险。"],
    market_context: ["市场主线是缺口、节奏和仓位控制。"],
    admin_deep_reading: ["管理员强调用可重复的幅度和时间条件过滤噪音。"],
    admin_symbols: [
      { symbol: "SPX", summary: "观察缓跌模型是否继续按节奏运行。" },
      { symbol: "NVDA", summary: "财报窗口前不追高，等待缺口确认。" },
    ],
    risks: ["追高、超仓和财报赌博是主要亏损来源。"],
  };
}

async function buildCardArtifacts(summary, artifacts, options = {}) {
  const day = options.day || artifacts?.day || summary?.day || new Date().toISOString().slice(0, 10);
  const reportUrl = options.reportUrl || siteBaseUrl.replace(/\/+$/, "/");
  const digest = buildSummaryCardDigest(summary, { day, reportUrl });
  const payload = buildDailySummaryCard(digest);

  return {
    day,
    payload,
    reportUrl,
  };
}

async function buildImageArtifacts(summary, artifacts, options = {}) {
  const day = options.day || artifacts?.day || summary?.day || new Date().toISOString().slice(0, 10);
  const imagePath =
    options.imagePath ||
    path.join(root, "docs", "assets", "summary-images", `${day}-daily-summary.png`);
  await mkdir(path.dirname(imagePath), { recursive: true });
  const rendered = await renderSummaryPng(summary, { outputPath: imagePath, themeName });
  const payload = await buildWeWorkImagePayloadFromFile(rendered.outputPath);

  return {
    day,
    imagePath: rendered.outputPath,
    imageSizeBytes: rendered.sizeBytes,
    payloadBase64Bytes: Buffer.byteLength(payload.image.base64, "utf8"),
  };
}

function gitPath(filePath) {
  return path.relative(root, path.resolve(root, filePath)).replaceAll("\\", "/");
}

function publishWithGit(artifacts, pathsToPublish) {
  const addPaths = new Set(["docs/index.md", "docs/search_index.json"]);
  for (const item of pathsToPublish) {
    if (item) addPaths.add(gitPath(item));
  }

  run(root, "git", ["add", ...addPaths]);
  if (artifacts.archive_path) run(root, "git", ["add", "-f", artifacts.archive_path]);

  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root, windowsHide: true });
  if (diff.status === 0) {
    console.log("No staged docs changes to publish.");
    return false;
  }

  const message = `Auto daily publish: ${artifacts.generated_at_cst ?? new Date().toISOString()}`;
  run(root, "git", ["commit", "-m", message]);
  const branch = currentGitBranch(root);
  syncCurrentBranchBeforePush(branch);
  run(root, "git", ["push", "origin", branch]);
  return true;
}

async function runDry() {
  const summary = sampleSummary();
  const card = skipCard
    ? null
    : await buildCardArtifacts(summary, { day: summary.day }, {
        reportUrl: siteBaseUrl.replace(/\/+$/, "/"),
      });
  const image = skipImage
    ? null
    : await buildImageArtifacts(summary, { day: summary.day }, {
        imagePath: path.join(root, "data", "generated", "dry-run-daily-publish-image.png"),
      });

  console.log("daily:publish dry run ok");
  if (card) {
    console.log(`card_msgtype: ${card.payload.msgtype}`);
  }
  if (image) {
    console.log(`image: ${image.imagePath}`);
    console.log(`image_bytes: ${image.imageSizeBytes}`);
    console.log(`image_payload_base64_bytes: ${image.payloadBase64Bytes}`);
  }
}

async function runActual() {
  const py = pythonPath(root);
  const pyArgs = ["daily_summary_structured.py"];
  if (targetDate) pyArgs.push("--date", targetDate);
  if (limit) pyArgs.push("--limit", limit);

  const summaryResult = run(root, py, pyArgs, {
    capture: true,
    env: { SKIP_GIT_PUSH: "1" },
  });
  process.stderr.write(summaryResult.stderr ?? "");

  const artifacts = parseArtifacts(summaryResult.stdout ?? "");
  const summaryJsonPath = path.resolve(root, artifacts.summary_json_path);
  const summary = JSON.parse(await readFile(summaryJsonPath, "utf-8"));
  const card = skipCard ? null : await buildCardArtifacts(summary, artifacts);
  const image = skipImage ? null : await buildImageArtifacts(summary, artifacts);

  console.log(`summary markdown: ${path.resolve(root, artifacts.archive_path)}`);
  console.log(`summary json: ${summaryJsonPath}`);
  if (card) {
    console.log(`report url: ${card.reportUrl}`);
  }
  if (image) {
    console.log(`summary image: ${image.imagePath} (${image.imageSizeBytes} bytes)`);
  }

  let published = false;
  if (!skipGitPush) {
    published = publishWithGit(artifacts, [image?.imagePath]);
    if (published) {
      await triggerDeployHook();
    }
  } else {
    console.log("skip git push");
  }

  if (!skipWebhook) {
    const webhookUrl = await loadWebhookUrl(py, root);
    if (!webhookUrl) throw new Error("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.");
    if (image) {
      await sendWeWorkImage(webhookUrl, image.imagePath);
      console.log("wework image sent");
    }
    if (card) {
      await sendWeWorkTemplateCard(webhookUrl, card.payload);
      console.log("wework template_card sent");
    }
  } else {
    console.log("skip webhook");
  }
}

try {
  if (dryRun) {
    await runDry();
  } else {
    await runActual();
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exit(1);
}
