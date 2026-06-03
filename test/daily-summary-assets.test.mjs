import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildWeWorkImagePayload,
  renderSummarySvg,
  renderSummaryPng,
  sendWeWorkImage,
} from "../scripts/lib/summary-image.mjs";
import {
  buildDailySummaryCard,
  buildSummaryCardDigest,
  sendWeWorkTemplateCard,
} from "../scripts/lib/summary-card.mjs";
import {
  buildSummaryBriefMarkdown,
  buildWeWorkMarkdownPayload,
  sendWeWorkMarkdown,
} from "../scripts/lib/summary-brief.mjs";
import { loadLocalEnv } from "../scripts/lib/local-env.mjs";

async function withEnv(updates, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withFetch(fetchImpl, callback) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = previous;
  }
}
const summary = {
  image_digest: {
    title: "每日财经群总结",
    subtitle: "2026-05-20 08:30 CST",
    core: ["市场因月末调仓继续震荡。", "重点关注半导体与存储板块。"],
    symbols: [
      { symbol: "NVDA", summary: "财报前不追高，等待缺口确认。", source: "admin" },
      { symbol: "TSLA", summary: "观察 385 支撑。", source: "admin" },
    ],
    admin: ["每天只做一次日内波段，总仓位控制在三成。"],
    risks: ["不赌财报，避免高位追涨。"],
    link: "https://stock.autoin.me/",
  },
};

const detailedSummary = {
  image_digest: {
    title: "每日财经群总结",
    subtitle: "2026-05-20 复盘",
    link: "https://stock.autoin.me/",
  },
  event_summary: [
    "赵哥的框架：SPX（标普500指数）仍在缓跌模型里，先看节奏，不急着猜方向。",
    "市场发生的事：指数日内急跌急拉，说明资金还在被动调仓。",
    "操作含义：控制仓位，只做低吸高抛，不追高。",
  ],
  overview: ["核心结论一：指数仍处于被动减持压力中。", "核心结论二：不追高，等待缺口确认。"],
  market_context: ["市场主线：SPX 急跌急涨由机构减持驱动。"],
  key_symbols: [
    { symbol: "NVDA", name: "英伟达", summary: "财报已计提，补 189 缺口才动手。", source: "admin" },
    { symbol: "TSLA", name: "特斯拉", summary: "补 398 缺口，下一个观察 385。", source: "admin" },
  ],
  admin_symbols: [
    { symbol: "NVDA", name: "英伟达", summary: "管理员观点：财报前不追高，等缺口。" },
  ],
  user_symbols: [
    { symbol: "PLTR", name: "Palantir", summary: "用户讨论：有人关注回调后的弹性。" },
  ],
  options: ["期权策略：期权磨损大，优先杠杆 ETF。"],
  events: ["关键事件：英伟达财报窗口临近。"],
  admin_core: ["管理员观点：每个股 0.3 成，分三次买，亏损不补仓。"],
  admin_deep_reading: ["赵哥理论提炼：核心不是预测涨跌，而是用指数路径和仓位纪律过滤噪音。"],
  admin_quotes: ["2026-05-20 08:30:08 [管理员]xiaozhaolucky 说: 这是一句不应该进入图片的原始发言。"],
  user_core: ["用户补充：普通用户主要讨论是否会踏空，以及个股回调后的机会。"],
  disagreements: ["分歧：部分用户担心踏空，管理员坚持等回调。"],
  risks: ["风险：追高、超仓、赌财报是主要亏损来源。"],
};

const legacyDictSummary = {
  image_digest: { title: "每日财经群总结" },
  overview: ["市场震荡"],
  market_context: [
    "{'user': '部分用户', 'point': '盘前上涨担心踏空', 'resolution': '管理员坚持等回调'}",
  ],
};

const asciiCardSummary = {
  day: "2026-05-20",
  event_summary: ["CORE_CONCLUSION: index rhythm first, no chase."],
  admin_deep_reading: ["ADMIN_MAINLINE: Zhao mainline focuses on SPX rhythm and position control."],
  admin_symbols: [
    { symbol: "ADMIN_TICKER", summary: "ADMIN_SYMBOL_REASON: wait for confirmation before action." },
  ],
  user_symbols: [
    { symbol: "USER_TICKER", summary: "USER_SYMBOL_REASON: should not appear in card." },
  ],
  user_core: ["USER_SUPPLEMENT: should not appear in card."],
  disagreements: ["USER_DISAGREEMENT: should not appear in card."],
  risks: ["ADMIN_RISK: chasing highs and oversized positions are the main risk."],
};

function compactText(svg) {
  return svg.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
}

