import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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

const require = createRequire(import.meta.url);
let researchTsHookInstalled = false;

function installResearchTsHook() {
  if (researchTsHookInstalled) return;
  const typescriptPath = require.resolve("typescript", {
    paths: [path.resolve("apps/research-console")],
  });
  const ts = require(typescriptPath);

  require.extensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
        resolveJsonModule: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };

  researchTsHookInstalled = true;
}

function loadResearchConsoleModule(relativePath) {
  installResearchTsHook();
  return require(path.resolve(relativePath));
}

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

function researchProviderInput(overrides = {}) {
  return {
    day: "2026-05-22",
    message: "解释今天的机会观察",
    context: {
      day: "2026-05-22",
      eventSummary: ["市场围绕 LITE 和 IREN 形成资金观察线索。"],
      overview: ["管理员强调先看节奏，再看标的。"],
      adminCore: ["核心理论是用价格、时间和资金承接确认机会。"],
      adminSymbols: ["LITE: wait for trigger window", "IREN: compute infrastructure theme"],
      risks: ["如果资金承接不一致，机会观察失效。"],
      opportunityMarkdown: "# 机会观察\n- LITE 等待触发。",
    },
    toolTrace: [
      {
        name: "extract_watchlist",
        reason: "test",
        input: { day: "2026-05-22" },
        result_summary: "LITE | IREN",
      },
    ],
    policyDecisions: [
      { name: "extract_watchlist", status: "allowed", reason: "test" },
    ],
    conversationSummary: "user: 解释机会观察",
    ...overrides,
  };
}

async function createResearchFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "research-console-"));
  const day = "2026-05-22";
  const month = "2026-05";
  await mkdir(path.join(root, "data", "structured", day), { recursive: true });
  await mkdir(path.join(root, "docs", "opportunities", month), { recursive: true });

  await writeFile(
    path.join(root, "data", "structured", day, `${day}.json`),
    JSON.stringify({
      event_summary: ["三句话总结：LITE 和 IREN 是当日主要观察线索。"],
      overview: ["市场仍以管理员节奏判断为主。"],
      admin_core: ["核心理论：只在价格、时间和资金承接同时出现时观察。"],
      admin_symbols: [
        { symbol: "LITE", summary: "等待确认窗口" },
        { symbol: "IREN", summary: "算力线索" },
      ],
      risks: ["追高和缺少承接是主要失效条件。"],
    }),
    "utf8",
  );
  await writeFile(
    path.join(root, "docs", "opportunities", month, `${day}-机会观察.md`),
    "# 机会观察\n\n- 来源：2026-05-22 每日总结。\n- 观察：LITE 与 IREN。",
    "utf8",
  );

  return { root, day };
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

test("daily publish waits for public card cover before template card webhook", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");

  assert.match(script, /async function waitForPublicUrl/);
  assert.match(script, /SUMMARY_CARD_URL_WAIT_TIMEOUT_MS/);
  assert.match(script, /SUMMARY_CARD_URL_WAIT_INTERVAL_MS/);
  assert.match(script, /await waitForPublicUrl\(card\.coverImageUrl/);
  assert.ok(
    script.indexOf("await waitForPublicUrl(card.coverImageUrl") <
      script.indexOf("await sendWeWorkTemplateCard(webhookUrl, card.payload)"),
    "card cover URL should be checked before sending template card",
  );
});

test("daily publish optionally triggers deploy hook after git publish before webhook", async () => {
  const script = await readFile("scripts/daily-publish.mjs", "utf8");

  assert.match(script, /SUMMARY_DEPLOY_HOOK_URL/);
  assert.match(script, /async function triggerDeployHook/);
  assert.match(script, /method:\s*"POST"/);
  assert.match(script, /deploy hook response/);
  assert.match(script, /published = publishWithGit\(artifacts,\s*\[card\?\.coverPath,\s*image\?\.imagePath\]\)/);
  assert.match(script, /if \(published\) \{\s*await triggerDeployHook\(\);\s*\}/s);
  assert.ok(
    script.indexOf("await triggerDeployHook()") <
      script.indexOf("await waitForPublicUrl(card.coverImageUrl)"),
    "deploy hook should be triggered before waiting for the public cover URL",
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

  for (const script of [dailyScript, cardScript]) {
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
  assert.equal(nvmrc.trim(), "20");
  assert.equal(nodeVersion.trim(), "20");
  await assert.rejects(access("package-lock.json"), /ENOENT/);
  await access("pnpm-lock.yaml");
  assert.match(gitignore, /^\.cache\/$/m);
  assert.match(workspace, /-\s+"apps\/\*"/);
  assert.match(workspace, /-\s+"packages\/\*"/);
  assert.equal(pkg.scripts["docs:dev"], "vitepress dev docs");
  assert.equal(pkg.scripts["docs:build"], "vitepress build docs");
  assert.equal(pkg.scripts["daily:publish"], "node scripts/daily-publish.mjs");
  assert.equal(pkg.scripts["console:dev"], "node scripts/pnpm-workspace.mjs --filter research-console dev");
  assert.equal(pkg.scripts["console:build"], "node scripts/pnpm-workspace.mjs --filter research-console build");
  assert.equal(pkg.scripts["console:lint"], "node scripts/pnpm-workspace.mjs --filter research-console lint");
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

test("node runtime policy keeps CI pinned to Node 20 despite local newer runtimes", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const nvmrc = await readFile(".nvmrc", "utf8");
  const nodeVersion = await readFile(".node-version", "utf8");
  const dailyWorkflow = await readFile(".github/workflows/daily-publish.yml", "utf8");
  const deployWorkflow = await readFile(".github/workflows/deploy.yml", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-node-runtime-policy.md", "utf8");

  assert.equal(nvmrc.trim(), "20");
  assert.equal(nodeVersion.trim(), "20");
  assert.equal(pkg.engines.node, ">=20 <23");
  assert.match(dailyWorkflow, /node-version-file:\s*\.nvmrc/);
  assert.match(deployWorkflow, /node-version-file:\s*\.nvmrc/);
  assert.match(moduleDoc, /Canonical CI runtime: Node 20/);
  assert.match(moduleDoc, /Do not broaden `package\.json` engines only to silence a local warning/);
  assert.match(moduleDoc, /switch the local shell to Node 20/);
});

test("research console scaffold provides a React agent workspace with server-side secret boundary", async () => {
  const rootPkg = JSON.parse(await readFile("package.json", "utf8"));
  const appPkg = JSON.parse(await readFile("apps/research-console/package.json", "utf8"));
  const page = await readFile("apps/research-console/app/page.tsx", "utf8");
  const workspace = await readFile("apps/research-console/components/ResearchWorkspace.tsx", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const route = await readFile("apps/research-console/app/api/agent/chat/route.ts", "utf8");
  const auth = await readFile("apps/research-console/lib/api-auth.ts", "utf8");
  const kernel = await readFile("apps/research-console/lib/agent-kernel.ts", "utf8");
  const context = await readFile("apps/research-console/lib/context.ts", "utf8");
  const provider = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");
  const corePkg = JSON.parse(await readFile("packages/summary-core/package.json", "utf8"));

  assert.equal(appPkg.name, "research-console");
  assert.equal(appPkg.private, true);
  assert.match(appPkg.dependencies.next, /^\^15\./);
  assert.match(appPkg.dependencies.react, /^\^19\./);
  assert.equal(appPkg.scripts.dev, "next dev");
  assert.equal(appPkg.scripts.lint, "tsc --noEmit --incremental false");
  assert.equal(rootPkg.scripts["console:dev"], "node scripts/pnpm-workspace.mjs --filter research-console dev");
  assert.match(page, /<ResearchWorkspace/);
  assert.match(page, /交易研究工作台/);
  assert.match(workspace, /<AgentPanel/);
  assert.match(workspace, /timeZone:\s*"Asia\/Shanghai"/);
  assert.match(panel, /"use client"/);
  assert.match(panel, /\/api\/agent\/chat/);
  assert.doesNotMatch(panel, /useState\("2026-05-22"\)/);
  assert.doesNotMatch(panel, /AGENT_API_KEY|OPENAI_API_KEY|ALPHA_VANTAGE_API_KEY|LONGBRIDGE|RESEARCH_CONSOLE_ACCESS_TOKEN/);
  assert.doesNotMatch(route, /AGENT_API_KEY/);
  assert.doesNotMatch(route, /External LLM/);
  assert.match(route, /isAuthorizedResearchConsoleRequest/);
  assert.match(auth, /process\.env\.NODE_ENV\s*!==\s*"production"/);
  assert.match(auth, /process\.env\.RESEARCH_CONSOLE_ACCESS_TOKEN/);
  assert.match(auth, /x-research-console-token/);
  assert.match(route, /timeZone:\s*"Asia\/Shanghai"/);
  assert.match(route, /runResearchAgent/);
  assert.match(kernel, /loadResearchContext/);
  assert.match(provider, /reasoning_summary/);
  assert.match(context, /STRUCTURED_DATA_PARTS/);
  assert.match(context, /OPPORTUNITIES_PARTS/);
  assert.equal(corePkg.name, "@stock-summary/summary-core");
  assert.match(corePkg.exports["."], /src\/index\.ts/);
});

test("local research agent answer includes evidence digest and blocked policy notes", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule("apps/research-console/lib/agent-provider.ts");

  await withEnv({ AGENT_PROVIDER: "local-deterministic" }, async () => {
    const provider = createResearchAgentProvider();
    const response = await provider.generateResponse(researchProviderInput({
      toolTrace: [
        {
          name: "extract_watchlist",
          reason: "test",
          input: { day: "2026-05-22" },
          result_summary: "LITE | IREN",
        },
      ],
      policyDecisions: [
        { name: "extract_watchlist", status: "allowed", reason: "local context tool" },
        { name: "news_search", status: "blocked", reason: "external tools disabled" },
      ],
    }));

    assert.match(response.answer, /证据摘要/);
    assert.match(response.answer, /extract_watchlist/);
    assert.match(response.answer, /LITE \| IREN/);
    assert.match(response.answer, /策略阻断/);
    assert.match(response.answer, /news_search/);
    assert.match(response.answer, /external tools disabled/);
    assert.match(response.answer, /研究边界/);
    assert.match(response.answer, /不是交易指令/);
  });
});

test("local research agent answer uses stable research sections", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule("apps/research-console/lib/agent-provider.ts");

  await withEnv({ AGENT_PROVIDER: "local-deterministic" }, async () => {
    const provider = createResearchAgentProvider();
    const response = await provider.generateResponse(researchProviderInput({
      policyDecisions: [
        { name: "extract_watchlist", status: "allowed", reason: "local context tool" },
        { name: "yfinance_history", status: "blocked", reason: "external tools disabled" },
      ],
    }));
    const headings = ["结论", "证据", "反证", "下一步观察", "研究边界"];
    const indexes = headings.map((heading) => response.answer.indexOf(`${heading}：`));

    assert.ok(indexes.every((index) => index >= 0), response.answer);
    assert.deepEqual([...indexes].sort((a, b) => a - b), indexes);
    assert.match(response.answer, /yfinance_history/);
    assert.match(response.answer, /不是交易指令/);
  });
});

test("research console agent contract supports multi-turn tool-calling traces", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const route = await readFile("apps/research-console/app/api/agent/chat/route.ts", "utf8");
  const kernel = await readFile("apps/research-console/lib/agent-kernel.ts", "utf8");
  const tools = await readFile("apps/research-console/lib/agent-tools.ts", "utf8");
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");

  assert.match(coreTypes, /interface AgentChatMessage/);
  assert.match(coreTypes, /interface AgentToolTrace/);
  assert.match(coreTypes, /tool_trace:\s*AgentToolTrace\[\]/);

  assert.match(route, /messages\?:\s*AgentChatMessage\[\]/);
  assert.match(route, /runResearchAgent/);
  assert.doesNotMatch(route, /buildLocalReasonedResponse/);

  assert.match(kernel, /runResearchAgent/);
  assert.match(kernel, /executeResearchTool/);
  assert.match(kernel, /conversation_summary/);
  assert.match(kernel, /tool_trace/);

  assert.match(tools, /load_structured_summary/);
  assert.match(tools, /load_opportunity_observation/);
  assert.match(tools, /extract_watchlist/);

  assert.match(panel, /messages/);
  assert.match(panel, /tool_trace/);
  assert.match(panel, /工具调用/);
  assert.match(panel, /className="agent-answer-text"/);
});

test("research console separates provider planning from tool execution policy", async () => {
  const kernel = await readFile("apps/research-console/lib/agent-kernel.ts", "utf8");
  const provider = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");
  const policy = await readFile("apps/research-console/lib/tool-policy.ts", "utf8");
  const tools = await readFile("apps/research-console/lib/agent-tools.ts", "utf8");
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");

  assert.match(coreTypes, /interface AgentToolDefinition/);
  assert.match(coreTypes, /interface AgentToolPolicyDecision/);
  assert.match(coreTypes, /provider:\s*AgentProviderMode/);
  assert.match(coreTypes, /policy_decisions:\s*AgentToolPolicyDecision\[\]/);

  assert.match(policy, /LOCAL_RESEARCH_TOOLS/);
  assert.match(policy, /DISABLED_EXTERNAL_MARKET_TOOLS/);
  assert.match(policy, /authorizeResearchTool/);
  assert.match(policy, /status:\s*"allowed"/);
  assert.match(policy, /status:\s*"blocked"/);

  assert.match(provider, /createResearchAgentProvider/);
  assert.match(provider, /selectToolPlan/);
  assert.match(provider, /mode:\s*"local-deterministic"/);
  assert.match(provider, /AGENT_PROVIDER/);
  assert.match(provider, /fetch\(/);

  assert.match(kernel, /createResearchAgentProvider/);
  assert.match(kernel, /authorizeResearchTool/);
  assert.match(kernel, /policy_decisions/);
  assert.doesNotMatch(kernel, /const TOOL_PLAN/);

  assert.match(tools, /ResearchToolName/);
  assert.match(tools, /AgentToolDefinition/);
});

test("research console provider supports server-only openai compatible generation", async () => {
  const provider = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");
  const kernel = await readFile("apps/research-console/lib/agent-kernel.ts", "utf8");
  const route = await readFile("apps/research-console/app/api/agent/chat/route.ts", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");

  assert.match(coreTypes, /type AgentProviderMode/);
  assert.match(coreTypes, /provider_status:\s*"ready"\s*\|\s*"fallback"\s*\|\s*"error"/);

  assert.match(provider, /openai-compatible/);
  assert.match(provider, /AGENT_API_BASE_URL/);
  assert.match(provider, /AGENT_MODEL/);
  assert.match(provider, /process\.env\.AGENT_API_KEY/);
  assert.match(provider, /\/chat\/completions/);
  assert.match(provider, /AbortSignal\.timeout/);
  assert.match(provider, /generateResponse/);
  assert.match(provider, /结论 \/ 证据 \/ 反证 \/ 下一步观察 \/ 研究边界/);
  assert.match(provider, /provider_status:\s*"fallback"/);
  assert.match(provider, /provider_status:\s*"error"/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC/);

  assert.match(kernel, /await provider\.generateResponse/);
  assert.match(kernel, /provider_status/);

  assert.doesNotMatch(route, /AGENT_MODEL|AGENT_API_BASE_URL/);
  assert.doesNotMatch(panel, /AGENT_MODEL|AGENT_API_BASE_URL|AGENT_API_KEY/);
});

test("research console tool policy blocks disabled and unknown tools at runtime", () => {
  const { authorizeResearchTool, isResearchToolName } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );

  for (const name of [
    "load_structured_summary",
    "load_opportunity_observation",
    "extract_watchlist",
  ]) {
    assert.equal(authorizeResearchTool(name).status, "allowed");
    assert.equal(isResearchToolName(name), true);
  }

  const alphaDecision = authorizeResearchTool("alpha_vantage_quote");
  assert.equal(alphaDecision.status, "blocked");
  assert.equal(alphaDecision.name, "alpha_vantage_quote");
  assert.equal(isResearchToolName("alpha_vantage_quote"), true);

  const newsDecision = authorizeResearchTool("news_search");
  assert.equal(newsDecision.status, "blocked");
  assert.equal(newsDecision.name, "news_search");
  assert.equal(isResearchToolName("news_search"), true);

  const yfinanceDecision = authorizeResearchTool("yfinance_quote");
  assert.equal(yfinanceDecision.status, "blocked");
  assert.equal(yfinanceDecision.name, "yfinance_quote");
  assert.equal(isResearchToolName("yfinance_quote"), true);

  const longbridgeDecision = authorizeResearchTool("longbridge_quote");
  assert.equal(longbridgeDecision.status, "blocked");
  assert.equal(longbridgeDecision.name, "longbridge_quote");
  assert.equal(isResearchToolName("longbridge_quote"), true);

  const unknownDecision = authorizeResearchTool("shell_exec");
  assert.equal(unknownDecision.status, "blocked");
  assert.equal(unknownDecision.name, "shell_exec");
  assert.equal(isResearchToolName("shell_exec"), false);
});

test("research console exposes tool readiness before an agent run", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const policySource = await readFile("apps/research-console/lib/tool-policy.ts", "utf8");
  const route = await readFile("apps/research-console/app/api/research/tools/route.ts", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const { listResearchToolReadiness } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );

  const closed = listResearchToolReadiness();
  assert.ok(closed.some((tool) => tool.name === "load_structured_summary" && tool.status === "allowed"));
  assert.ok(closed.some((tool) => tool.name === "score_opportunities" && tool.status === "allowed"));
  assert.ok(closed.some((tool) => tool.name === "alpha_vantage_quote" && tool.status === "blocked"));
  assert.ok(closed.some((tool) => tool.name === "news_search" && tool.status === "blocked"));
  assert.ok(closed.some((tool) => tool.name === "yfinance_quote" && tool.status === "blocked"));

  await withEnv(
    {
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      ALPHA_VANTAGE_API_KEY: "alpha-secret-value",
      NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
      NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com,www.reuters.com",
    },
    async () => {
      const open = listResearchToolReadiness();
      assert.ok(open.some((tool) => tool.name === "alpha_vantage_quote" && tool.status === "allowed"));
      assert.ok(open.some((tool) => tool.name === "news_search" && tool.status === "allowed"));
      assert.ok(open.some((tool) => tool.name === "yfinance_quote" && tool.status === "allowed"));
      assert.doesNotMatch(JSON.stringify(open), /alpha-secret-value/);
    },
  );

  assert.match(coreTypes, /interface ResearchToolReadiness/);
  assert.match(policySource, /listResearchToolReadiness/);
  assert.match(route, /listResearchToolReadiness/);
  assert.match(panel, /\/api\/research\/tools/);
  assert.match(panel, /className="tool-readiness"/);
  assert.match(panel, /policy.status/);
  assert.match(styles, /\.tool-readiness/);
  assert.match(styles, /\.tool-policy-pill/);
});

test("research console score_opportunities is a local non-actionable scoring tool", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const providerSource = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");
  const { authorizeResearchTool, isResearchToolName } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );

  assert.match(coreTypes, /interface OpportunityScore/);
  for (const field of [
    "symbol",
    "thesis_alignment",
    "trigger_clarity",
    "evidence_quality",
    "invalidation_clarity",
    "liquidity_risk",
    "summary",
  ]) {
    assert.match(coreTypes, new RegExp(`${field}:`));
  }

  const policy = authorizeResearchTool("score_opportunities");
  assert.equal(policy.status, "allowed");
  assert.equal(policy.name, "score_opportunities");
  assert.equal(isResearchToolName("score_opportunities"), true);

  assert.match(
    providerSource,
    /"extract_watchlist",\s*"score_opportunities"/,
    "default local tool plan should score after extracting the watchlist",
  );
  assert.match(
    providerSource,
    /name:\s*"score_opportunities"[\s\S]*source:\s*"local"/,
    "model planning should expose score_opportunities as a local tool",
  );

  const provider = createResearchAgentProvider();
  const defaultPlan = await provider.selectToolPlan({ day: "2026-05-22", message: "score context" });
  assert.deepEqual(defaultPlan, [
    "load_structured_summary",
    "load_opportunity_observation",
    "extract_watchlist",
    "score_opportunities",
  ]);

  const context = {
    day: "2026-05-22",
    eventSummary: [
      "LITE has a follow-through watch window after guidance while IREN remains a secondary compute theme.",
    ],
    overview: ["Admin wants price, time, and capital acceptance before upgrading any observation."],
    adminCore: ["Admin theory: LITE can matter only when the confirmation window and acceptance both appear."],
    adminSymbols: ["LITE: wait for confirmation window", "IREN: compute infrastructure theme"],
    risks: ["Risk: if follow-through does not hold or volume fades, the observation is invalidated."],
    opportunityMarkdown:
      "LITE trigger: wait for confirmation window and confirm acceptance before changing the research state.",
  };
  const trace = await executeResearchTool(
    { name: "score_opportunities", input: { symbol: "LITE" } },
    context,
  );

  assert.equal(trace.name, "score_opportunities");
  assert.deepEqual(trace.input, { symbol: "LITE" });
  assert.match(trace.result_summary, /LITE/);
  assert.doesNotMatch(trace.result_summary, /IREN/);
  for (const component of [
    "thesis_alignment",
    "trigger_clarity",
    "evidence_quality",
    "invalidation_clarity",
    "liquidity_risk",
  ]) {
    assert.match(trace.result_summary, new RegExp(`${component}=\\d+`));
  }
  assert.doesNotMatch(trace.result_summary, /\b(buy|sell|long|short|call option|put option)\b/i);
});

