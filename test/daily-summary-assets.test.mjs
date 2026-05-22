import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const payload = buildDailySummaryCard(digest, {
    coverImageUrl: "https://stock.example.com/assets/summary-cards/2026-05-20.png",
  });

  assert.equal(payload.msgtype, "template_card");
  assert.equal(payload.template_card.card_type, "news_notice");
  assert.equal(payload.template_card.card_action.type, 1);
  assert.equal(payload.template_card.card_action.url, digest.reportUrl);
  assert.equal(payload.template_card.card_image.url, "https://stock.example.com/assets/summary-cards/2026-05-20.png");
  assert.match(payload.template_card.main_title.title, /5\/20/);
  assert.match(payload.template_card.main_title.desc, /SPX|NVDA|TSLA/);
  assert.ok(payload.template_card.vertical_content_list.length <= 4);
  assert.ok(payload.template_card.horizontal_content_list.length <= 6);
  assert.doesNotMatch(JSON.stringify(payload), /不应该进入图片的原始发言/);
});

test("buildDailySummaryCard keeps card body admin-only and uses public homepage by default", () => {
  const digest = buildSummaryCardDigest(asciiCardSummary, {
    day: "2026-05-20",
    archivePath: "docs/summaries/2026-05/2026-05-20-daily-summary.md",
    siteBaseUrl: "https://stock.example.com/private-docs",
  });
  const payload = buildDailySummaryCard(digest, {
    coverImageUrl: "https://stock.example.com/assets/summary-cards/2026-05-20.png",
  });
  const raw = JSON.stringify(payload);

  assert.equal(digest.reportUrl, "https://stock.example.com/");
  assert.equal(payload.template_card.card_action.url, "https://stock.example.com/");
  assert.ok(payload.template_card.jump_list.every((item) => item.url === "https://stock.example.com/"));
  assert.match(raw, /ADMIN_MAINLINE/);
  assert.match(raw, /CORE_CONCLUSION/);
  assert.match(raw, /ADMIN_TICKER/);
  assert.match(raw, /ADMIN_RISK/);
  assert.doesNotMatch(raw, /USER_TICKER|USER_SYMBOL_REASON|USER_SUPPLEMENT|USER_DISAGREEMENT/);
  assert.doesNotMatch(raw, /\/summaries\/|docs\/|private-docs|daily-summary\.md|(^|["'\s])[A-Za-z]:[\\/]/);
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
    }),
    { coverImageUrl: "https://stock.example.com/assets/summary-cards/2026-05-20.png" }
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
  assert.match(script, /summary-cards/);
  assert.match(script, /summary-images/);
  assert.match(script, /git",\s*\["push",\s*"origin",\s*currentGitBranch\(\)\]/);
});

test("GitHub Actions schedules daily publish at Beijing 08:30", async () => {
  const workflow = await readFile(".github/workflows/daily-publish.yml", "utf8");

  assert.match(workflow, /cron:\s*["']30 0 \* \* \*["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /actions\/setup-python@v5/);
  assert.match(workflow, /python -m pip install -r requirements\.txt/);
  assert.match(workflow, /npm run daily:publish/);
  assert.match(workflow, /SUMMARY_SITE_BASE_URL:\s*https:\/\/stocks-emw\.pages\.dev\//);
  assert.match(workflow, /WHOP_HEADERS_JSON:\s*\$\{\{\s*secrets\.WHOP_HEADERS_JSON\s*\}\}/);
  assert.match(workflow, /MODEL_KEY_JSON:\s*\$\{\{\s*secrets\.MODEL_KEY_JSON\s*\}\}/);
  assert.match(workflow, /WEWORK_WEBHOOK_URL:\s*\$\{\{\s*secrets\.WEWORK_WEBHOOK_URL\s*\}\}/);
});

test("python secrets loader supports GitHub Actions JSON secrets", async () => {
  const source = await readFile("utils/_secrets.py", "utf8");

  assert.match(source, /WHOP_HEADERS_JSON/);
  assert.match(source, /MODEL_KEY_JSON/);
  assert.match(source, /WEWORK_WEBHOOK_URL/);
  assert.match(source, /json\.loads/);
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

  for (const script of [dailyScript, cardScript]) {
    assert.match(script, /branch.*--show-current/);
    assert.doesNotMatch(script, /push["'],\s*\["origin",\s*"master"\]/);
  }
});

test("vitepress exposes current-month summaries and excludes older history from public build", async () => {
  const config = await readFile("docs/.vitepress/config.mts", "utf8");

  assert.match(config, /srcExclude:\s*getSummarySrcExclude\(\)/);
  assert.match(config, /search\.md/);
  assert.match(config, /summaries\/\*\/\*_\*\.md/);
  assert.match(config, /getOldMonthlySrcExclude\('summaries'\)/);
  assert.match(config, /getOldMonthlySrcExclude\('trading-experiences'\)/);
  assert.match(config, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}-每日总结\\.md\$/);
  assert.match(config, /slice\(1\)/);
  assert.match(config, /isDirectory\(\) && \/\^\\d\{4\}-\\d\{2\}\$\/\.test\(entry\.name\)/);
  assert.match(config, /\{\s*text:\s*[`'"]历史总结[`'"],\s*link:\s*[`'"]\/summaries\/[`'"]\s*\}/);
  assert.match(config, /\/summaries\/\$\{month\}\/\$\{file\.replace\('\.md', ''\)\}/);
  assert.doesNotMatch(config, /summaries\/index\.md/);
  assert.doesNotMatch(config, /summaries\/\*\*\/\*\.md/);
});

test("package exposes Cloudflare Pages build and deploy commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const wranglerConfig = await readFile("wrangler.toml", "utf8");

  assert.equal(pkg.scripts["pages:build"], "npm run docs:build");
  assert.equal(pkg.scripts["pages:deploy"], "node scripts/deploy-cloudflare-pages.mjs");
  assert.equal(pkg.scripts["pages:deploy:dry"], "node scripts/deploy-cloudflare-pages.mjs --dry-run");
  assert.match(wranglerConfig, /pages_build_output_dir\s*=\s*"\.\/docs\/\.vitepress\/dist"/);
});

test("cloudflare deploy dry run prints configured site base url for card notify", () => {
  const result = spawnSync(process.execPath, [
    "scripts/deploy-cloudflare-pages.mjs",
    "--dry-run",
    "--skip-build",
    "--site-base-url=https://f79a4b5f.stocks-emw.pages.dev/",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /project_name: stocks-emw/);
  assert.match(result.stdout, /site_url: https:\/\/f79a4b5f\.stocks-emw\.pages\.dev\//);
  assert.match(result.stdout, /notify_card_env: SUMMARY_SITE_BASE_URL=https:\/\/f79a4b5f\.stocks-emw\.pages\.dev\//);
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

test("notify:text dry run validates text notification path without network", () => {
  const result = spawnSync(process.execPath, ["scripts/notify-text.mjs", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /notify:text dry run ok/);
  assert.match(result.stdout, /text_chunks:/);
  assert.match(result.stdout, /unicode_probe: 每日总结/);
});

test("notify:card dry run validates card notification path without network", () => {
  const result = spawnSync(process.execPath, [
    "scripts/notify-card.mjs",
    "--dry-run",
    "--site-base-url=https://f79a4b5f.stocks-emw.pages.dev/",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /notify:card dry run ok/);
  assert.match(result.stdout, /msgtype: template_card/);
  assert.match(result.stdout, /card_type: news_notice/);
  assert.match(result.stdout, /report_url: https:\/\/f79a4b5f\.stocks-emw\.pages\.dev\//);
  assert.match(result.stdout, /cover_url: https:\/\/f79a4b5f\.stocks-emw\.pages\.dev\/assets\/summary-cards\/2026-05-20\.png/);
});

test("notify:brief dry run validates no-url markdown notification path without network", () => {
  const result = spawnSync(process.execPath, ["scripts/notify-brief.mjs", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /notify:brief dry run ok/);
  assert.match(result.stdout, /msgtype: markdown/);
  assert.match(result.stdout, /contains_url: false/);
});