test("buildWeWorkImagePayload returns base64 and md5 for png bytes", () => {
  const pngBytes = Buffer.from("fake-png-bytes");
  const payload = buildWeWorkImagePayload(pngBytes);

  assert.equal(payload.msgtype, "image");
  assert.equal(payload.image.base64, pngBytes.toString("base64"));
  assert.match(payload.image.md5, /^[a-f0-9]{32}$/);
});

test("renderSummarySvg emits a readable single-image card", () => {
  const svg = renderSummarySvg(summary, { themeName: "light_report" });

  assert.match(svg, /^<svg /);
  assert.match(svg, /每日财经群总结/);
  assert.match(svg, /NVDA/);
  assert.doesNotMatch(svg, /完整内容/);
  assert.doesNotMatch(svg, /stock\.autoin\.me/);
  assert.doesNotMatch(svg, /固定宽度长图/);
});

test("renderSummarySvg includes core report sections and excludes user-only sections", () => {
  const svg = renderSummarySvg(detailedSummary, { themeName: "light_report" });
  const text = compactText(svg);

  assert.match(text, /三句话总结/);
  assert.match(text, /赵哥的框架：SPX（标普500指数）仍在缓跌模型里/);
  assert.match(text, /xiaozhaolucky/);
  assert.match(text, /赵哥理论提炼：核心不是预测涨跌/);
  assert.match(text, /管理员重点标的/);
  assert.match(text, /管理员观点：财报前不追高，等缺口。/);
  assert.doesNotMatch(text, /其他用户补充/);
  assert.doesNotMatch(text, /用户补充：普通用户主要讨论是否会踏空/);
  assert.doesNotMatch(text, /普通用户提到的标的/);
  assert.doesNotMatch(text, /PLTR/);
  assert.match(text, /核心结论一：指数仍处于被动减持压力中。/);
  assert.match(text, /市场主线：SPX急跌急涨由机构减持驱动。/);
  assert.match(text, /期权策略：期权磨损大，优先杠杆ETF。/);
  assert.match(text, /关键事件：英伟达财报窗口临近。/);
  assert.doesNotMatch(text, /分歧：部分用户担心踏空，管理员坚持等回调。/);
  assert.match(text, /风险：追高、超仓、赌财报是主要亏损来源。/);
  assert.doesNotMatch(text, /不应该进入图片的原始发言/);
});

test("renderSummarySvg grows taller when summary has more text", () => {
  const shortSvg = renderSummarySvg({ overview: ["短内容"], admin_core: ["短观点"] }, { themeName: "light_report" });
  const longSvg = renderSummarySvg(detailedSummary, { themeName: "light_report" });
  const shortHeight = Number(shortSvg.match(/height="(\d+)"/)?.[1]);
  const longHeight = Number(longSvg.match(/height="(\d+)"/)?.[1]);

  assert.ok(longHeight > shortHeight + 400);
});

test("renderSummarySvg formats legacy dict-like strings in included sections", () => {
  const svg = renderSummarySvg(legacyDictSummary, { themeName: "light_report" });
  const text = compactText(svg);

  assert.doesNotMatch(text, /\{'user'/);
  assert.match(text, /用户：部分用户；观点：盘前上涨担心踏空；处理：管理员坚持等回调/);
});

test("renderSummaryPng writes a png smaller than wework image limit", async () => {
  const result = await renderSummaryPng(summary, {
    outputPath: "data/generated/test-summary.png",
    themeName: "light_report",
  });

  const bytes = await readFile(result.outputPath);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(result.sizeBytes > 5);
  assert.ok(result.sizeBytes < 2 * 1024 * 1024);
});

test("sendWeWorkImage rejects non-zero wework errcode", async () => {
  const imagePath = "data/generated/test-wework-payload.png";
  await writeFile(imagePath, Buffer.from("fake-png-bytes"));

  await assert.rejects(
    () =>
      sendWeWorkImage("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test", imagePath, async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ errcode: 93000, errmsg: "invalid webhook" }),
      })),
    /errcode=93000/
  );
});

test("buildDailySummaryCard creates one clickable mobile report card", () => {
  const digest = buildSummaryCardDigest(detailedSummary, {
    day: "2026-05-20",
    reportUrl: "https://stock.example.com/",
  });
  const payload = buildDailySummaryCard(digest);

  assert.equal(payload.msgtype, "template_card");
  assert.equal(payload.template_card.card_type, "text_notice");
  assert.equal(payload.template_card.card_action.type, 1);
  assert.equal(payload.template_card.card_action.url, digest.reportUrl);
  assert.equal(payload.template_card.card_image, undefined);
  assert.equal(payload.template_card.image_text_area, undefined);
  assert.match(payload.template_card.main_title.title, /5\/20/);
  assert.match(payload.template_card.main_title.desc, /SPX|NVDA|TSLA/);
  assert.match(payload.template_card.sub_title_text, /核心主线|核心结论/);
  assert.ok(payload.template_card.horizontal_content_list.length <= 6);
  assert.doesNotMatch(JSON.stringify(payload), /不应该进入图片的原始发言/);
});