test("research console kernel executes provider-planned score_opportunities", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({ STOCK_SUMMARY_ROOT: root, AGENT_PROVIDER: undefined }, async () => {
      const response = await runResearchAgent({
        day,
        message: "Rank current opportunity observations.",
        provider: {
          mode: "local-deterministic",
          selectToolPlan(input) {
            if (input.round > 0) return [];
            return [{ name: "score_opportunities", input: { symbol: "LITE" } }];
          },
          async generateResponse(input) {
            return {
              answer: input.toolTrace.map((tool) => tool.result_summary).join("\n"),
              reasoning_summary: ["score_opportunities was executed as a local scoring tool"],
              next_watch_plan: ["Use scores only as research triage, then verify triggers and risks."],
              provider_status: "ready",
            };
          },
        },
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["score_opportunities:allowed"],
      );
      assert.deepEqual(response.tool_trace.map((tool) => tool.name), ["score_opportunities"]);
      assert.match(response.answer, /LITE/);
      assert.match(response.answer, /thesis_alignment=\d+/);
      assert.match(response.answer, /liquidity_risk=\d+/);
  assert.doesNotMatch(response.answer, /\b(buy|sell|long|short|call option|put option)\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console renders score_opportunities traces as compact score rows", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const scoreRows = await readFile("apps/research-console/components/ScoreRows.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const tools = await readFile("apps/research-console/lib/agent-tools.ts", "utf8");

  assert.match(tools, /\$\{index \+ 1\} \| \$\{score\.symbol\} \|/);
  assert.match(panel, /function\s+parseScoreTraceRows\(/);
  assert.match(panel, /tool\.name\s*===\s*"score_opportunities"/);
  assert.match(panel, /<ScoreRows rows=\{rows\}/);
  assert.match(panel, /className="score-trace"/);
  assert.match(scoreRows, /className="score-row"/);
  assert.match(scoreRows, /className="score-pill"/);
  assert.match(scoreRows, /className="score-meter-fill"/);
  assert.match(styles, /\.score-trace/);
  assert.match(styles, /\.score-row/);
  assert.match(styles, /\.score-pill/);
  assert.match(styles, /\.score-meter-fill/);
});

test("research console renders yfinance history traces as metric cards", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const tools = await readFile("apps/research-console/lib/agent-tools.ts", "utf8");

  assert.match(tools, /`yfinance history\$\{fromCache \? " cache" : ""\}`/);
  assert.match(tools, /`close change \$\{percentText\(history\.close_change_percent\)\}`/);
  assert.match(tools, /`max drawdown \$\{percentText\(history\.max_drawdown_percent\)\}`/);
  assert.match(tools, /`latest volume ratio \$\{ratioText\(history\.latest_volume_ratio\)\}`/);
  assert.match(panel, /function\s+parseYfinanceHistoryTrace\(/);
  assert.match(panel, /tool\.name\s*===\s*"yfinance_history"/);
  assert.match(panel, /className="history-trace"/);
  assert.match(panel, /Close change/);
  assert.match(panel, /Max drawdown/);
  assert.match(panel, /Realized volatility/);
  assert.match(panel, /Latest volume ratio/);
  assert.match(styles, /\.history-trace/);
  assert.match(styles, /\.history-metrics/);
  assert.match(styles, /\.history-metric/);
});

test("research console exposes selected-day context status without raw content", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const route = await readFile("apps/research-console/app/api/research/context/route.ts", "utf8");
  const { inspectResearchContext } = loadResearchConsoleModule("apps/research-console/lib/context.ts");
  const { root, day } = await createResearchFixture();

  try {
    await mkdir(path.join(root, "docs", "summaries", day.slice(0, 7)), { recursive: true });
    await writeFile(
      path.join(root, "docs", "summaries", day.slice(0, 7), `${day}-每日总结-local.md`),
      "# local summary\n\nfull local audit content should not be returned by status.",
      "utf8",
    );

    await withEnv({ STOCK_SUMMARY_ROOT: root }, async () => {
      const status = await inspectResearchContext(day);
      const serialized = JSON.stringify(status);

      assert.equal(status.day, day);
      assert.equal(status.hasStructuredSummary, true);
      assert.equal(status.hasOpportunityObservation, true);
      assert.equal(status.hasSourceSummary, true);
      assert.equal(status.eventSummaryCount, 1);
      assert.equal(status.adminCoreCount, 1);
      assert.equal(status.adminSymbolCount, 2);
      assert.equal(status.riskCount, 1);
      assert.deepEqual(status.adminSymbolsPreview, ["LITE: 等待确认窗口", "IREN: 算力线索"]);
      assert.match(status.structuredSummaryPath, new RegExp(`data/structured/${day}/${day}\\.json`));
      assert.match(status.opportunityPath, new RegExp(`docs/opportunities/${day.slice(0, 7)}/${day}-机会观察\\.md`));
      assert.match(status.sourceSummaryPath, new RegExp(`docs/summaries/${day.slice(0, 7)}/${day}-每日总结-local\\.md`));
      assert.doesNotMatch(serialized, /full local audit content/);
      assert.doesNotMatch(serialized, /# 机会观察/);
      assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  assert.match(coreTypes, /interface ResearchContextStatus/);
  assert.match(route, /export async function GET/);
  assert.match(route, /inspectResearchContext/);
  assert.match(panel, /\/api\/research\/context/);
  assert.match(panel, /className="context-status"/);
});

test("research console exposes a local opportunity board without model or raw content", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const route = await readFile("apps/research-console/app/api/research/opportunities/route.ts", "utf8");
  const page = await readFile("apps/research-console/app/page.tsx", "utf8");
  const workspace = await readFile("apps/research-console/components/ResearchWorkspace.tsx", "utf8");
  const board = await readFile("apps/research-console/components/OpportunityBoard.tsx", "utf8");
  const scoreRows = await readFile("apps/research-console/components/ScoreRows.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const { loadOpportunityBoard } = loadResearchConsoleModule("apps/research-console/lib/opportunity-board.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({ STOCK_SUMMARY_ROOT: root }, async () => {
      const result = await loadOpportunityBoard(day);
      const serialized = JSON.stringify(result);

      assert.equal(result.day, day);
      assert.equal(result.status.hasStructuredSummary, true);
      assert.equal(result.status.hasOpportunityObservation, true);
      assert.equal(result.scores.length, 2);
      assert.equal(result.scores[0].symbol, "LITE");
      assert.equal(typeof result.scores[0].score, "number");
      assert.ok(result.scores[0].score >= 0 && result.scores[0].score <= 100);
      assert.equal(result.scores[0].confidence === "high" || result.scores[0].confidence === "medium" || result.scores[0].confidence === "low", true);
      assert.match(result.scores[0].reason, /thesis_alignment=/);
      assert.equal(result.reasoning.context.observationOnly, true);
      assert.ok(result.reasoning.reasoningSummary.length > 0);
      assert.ok(result.reasoning.marketIntelNeeds.length > 0);
      assert.ok(result.reasoning.candidateOpportunities.length > 0);
      assert.ok(result.reasoning.candidateOpportunities[0].sourceBasis.length > 0);
      assert.ok(result.reasoning.candidateOpportunities[0].invalidation.length > 0);
      assert.doesNotMatch(serialized, /# 机会观察/);
      assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(serialized, /\b(buy|sell|long|short|call option|put option)\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  assert.match(coreTypes, /interface OpportunityBoardSummary/);
  assert.match(coreTypes, /interface OpportunityBoardScore/);
  assert.match(coreTypes, /interface OpportunityReasoningResult/);
  assert.match(route, /export async function GET/);
  assert.match(route, /loadOpportunityBoard/);
  assert.match(page, /<ResearchWorkspace/);
  assert.match(workspace, /<OpportunityBoard day=\{day\} onDayChange=\{setDay\}/);
  assert.match(board, /\/api\/research\/opportunities/);
  assert.match(board, /className="opportunity-board"/);
  assert.match(board, /board\?\.reasoning/);
  assert.match(board, /className="reasoning-panel"/);
  assert.match(board, /<ScoreRows/);
  assert.match(scoreRows, /export function ScoreRows/);
  assert.match(styles, /\.opportunity-board/);
  assert.match(styles, /\.opportunity-metrics/);
  assert.match(styles, /\.opportunity-watchlist/);
  assert.match(styles, /\.reasoning-panel/);
});

test("research console agent response includes staged opportunity reasoning without raw content", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({ STOCK_SUMMARY_ROOT: root, AGENT_PROVIDER: undefined }, async () => {
      const response = await runResearchAgent({
        day,
        message: "基于今天的机会观察，列出需要反证的市场情报。",
      });
      const serialized = JSON.stringify(response);

      assert.equal(response.opportunity_reasoning.context.observationOnly, true);
      assert.equal(response.opportunity_reasoning.context.day, day);
      assert.ok(response.opportunity_reasoning.reasoningSummary.length > 0);
      assert.ok(response.opportunity_reasoning.marketIntelNeeds.length > 0);
      assert.ok(response.opportunity_reasoning.invalidationPlan.length > 0);
      assert.ok(response.opportunity_reasoning.nextChecks.length > 0);
      assert.deepEqual(
        response.opportunity_reasoning.candidateOpportunities.map((candidate) => candidate.symbol),
        ["LITE", "IREN"],
      );
      assert.match(response.used_context.join("\n"), /local-staged-opportunity-reasoning/);
      assert.doesNotMatch(serialized, /# 机会观察/);
      assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(serialized, /\b(buy|sell|long|short|call option|put option)\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console renders staged opportunity reasoning in the agent panel", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const kernel = await readFile("apps/research-console/lib/agent-kernel.ts", "utf8");
  const provider = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");
  const reasoning = await readFile("apps/research-console/lib/opportunity-reasoning.ts", "utf8");
  const board = await readFile("apps/research-console/lib/opportunity-board.ts", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(coreTypes, /opportunity_reasoning:\s*OpportunityReasoningResult/);
  assert.match(coreTypes, /evidenceNeeds:\s*EvidenceNeed\[\]/);
  assert.match(coreTypes, /researchPlan:\s*ResearchPlanStep\[\]/);
  assert.match(coreTypes, /interface EvidenceNeed/);
  assert.match(coreTypes, /interface ResearchPlanStep/);
  assert.match(reasoning, /buildReasoningInputFromResearchContext/);
  assert.match(reasoning, /buildEvidenceNeeds/);
  assert.match(reasoning, /buildResearchPlan/);
  assert.match(board, /buildReasoningInputFromResearchContext/);
  assert.match(kernel, /opportunity_reasoning/);
  assert.match(kernel, /buildReasoningInputFromResearchContext/);
  assert.match(provider, /opportunityReasoning/);
  assert.match(provider, /Research plan:/);
  assert.match(panel, /reply\.opportunity_reasoning/);
  assert.match(panel, /className="agent-reasoning-context"/);
  assert.match(panel, /researchPlan/);
  assert.match(panel, /className="agent-research-plan"/);
  assert.match(panel, /evidenceNeeds/);
  assert.match(panel, /className="agent-evidence-needs"/);
  assert.match(panel, /need\.preferredTools\.join\(" \/ "\)/);
  assert.match(panel, /推演上下文/);
  assert.match(panel, /研究计划/);
  assert.match(panel, /候选观察/);
  assert.match(styles, /\.agent-reasoning-context/);
  assert.match(styles, /\.agent-research-plan/);
  assert.match(styles, /\.agent-evidence-needs/);
});

test("research console writes sanitized agent run evidence log", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_PROVIDER: undefined,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
    }, async () => {
      const response = await runResearchAgent({
        day,
        message: "explain the local opportunity observation with evidence",
      });
      const expectedLogPath = `.cache/research-agent/runs/${day}.jsonl`;

      assert.match(response.run_id, /^run_[a-f0-9]{16}$/);
      assert.equal(response.evidence_log_path, expectedLogPath);

      const rawLog = await readFile(path.join(root, ".cache", "research-agent", "runs", `${day}.jsonl`), "utf8");
      const lines = rawLog.trim().split(/\r?\n/);
      assert.equal(lines.length, 1);

      const record = JSON.parse(lines[0]);
      const serialized = JSON.stringify(record);

      assert.equal(record.run_id, response.run_id);
      assert.equal(record.day, day);
      assert.equal(record.provider, "local-deterministic");
      assert.equal(record.provider_status, response.provider_status);
      assert.deepEqual(record.used_context, response.used_context);
      assert.deepEqual(
        record.tool_trace.map((tool) => tool.name),
        response.tool_trace.map((tool) => tool.name),
      );
      assert.ok(record.opportunity_reasoning.candidateOpportunities.length > 0);
      assert.doesNotMatch(serialized, /opportunityMarkdown|raw_markdown|raw_json|structuredPath/i);
      assert.doesNotMatch(serialized, /\b[A-Za-z]:[\\/]/);
      assert.doesNotMatch(serialized, /API_KEY|WEBHOOK|Authorization|Bearer|STOCK_SUMMARY_ROOT/i);
      assert.doesNotMatch(serialized, /\b(buy|sell|long|short|call option|put option)\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console agent evidence log viewer returns bounded run summaries", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { listAgentRunEvidence } = loadResearchConsoleModule("apps/research-console/lib/agent-evidence.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_PROVIDER: undefined,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
    }, async () => {
      await runResearchAgent({ day, message: "first local evidence question" });
      await runResearchAgent({ day, message: "second local evidence question" });

      const result = await listAgentRunEvidence(day, { limit: 1 });
      const serialized = JSON.stringify(result);

      assert.equal(result.day, day);
      assert.equal(result.evidence_log_path, `.cache/research-agent/runs/${day}.jsonl`);
      assert.equal(result.runs.length, 1);
      assert.match(result.runs[0].run_id, /^run_[a-f0-9]{16}$/);
      assert.match(result.runs[0].message_preview, /second local evidence question/);
      assert.deepEqual(result.runs[0].tool_names, [
        "load_structured_summary",
        "load_opportunity_observation",
        "extract_watchlist",
        "score_opportunities",
      ]);
      assert.deepEqual(result.runs[0].candidate_symbols, ["LITE", "IREN"]);
      assert.doesNotMatch(serialized, /result_summary|opportunityMarkdown|raw_markdown|raw_json/i);
      assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(serialized, /API_KEY|WEBHOOK|Authorization|Bearer|STOCK_SUMMARY_ROOT/i);
      assert.doesNotMatch(serialized, /\b(buy|sell|long|short|call option|put option)\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console agent evidence log viewer rejects invalid dates before reading cache paths", async () => {
  const { listAgentRunEvidence } = loadResearchConsoleModule("apps/research-console/lib/agent-evidence.ts");
  const root = await mkdtemp(path.join(os.tmpdir(), "research-console-invalid-day-"));

  try {
    await withEnv({ STOCK_SUMMARY_ROOT: root }, async () => {
      await assert.rejects(
        () => listAgentRunEvidence("../2026-05-22"),
        /Invalid agent run evidence date/,
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console agent evidence log viewer sanitizes legacy cache records on read", async () => {
  const { listAgentRunEvidence } = loadResearchConsoleModule("apps/research-console/lib/agent-evidence.ts");
  const root = await mkdtemp(path.join(os.tmpdir(), "research-console-legacy-evidence-"));
  const day = "2026-05-22";
  const secret = "super-secret-agent-token";

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_API_KEY: secret,
    }, async () => {
      const logDir = path.join(root, ".cache", "research-agent", "runs");
      await mkdir(logDir, { recursive: true });
      await writeFile(
        path.join(logDir, `${day}.jsonl`),
        `${JSON.stringify({
          run_id: "run_aaaaaaaaaaaaaaaa",
          created_at: "2026-05-22T00:00:00.000Z",
          day,
          provider: "local-deterministic",
          provider_status: "ready",
          message_preview: `Question with ${root} and ${secret}`,
          answer_preview: "raw_markdown: # secret report\nAuthorization: Bearer should-not-render",
          tool_trace: [
            {
              name: `score_opportunities ${secret}`,
              result_summary: "full raw tool result must stay server side",
            },
          ],
          policy_decisions: [
            {
              name: `news_search ${secret}`,
              status: "blocked",
              reason: `blocked because ${secret}`,
            },
          ],
          opportunity_reasoning: {
            candidateOpportunities: [
              {
                symbol: `LITE ${secret}`,
                thesis: `uses ${root}`,
              },
            ],
          },
          raw_json: { leaked: true },
          opportunityMarkdown: "# local raw markdown",
        })}\n`,
        "utf8",
      );

      const result = await listAgentRunEvidence(day);
      const serialized = JSON.stringify(result);

      assert.equal(result.runs.length, 1);
      assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(serialized, /Authorization|Bearer|raw_markdown|raw_json|opportunityMarkdown/i);
      assert.doesNotMatch(serialized, /secret report/i);
      assert.doesNotMatch(serialized, /full raw tool result/i);
      assert.match(result.runs[0].message_preview, /\[workspace\]/);
      assert.deepEqual(result.runs[0].tool_names, ["score_opportunities"]);
      assert.deepEqual(result.runs[0].blocked_tools, ["news_search"]);
      assert.deepEqual(result.runs[0].candidate_symbols, ["LITE"]);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console renders agent evidence log viewer in the agent panel", async () => {
  const coreTypes = await readFile("packages/summary-core/src/index.ts", "utf8");
  const evidence = await readFile("apps/research-console/lib/agent-evidence.ts", "utf8");
  const route = await readFile("apps/research-console/app/api/agent/runs/route.ts", "utf8");
  const auth = await readFile("apps/research-console/lib/api-auth.ts", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(coreTypes, /interface AgentRunEvidenceSummary/);
  assert.match(evidence, /listAgentRunEvidence/);
  assert.match(route, /listAgentRunEvidence/);
  assert.match(route, /isAuthorizedResearchConsoleRequest/);
  assert.match(auth, /x-research-console-token/);
  assert.match(panel, /\/api\/agent\/runs\?day=\$\{encodeURIComponent\(day\)\}/);
  assert.match(panel, /className="agent-run-list"/);
  assert.match(panel, /历史运行/);
  assert.match(styles, /\.agent-run-list/);
});

test("research console renders blocked tool tags in run history", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(panel, /run\.blocked_tools\.length/);
  assert.match(panel, /run\.blocked_tools\.map\(\(tool\)/);
  assert.match(panel, /className="agent-run-blocked-tags"/);
  assert.match(panel, /blocked:/);
  assert.match(styles, /\.agent-run-blocked-tags/);
  assert.match(styles, /\.agent-run-blocked-tags span/);
});

test("research console renders current response evidence detail panel", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(panel, /const\s+blockedDecisions\s*=\s*reply\.policy_decisions\.filter/);
  assert.match(panel, /className="agent-evidence-detail"/);
  assert.match(panel, /reply\.tool_trace\.length/);
  assert.match(panel, /blockedDecisions\.length/);
  assert.match(panel, /reply\.evidence_log_path/);
  assert.match(panel, /reply\.tool_trace\.map\(\(tool,\s*index\)/);
  assert.match(panel, /blockedDecisions\.map\(\(decision,\s*index\)/);
  assert.match(panel, /研究边界/);
  assert.match(styles, /\.agent-evidence-detail/);
  assert.match(styles, /\.agent-evidence-stats/);
  assert.match(styles, /\.agent-evidence-row/);
  assert.match(styles, /\.agent-evidence-blocked/);
});

test("shared research console API auth guard protects production route handlers", async () => {
  const { isAuthorizedResearchConsoleRequest } = loadResearchConsoleModule("apps/research-console/lib/api-auth.ts");
  const { GET } = loadResearchConsoleModule("apps/research-console/app/api/agent/runs/route.ts");
  const root = await mkdtemp(path.join(os.tmpdir(), "research-console-auth-"));
  const url = "http://localhost/api/agent/runs?day=2026-05-22";

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      NODE_ENV: "production",
      RESEARCH_CONSOLE_ACCESS_TOKEN: "expected-token",
    }, async () => {
      assert.equal(isAuthorizedResearchConsoleRequest(new Request(url)), false);
      assert.equal(
        isAuthorizedResearchConsoleRequest(new Request(url, {
          headers: { "x-research-console-token": "wrong-token" },
        })),
        false,
      );
      assert.equal(
        isAuthorizedResearchConsoleRequest(new Request(url, {
          headers: { "x-research-console-token": "expected-token" },
        })),
        true,
      );

      const missingToken = await GET(new Request(url));
      assert.equal(missingToken.status, 403);

      const wrongToken = await GET(new Request(url, {
        headers: { "x-research-console-token": "wrong-token" },
      }));
      assert.equal(wrongToken.status, 403);

      const allowed = await GET(new Request(url, {
        headers: { "x-research-console-token": "expected-token" },
      }));
      assert.equal(allowed.status, 200);
      const payload = await allowed.json();
      assert.deepEqual(payload.runs, []);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shared research console API auth guard is imported by every console API route", async () => {
  const routeFiles = [
    "apps/research-console/app/api/agent/chat/route.ts",
    "apps/research-console/app/api/agent/runs/route.ts",
    "apps/research-console/app/api/research/context/route.ts",
    "apps/research-console/app/api/research/data-sources/route.ts",
    "apps/research-console/app/api/research/opportunities/route.ts",
    "apps/research-console/app/api/research/tools/route.ts",
  ];

  const authModule = await readFile("apps/research-console/lib/api-auth.ts", "utf8");
  assert.match(authModule, /isAuthorizedResearchConsoleRequest/);
  assert.match(authModule, /x-research-console-token/);

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    assert.match(source, /isAuthorizedResearchConsoleRequest/);
    assert.match(source, /researchConsoleForbiddenResponse/);
    assert.doesNotMatch(source, /function isAuthorizedProductionRequest/);
    assert.doesNotMatch(source, /process\.env\.RESEARCH_CONSOLE_ACCESS_TOKEN/);
  }
});

test("shared research console API auth guard rejects unauthorized production requests for every console API route", async () => {
  const routeSpecs = [
    {
      path: "apps/research-console/app/api/agent/chat/route.ts",
      method: "POST",
      handler: "POST",
      url: "http://localhost/api/agent/chat",
      init: { method: "POST", body: "{}" },
    },
    {
      path: "apps/research-console/app/api/agent/runs/route.ts",
      handler: "GET",
      url: "http://localhost/api/agent/runs?day=2026-05-22",
    },
    {
      path: "apps/research-console/app/api/research/context/route.ts",
      handler: "GET",
      url: "http://localhost/api/research/context?day=2026-05-22",
    },
    {
      path: "apps/research-console/app/api/research/data-sources/route.ts",
      handler: "GET",
      url: "http://localhost/api/research/data-sources",
    },
    {
      path: "apps/research-console/app/api/research/opportunities/route.ts",
      handler: "GET",
      url: "http://localhost/api/research/opportunities?day=2026-05-22",
    },
    {
      path: "apps/research-console/app/api/research/tools/route.ts",
      handler: "GET",
      url: "http://localhost/api/research/tools",
    },
  ];

  await withEnv({
    NODE_ENV: "production",
    RESEARCH_CONSOLE_ACCESS_TOKEN: "expected-token",
  }, async () => {
    for (const spec of routeSpecs) {
      const route = loadResearchConsoleModule(spec.path);
      const handler = route[spec.handler];
      assert.equal(typeof handler, "function", `${spec.path} missing ${spec.handler}`);

      const response = await handler(new Request(spec.url, spec.init));
      assert.equal(response.status, 403, `${spec.path} should reject missing token`);
      const payloadText = await response.text();
      assert.doesNotMatch(payloadText, /expected-token/);

      const wrongToken = await handler(new Request(spec.url, {
        ...spec.init,
        headers: { "x-research-console-token": "wrong-token" },
      }));
      assert.equal(wrongToken.status, 403, `${spec.path} should reject wrong token`);
      assert.doesNotMatch(await wrongToken.text(), /wrong-token|expected-token/);
    }
  });
});

test("research console shares one selected day between opportunity board and agent", async () => {
  const page = await readFile("apps/research-console/app/page.tsx", "utf8");
  const workspace = await readFile("apps/research-console/components/ResearchWorkspace.tsx", "utf8");
  const board = await readFile("apps/research-console/components/OpportunityBoard.tsx", "utf8");
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");

  assert.match(page, /import \{ ResearchWorkspace \}/);
  assert.match(page, /<ResearchWorkspace \/>/);
  assert.match(workspace, /"use client"/);
  assert.match(workspace, /const\s+\[day,\s*setDay\]\s*=\s*useState\(currentBeijingDay\)/);
  assert.match(workspace, /<OpportunityBoard day=\{day\} onDayChange=\{setDay\}/);
  assert.match(workspace, /<AgentPanel day=\{day\} onDayChange=\{setDay\}/);
  assert.match(board, /day,\s*onDayChange/);
  assert.doesNotMatch(board, /useState\(currentBeijingDay\)/);
  assert.match(board, /\/api\/research\/opportunities\?day=\$\{encodeURIComponent\(day\)\}/);
  assert.match(panel, /day,\s*onDayChange/);
  assert.doesNotMatch(panel, /useState\(currentBeijingDay\)/);
  assert.match(panel, /\/api\/research\/context\?day=\$\{encodeURIComponent\(day\)\}/);
  assert.match(panel, /body:\s*JSON\.stringify\(\{ day, message: normalizedMessage, messages \}\)/);
  assert.match(panel, /async function runAgent\(nextMessage: string\)/);
});

test("research console renders market data source readiness without exposing secrets", async () => {
  const workspace = await readFile("apps/research-console/components/ResearchWorkspace.tsx", "utf8");
  const panel = await readFile("apps/research-console/components/DataSourcePanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");
  const route = await readFile("apps/research-console/app/api/research/data-sources/route.ts", "utf8");
  const sources = await readFile("apps/research-console/lib/market-data-sources.ts", "utf8");

  assert.match(route, /listMarketDataSources/);
  assert.match(sources, /LONGBRIDGE_APP_KEY/);
  assert.match(sources, /ALPHA_VANTAGE_API_KEY/);
  assert.match(sources, /NEWS_SEARCH_ENDPOINT/);
  assert.match(sources, /yfinance/);

  assert.match(workspace, /<DataSourcePanel \/>/);
  assert.match(panel, /"use client"/);
  assert.match(panel, /\/api\/research\/data-sources/);
  assert.match(panel, /className="data-source-panel"/);
  assert.match(panel, /configured/);
  assert.match(panel, /missing-required-env/);
  assert.match(panel, /planned/);
  assert.match(panel, /requiresSecret/);
  assert.doesNotMatch(panel, /process\.env/);
  assert.doesNotMatch(panel, /AGENT_API_KEY|OPENAI_API_KEY|WEWORK_WEBHOOK_URL|secret-value/);
  assert.match(styles, /\.data-source-panel/);
  assert.match(styles, /\.data-source-grid/);
  assert.match(styles, /\.source-status/);
});

test("research console provider fallback and openai-compatible status are runtime behavior", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );

  await withEnv({
    AGENT_PROVIDER: undefined,
    AGENT_API_KEY: undefined,
    AGENT_API_BASE_URL: undefined,
    AGENT_MODEL: undefined,
  }, async () => {
    const provider = createResearchAgentProvider();
    const response = await provider.generateResponse(researchProviderInput());
    assert.equal(provider.mode, "local-deterministic");
    assert.equal(response.provider_status, "ready");
    assert.match(response.answer, /LITE/);
  });

  await withEnv({
    AGENT_PROVIDER: "openai-compatible",
    AGENT_API_KEY: undefined,
    AGENT_API_BASE_URL: undefined,
    AGENT_MODEL: undefined,
  }, async () => withFetch(async () => {
    throw new Error("fetch should not be called without complete provider env");
  }, async () => {
    const provider = createResearchAgentProvider();
    const response = await provider.generateResponse(researchProviderInput());
    assert.equal(provider.mode, "openai-compatible");
    assert.equal(response.provider_status, "fallback");
  }));

  await withEnv({
    AGENT_PROVIDER: "openai-compatible",
    AGENT_API_KEY: "test-key",
    AGENT_API_BASE_URL: "https://example.test/v1/",
    AGENT_MODEL: "agent-model",
  }, async () => {
    const requests = [];
    await withFetch(async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: "模型回答：继续观察 LITE。" } }] };
        },
      };
    }, async () => {
      const provider = createResearchAgentProvider();
      const response = await provider.generateResponse(researchProviderInput());
      assert.equal(response.provider_status, "ready");
      assert.equal(response.answer, "模型回答：继续观察 LITE。");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://example.test/v1/chat/completions");
      assert.equal(requests[0].init.headers.Authorization, "Bearer test-key");
      assert.equal(JSON.parse(requests[0].init.body).model, "agent-model");
    });

    await withFetch(async () => ({ ok: false, async json() { return {}; } }), async () => {
      const provider = createResearchAgentProvider();
      const response = await provider.generateResponse(researchProviderInput());
      assert.equal(response.provider_status, "error");
      assert.match(response.answer, /LITE/);
    });

    await withFetch(async () => ({
      ok: true,
      async json() {
        return { choices: [{ message: { content: "" } }] };
      },
    }), async () => {
      const provider = createResearchAgentProvider();
      const response = await provider.generateResponse(researchProviderInput());
      assert.equal(response.provider_status, "error");
      assert.match(response.answer, /LITE/);
    });
  });
});

test("research console openai-compatible provider parses model tool calls for planning", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );

  await withEnv({
    AGENT_PROVIDER: "openai-compatible",
    AGENT_API_KEY: "planning-secret",
    AGENT_API_BASE_URL: "https://example.test/v1/",
    AGENT_MODEL: "agent-model",
  }, async () => {
    const requests = [];
    await withFetch(async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "alpha_vantage_quote",
                        arguments: "{\"symbol\":\"LITE\"}",
                      },
                    },
                    {
                      type: "function",
                      function: {
                        name: "news_search",
                        arguments: "{\"query\":\"LITE earnings\"}",
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      };
    }, async () => {
      const provider = createResearchAgentProvider();
      const plan = await provider.selectToolPlan({
        day: "2026-05-22",
        message: "补充 LITE 行情和新闻",
        context: researchProviderInput().context,
        toolTrace: [],
        policyDecisions: [],
        conversationSummary: "user: 补充 LITE 行情和新闻",
        round: 0,
      });

      assert.deepEqual(plan, [
        { name: "alpha_vantage_quote", input: { symbol: "LITE" } },
        { name: "news_search", input: { query: "LITE earnings" } },
      ]);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://example.test/v1/chat/completions");
      assert.equal(requests[0].init.headers.Authorization, "Bearer planning-secret");
      const body = JSON.parse(requests[0].init.body);
      assert.equal(body.model, "agent-model");
      assert.match(JSON.stringify(body.tools), /alpha_vantage_quote/);
      assert.match(JSON.stringify(body.tools), /news_search/);
      assert.doesNotMatch(requests[0].init.body, /planning-secret/);
    });
  });
});

test("research console openai-compatible prompt includes structured evidence needs", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );

  await withEnv({
    AGENT_PROVIDER: "openai-compatible",
    AGENT_API_KEY: "planning-secret",
    AGENT_API_BASE_URL: "https://example.test/v1/",
    AGENT_MODEL: "agent-model",
  }, async () => {
    const requests = [];
    await withFetch(async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: "模型回答：等待证据刷新。" } }] };
        },
      };
    }, async () => {
      const provider = createResearchAgentProvider();
      await provider.generateResponse(researchProviderInput({
        opportunityReasoning: {
          context: {
            day: "2026-05-22",
            sourceScope: ["local summary object"],
            observationOnly: true,
          },
          adminTheory: {
            summary: "LITE remains a research-only candidate.",
            supportingPoints: ["Admin context mentions LITE."],
            openRisks: ["Evidence is incomplete."],
          },
          marketIntelNeeds: ["LITE: verify market evidence."],
          researchPlan: [
            {
              stage: "hypothesis",
              title: "Hypothesis",
              question: "What must be true?",
              method: "Summarize the admin theory as a falsifiable claim.",
              expectedOutput: "A bounded research hypothesis.",
              toolHints: [],
            },
          ],
          evidenceNeeds: [
            {
              kind: "quote",
              symbol: "LITE",
              question: "Verify latest price and volume.",
              preferredTools: ["yfinance_quote"],
              required: true,
            },
            {
              kind: "history",
              symbol: "LITE",
              question: "Verify drawdown and volatility.",
              preferredTools: ["yfinance_history"],
              required: true,
            },
          ],
          candidateOpportunities: [
            {
              symbol: "LITE",
              thesis: "Needs evidence refresh before confidence changes.",
              sourceBasis: ["local summary"],
              invalidation: ["fresh evidence contradicts thesis"],
              researchOnly: true,
            },
          ],
          invalidationPlan: ["Check invalidation."],
          nextChecks: ["Refresh evidence."],
          reasoningSummary: ["Structured evidence needs are pending."],
        },
      }));

      assert.equal(requests.length, 1);
      const body = JSON.parse(requests[0].init.body);
      const prompt = body.messages.at(-1).content;
      assert.match(prompt, /Research plan:/);
      assert.match(prompt, /hypothesis: Hypothesis/);
      assert.match(prompt, /Market intel needs:/);
      assert.match(prompt, /LITE: verify market evidence/);
      assert.match(prompt, /Evidence needs:/);
      assert.match(prompt, /quote LITE/);
      assert.match(prompt, /history LITE/);
      assert.match(prompt, /required=true/);
      assert.match(prompt, /yfinance_quote/);
      assert.match(prompt, /yfinance_history/);
      assert.match(prompt, /Invalidation plan:/);
      assert.match(prompt, /Check invalidation/);
      assert.match(prompt, /Next checks:/);
      assert.match(prompt, /Refresh evidence/);
      assert.doesNotMatch(prompt, /planning-secret/);
    });
  });
});

