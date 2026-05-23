import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    date: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      options.root = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--root=")) {
      options.root = path.resolve(arg.slice("--root=".length));
    } else if (arg === "--date") {
      options.date = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    }
  }

  return options;
}

function listMonthlyDirs(root, section) {
  const sectionDir = path.join(root, "docs", section);
  if (!fs.existsSync(sectionDir)) return [];
  return fs
    .readdirSync(sectionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

function resolveLatestStructuredDate(root) {
  const structuredDir = path.join(root, "data", "structured");
  if (!fs.existsSync(structuredDir)) {
    throw new Error(`structured data directory not found: ${structuredDir}`);
  }

  const dates = fs
    .readdirSync(structuredDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    throw new Error(`no structured summary dates found in ${structuredDir}`);
  }

  return dates[0];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function plainText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && String(item).trim())
    .map(([key, item]) => `${key}: ${item}`)
    .join("; ");
}

function bulletList(items, fallback) {
  const lines = asArray(items).map(plainText).filter(Boolean);
  if (!lines.length) return `- ${fallback}\n`;
  return lines.map((item) => `- ${item}`).join("\n") + "\n";
}

function findSourceSummary(root, day) {
  const month = day.slice(0, 7);
  const summaryDir = path.join(root, "docs", "summaries", month);
  if (!fs.existsSync(summaryDir)) {
    return {
      label: `${day} 每日总结`,
      link: `../../summaries/${month}/${day}-每日总结`,
    };
  }

  const candidates = fs
    .readdirSync(summaryDir)
    .filter((file) => file.startsWith(`${day}-`) && file.endsWith(".md") && !file.endsWith("-local.md"))
    .sort((a, b) => a.localeCompare(b));
  const file = candidates[0] ?? `${day}-每日总结.md`;

  return {
    label: `${day} 每日总结`,
    link: `../../summaries/${month}/${file.replace(/\.md$/, "")}`,
  };
}

function formatSymbols(symbols) {
  return asArray(symbols)
    .map((symbol) => {
      if (typeof symbol === "string") return symbol;
      const code = plainText(symbol.symbol || symbol.ticker || symbol.name);
      const name = plainText(symbol.name);
      const summary = plainText(symbol.summary || symbol.reason);
      const label = code && name && name !== code ? `${code}（${name}）` : code || name || "未命名标的";
      return summary ? `${label}: ${summary}` : label;
    })
    .filter(Boolean);
}

function extractAdminSymbols(summary) {
  const adminSymbols = asArray(summary.admin_symbols);
  if (adminSymbols.length) return adminSymbols;

  return asArray(summary.key_symbols).filter((item) => {
    const source = plainText(item.source).toLowerCase();
    return source.includes("admin") || source.includes("管理员") || source.includes("xiaozhaolucky");
  });
}

function buildFallbackOpportunities(summary) {
  return extractAdminSymbols(summary)
    .slice(0, 5)
    .map((symbol) => {
      const code = plainText(symbol.symbol || symbol.ticker || symbol.name) || "重点标的";
      const name = plainText(symbol.name);
      const label = name && name !== code ? `${code}（${name}）` : code;
      const symbolSummary = plainText(symbol.summary || symbol.reason);
      return {
        title: `${label} 节奏观察`,
        symbols: [symbol],
        setup: symbolSummary || "该标的来自管理员重点标的列表，适合进入后续节奏观察池。",
        trigger: "等待管理员核心理论中的时间窗口、价格位置和资金承接同时出现确认。",
        data_points: asArray(summary.event_summary).slice(0, 1),
        action_bias: "仅观察是否出现低吸、价差收敛或事件窗口，不形成直接买卖指令。",
        risk: asArray(summary.risks)[0] || "若市场节奏脱离管理员框架，观察失效。",
        confidence: "low",
        source_basis: `来自当日总结中的管理员重点标的：${label}。`,
      };
    });
}

function renderOpportunity(item, index) {
  const title = plainText(item.title) || `机会 ${index + 1}`;
  const symbols = formatSymbols(item.symbols);
  const dataPoints = asArray(item.data_points).map(plainText).filter(Boolean);

  return [
    `### ${String(index + 1).padStart(2, "0")}. ${title}`,
    `- 相关标的：${symbols.length ? symbols.join("、") : "未明确指定"}`,
    `- 动机来源：${plainText(item.source_basis) || "来自当日结构化总结与管理员核心理论"}`,
    `- 机会结构：${plainText(item.setup) || "暂无明确机会结构"}`,
    `- 观察触发：${plainText(item.trigger) || "等待价格、时间窗口和资金承接同时确认"}`,
    `- 关键数据：${dataPoints.length ? dataPoints.join("；") : "暂无额外数据点"}`,
    `- 行动偏向：${plainText(item.action_bias) || "仅观察，不形成直接买卖指令"}`,
    `- 失效条件：${plainText(item.risk) || "若管理员框架或市场节奏失效，则取消观察"}`,
    `- 置信度：${plainText(item.confidence) || "low"}`,
    "",
  ].join("\n");
}

function renderOpportunitiesMarkdown(summary, day, sourceSummary) {
  const brief = summary.professional_brief || {};
  const explicitOpportunities = asArray(summary.arbitrage_opportunities).filter((item) => plainText(item.title || item.setup));
  const opportunities = explicitOpportunities.length ? explicitOpportunities : buildFallbackOpportunities(summary);
  const adminSymbols = formatSymbols(extractAdminSymbols(summary));

  const parts = [
    `# ${day} 机会观察`,
    "",
    `> 来源总结：[${sourceSummary.label}](${sourceSummary.link})`,
    "> 生成依据：xiaozhaolucky 核心理论 + 当日群聊结构化总结",
    "> 类型：交易观察，不是买卖建议。仅本地 `npm run docs:dev` 可见。",
    "",
    "## 今日交易框架",
    bulletList(
      [
        ...asArray(brief.core_theory),
        ...asArray(brief.trading_framework),
        ...asArray(summary.event_summary).slice(0, 1),
      ],
      "今日总结尚未形成明确交易框架，先保持观察。",
    ),
    "## 机会观察",
    "",
  ];

  if (opportunities.length) {
    parts.push(opportunities.map(renderOpportunity).join("\n"));
  } else {
    parts.push("- 暂未形成足够明确的高质量机会观察。当前只保留日报复盘，不强行生成交易推演。\n");
  }

  parts.push(
    "## 重点标的",
    bulletList(adminSymbols, "管理员未明确给出可独立观察的重点标的。"),
    "## 触发条件",
    bulletList(brief.evidence_chain, "等待核心理论、价格位置、时间窗口和资金承接出现一致信号。"),
    "## 失效条件与风险边界",
    bulletList(summary.risks, "如果市场节奏脱离管理员框架，机会观察自动失效。"),
    "## 暂不建议行动方向",
    "- 未满足触发条件前，不把普通用户热议直接视为机会。",
    "- 与核心理论冲突的追高、赌财报、赌消息方向先排除。",
    "- 只记录可复盘的观察，不输出确定性买卖指令。",
    "",
  );

  return parts.join("\n");
}

function buildOpportunitiesIndex(root) {
  const opportunitiesRoot = path.join(root, "docs", "opportunities");
  const parts = [
    "# 机会观察",
    "",
    "> 本分区只用于本地 `npm run docs:dev`，不进入 Cloudflare 公开构建。",
    "",
  ];

  for (const month of listMonthlyDirs(root, "opportunities")) {
    const monthDir = path.join(opportunitiesRoot, month);
    const files = fs
      .readdirSync(monthDir)
      .filter((file) => file.endsWith(".md"))
      .sort((a, b) => b.localeCompare(a));
    if (!files.length) continue;

    parts.push(`## ${month}`, "");
    for (const file of files) {
      const title = file.replace(/\.md$/, "");
      const label = title.replace(/-机会观察$/, " 机会观察");
      parts.push(`- [${label}](./${month}/${title})`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

export function generateOpportunities(options) {
  const root = path.resolve(options.root || process.cwd());
  const day = options.date || resolveLatestStructuredDate(root);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`invalid date: ${day}`);
  }

  const month = day.slice(0, 7);
  const summaryJsonPath = path.join(root, "data", "structured", day, `${day}.json`);
  if (!fs.existsSync(summaryJsonPath)) {
    throw new Error(`structured summary json not found: ${summaryJsonPath}`);
  }

  const summary = readJson(summaryJsonPath);
  const sourceSummary = findSourceSummary(root, day);
  const outputDir = path.join(root, "docs", "opportunities", month);
  const outputPath = path.join(outputDir, `${day}-机会观察.md`);
  const indexPath = path.join(root, "docs", "opportunities", "index.md");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(outputPath, renderOpportunitiesMarkdown(summary, day, sourceSummary), "utf8");
  fs.writeFileSync(indexPath, buildOpportunitiesIndex(root), "utf8");

  return {
    day,
    outputPath,
    indexPath,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = generateOpportunities(parseArgs(process.argv.slice(2)));
    console.log(`opportunity markdown: ${result.outputPath}`);
    console.log(`opportunities index: ${result.indexPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