test("buildDailySummaryCard keeps card body admin-only and uses public homepage by default", () => {
  const digest = buildSummaryCardDigest(asciiCardSummary, {
    day: "2026-05-20",
    archivePath: "docs/summaries/2026-05/2026-05-20-daily-summary.md",
    siteBaseUrl: "https://stock.example.com/private-docs",
  });
  const payload = buildDailySummaryCard(digest);
  const raw = JSON.stringify(payload);

  assert.equal(digest.reportUrl, "https://stock.example.com/");
  assert.equal(payload.template_card.card_action.url, "https://stock.example.com/");
  assert.ok(payload.template_card.jump_list.every((item) => item.url === "https://stock.example.com/"));
  assert.match(raw, /ADMIN_MAINLINE/);
  assert.match(raw, /CORE_CONCLUSION/);
  assert.match(raw, /ADMIN_TICKER/);
  assert.match(raw, /ADMIN_RISK/);
  assert.doesNotMatch(raw, /USER_TICKER|USER_SYMBOL_REASON|USER_SUPPLEMENT|USER_DISAGREEMENT/);
  assert.doesNotMatch(raw, /summary-cards|\/summaries\/|docs\/|private-docs|daily-summary\.md|(^|["'\s])[A-Za-z]:[\\/]/);
});

test("buildSummaryCardDigest honors an explicit public report url", () => {
  const digest = buildSummaryCardDigest(asciiCardSummary, {
    day: "2026-05-20",
    reportUrl: "https://stock.example.com/custom-entry",
    archivePath: "docs/summaries/2026-05/2026-05-20-daily-summary.md",
  });

  assert.equal(digest.reportUrl, "https://stock.example.com/custom-entry");
});

test("sendWeWorkTemplateCard rejects non-zero wework errcode", async () => {
  const payload = buildDailySummaryCard(
    buildSummaryCardDigest(detailedSummary, {
      day: "2026-05-20",
      reportUrl: "https://stock.example.com/summaries/2026-05/2026-05-20-每日总结",
    })
  );

  await assert.rejects(
    () =>
      sendWeWorkTemplateCard("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test", payload, async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ errcode: 93000, errmsg: "invalid webhook" }),
      })),
    /errcode=93000/
  );
});

test("buildSummaryBriefMarkdown creates one no-url mobile summary", () => {
  const markdown = buildSummaryBriefMarkdown(detailedSummary, {
    day: "2026-05-20",
    localMarkdownPath: "docs/summaries/2026-05/2026-05-20-每日总结.md",
  });
  const payload = buildWeWorkMarkdownPayload(markdown);

  assert.equal(payload.msgtype, "markdown");
  assert.match(payload.markdown.content, /每日财经总结/);
  assert.match(payload.markdown.content, /三句话总结/);
  assert.match(payload.markdown.content, /赵哥|xiaozhaolucky/);
  assert.match(payload.markdown.content, /NVDA|TSLA|SPX/);
  assert.match(payload.markdown.content, /本地完整文档/);
  assert.doesNotMatch(payload.markdown.content, /https?:\/\//);
  assert.doesNotMatch(payload.markdown.content, /不应该进入图片的原始发言/);
  assert.ok(Buffer.byteLength(payload.markdown.content, "utf8") <= 4096);
});

test("sendWeWorkMarkdown rejects non-zero wework errcode", async () => {
  const payload = buildWeWorkMarkdownPayload("## 每日财经总结\n> 简报");

  await assert.rejects(
    () =>
      sendWeWorkMarkdown("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test", payload, async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ errcode: 93000, errmsg: "invalid webhook" }),
      })),
    /errcode=93000/
  );
});

test("package keeps image notify and exposes notify:text compatibility command", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["daily:notify"], "node scripts/daily-summary.mjs");
  assert.equal(pkg.scripts["notify:text"], "node scripts/notify-text.mjs");
  assert.equal(pkg.scripts["notify:text:dry"], "node scripts/notify-text.mjs --dry-run");
  assert.equal(pkg.scripts["notify:card"], "node scripts/notify-card.mjs");
  assert.equal(pkg.scripts["notify:card:dry"], "node scripts/notify-card.mjs --dry-run");
  assert.equal(pkg.scripts["notify:brief"], "node scripts/notify-brief.mjs");
  assert.equal(pkg.scripts["notify:brief:dry"], "node scripts/notify-brief.mjs --dry-run");
});