test("research console agent panel provides one-click evidence refresh action", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(panel, /runEvidenceRefresh/);
  assert.match(panel, /refresh all missing evidence for/);
  assert.match(panel, /刷新缺失证据/);
  assert.match(panel, /type="button"/);
  assert.match(panel, /className="agent-quick-actions"/);
  assert.match(panel, /className="agent-submit-button"/);
  assert.match(panel, /runAgent\(nextMessage\)/);
  assert.match(styles, /\.agent-quick-actions/);
  assert.match(styles, /\.agent-submit-button/);
  assert.doesNotMatch(styles, /\.agent-form button\s*\{/);
});

test("research console agent panel derives research plan status from tool evidence", async () => {
  const panel = await readFile("apps/research-console/components/AgentPanel.tsx", "utf8");
  const styles = await readFile("apps/research-console/app/globals.css", "utf8");

  assert.match(panel, /type ResearchPlanStatus = "done" \| "blocked" \| "pending" \| "process"/);
  assert.match(panel, /function researchPlanStepStatus/);
  assert.match(panel, /const executedTools = new Set\(reply\.tool_trace\.map\(\(tool\) => tool\.name\)\)/);
  assert.match(panel, /const blockedTools = new Set/);
  assert.match(panel, /decision\.status === "blocked"/);
  assert.match(panel, /step\.toolHints\.some\(\(tool\) => blockedTools\.has\(tool\)\)/);
  assert.match(panel, /step\.toolHints\.some\(\(tool\) => executedTools\.has\(tool\)\)/);
  assert.match(panel, /className=\{`agent-plan-status agent-plan-status-\$\{planStatus\.status\}`\}/);
  assert.match(panel, /planStatus\.tools\.join\(" \/ "\)/);
  assert.match(styles, /\.agent-plan-status/);
  assert.match(styles, /\.agent-plan-status-done/);
  assert.match(styles, /\.agent-plan-status-blocked/);
  assert.match(styles, /\.agent-plan-status-pending/);
  assert.match(styles, /\.agent-plan-status-process/);
});

