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
  pythonPath,
  run,
  parseArtifacts,
  currentGitBranch,
  readArgValue,
  loadWebhookUrl,
} from "./lib/common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--dry");
const skipWebhook = dryRun || args.has("--skip-webhook") || process.env.NOTIFY_SKIP_WEBHOOK === "1";
const skipGitPush = dryRun || args.has("--skip-git-push") || process.env.SKIP_GIT_PUSH === "1";
const themeName = process.env.SUMMARY_IMAGE_THEME || "light_report";
const rawArgs = process.argv.slice(2);

const targetDate = readArgValue(rawArgs, "--date");
if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  throw new Error("--date must be formatted as YYYY-MM-DD");
}

function sampleSummary() {
  return {
    schema_version: "1.0",
    overview: ["市场围绕月末调仓继续震荡，群内讨论集中在半导体、存储和高弹性标的。"],
    market_context: ["资金从高位标的撤出，等待缺口和前低确认。"],
    key_symbols: [
      { symbol: "NVDA", name: "英伟达", summary: "财报前不追高，等待缺口确认。", source: "admin" },
      { symbol: "TSLA", name: "特斯拉", summary: "观察 385 一线支撑。", source: "admin" },
      { symbol: "MU", name: "美光", summary: "适合作为日内做T观察标的。", source: "admin" },
    ],
    admin_core: ["每天只做一次日内波段，总仓位控制在三成。"],
    risks: ["不赌财报，避免高位追涨。", "图片为摘要，完整内容以网站 Markdown 为准。"],
    image_digest: {
      title: "每日财经群总结",
      subtitle: "Dry run preview",
      core: ["市场继续震荡，关注资金高低切换。", "重点标的围绕 NVDA、TSLA、MU。"],
      market: ["等待缺口和前低确认，不追高。"],
      admin: ["每天只做一次日内波段，总仓位控制在三成。"],
      risks: ["不赌财报。", "完整内容查看网站。"],
      link: "https://stock.autoin.me/",
    },
  };
}

async function runDry() {
  const imagePath = path.join(root, "data", "generated", "dry-run-summary.png");
  const rendered = await renderSummaryPng(sampleSummary(), { outputPath: imagePath, themeName });
  const payload = await buildWeWorkImagePayloadFromFile(rendered.outputPath);
  const galleryCheck = String.raw`
from utils.structured_summary import normalize_summary_payload, render_summary_markdown
summary = normalize_summary_payload({"overview": ["dry run"], "admin_core": ["dry run"]})
markdown = render_summary_markdown(summary, images=[{
    "id": "file_dry",
    "post_id": "post_dry",
    "filename": "image.png",
    "username": "dry-run",
    "is_admin": True,
    "markdown_path": "/assets/chat-images/2099-01-01/image.png",
    "original_url": "https://example.com/image.png",
    "download_status": "downloaded",
}], chat_text="2099-01-01 08:30:00 dry-run 说: dry run chat content")
assert "## 群聊图片记录" in markdown
assert "## 群聊内容记录" in markdown
assert "<details>" in markdown
`;
  run(root, pythonPath(root), ["-c", galleryCheck], { capture: true });
  console.log("daily:sync dry run ok");
  console.log(`image: ${rendered.outputPath}`);
  console.log(`image_bytes: ${rendered.sizeBytes}`);
  console.log(`payload_base64_bytes: ${Buffer.byteLength(payload.image.base64, "utf8")}`);
  console.log("markdown_gallery: ok");
}

function publishWithGit(artifacts, imagePath) {
  const addPaths = ["docs/index.md", "docs/search_index.json", imagePath];
  run(root, "git", ["add", ...addPaths]);
  if (artifacts.archive_path) run(root, "git", ["add", "-f", artifacts.archive_path]);

  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
  if (diff.status === 0) {
    console.log("No staged docs changes to publish.");
    return;
  }

  const message = `Auto update: ${artifacts.generated_at_cst ?? new Date().toISOString()}`;
  run(root, "git", ["commit", "-m", message]);
  run(root, "git", ["push", "origin", currentGitBranch(root)]);
}

async function runActual() {
  const py = pythonPath(root);
  const pyArgs = ["daily_summary_structured.py"];
  if (targetDate) pyArgs.push("--date", targetDate);
  const result = run(root, py, pyArgs, { capture: true });
  process.stderr.write(result.stderr ?? "");
  const artifacts = parseArtifacts(result.stdout ?? "");
  const summary = JSON.parse(await readFile(path.join(root, artifacts.summary_json_path), "utf-8"));
  const day = artifacts.day ?? new Date().toISOString().slice(0, 10);
  const imageDir = path.join(root, "docs", "assets", "summary-images");
  await mkdir(imageDir, { recursive: true });
  const imagePath = path.join(imageDir, `${day}-daily-summary.png`);
  const rendered = await renderSummaryPng(summary, { outputPath: imagePath, themeName });
  console.log(`summary image: ${rendered.outputPath} (${rendered.sizeBytes} bytes)`);

  if (!skipWebhook) {
    const webhookUrl = await loadWebhookUrl(py, root);
    if (!webhookUrl) throw new Error("WEWORK_WEBHOOK_URL or utils/.local_secrets.py wework_webhook_url is required.");
    await sendWeWorkImage(webhookUrl, imagePath);
    console.log("wework image sent");
  } else {
    console.log("skip webhook");
  }

  if (!skipGitPush) {
    await publishWithGit(artifacts, path.relative(root, imagePath).replaceAll("\\", "/"));
  } else {
    console.log("skip git push");
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