test("package exposes one-command daily publish for card and image", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["daily:publish"], "node scripts/daily-publish.mjs");
  assert.equal(pkg.scripts["daily:publish:dry"], "node scripts/daily-publish.mjs --dry-run");
});

test("daily publish script generates one summary then publishes card and image", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");
  const summaryRuns = [...script.matchAll(/daily_summary_structured\.py/g)];

  assert.equal(summaryRuns.length, 1);
  assert.match(script, /sendWeWorkTemplateCard/);
  assert.match(script, /sendWeWorkImage/);
  assert.doesNotMatch(script, /summary-cards/);
  assert.match(script, /summary-images/);
  assert.match(script, /const branch = currentGitBranch\(root\)/);
  assert.match(script, /run\(root,\s*"git",\s*\["push",\s*"origin",\s*branch\]\)/);
});

test("daily publish sends image without waiting for a public card cover", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");

  assert.doesNotMatch(script, /waitForPublicUrl/);
  assert.doesNotMatch(script, /SUMMARY_CARD_URL_WAIT/);
  assert.doesNotMatch(script, /card\.coverImageUrl/);
  assert.ok(
    script.indexOf("await sendWeWorkImage(webhookUrl, image.imagePath)") <
    script.indexOf("await sendWeWorkTemplateCard(webhookUrl, card.payload)"),
    "image webhook should not be blocked by template card delivery",
  );
});

test("daily publish optionally triggers deploy hook after git publish before webhook", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");

  assert.match(script, /SUMMARY_DEPLOY_HOOK_URL/);
  assert.match(script, /async function triggerDeployHook/);
  assert.match(script, /method:\s*"POST"/);
  assert.match(script, /deploy hook response/);
  assert.match(script, /published = publishWithGit\(artifacts,\s*\[image\?\.imagePath\]\)/);
  assert.match(script, /if \(published\) \{\s*await triggerDeployHook\(\);\s*\}/s);
  assert.ok(
    script.indexOf("await triggerDeployHook()") <
    script.indexOf("await sendWeWorkImage(webhookUrl, image.imagePath)"),
    "deploy hook should be triggered before webhook delivery when it is configured",
  );
});

test("daily publish rebases onto current remote branch before pushing generated docs", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");

  assert.match(script, /function syncCurrentBranchBeforePush/);
  assert.match(script, /run\(root,\s*"git",\s*\["fetch",\s*"origin",\s*branch\]\)/);
  assert.match(script, /run\(root,\s*"git",\s*\["rebase",\s*`origin\/\$\{branch\}`\]\)/);
  assert.ok(
    script.indexOf("syncCurrentBranchBeforePush(branch)") <
    script.indexOf('run(root, "git", ["push", "origin", branch])'),
    "daily publish should update its checkout before pushing generated docs",
  );
});