test("research agent plan documents subagent lifecycle governance", async () => {
  const plan = await readFile("docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-agent-lifecycle-governance.md", "utf8");

  assert.match(moduleDoc, /默认最多保留 2 个活跃 agent/);
  assert.match(moduleDoc, /已完成、无后续依赖、被替代或方向过期的 agent 必须关闭/);
  assert.match(moduleDoc, /主 agent 必须检查 diff、测试或文档证据/);

  assert.match(plan, /Agent lifecycle governance/);
  assert.match(plan, /同一阶段默认最多保留 2 个活跃 agent/);
  assert.match(plan, /完成后.*close agent/);
  assert.match(plan, /主 agent 负责 review、审计、集成和最终验证/);
});

test("research agent plan documents collaboration retrospective cadence", async () => {
  const plan = await readFile("docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-collaboration-retrospective-cadence.md", "utf8");

  assert.match(moduleDoc, /默认每 10 个用户-助手交互轮次/);
  assert.match(moduleDoc, /本阶段做对了什么/);
  assert.match(moduleDoc, /不得替代实现、测试或用户要求的交付物/);

  assert.match(plan, /Collaboration retrospective cadence/);
  assert.match(plan, /默认每 10 个用户-助手交互轮次/);
  assert.match(plan, /本阶段做对了什么/);
  assert.match(plan, /本阶段暴露了什么协作或工程风险/);
  assert.match(plan, /下一阶段应调整什么规则或流程/);
  assert.match(plan, /是否需要写入项目文档或记忆/);
  assert.match(plan, /复盘不得替代实现、测试或用户要求的交付物/);
});