test("GitHub Actions schedules daily publish at Beijing 08:30", async () => {
  const workflow = await readFile(".github/workflows/daily-publish.yml", "utf8");

  assert.match(workflow, /cron:\s*["']30 0 \* \* \*["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /actions\/setup-python@v5/);
  assert.match(workflow, /fonts-noto-cjk/);
  assert.match(workflow, /python -m pip install -r requirements\.txt/);
  assert.match(workflow, /pnpm run daily:publish/);
  assert.match(workflow, /SUMMARY_SITE_BASE_URL:\s*https:\/\/stocks-emw\.pages\.dev\//);
  assert.match(workflow, /WHOP_HEADERS_JSON:\s*\$\{\{\s*secrets\.WHOP_HEADERS_JSON\s*\}\}/);
  assert.match(workflow, /MODEL_KEY_JSON:\s*\$\{\{\s*secrets\.MODEL_KEY_JSON\s*\}\}/);
  assert.match(workflow, /WEWORK_WEBHOOK_URL:\s*\$\{\{\s*secrets\.WEWORK_WEBHOOK_URL\s*\}\}/);
  assert.match(workflow, /SUMMARY_DEPLOY_HOOK_URL:\s*\$\{\{\s*secrets\.SUMMARY_DEPLOY_HOOK_URL\s*\}\}/);
});

test("python secrets loader supports GitHub Actions JSON secrets", async () => {
  const source = await readFile("utils/_secrets.py", "utf8");

  assert.match(source, /WHOP_HEADERS_JSON/);
  assert.match(source, /MODEL_KEY_JSON/);
  assert.match(source, /WEWORK_WEBHOOK_URL/);
  assert.match(source, /json\.loads/);
});

test("summary image renderers prefer CJK fonts on Ubuntu runners", async () => {
  const imageRenderer = await readFile("scripts/lib/summary-image.mjs", "utf8");
  const cardRenderer = await readFile("scripts/lib/summary-card.mjs", "utf8");

  assert.match(imageRenderer, /font-family:\s*"Noto Sans CJK SC"/);
  assert.match(cardRenderer, /font-family:\s*"Noto Sans CJK SC"/);
  assert.doesNotMatch(imageRenderer, /font-family:\s*"Microsoft YaHei",\s*"PingFang SC",\s*"Noto Sans CJK SC"/);
  assert.doesNotMatch(cardRenderer, /font-family:\s*"Microsoft YaHei",\s*"PingFang SC",\s*"Noto Sans CJK SC"/);
});

test("local env loader reads SUMMARY_SITE_BASE_URL from project .env", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "summary-env-"));
  const previous = process.env.SUMMARY_SITE_BASE_URL;
  try {
    delete process.env.SUMMARY_SITE_BASE_URL;
    await writeFile(path.join(tmp, ".env"), "SUMMARY_SITE_BASE_URL=https://stocks-emw.pages.dev/\n", "utf8");
    loadLocalEnv(tmp);

    assert.equal(process.env.SUMMARY_SITE_BASE_URL, "https://stocks-emw.pages.dev/");
  } finally {
    if (previous === undefined) {
      delete process.env.SUMMARY_SITE_BASE_URL;
    } else {
      process.env.SUMMARY_SITE_BASE_URL = previous;
    }
    await rm(tmp, { recursive: true, force: true });
  }
});

test("public publish scripts do not stage chat image audit assets", async () => {
  const dailyScript = await readFile("scripts/daily-summary.mjs", "utf8");
  const cardScript = await readFile("scripts/notify-card.mjs", "utf8");

  assert.doesNotMatch(dailyScript, /chat_image_dir|chat_image_paths/);
  assert.doesNotMatch(cardScript, /chat_image_dir|chat_image_paths/);
});

test("publish scripts push the current git branch instead of hardcoded master", async () => {
  const dailyScript = await readFile("scripts/daily-summary.mjs", "utf8");
  const cardScript = await readFile("scripts/notify-card.mjs", "utf8");
  const commonScript = await readFile("scripts/lib/common.mjs", "utf8");

  for (const script of [`${dailyScript}\n${commonScript}`, cardScript]) {
    assert.match(script, /branch.*--show-current/);
    assert.doesNotMatch(script, /push["'],\s*\["origin",\s*"master"\]/);
  }
});

test("vitepress uses full local history in docs:dev and current-month history in public build", async () => {
  const config = await readFile("docs/.vitepress/config.mts", "utf8");

  assert.match(config, /const\s+isFullHistoryDev\s*=\s*process\.env\.npm_lifecycle_event\s*===\s*['"]docs:dev['"]/);
  assert.match(config, /srcExclude:\s*isFullHistoryDev\s*\?\s*\[\s*['"]search\.md['"]\s*\]\s*:\s*getSummarySrcExclude\(\)/);
  assert.match(config, /search\.md/);
  assert.match(config, /summaries\/\*\/\*-local\.md/);
  assert.match(config, /summaries\/\*\/\*_\*\.md/);
  assert.match(config, /getOldMonthlySrcExclude\('summaries'\)/);
  assert.match(config, /getOldMonthlySrcExclude\('trading-experiences'\)/);
  assert.match(config, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}-每日总结\\.md\$/);
  assert.match(config, /slice\(1\)/);
  assert.match(config, /isDirectory\(\) && \/\^\\d\{4\}-\\d\{2\}\$\/\.test\(entry\.name\)/);
  assert.match(config, /\{\s*text:\s*[`'"]历史总结[`'"],\s*link:\s*[`'"]\/summaries\/[`'"]\s*\}/);
  assert.match(config, /function\s+getSummaryLink\(month:\s*string,\s*file:\s*string,\s*files:\s*Set<string>,\s*fullHistory:\s*boolean\)/);
  assert.match(config, /const\s+localFile\s*=\s*file\.replace\('\.md',\s*'-local\.md'\)/);
  assert.match(config, /files\.has\(localFile\)/);
  assert.match(config, /!file\.endsWith\('-local\.md'\)/);
  assert.match(config, /getSummaryLink\(month,\s*file,\s*files,\s*fullHistory\)/);
  assert.match(config, /getSummariesSidebar\(isFullHistoryDev\)/);
  assert.doesNotMatch(config, /summaries\/index\.md/);
  assert.doesNotMatch(config, /summaries\/\*\*\/\*\.md/);
});

test("vitepress dev summaries sidebar includes all months and legacy root files", async () => {
  const config = await readFile("docs/.vitepress/config.mts", "utf8");

  assert.match(config, /function\s+getLegacySummaryItems\(\)/);
  assert.match(config, /fullHistory\s*\?\s*getMonthlyDirs\('summaries'\)\s*:\s*getMonthlyDirs\('summaries'\)\.slice\(0,\s*1\)/);
  assert.match(config, /collapsed:\s*fullHistory\s*\?\s*month\s*!==\s*latestMonth\s*:\s*false/);
  assert.match(config, /text:\s*['"]旧版历史文件['"]/);
  assert.match(config, /legacyItems\.length/);
});

test("local opportunity observation section is only visible in docs dev", async () => {
  const config = await readFile("docs/.vitepress/config.mts", "utf8");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["opportunities:generate"], "node scripts/generate-opportunities.mjs");
  assert.match(config, /'opportunities\/\*\.md'/);
  assert.match(config, /'opportunities\/\*\*\/\*\.md'/);
  assert.match(config, /'research-agent\/\*\.md'/);
  assert.match(config, /'research-agent\/\*\*\/\*\.md'/);
  assert.match(config, /'superpowers\/\*\.md'/);
  assert.match(config, /'superpowers\/\*\*\/\*\.md'/);
  assert.match(config, /function\s+getOpportunitiesSidebar\(\)/);
  assert.match(config, /if\s*\(isFullHistoryDev\)\s*\{[\s\S]*\/opportunities\//);
  assert.match(config, /sidebarConfig\['\/opportunities\/'\]\s*=\s*getOpportunitiesSidebar\(\)/);
});

test("opportunities generator writes local trading observation page from structured summary", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "opportunities-"));
  const day = "2026-05-22";
  const month = "2026-05";
  const structuredDir = path.join(tmp, "data", "structured", day);
  const summaryDir = path.join(tmp, "docs", "summaries", month);

  try {
    await mkdir(structuredDir, { recursive: true });
    await mkdir(summaryDir, { recursive: true });
    await writeFile(
      path.join(structuredDir, `${day}.json`),
      JSON.stringify({
        event_summary: ["市场进入被动减仓节奏，机会来自时间窗口和价差回补。"],
        overview: ["核心结论：不追盘前急拉，等待确认后的节奏机会。"],
        professional_brief: {
          core_theory: ["核心理论：先识别被动减仓，再用固定时间窗口观察承接。"],
          evidence_chain: ["10:30 和 11:30 附近多次出现程序化波动。"],
          trading_framework: ["只观察触发条件，不把热度当成买点。"],
          beginner_explanation: ["普通人可以理解为先等价格回到合理区，再看资金是否接住。"],
        },
        admin_symbols: [
          { symbol: "LITE", name: "Lumentum", summary: "缺口已补，适合观察日内价差。" },
        ],
        arbitrage_opportunities: [
          {
            title: "AI 光模块财报错位价差",
            symbols: ["LITE", "COHR"],
            setup: "管理员提到 AI 线先杀估值，群聊同时讨论光模块补涨。",
            trigger: "NVDA 财报后 AI 线不再扩散下跌，LITE 先回补缺口。",
            data_points: ["LITE 缺口", "NVDA 财报窗口", "盘前急拉不追"],
            action_bias: "只观察低吸和价差收敛，不追盘前急拉。",
            risk: "财报后资金继续撤离 AI 线。",
            confidence: "medium",
            source_basis: "基于 xiaozhaolucky 缺口纪律和群聊 AI 线索。",
          },
        ],
        risks: ["若固定时间窗口失效，机会观察取消。"],
      }),
      "utf8",
    );
    await writeFile(path.join(summaryDir, `${day}-每日总结.md`), "# daily summary\n", "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/generate-opportunities.mjs",
      "--root",
      tmp,
      "--date",
      day,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /opportunity markdown:/);

    const page = await readFile(path.join(tmp, "docs", "opportunities", month, `${day}-机会观察.md`), "utf8");
    const index = await readFile(path.join(tmp, "docs", "opportunities", "index.md"), "utf8");

    assert.match(page, /# 2026-05-22 机会观察/);
    assert.match(page, /来源总结：\[2026-05-22 每日总结\]\(\.\.\/\.\.\/summaries\/2026-05\/2026-05-22-每日总结\)/);
    assert.match(page, /类型：交易观察，不是买卖建议/);
    assert.match(page, /## 今日交易框架/);
    assert.match(page, /## 机会观察/);
    assert.match(page, /AI 光模块财报错位价差/);
    assert.match(page, /动机来源：基于 xiaozhaolucky 缺口纪律和群聊 AI 线索。/);
    assert.match(page, /## 暂不建议行动方向/);
    assert.match(index, /# 机会观察/);
    assert.match(index, /2026-05-22 机会观察/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("repository declares a light pnpm monorepo without breaking existing root scripts", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const nvmrc = await readFile(".nvmrc", "utf8");
  const nodeVersion = await readFile(".node-version", "utf8");
  const workspace = await readFile("pnpm-workspace.yaml", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");
  const dailyWorkflow = await readFile(".github/workflows/daily-publish.yml", "utf8");
  const deployWorkflow = await readFile(".github/workflows/deploy.yml", "utf8");

  assert.equal(pkg.private, true);
  assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  assert.equal(pkg.engines.node, ">=20 <23");
  assert.equal(nvmrc.trim(), "22");
  assert.equal(nodeVersion.trim(), "22");
  await assert.rejects(access("package-lock.json"), /ENOENT/);
  await access("pnpm-lock.yaml");
  assert.match(gitignore, /^\.cache\/$/m);
  assert.match(workspace, /-\s+"apps\/\*"/);
  assert.match(workspace, /-\s+"packages\/\*"/);
  assert.equal(pkg.scripts["docs:dev"], "vitepress dev docs");
  assert.equal(pkg.scripts["docs:build"], "vitepress build docs");
  assert.equal(pkg.scripts["daily:publish"], "node scripts/daily-publish.mjs");
  for (const removedScript of [
    "console:dev",
    "console:build",
    "console:lint",
    "research-console:dev",
    "trader-cockpit:dev",
    "trader-cockpit:build",
    "trader-cockpit:lint",
    "test:trader-cockpit",
  ]) {
    assert.equal(pkg.scripts[removedScript], undefined);
  }
  await assert.rejects(access(".github/workflows/research-console.yml"), /ENOENT/);
  await access("scripts/pnpm-workspace.mjs");
  for (const workflow of [dailyWorkflow, deployWorkflow]) {
    assert.match(workflow, /pnpm\/action-setup@v4/);
    assert.match(workflow, /cache:\s*pnpm/);
    assert.match(workflow, /pnpm install --frozen-lockfile/);
    assert.doesNotMatch(workflow, /npm ci/);
  }
  assert.match(dailyWorkflow, /pnpm run daily:publish/);
  assert.match(deployWorkflow, /pnpm run docs:build/);
});

test("node runtime policy keeps CI pinned to Node 22", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const dailyWorkflow = await readFile(".github/workflows/daily-publish.yml", "utf8");
  const deployWorkflow = await readFile(".github/workflows/deploy.yml", "utf8");

  assert.equal(pkg.engines.node, ">=20 <23");
  assert.equal((await readFile(".nvmrc", "utf8")).trim(), "22");
  assert.equal((await readFile(".node-version", "utf8")).trim(), "22");
  assert.match(dailyWorkflow, /node-version-file:\s*\.nvmrc/);
  assert.match(deployWorkflow, /node-version-file:\s*\.nvmrc/);
});

test("package exposes static Cloudflare Pages build without Wrangler deploy commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const deployWorkflow = await readFile(".github/workflows/deploy.yml", "utf8");

  assert.equal(pkg.scripts["pages:build"], "node scripts/pnpm-workspace.mjs run docs:build");
  assert.equal(pkg.scripts["pages:deploy"], undefined);
  assert.equal(pkg.scripts["pages:deploy:dry"], undefined);
  assert.match(deployWorkflow, /pnpm run docs:build/);
  assert.doesNotMatch(deployWorkflow, /wrangler|pages deploy/i);
  await assert.rejects(access("scripts/deploy-cloudflare-pages.mjs"), /ENOENT/);
});

test("public build audit and release check use current active gates", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const auditScript = await readFile("scripts/audit-public-build.mjs", "utf8");
  const releaseCheck = await readFile("scripts/release-check.mjs", "utf8");

  assert.equal(pkg.scripts["public:build:audit"], "node scripts/audit-public-build.mjs");
  assert.match(auditScript, /docs\/\.vitepress\/dist does not exist/);
  assert.match(auditScript, /latestMonth/);
  for (const command of [
    '["npm", ["run", "test:summary"]]',
    '["npm", ["run", "docs:build"]]',
    '["npm", ["run", "daily:publish:dry"]]',
    '["npm", ["run", "public:build:audit"]]',
    '["git", ["diff", "--check"]]',
  ]) {
    assert.match(releaseCheck, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(releaseCheck, /console:build|research-console|trader-cockpit|wrangler|pages:deploy/i);
});

test("package exposes read-only integration status and production release verifier", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const integrationStatus = await readFile("scripts/integration-status.mjs", "utf8");
  const releaseVerify = await readFile("scripts/verify-production-release.mjs", "utf8");

  assert.equal(pkg.scripts["integration:status"], "node scripts/integration-status.mjs");
  assert.equal(pkg.scripts["release:verify"], "node scripts/verify-production-release.mjs");
  for (const expected of [
    "git status --short",
    "git rev-parse HEAD",
    "git rev-parse origin/main",
    "npm run release:check",
    "npm run release:verify -- --date YYYY-MM-DD",
  ]) {
    assert.match(integrationStatus, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const expected of [
    "Daily Summary Publish",
    "git status --short",
    "git rev-parse HEAD",
    "git ls-remote origin refs/heads/main",
    "gh run list",
    "https://stocks-emw.pages.dev/",
    "--date",
    "--dry-run",
  ]) {
    assert.match(releaseVerify, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(integrationStatus, /git",\s*\["add"|git",\s*\["commit"|git",\s*\["push"|wrangler",\s*"pages"/);
  assert.doesNotMatch(releaseVerify, /git",\s*\["add"|git",\s*\["commit"|git",\s*\["push"|wrangler",\s*"pages"/);
});

test("integration status command emits machine-readable json", () => {
  const result = spawnSync(process.execPath, ["scripts/integration-status.mjs", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.read_only, true);
  assert.equal(payload.commands.release_check, "npm run release:check");
  assert.equal(payload.commands.release_verify, "npm run release:verify -- --date YYYY-MM-DD");
  assert.equal(typeof payload.git.changed_entries, "number");
  assert.equal(typeof payload.git.head_matches_origin_main, "boolean");
  assert.equal(Array.isArray(payload.git.dirty_files), true);
  assert.equal(Array.isArray(payload.blockers), true);
  assert.deepEqual(payload.gates, [
    "release_check",
    "git_integration",
    "release_verify",
    "daily_summary_publish",
    "cloudflare_pages",
    "wecom_delivery",
    "agent_cleanup",
  ]);
});

test("integration status accepts fresh release check evidence for current worktree", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "release-check-evidence-"));
  try {
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const status = spawnSync("git", ["-c", "core.quotepath=false", "status", "--short"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(head.status, 0, head.stderr || head.stdout);
    assert.equal(status.status, 0, status.stderr || status.stdout);

    const evidencePath = path.join(tmp, "release-check-status.json");
    await writeFile(evidencePath, JSON.stringify({
      ok: true,
      completed_at: "2026-05-23T00:00:00.000Z",
      head: head.stdout.trim(),
      git_status_short: String(status.stdout || "").replace(/\s+$/u, ""),
      checks: ["npm run test:summary", "npm run docs:build", "git diff --check"],
    }, null, 2));

    const result = spawnSync(process.execPath, ["scripts/integration-status.mjs", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_CHECK_STATUS_PATH: evidencePath,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.release_check.ok, true);
    assert.equal(payload.release_check.current, true);
    assert.equal(payload.blockers.some((blocker) => blocker.gate === "release_check"), false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("summaries landing page describes current-month public history scope", async () => {
  const config = await readFile("docs/.vitepress/config.mts", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");
  const summariesIndex = await readFile("docs/summaries/index.md", "utf8");

  assert.doesNotMatch(config, /summaries\/index\.md/);
  assert.match(gitignore, /!docs\/summaries\/\*\/\?\?\?\?-\?\?-\?\?-每日总结\.md/);
  assert.match(summariesIndex, /# 历史总结/);
  assert.match(summariesIndex, /公开站只展示当前月份/);
  assert.match(summariesIndex, /左侧目录/);
});

test("notification dry runs validate text, card, and brief paths without network", () => {
  for (const [script, marker] of [
    ["scripts/notify-text.mjs", "notify:text dry run ok"],
    ["scripts/notify-card.mjs", "notify:card dry run ok"],
    ["scripts/notify-brief.mjs", "notify:brief dry run ok"],
  ]) {
    const args = [script, "--dry-run"];
    if (script.endsWith("notify-card.mjs")) {
      args.push("--site-base-url=https://f79a4b5f.stocks-emw.pages.dev/");
    }
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