test("research console kernel executes allowed tools and reports blocked plans", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({ STOCK_SUMMARY_ROOT: root, AGENT_PROVIDER: undefined }, async () => {
      const response = await runResearchAgent({
        day,
        message: "哪些机会最需要反证？",
        messages: [
          { role: "user", content: "先看 LITE" },
          { role: "assistant", content: "需要结合管理员理论。" },
        ],
        provider: {
          mode: "local-deterministic",
          selectToolPlan() {
            return ["load_structured_summary", "news_search", "shell_exec"];
          },
          async generateResponse(input) {
            return {
              answer: `allowed=${input.toolTrace.length}; blocked=${input.policyDecisions.filter((item) => item.status === "blocked").length}`,
              reasoning_summary: [input.conversationSummary],
              next_watch_plan: ["继续观察管理员重点标的。"],
              provider_status: "ready",
            };
          },
        },
      });

      assert.equal(response.provider, "local-deterministic");
      assert.equal(response.provider_status, "ready");
      assert.deepEqual(response.tool_trace.map((tool) => tool.name), ["load_structured_summary"]);
      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["load_structured_summary:allowed", "news_search:blocked", "shell_exec:blocked"],
      );
      assert.match(response.conversation_summary, /先看 LITE/);
      assert.match(response.conversation_summary, /哪些机会最需要反证/);
      assert.match(response.answer, /allowed=1; blocked=2/);
      assert.match(response.used_context.join("\n"), new RegExp(`data/structured/${day}/${day}\\.json`));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console alpha vantage quote tool is explicit opt-in and sanitized", async () => {
  const { authorizeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: [],
    adminSymbols: ["LITE: admin watchlist symbol"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      ALPHA_VANTAGE_API_KEY: undefined,
    }, async () => {
      assert.equal(authorizeResearchTool("alpha_vantage_quote").status, "blocked");
    });

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      ALPHA_VANTAGE_API_KEY: "secret-alpha-key",
    }, async () => withFetch(async (url) => {
      assert.match(String(url), /function=GLOBAL_QUOTE/);
      assert.match(String(url), /symbol=LITE/);
      assert.match(String(url), /apikey=secret-alpha-key/);
      return {
        ok: true,
        async json() {
          return {
            "Global Quote": {
              "01. symbol": "LITE",
              "05. price": "12.3400",
              "09. change": "0.5600",
              "10. change percent": "4.76%",
              "07. latest trading day": "2026-05-22",
            },
          };
        },
      };
    }, async () => {
      assert.equal(authorizeResearchTool("alpha_vantage_quote").status, "allowed");
      const trace = await executeResearchTool(
        { name: "alpha_vantage_quote", input: { symbol: "LITE" } },
        context,
      );

      assert.equal(trace.name, "alpha_vantage_quote");
      assert.equal(trace.input.symbol, "LITE");
      assert.match(trace.result_summary, /LITE/);
      assert.match(trace.result_summary, /12\.34/);
      assert.match(trace.result_summary, /4\.76%/);
      assert.doesNotMatch(trace.result_summary, /secret-alpha-key/);

      const cachedTrace = await executeResearchTool(
        { name: "alpha_vantage_quote", input: { symbol: "LITE" } },
        context,
      );
      assert.match(cachedTrace.result_summary, /cache/);
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console yfinance quote tool is explicit opt-in, cached, and sanitized", async () => {
  const { authorizeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: [],
    adminSymbols: ["LITE: admin watchlist symbol"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      YFINANCE_QUOTE_FIXTURE_JSON: undefined,
    }, async () => {
      assert.equal(authorizeResearchTool("yfinance_quote").status, "blocked");
    });

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      YFINANCE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "LITE",
        regularMarketPrice: 12.34,
        regularMarketChange: 0.56,
        regularMarketChangePercent: 4.76,
        regularMarketVolume: 1234567,
        currency: "USD",
        exchange: "NMS",
        shortName: "Lumentum",
      }),
    }, async () => {
      assert.equal(authorizeResearchTool("yfinance_quote").status, "allowed");
      const trace = await executeResearchTool(
        { name: "yfinance_quote", input: { symbol: "LITE" } },
        context,
      );

      assert.equal(trace.name, "yfinance_quote");
      assert.equal(trace.input.symbol, "LITE");
      assert.match(trace.result_summary, /yfinance/);
      assert.match(trace.result_summary, /LITE/);
      assert.match(trace.result_summary, /12\.34/);
      assert.match(trace.result_summary, /4\.76%/);
      assert.match(trace.result_summary, /volume 1234567/);
      assert.doesNotMatch(trace.result_summary, /YFINANCE_QUOTE_FIXTURE_JSON/);

      await withEnv({
        STOCK_SUMMARY_ROOT: root,
        RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
        YFINANCE_QUOTE_FIXTURE_JSON: undefined,
      }, async () => {
        const cachedTrace = await executeResearchTool(
          { name: "yfinance_quote", input: { symbol: "LITE" } },
          context,
        );
        assert.match(cachedTrace.result_summary, /cache/);
      });
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console longbridge quote tool is explicit opt-in, cached, and sanitized", async () => {
  const { authorizeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: ["Use quote evidence only after matching the admin theory."],
    adminSymbols: ["LITE.US: admin watchlist symbol"],
    risks: ["Do not convert quote evidence into a direct trading instruction."],
    opportunityMarkdown: "",
  };
  const secret = "longbridge-secret-value";

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      LONGBRIDGE_APP_KEY: "longbridge-app-key",
      LONGBRIDGE_APP_SECRET: secret,
      LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
      LONGBRIDGE_QUOTE_FIXTURE_JSON: undefined,
    }, async () => {
      assert.equal(authorizeResearchTool("longbridge_quote").status, "blocked");
    });

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      LONGBRIDGE_APP_KEY: "longbridge-app-key",
      LONGBRIDGE_APP_SECRET: secret,
      LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
      LONGBRIDGE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "LITE.US",
        last_done: "85.12",
        prev_close: "82.00",
        change: "3.12",
        change_rate: "0.038",
        volume: "1234567",
        currency: "USD",
        trade_status: "Normal",
        timestamp: "2026-05-22T14:30:00Z",
        echoed_secret: secret,
      }),
    }, async () => {
      assert.equal(authorizeResearchTool("longbridge_quote").status, "allowed");
      const trace = await executeResearchTool(
        { name: "longbridge_quote", input: { symbol: "LITE.US" } },
        context,
      );

      assert.equal(trace.name, "longbridge_quote");
      assert.equal(trace.input.symbol, "LITE.US");
      assert.match(trace.result_summary, /Longbridge/);
      assert.match(trace.result_summary, /LITE\.US/);
      assert.match(trace.result_summary, /85\.12/);
      assert.match(trace.result_summary, /change% 3\.80%/);
      assert.match(trace.result_summary, /market Normal/);
      assert.doesNotMatch(trace.result_summary, new RegExp(secret));
      assert.doesNotMatch(trace.result_summary, /LONGBRIDGE_/);

      await withEnv({
        STOCK_SUMMARY_ROOT: root,
        RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
        LONGBRIDGE_APP_KEY: "longbridge-app-key",
        LONGBRIDGE_APP_SECRET: secret,
        LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
        LONGBRIDGE_QUOTE_FIXTURE_JSON: undefined,
      }, async () => {
        const cachedTrace = await executeResearchTool(
          { name: "longbridge_quote", input: { symbol: "LITE.US" } },
          context,
        );
        assert.match(cachedTrace.result_summary, /cache/);
        assert.match(cachedTrace.result_summary, /85\.12/);
        assert.doesNotMatch(cachedTrace.result_summary, new RegExp(secret));
      });

      const cacheFiles = await readdir(
        path.join(root, ".cache", "research-tools", "longbridge_quote", day),
      );
      assert.deepEqual(cacheFiles, ["LITE.US.json"]);
      const cachedPayload = await readFile(
        path.join(root, ".cache", "research-tools", "longbridge_quote", day, "LITE.US.json"),
        "utf8",
      );
      assert.equal(cachedPayload.includes(secret), false);
      assert.equal(cachedPayload.includes("echoed_secret"), false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console longbridge quote appears in readiness and model planning metadata", async () => {
  const { authorizeResearchTool, isResearchToolName, listResearchToolReadiness } =
    loadResearchConsoleModule("apps/research-console/lib/tool-policy.ts");
  const { listMarketDataSources } = loadResearchConsoleModule(
    "apps/research-console/lib/market-data-sources.ts",
  );
  const providerSource = await readFile("apps/research-console/lib/agent-provider.ts", "utf8");

  await withEnv({
    RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
    LONGBRIDGE_APP_KEY: "longbridge-app-key",
    LONGBRIDGE_APP_SECRET: "longbridge-secret-value",
    LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
  }, async () => {
    const sources = listMarketDataSources();
    const longbridge = sources.find((source) => source.name === "longbridge");
    assert.equal(longbridge?.status.enabled, false);
    assert.equal(longbridge?.status.reason, "missing-required-env");
    assert.match(JSON.stringify(longbridge?.status.missingEnv), /RESEARCH_ENABLE_EXTERNAL_TOOLS/);
    assert.doesNotMatch(JSON.stringify(sources), /longbridge-secret-value/);
  });

  await withEnv({
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
    LONGBRIDGE_APP_KEY: "longbridge-app-key",
    LONGBRIDGE_APP_SECRET: "longbridge-secret-value",
    LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
  }, async () => {
    assert.equal(authorizeResearchTool("longbridge_quote").status, "allowed");
    assert.equal(isResearchToolName("longbridge_quote"), true);

    const toolReadiness = listResearchToolReadiness();
    assert.ok(toolReadiness.some((tool) =>
      tool.name === "longbridge_quote" && tool.status === "allowed",
    ));
    assert.doesNotMatch(JSON.stringify(toolReadiness), /longbridge-secret-value/);

    const sources = listMarketDataSources();
    const longbridge = sources.find((source) => source.name === "longbridge");
    assert.equal(longbridge?.status.enabled, true);
    assert.equal(longbridge?.status.reason, "configured");
    assert.deepEqual(longbridge?.status.configuredEnv, [
      "LONGBRIDGE_APP_KEY",
      "LONGBRIDGE_APP_SECRET",
      "LONGBRIDGE_ACCESS_TOKEN",
    ]);
    assert.doesNotMatch(JSON.stringify(sources), /longbridge-secret-value/);
  });

  assert.match(providerSource, /name:\s*"longbridge_quote"/);
  assert.match(providerSource, /Longbridge/);
});

test("research console longbridge quote executor refuses direct calls without opt-in", async () => {
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const cacheDir = path.join(root, ".cache", "research-tools", "longbridge_quote", day);
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: [],
    adminSymbols: ["LITE.US"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      path.join(cacheDir, "LITE.US.json"),
      JSON.stringify({ symbol: "LITE.US", price: 99.99, marketStatus: "Cached" }),
      "utf8",
    );

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      LONGBRIDGE_APP_KEY: "longbridge-app-key",
      LONGBRIDGE_APP_SECRET: "longbridge-secret-value",
      LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
      LONGBRIDGE_QUOTE_FIXTURE_JSON: undefined,
    }, async () => withFetch(async () => {
      throw new Error("longbridge_quote must not fetch without opt-in");
    }, async () => {
      const trace = await executeResearchTool(
        { name: "longbridge_quote", input: { symbol: "LITE.US" } },
        context,
      );

      assert.equal(trace.name, "longbridge_quote");
      assert.match(trace.result_summary, /blocked|skipped/i);
      assert.doesNotMatch(trace.result_summary, /99\.99|Cached/);
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console kernel reports blocked longbridge quote without opt-in", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      LONGBRIDGE_APP_KEY: "longbridge-app-key",
      LONGBRIDGE_APP_SECRET: "longbridge-secret-value",
      LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
      LONGBRIDGE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "LITE.US",
        price: "85.12",
      }),
    }, async () => {
      const response = await runResearchAgent({
        day,
        message: "Check LITE.US with Longbridge quote.",
        provider: {
          mode: "local-deterministic",
          selectToolPlan(input) {
            if (input.round > 0) return [];
            return [{ name: "longbridge_quote", input: { symbol: "LITE.US" } }];
          },
          async generateResponse(input) {
            return {
              answer: input.toolTrace.map((tool) => tool.result_summary).join("\n"),
              reasoning_summary: ["longbridge quote should be blocked without opt-in"],
              next_watch_plan: ["enable explicit external tools before quote validation"],
              provider_status: "ready",
            };
          },
        },
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["longbridge_quote:blocked"],
      );
      assert.deepEqual(response.tool_trace, []);
      assert.doesNotMatch(response.answer, /85\.12/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console longbridge quote redacts secret-shaped strings from cache and trace", async () => {
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const secret = "longbridge-secret-value";
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: [],
    adminSymbols: ["IREN.US"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      LONGBRIDGE_APP_KEY: "longbridge-app-key",
      LONGBRIDGE_APP_SECRET: secret,
      LONGBRIDGE_ACCESS_TOKEN: "longbridge-access-token",
      LONGBRIDGE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "IREN.US",
        price: "10.25",
        currency: secret,
        market_status: `Bearer ${secret}`,
        timestamp: `Authorization: ${secret}`,
      }),
    }, async () => {
      const trace = await executeResearchTool(
        { name: "longbridge_quote", input: { symbol: "IREN.US" } },
        context,
      );
      const cachedPayload = await readFile(
        path.join(root, ".cache", "research-tools", "longbridge_quote", day, "IREN.US.json"),
        "utf8",
      );

      assert.match(trace.result_summary, /IREN\.US/);
      assert.match(trace.result_summary, /10\.25/);
      assert.doesNotMatch(trace.result_summary, new RegExp(secret));
      assert.doesNotMatch(trace.result_summary, /Authorization|Bearer|LONGBRIDGE_/i);
      assert.doesNotMatch(cachedPayload, new RegExp(secret));
      assert.doesNotMatch(cachedPayload, /Authorization|Bearer|LONGBRIDGE_/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("yfinance history helper computes fixture metrics with numpy", () => {
  const fixture = {
    rows: [
      { date: "2026-05-18", close: 10, volume: 100 },
      { date: "2026-05-19", close: 11, volume: 110 },
      { date: "2026-05-20", close: 12, volume: 120 },
      { date: "2026-05-21", close: 11, volume: 130 },
      { date: "2026-05-22", close: 13, volume: 260 },
    ],
  };
  const result = spawnSync(".venv\\Scripts\\python.exe", [
    "scripts/research/yfinance_history_snapshot.py",
    "LITE",
    "--period",
    "5d",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      YFINANCE_HISTORY_FIXTURE_JSON: JSON.stringify(fixture),
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.symbol, "LITE");
  assert.equal(payload.period, "5d");
  assert.equal(payload.observations, 5);
  assert.equal(payload.close_change_percent, 30);
  assert.equal(payload.max_drawdown_percent, 8.33);
  assert.equal(payload.latest_volume_ratio, 2.26);
  assert.ok(payload.realized_volatility_percent > 0);
  assert.equal(JSON.stringify(payload).includes("rows"), false);
});

test("research console yfinance history tool is opt-in, cached, and metric-only", async () => {
  const { authorizeResearchTool, isResearchToolName } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: ["Use historical metrics to validate trend and invalidation context."],
    adminSymbols: ["LITE"],
    risks: [],
    opportunityMarkdown: "",
  };
  const fixture = {
    rows: [
      { date: "2026-05-18", close: 10, volume: 100 },
      { date: "2026-05-19", close: 11, volume: 110 },
      { date: "2026-05-20", close: 12, volume: 120 },
      { date: "2026-05-21", close: 11, volume: 130 },
      { date: "2026-05-22", close: 13, volume: 260 },
    ],
  };

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      YFINANCE_HISTORY_FIXTURE_JSON: undefined,
    }, async () => {
      assert.equal(authorizeResearchTool("yfinance_history").status, "blocked");
      assert.equal(isResearchToolName("yfinance_history"), true);
    });

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      YFINANCE_HISTORY_FIXTURE_JSON: JSON.stringify(fixture),
    }, async () => {
      assert.equal(authorizeResearchTool("yfinance_history").status, "allowed");
      const trace = await executeResearchTool(
        { name: "yfinance_history", input: { symbol: "LITE", period: "5d" } },
        context,
      );

      assert.equal(trace.name, "yfinance_history");
      assert.equal(trace.input.symbol, "LITE");
      assert.equal(trace.input.period, "5d");
      assert.match(trace.result_summary, /yfinance history/);
      assert.match(trace.result_summary, /close change 30\.00%/);
      assert.match(trace.result_summary, /max drawdown 8\.33%/);
      assert.match(trace.result_summary, /latest volume ratio 2\.26x/);
      assert.doesNotMatch(trace.result_summary, /rows|YFINANCE_HISTORY_FIXTURE_JSON/);

      await withEnv({
        STOCK_SUMMARY_ROOT: root,
        RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
        YFINANCE_HISTORY_FIXTURE_JSON: undefined,
      }, async () => {
        const cachedTrace = await executeResearchTool(
          { name: "yfinance_history", input: { symbol: "LITE", period: "5d" } },
          context,
        );
        assert.match(cachedTrace.result_summary, /cache/);
        assert.match(cachedTrace.result_summary, /30\.00%/);
      });

      const cachedPayload = await readFile(
        path.join(root, ".cache", "research-tools", "yfinance_history", day, "LITE-5d.json"),
        "utf8",
      );
      assert.equal(cachedPayload.includes("rows"), false);
      assert.equal(cachedPayload.includes("YFINANCE_HISTORY_FIXTURE_JSON"), false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console yfinance history cache is scoped by requested period", async () => {
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: ["Compare separate history windows without reusing stale metrics."],
    adminSymbols: ["LITE"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      YFINANCE_HISTORY_FIXTURE_JSON: JSON.stringify({
        rows: [
          { date: "2026-05-18", close: 10, volume: 100 },
          { date: "2026-05-22", close: 13, volume: 260 },
        ],
      }),
    }, async () => {
      const first = await executeResearchTool(
        { name: "yfinance_history", input: { symbol: "LITE", period: "5d" } },
        context,
      );
      assert.match(first.result_summary, /period 5d/);
      assert.match(first.result_summary, /close change 30\.00%/);
    });

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      YFINANCE_HISTORY_FIXTURE_JSON: JSON.stringify({
        rows: [
          { date: "2026-04-22", close: 20, volume: 100 },
          { date: "2026-05-22", close: 10, volume: 120 },
        ],
      }),
    }, async () => {
      const second = await executeResearchTool(
        { name: "yfinance_history", input: { symbol: "LITE", period: "1mo" } },
        context,
      );
      assert.match(second.result_summary, /period 1mo/);
      assert.match(second.result_summary, /close change -50\.00%/);
      assert.doesNotMatch(second.result_summary, /30\.00%/);
    });

    await access(path.join(root, ".cache", "research-tools", "yfinance_history", day, "LITE-5d.json"));
    await access(path.join(root, ".cache", "research-tools", "yfinance_history", day, "LITE-1mo.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console yfinance history executor refuses direct calls without opt-in", async () => {
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const cacheDir = path.join(root, ".cache", "research-tools", "yfinance_history", day);
  const context = {
    day,
    eventSummary: [],
    overview: [],
    adminCore: [],
    adminSymbols: ["LITE"],
    risks: [],
    opportunityMarkdown: "",
  };

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      path.join(cacheDir, "LITE.json"),
      JSON.stringify({ symbol: "LITE", close_change_percent: 99.99 }),
      "utf8",
    );

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      YFINANCE_HISTORY_FIXTURE_JSON: undefined,
    }, async () => {
      const trace = await executeResearchTool(
        { name: "yfinance_history", input: { symbol: "LITE", period: "5d" } },
        context,
      );

      assert.equal(trace.name, "yfinance_history");
      assert.match(trace.result_summary, /blocked|skipped/i);
      assert.doesNotMatch(trace.result_summary, /99\.99/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console local provider plans yfinance only for explicit market validation", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );
  const input = researchProviderInput({
    message: "validate LITE latest price and volume before comparing the opportunity",
  });
  const expectedLocalPlan = [
    "load_structured_summary",
    "load_opportunity_observation",
    "extract_watchlist",
    "score_opportunities",
  ];

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
  }, async () => {
    const provider = createResearchAgentProvider();
    const plan = await provider.selectToolPlan(input);
    assert.deepEqual(plan, [
      ...expectedLocalPlan,
      { name: "yfinance_quote", input: { symbol: "LITE" } },
    ]);
  });

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
  }, async () => {
    const provider = createResearchAgentProvider();
    const plan = await provider.selectToolPlan(input);
    assert.deepEqual(plan, [
      ...expectedLocalPlan,
      { name: "yfinance_quote", input: { symbol: "LITE" } },
    ]);
  });

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
  }, async () => {
    const provider = createResearchAgentProvider();
    const genericPlan = await provider.selectToolPlan(researchProviderInput({
      message: "explain the opportunity observation with local context",
    }));
    assert.deepEqual(genericPlan, expectedLocalPlan);
  });

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
  }, async () => {
    const provider = createResearchAgentProvider();
    const laterRoundPlan = await provider.selectToolPlan({
      ...input,
      round: 1,
    });
    assert.deepEqual(laterRoundPlan, []);
  });
});

test("research console local provider plans yfinance history for explicit historical validation", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );
  const expectedLocalPlan = [
    "load_structured_summary",
    "load_opportunity_observation",
    "extract_watchlist",
    "score_opportunities",
  ];

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
  }, async () => {
    const provider = createResearchAgentProvider();
    const plan = await provider.selectToolPlan(researchProviderInput({
      message: "validate LITE trend, drawdown, and volatility history before comparing the opportunity",
    }));

    assert.deepEqual(plan, [
      ...expectedLocalPlan,
      { name: "yfinance_history", input: { symbol: "LITE", period: "30d" } },
    ]);
  });

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
  }, async () => {
    const provider = createResearchAgentProvider();
    const genericPlan = await provider.selectToolPlan(researchProviderInput({
      message: "explain the opportunity observation with local context",
    }));
    assert.deepEqual(genericPlan, expectedLocalPlan);
  });

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
  }, async () => {
    const provider = createResearchAgentProvider();
    const laterRoundPlan = await provider.selectToolPlan({
      ...researchProviderInput({
        message: "review LITE drawdown history",
      }),
      round: 1,
    });
    assert.deepEqual(laterRoundPlan, []);
  });
});

test("research console local provider plans tools from structured evidence needs", async () => {
  const { createResearchAgentProvider } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-provider.ts",
  );
  const { buildOpportunityReasoning } = loadResearchConsoleModule(
    "apps/research-console/lib/opportunity-reasoning.ts",
  );
  const opportunityReasoning = buildOpportunityReasoning({
    summary: {
      day: "2026-05-22",
      overview: ["LITE is the primary admin-side observation candidate."],
      eventSummary: ["LITE needs fresh evidence before confidence changes."],
      risks: ["The setup fails if market evidence contradicts the local thesis."],
    },
    opportunity: {
      title: "LITE evidence refresh",
      symbols: ["LITE"],
      hypothesis: "LITE needs evidence refresh before escalation.",
      supportingEvidence: ["Admin context marks LITE as a candidate."],
      contradictingEvidence: ["No fresh market evidence has been checked yet."],
      trigger: ["Confirm price, history, news, and fundamental context."],
      invalidation: ["Cancel if fresh evidence contradicts the thesis."],
      watchPlan: ["Refresh evidence before changing confidence."],
    },
    context: {
      adminCore: ["Structured evidence should drive tool planning."],
      adminSymbols: ["LITE"],
    },
  });
  const expectedLocalPlan = [
    "load_structured_summary",
    "load_opportunity_observation",
    "extract_watchlist",
    "score_opportunities",
  ];

  await withEnv({
    AGENT_PROVIDER: undefined,
    RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
  }, async () => {
    const provider = createResearchAgentProvider();
    const evidencePlan = await provider.selectToolPlan(researchProviderInput({
      message: "refresh all missing evidence for LITE before comparing the opportunity",
      opportunityReasoning,
    }));

    assert.deepEqual(evidencePlan, [
      ...expectedLocalPlan,
      { name: "yfinance_quote", input: { symbol: "LITE" } },
      { name: "yfinance_history", input: { symbol: "LITE", period: "30d" } },
      { name: "news_search", input: { query: "LITE recent market news" } },
      { name: "news_search", input: { query: "LITE earnings guidance filings" } },
    ]);

    const genericPlan = await provider.selectToolPlan(researchProviderInput({
      message: "explain the opportunity observation with local context",
      opportunityReasoning,
    }));
    assert.deepEqual(genericPlan, expectedLocalPlan);
  });
});

test("research console default agent reports blocked yfinance history without opt-in", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_PROVIDER: undefined,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      YFINANCE_HISTORY_FIXTURE_JSON: JSON.stringify({
        rows: [
          { date: "2026-05-18", close: 10, volume: 100 },
          { date: "2026-05-22", close: 13, volume: 260 },
        ],
      }),
    }, async () => {
      const response = await runResearchAgent({
        day,
        message: "validate LITE trend, drawdown, and volatility history",
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        [
          "load_structured_summary:allowed",
          "load_opportunity_observation:allowed",
          "extract_watchlist:allowed",
          "score_opportunities:allowed",
          "yfinance_history:blocked",
        ],
      );
      assert.deepEqual(
        response.tool_trace.map((tool) => tool.name),
        [
          "load_structured_summary",
          "load_opportunity_observation",
          "extract_watchlist",
          "score_opportunities",
        ],
      );
      assert.doesNotMatch(
        response.tool_trace.map((tool) => tool.result_summary).join("\n"),
        /30\.00%/,
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console default agent reports blocked yfinance market validation without opt-in", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_PROVIDER: undefined,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: undefined,
      YFINANCE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "LITE",
        regularMarketPrice: 12.34,
        regularMarketVolume: 1234567,
      }),
    }, async () => {
      const response = await runResearchAgent({
        day,
        message: "validate LITE latest price and volume before comparing the opportunity",
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        [
          "load_structured_summary:allowed",
          "load_opportunity_observation:allowed",
          "extract_watchlist:allowed",
          "score_opportunities:allowed",
          "yfinance_quote:blocked",
        ],
      );
      assert.deepEqual(
        response.tool_trace.map((tool) => tool.name),
        [
          "load_structured_summary",
          "load_opportunity_observation",
          "extract_watchlist",
          "score_opportunities",
        ],
      );
      assert.doesNotMatch(
        response.tool_trace.map((tool) => tool.result_summary).join("\n"),
        /volume 1234567/,
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console default agent can execute opted-in yfinance market validation", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      AGENT_PROVIDER: undefined,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      YFINANCE_QUOTE_FIXTURE_JSON: JSON.stringify({
        symbol: "LITE",
        regularMarketPrice: 12.34,
        regularMarketChange: 0.56,
        regularMarketChangePercent: 4.76,
        regularMarketVolume: 1234567,
        currency: "USD",
        exchange: "NMS",
        shortName: "Lumentum",
      }),
    }, async () => {
      const response = await runResearchAgent({
        day,
        message: "validate LITE latest price and volume before comparing the opportunity",
      });

      assert.equal(response.provider, "local-deterministic");
      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        [
          "load_structured_summary:allowed",
          "load_opportunity_observation:allowed",
          "extract_watchlist:allowed",
          "score_opportunities:allowed",
          "yfinance_quote:allowed",
        ],
      );
      assert.deepEqual(
        response.tool_trace.map((tool) => tool.name),
        [
          "load_structured_summary",
          "load_opportunity_observation",
          "extract_watchlist",
          "score_opportunities",
          "yfinance_quote",
        ],
      );
      assert.match(
        response.tool_trace.find((tool) => tool.name === "yfinance_quote")?.result_summary ?? "",
        /volume 1234567/,
      );
      assert.doesNotMatch(response.answer, /\bbuy\b|\bsell\b|\blong\b|\bshort\b/i);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console news search tool is opt-in, host-filtered, cached, and sanitized", async () => {
  const { authorizeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/tool-policy.ts",
  );
  const { executeResearchTool } = loadResearchConsoleModule(
    "apps/research-console/lib/agent-tools.ts",
  );
  const { root, day } = await createResearchFixture();
  const context = {
    day,
    eventSummary: ["LITE and IREN were discussed around post-earnings momentum."],
    overview: [],
    adminCore: ["Only treat news as supporting evidence, not as a trading trigger by itself."],
    adminSymbols: ["LITE", "IREN"],
    risks: ["News confirmation can lag price action."],
  };
  const secret = "secret-news-key";
  const calls = [];

  try {
    assert.equal(authorizeResearchTool("news_search").status, "blocked");

    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
      NEWS_SEARCH_API_KEY: secret,
      NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com,www.reuters.com",
    }, async () => {
      assert.equal(authorizeResearchTool("news_search").status, "allowed");

      await withFetch(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        assert.ok(String(url).startsWith("https://search.example.test/news"));
        assert.ok(String(url).includes("q=LITE+earnings"));
        assert.equal(init.headers.Authorization, `Bearer ${secret}`);
        assert.equal(String(url).includes(secret), false);
        assert.equal(JSON.stringify(init.body ?? "").includes(secret), false);

        return {
          ok: true,
          status: 200,
          async json() {
            return {
              results: [
                {
                  title: "Yahoo Finance LITE earnings update",
                  url: "https://finance.yahoo.com/news/lite-earnings",
                  source: "Yahoo Finance",
                  published_at: "2026-05-22T09:30:00Z",
                  snippet: "LITE moves after earnings and guidance.",
                },
                {
                  title: "Reuters IREN market context",
                  url: "https://www.reuters.com/markets/iren-context",
                  source: "Reuters",
                  published_at: "2026-05-22T10:00:00Z",
                  snippet: "Infrastructure names remain volatile.",
                },
                {
                  title: "Blocked mirror result",
                  url: "https://evil-finance.yahoo.com/news/lite",
                  source: "Unknown Blog",
                  snippet: "This result must not enter the summary.",
                },
              ],
              request_meta: {
                echoed_authorization: secret,
              },
            };
          },
        };
      }, async () => {
        const first = await executeResearchTool(
          { name: "news_search", input: { query: "LITE earnings" } },
          context,
        );

        assert.equal(first.name, "news_search");
        assert.match(first.result_summary, /Yahoo Finance/);
        assert.match(first.result_summary, /Reuters/);
        assert.match(first.result_summary, /finance\.yahoo\.com/);
        assert.doesNotMatch(first.result_summary, /evil-finance/);
        assert.doesNotMatch(first.result_summary, new RegExp(secret));
      });

      await withFetch(async () => {
        throw new Error("news_search should read the second call from cache");
      }, async () => {
        const second = await executeResearchTool(
          { name: "news_search", input: { query: "LITE earnings" } },
          context,
        );

        assert.match(second.result_summary, /cache/);
        assert.doesNotMatch(second.result_summary, new RegExp(secret));
      });

      assert.equal(calls.length, 1);
      const cacheFiles = await readdir(
        path.join(root, ".cache", "research-tools", "news_search", day),
      );
      assert.equal(cacheFiles.length, 1);
      const cachedPayload = await readFile(
        path.join(root, ".cache", "research-tools", "news_search", day, cacheFiles[0]),
        "utf8",
      );
      assert.equal(cachedPayload.includes(secret), false);
      assert.equal(cachedPayload.includes("evil-finance.yahoo.com"), false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console kernel executes opted-in news search from provider tool plan", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      NEWS_SEARCH_ENDPOINT: "https://search.example.test/news",
      NEWS_SEARCH_ALLOWED_HOSTS: "finance.yahoo.com",
    }, async () => withFetch(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          results: [
            {
              title: "LITE earnings update",
              url: "https://finance.yahoo.com/news/lite-earnings",
              source: "Yahoo Finance",
              snippet: "Allowed source result.",
            },
          ],
        };
      },
    }), async () => {
      const response = await runResearchAgent({
        day,
        message: "Check whether LITE has confirming news.",
        provider: {
          mode: "local-deterministic",
          selectToolPlan(input) {
            if (input.round > 0) return [];
            return [{ name: "news_search", input: { query: "LITE earnings" } }];
          },
          async generateResponse(input) {
            return {
              answer: input.toolTrace.map((tool) => tool.result_summary).join("\n"),
              reasoning_summary: ["news search was executed after policy approval"],
              next_watch_plan: ["compare news against admin theory before acting"],
              provider_status: "ready",
            };
          },
        },
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["news_search:allowed"],
      );
      assert.deepEqual(response.tool_trace.map((tool) => tool.name), ["news_search"]);
      assert.match(response.answer, /LITE earnings update/);
      assert.match(response.answer, /finance\.yahoo\.com/);
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console kernel can execute opted-in external quote tools", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      ALPHA_VANTAGE_API_KEY: "secret-alpha-key",
    }, async () => withFetch(async () => ({
      ok: true,
      async json() {
        return {
          "Global Quote": {
            "01. symbol": "LITE",
            "05. price": "12.3400",
            "10. change percent": "4.76%",
            "07. latest trading day": "2026-05-22",
          },
        };
      },
    }), async () => {
      const response = await runResearchAgent({
        day,
        message: "给我看 LITE 最新行情",
        provider: {
          mode: "local-deterministic",
          selectToolPlan() {
            return [
              "load_structured_summary",
              { name: "alpha_vantage_quote", input: { symbol: "LITE" } },
            ];
          },
          async generateResponse(input) {
            return {
              answer: input.toolTrace.map((tool) => tool.result_summary).join("\n"),
              reasoning_summary: ["已执行本地总结和显式启用的外部行情工具。"],
              next_watch_plan: ["继续观察 LITE 的价格触发条件。"],
              provider_status: "ready",
            };
          },
        },
      });

      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["load_structured_summary:allowed", "alpha_vantage_quote:allowed"],
      );
      assert.deepEqual(
        response.tool_trace.map((tool) => tool.name),
        ["load_structured_summary", "alpha_vantage_quote"],
      );
      assert.match(response.answer, /LITE/);
      assert.match(response.answer, /12\.34/);
      assert.doesNotMatch(response.answer, /secret-alpha-key/);
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research console kernel supports bounded multi-round tool planning", async () => {
  const { runResearchAgent } = loadResearchConsoleModule("apps/research-console/lib/agent-kernel.ts");
  const { root, day } = await createResearchFixture();
  const planningRounds = [];

  try {
    await withEnv({
      STOCK_SUMMARY_ROOT: root,
      RESEARCH_ENABLE_EXTERNAL_TOOLS: "1",
      ALPHA_VANTAGE_API_KEY: "secret-alpha-key",
    }, async () => withFetch(async () => ({
      ok: true,
      async json() {
        return {
          "Global Quote": {
            "01. symbol": "LITE",
            "05. price": "12.3400",
            "10. change percent": "4.76%",
            "07. latest trading day": "2026-05-22",
          },
        };
      },
    }), async () => {
      const response = await runResearchAgent({
        day,
        message: "先读总结，再补 LITE 行情，然后给判断",
        provider: {
          mode: "local-deterministic",
          selectToolPlan(input) {
            planningRounds.push({
              round: input.round,
              traceNames: input.toolTrace?.map((tool) => tool.name) ?? [],
            });

            if (input.round === 0) return ["load_structured_summary"];
            if (input.round === 1) {
              assert.deepEqual(
                input.toolTrace?.map((tool) => tool.name),
                ["load_structured_summary"],
              );
              return [{ name: "alpha_vantage_quote", input: { symbol: "LITE" } }];
            }
            return [];
          },
          async generateResponse(input) {
            return {
              answer: input.toolTrace.map((tool) => tool.name).join(" -> "),
              reasoning_summary: [
                `trace=${input.toolTrace.length}`,
                `policy=${input.policyDecisions.length}`,
              ],
              next_watch_plan: ["观察 LITE 是否符合管理员理论触发条件。"],
              provider_status: "ready",
            };
          },
        },
      });

      assert.deepEqual(
        planningRounds.map((item) => `${item.round}:${item.traceNames.join("|")}`),
        ["0:", "1:load_structured_summary", "2:load_structured_summary|alpha_vantage_quote"],
      );
      assert.deepEqual(
        response.tool_trace.map((tool) => tool.name),
        ["load_structured_summary", "alpha_vantage_quote"],
      );
      assert.deepEqual(
        response.policy_decisions.map((item) => `${item.name}:${item.status}`),
        ["load_structured_summary:allowed", "alpha_vantage_quote:allowed"],
      );
      assert.equal(response.answer, "load_structured_summary -> alpha_vantage_quote");
      assert.deepEqual(response.reasoning_summary, ["trace=2", "policy=2"]);
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package exposes Cloudflare Pages build and deploy commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const wranglerConfig = await readFile("wrangler.toml", "utf8");

  assert.equal(pkg.scripts["pages:build"], "node scripts/pnpm-workspace.mjs run docs:build");
  assert.equal(pkg.scripts["pages:deploy"], "node scripts/deploy-cloudflare-pages.mjs");
  assert.equal(pkg.scripts["pages:deploy:dry"], "node scripts/deploy-cloudflare-pages.mjs --dry-run");
  assert.match(wranglerConfig, /pages_build_output_dir\s*=\s*"\.\/docs\/\.vitepress\/dist"/);
});

test("push workflow verifies VitePress without GitHub Pages deployment actions", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");

  assert.match(workflow, /name:\s*Verify VitePress site/);
  assert.match(workflow, /pnpm run docs:build/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /"\.github\/workflows\/deploy\.yml"/);
  assert.doesNotMatch(workflow, /actions\/configure-pages/);
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact/);
  assert.doesNotMatch(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /pages:\s*write/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /environment:\s*\n\s*name:\s*github-pages/);
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

test("cloudflare deploy helper builds with pnpm before wrangler deploy", async () => {
  const script = await readFile("scripts/deploy-cloudflare-pages.mjs", "utf8");

  assert.match(script, /run\(process\.execPath,\s*\["scripts\/pnpm-workspace\.mjs",\s*"run",\s*"docs:build"\]\)/);
  assert.doesNotMatch(script, /run\(commandName\("pnpm"\),\s*\["run",\s*"docs:build"\]\)/);
  assert.doesNotMatch(script, /run\(commandName\("npm"\),\s*\["run",\s*"docs:build"\]\)/);
  assert.match(script, /run\(commandName\("npx"\),\s*\[\s*"wrangler",\s*"pages",\s*"deploy"/);
});

test("delivery readiness audit covers the five operational surfaces", async () => {
  const audit = await readFile("docs/research-agent/delivery-readiness-audit.md", "utf8");

  for (const heading of [
    "Daily Summary Pipeline",
    "WeCom Notification",
    "Cloudflare Public Site",
    "Local Research Console",
    "Agent Tooling And External Data",
  ]) {
    assert.match(audit, new RegExp(`## ${heading}`));
  }

  assert.match(audit, /npm run daily:publish:dry/);
  assert.match(audit, /npm run pages:deploy:dry/);
  assert.match(audit, /npm run console:build/);
  assert.match(audit, /GitHub Actions/);
  assert.match(audit, /local-only/i);
  assert.match(audit, /RESEARCH_ENABLE_EXTERNAL_TOOLS/);
});

test("public build audit guards local-only content and summary month scope", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/audit-public-build.mjs", "utf8");
  const releaseCheck = await readFile("scripts/release-check.mjs", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-public-build-boundary-audit.md", "utf8");

  assert.equal(pkg.scripts["public:build:audit"], "node scripts/audit-public-build.mjs");
  for (const marker of [
    "research-agent",
    "superpowers",
    "opportunities",
    "机会观察",
    "群聊内容记录",
    "群聊图片记录",
    "原始发言记录",
    "本地链接",
    "chat-images",
  ]) {
    assert.match(script, new RegExp(marker));
    assert.match(moduleDoc, new RegExp(marker));
  }
  assert.match(script, /docs\/\.vitepress\/dist does not exist/);
  assert.match(script, /latestMonth/);
  assert.match(script, /no public summary pages found for latest month/);
  assert.match(script, /local audit summary page leaked/);
  assert.match(releaseCheck, /\["npm", \["run", "public:build:audit"\]\]/);
});

test("release completion audit distinguishes local readiness from production completion", async () => {
  const audit = await readFile("docs/research-agent/release-completion-audit.md", "utf8");

  assert.match(audit, /npm run release:check/);
  assert.match(audit, /git status --short/);
  assert.match(audit, /origin\/main/);
  assert.match(audit, /Daily Summary Publish/);
  assert.match(audit, /headSha/);
  assert.match(audit, /https:\/\/stocks-emw\.pages\.dev\//);
  assert.match(audit, /WeCom/);
  assert.match(audit, /Not complete yet/);
  assert.match(audit, /dirty worktree has not been committed/);
  assert.match(audit, /HEAD` does not match `origin\/main`/);
  assert.match(audit, /research-agent/);
  assert.match(audit, /integration-handoff-checklist\.md/);
});

test("integration handoff checklist keeps release and agent cleanup gates explicit", async () => {
  const checklist = await readFile("docs/research-agent/integration-handoff-checklist.md", "utf8");

  for (const expected of [
    "npm run release:check",
    "npm run release:verify -- --date YYYY-MM-DD",
    "git status --short",
    "git ls-remote origin refs/heads/main",
    "Daily Summary Publish",
    "Cloudflare Pages",
    "WeCom",
    "agent count",
    "0-2",
    "close completed agents",
    "do not mark complete",
  ]) {
    assert.match(checklist, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("git integration plan documents behind-one generated-index overlap strategy", async () => {
  const plan = await readFile("docs/research-agent/git-integration-plan.md", "utf8");

  for (const expected of [
    "behind origin/main by 1 commit",
    "docs/search_index.json",
    "generated artifact",
    "do not hand edit docs/search_index.json",
    "preserve remote daily publish artifacts",
    "regenerate search index",
    "npm run release:check",
    "npm run release:verify -- --date YYYY-MM-DD",
    "do not mark complete",
  ]) {
    assert.match(plan, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("package exposes a read-only integration status command", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/integration-status.mjs", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-integration-status-command.md", "utf8");

  assert.equal(pkg.scripts["integration:status"], "node scripts/integration-status.mjs");
  for (const expected of [
    "integration-handoff-checklist.md",
    "git status --short",
    "git rev-parse HEAD",
    "git rev-parse origin/main",
    "npm run release:check",
    "npm run release:verify -- --date YYYY-MM-DD",
    "Daily Summary Publish",
    "Cloudflare Pages",
    "WeCom",
    "agent cleanup",
    "do not mark complete",
  ]) {
    assert.match(script, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.match(moduleDoc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(script, /git",\s*\["add"|git",\s*\["commit"|git",\s*\["push"|WEWORK_WEBHOOK_URL|wrangler",\s*"pages",\s*"deploy"|gh",\s*\["run"/);
});

test("integration status command emits machine-readable json", () => {
  const result = spawnSync(process.execPath, ["scripts/integration-status.mjs", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.read_only, true);
  assert.equal(payload.checklist, "docs/research-agent/integration-handoff-checklist.md");
  assert.equal(payload.commands.release_check, "npm run release:check");
  assert.equal(payload.commands.release_verify, "npm run release:verify -- --date YYYY-MM-DD");
  assert.equal(typeof payload.git.changed_entries, "number");
  assert.equal(typeof payload.git.head_matches_origin_main, "boolean");
  assert.equal(typeof payload.git.ahead_by, "number");
  assert.equal(typeof payload.git.behind_by, "number");
  assert.equal(typeof payload.git.diverged, "boolean");
  assert.equal(Array.isArray(payload.git.dirty_files), true);
  assert.equal(Array.isArray(payload.git.remote_changed_files), true);
  assert.equal(Array.isArray(payload.git.overlap_files), true);
  assert.equal(typeof payload.git.overlap_count, "number");
  assert.equal(payload.git.dirty_files.some((file) => /warning:|Permission denied/i.test(file)), false);
  assert.equal(payload.git.dirty_files.includes("github/workflows/daily-publish.yml"), false);
  assert.equal(payload.git.remote_changed_files.some((file) => /\\\d{3}/.test(file)), false);
  assert.equal(typeof payload.complete, "boolean");
  assert.equal(Array.isArray(payload.blockers), true);
  assert.equal(payload.complete, payload.blockers.length === 0);
  for (const blocker of payload.blockers) {
    assert.equal(typeof blocker.gate, "string");
    assert.equal(typeof blocker.reason, "string");
  }
  assert.deepEqual(payload.gates, [
    "release_check",
    "git_integration",
    "release_verify",
    "daily_summary_publish",
    "cloudflare_pages",
    "wecom_delivery",
    "agent_cleanup",
  ]);
  assert.match(payload.next_action, /do not mark complete|run production verification/);
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
      checks: ["npm run test:summary", "git diff --check"],
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

test("package exposes a JS release check command for pre-push verification", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/release-check.mjs", "utf8");

  assert.equal(pkg.scripts["release:check"], "node scripts/release-check.mjs");
  for (const command of [
    '["npm", ["run", "test:summary"]]',
    '["npm", ["run", "console:build"]]',
    '["npm", ["run", "daily:publish:dry"]]',
    '["npm", ["run", "pages:deploy:dry"]]',
    '["npm", ["run", "public:build:audit"]]',
    '["git", ["diff", "--check"]]',
  ]) {
  assert.match(script, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(script, /git",\s*\["push"|git",\s*\["commit"|wrangler",\s*"pages",\s*"deploy"/);
  assert.match(script, /const cmdShims = new Set\(\["npm", "npx", "pnpm"\]\)/);
  assert.match(script, /cmdShims\.has\(name\)/);
  assert.match(script, /process\.env\.ComSpec \|\| "cmd\.exe"/);
  assert.match(script, /args: \["\/d", "\/s", "\/c", resolved, \.\.\.args\]/);
  assert.match(script, /release-check-status\.json/);
  assert.doesNotMatch(script, /shell:\s*true|shell:\s*useShell/);
});

test("package exposes a read-only production release verifier", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/verify-production-release.mjs", "utf8");
  const moduleDoc = await readFile("docs/research-agent/modules/2026-05-23-production-release-verifier.md", "utf8");

  assert.equal(pkg.scripts["release:verify"], "node scripts/verify-production-release.mjs");
  for (const expected of [
    "Daily Summary Publish",
    "git status --short",
    "git rev-parse HEAD",
    "git rev-parse origin/main",
    "git ls-remote origin refs/heads/main",
    "gh run list",
    "headSha",
    "https://stocks-emw.pages.dev/",
    "--date",
    "--dry-run",
  ]) {
    assert.match(script, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(moduleDoc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(script, /git",\s*\["add"|git",\s*\["commit"|git",\s*\["push"|WEWORK_WEBHOOK_URL|wrangler",\s*"pages",\s*"deploy"/);
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
