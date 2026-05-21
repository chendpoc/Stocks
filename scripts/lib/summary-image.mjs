import crypto from "node:crypto";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const WEWORK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const THEMES = {
  light_report: {
    bg: "#f4f6f8",
    paper: "#ffffff",
    ink: "#111827",
    text: "#1f2937",
    muted: "#6b7280",
    faint: "#eef2f6",
    line: "#d7dde5",
    header: "#111827",
    headerText: "#f9fafb",
    accent: "#0f766e",
    accentText: "#115e59",
    accentSoft: "#e6f4f1",
    gold: "#b7791f",
    goldSoft: "#fff7df",
    risk: "#b91c1c",
    riskSoft: "#fff1f2",
    adminSoft: "#ecfdf5",
    rowAlt: "#f8fafc",
  },
  dark_terminal: {
    bg: "#07111f",
    paper: "#0f1b2d",
    ink: "#e5edf7",
    text: "#dbe7f3",
    muted: "#91a4bd",
    faint: "#13233a",
    line: "#203047",
    header: "#08111f",
    headerText: "#f8fafc",
    accent: "#38bdf8",
    accentText: "#7dd3fc",
    accentSoft: "#12354a",
    gold: "#facc15",
    goldSoft: "#352b10",
    risk: "#fb7185",
    riskSoft: "#3b1823",
    adminSoft: "#102f27",
    rowAlt: "#132238",
  },
  poster: {
    bg: "#f5f1e7",
    paper: "#fffaf0",
    ink: "#1f2937",
    text: "#2f2a24",
    muted: "#7c6f64",
    faint: "#f0e4d2",
    line: "#dbc8a7",
    header: "#1f2937",
    headerText: "#fffaf0",
    accent: "#9a3412",
    accentText: "#7c2d12",
    accentSoft: "#ffedd5",
    gold: "#b45309",
    goldSoft: "#fef3c7",
    risk: "#be123c",
    riskSoft: "#ffe4e6",
    adminSoft: "#f0fdf4",
    rowAlt: "#fff7ed",
  },
};

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function normalizeDigest(summary) {
  const digest = summary?.image_digest ?? {};
  const keySymbols = asArray(summary?.key_symbols)
    .slice(0, 6)
    .map((item) => ({
      symbol: item.symbol ?? item.name ?? "UNKNOWN",
      summary: item.summary ?? item.reason ?? "",
      source: item.source ?? "user",
    }));

  return {
    title: digest.title ?? "每日财经群总结",
    subtitle: digest.subtitle ?? "",
    core: asArray(digest.core).length ? asArray(digest.core) : asArray(summary?.overview).slice(0, 4),
    market: asArray(digest.market).length
      ? asArray(digest.market)
      : asArray(summary?.market_context).slice(0, 3),
    symbols: asArray(digest.symbols).length ? asArray(digest.symbols) : keySymbols,
    admin: asArray(digest.admin).length ? asArray(digest.admin) : asArray(summary?.admin_core).slice(0, 3),
    risks: asArray(digest.risks).length ? asArray(digest.risks) : asArray(summary?.risks).slice(0, 4),
    link: digest.link ?? "https://stock.autoin.me/",
  };
}

function measureTextUnits(text) {
  let units = 0;
  for (const ch of String(text ?? "")) {
    units += /[\u0000-\u00ff]/.test(ch) ? 0.55 : 1;
  }
  return units;
}

function wrapText(text, maxUnits, maxLines = 3) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];

  const lines = [];
  let line = "";
  let units = 0;
  let consumed = 0;

  for (const ch of raw) {
    const chUnits = measureTextUnits(ch);
    if (/^[，。；、,.!?！？：:）)]$/u.test(ch) && line) {
      line += ch;
      units += chUnits;
      consumed += 1;
      continue;
    }
    if (units + chUnits > maxUnits && line) {
      lines.push(line);
      line = ch;
      units = chUnits;
      if (lines.length >= maxLines) break;
    } else {
      line += ch;
      units += chUnits;
    }
    consumed += 1;
  }

  if (lines.length < maxLines && line) lines.push(line);
  if (consumed < raw.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。；、,.!?！？\s]+$/u, "")}…`;
  }
  return lines;
}

function textBlock({ x, y, lines, size = 28, fill, weight = 400, maxUnits = 30, maxLines = 3, lineHeight = 1.35 }) {
  const wrapped = [];
  for (const line of asArray(lines)) {
    wrapped.push(...wrapText(line, maxUnits, maxLines - wrapped.length));
    if (wrapped.length >= maxLines) break;
  }

  const lineStep = Math.round(size * lineHeight);
  const svg = wrapped
    .map((line, idx) => {
      const yy = y + idx * lineStep;
      return `<text x="${x}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("");

  return {
    svg,
    lineCount: wrapped.length,
    height: Math.max(wrapped.length, 1) * lineStep,
  };
}

function label({ x, y, text, theme, fill = theme.faint, color = theme.muted, width = null }) {
  const measured = Math.max(78, Math.ceil(measureTextUnits(text) * 13 + 30));
  const w = width ?? measured;
  return `
    <rect x="${x}" y="${y - 23}" width="${w}" height="34" rx="6" fill="${fill}"/>
    <text x="${x + 15}" y="${y}" font-size="18" font-weight="700" fill="${color}">${escapeXml(text)}</text>
  `;
}

function sectionKicker({ x, y, title, theme, meta = "" }) {
  return `
    <text x="${x}" y="${y}" font-size="20" font-weight="800" letter-spacing="0" fill="${theme.accentText}">${escapeXml(title)}</text>
    ${meta ? `<text x="${x}" y="${y + 28}" font-size="17" fill="${theme.muted}">${escapeXml(meta)}</text>` : ""}
  `;
}

function sourceBadge(source, theme) {
  const normalized = String(source ?? "user").toLowerCase();
  if (normalized.includes("admin")) {
    return { text: "ADMIN", fill: theme.ink, color: "#ffffff" };
  }
  return { text: "USER", fill: theme.faint, color: theme.muted };
}

function renderCoreList(items, { x, y, width, theme }) {
  const parts = [];
  let currentY = y;
  items.slice(0, 4).forEach((item, idx) => {
    const index = String(idx + 1).padStart(2, "0");
    parts.push(`<text x="${x}" y="${currentY}" font-size="18" font-weight="800" fill="${theme.gold}">${index}</text>`);
    const block = textBlock({
      x: x + 48,
      y: currentY,
      lines: item,
      size: 26,
      fill: theme.ink,
      weight: idx === 0 ? 800 : 600,
      maxUnits: Math.floor((width - 60) / 25),
      maxLines: idx === 0 ? 3 : 2,
      lineHeight: 1.36,
    });
    parts.push(block.svg);
    currentY += block.height + 20;
  });
  return { svg: parts.join("\n"), height: currentY - y };
}

function renderMarketBox(items, { x, y, width, theme }) {
  const parts = [];
  parts.push(`<rect x="${x}" y="${y - 34}" width="${width}" height="222" rx="8" fill="${theme.rowAlt}" stroke="${theme.line}"/>`);
  parts.push(label({ x: x + 22, y: y, text: "MARKET LINE", theme, fill: theme.goldSoft, color: theme.gold }));
  let currentY = y + 48;
  const source = items.length ? items.slice(0, 3) : ["暂无明确市场主线，建议回看完整总结。"];
  source.forEach((item) => {
    parts.push(`<circle cx="${x + 32}" cy="${currentY - 8}" r="4" fill="${theme.accent}"/>`);
    const block = textBlock({
      x: x + 48,
      y: currentY,
      lines: item,
      size: 21,
      fill: theme.text,
      maxUnits: Math.floor((width - 76) / 20),
      maxLines: 2,
      lineHeight: 1.34,
    });
    parts.push(block.svg);
    currentY += block.height + 12;
  });
  return { svg: parts.join("\n"), height: 222 };
}

function renderSymbols(items, { x, y, width, theme }) {
  const parts = [];
  const rows = items.slice(0, 6);
  const rowHeight = 74;
  const tableHeight = Math.max(rows.length, 1) * rowHeight + 54;

  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${tableHeight}" rx="8" fill="${theme.paper}" stroke="${theme.line}"/>`);
  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="48" rx="8" fill="${theme.faint}"/>`);
  parts.push(`<text x="${x + 22}" y="${y + 31}" font-size="17" font-weight="800" fill="${theme.muted}">TICKER</text>`);
  parts.push(`<text x="${x + 188}" y="${y + 31}" font-size="17" font-weight="800" fill="${theme.muted}">SUMMARY</text>`);
  parts.push(`<text x="${x + width - 112}" y="${y + 31}" font-size="17" font-weight="800" fill="${theme.muted}">SOURCE</text>`);

  if (!rows.length) {
    parts.push(`<text x="${x + 22}" y="${y + 96}" font-size="24" fill="${theme.muted}">暂无重点标的</text>`);
    return { svg: parts.join("\n"), height: tableHeight };
  }

  rows.forEach((item, idx) => {
    const rowY = y + 48 + idx * rowHeight;
    if (idx % 2 === 1) {
      parts.push(`<rect x="${x}" y="${rowY}" width="${width}" height="${rowHeight}" fill="${theme.rowAlt}"/>`);
    }
    parts.push(`<line x1="${x}" y1="${rowY}" x2="${x + width}" y2="${rowY}" stroke="${theme.line}" stroke-width="1"/>`);
    parts.push(`<text x="${x + 22}" y="${rowY + 46}" font-size="30" font-weight="900" fill="${theme.accent}">${escapeXml(item.symbol ?? item.name ?? "UNKNOWN")}</text>`);

    const summary = textBlock({
      x: x + 188,
      y: rowY + 33,
      lines: item.summary ?? item.reason ?? "",
      size: 21,
      fill: theme.text,
      maxUnits: Math.floor((width - 340) / 20),
      maxLines: 2,
      lineHeight: 1.28,
    });
    parts.push(summary.svg);

    const badge = sourceBadge(item.source, theme);
    parts.push(label({
      x: x + width - 122,
      y: rowY + 43,
      text: badge.text,
      theme,
      fill: badge.fill,
      color: badge.color,
      width: 82,
    }));
  });

  return { svg: parts.join("\n"), height: tableHeight };
}

function renderInsightPanel({ x, y, width, title, items, theme, tone }) {
  const isRisk = tone === "risk";
  const border = isRisk ? theme.risk : theme.accent;
  const bg = isRisk ? theme.riskSoft : theme.adminSoft;
  const titleColor = isRisk ? theme.risk : theme.accentText;
  const source = items.length ? items.slice(0, 3) : [isRisk ? "暂无明确风险提示。" : "未发现管理员发言"];
  const parts = [];
  const height = 228;

  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${bg}" stroke="${border}" stroke-opacity="0.28"/>`);
  parts.push(`<rect x="${x}" y="${y}" width="7" height="${height}" rx="4" fill="${border}"/>`);
  parts.push(`<text x="${x + 24}" y="${y + 40}" font-size="24" font-weight="900" fill="${titleColor}">${escapeXml(title)}</text>`);

  let currentY = y + 80;
  source.forEach((item) => {
    const block = textBlock({
      x: x + 24,
      y: currentY,
      lines: item,
      size: 20,
      fill: isRisk ? theme.risk : theme.text,
      maxUnits: Math.floor((width - 48) / 19),
      maxLines: 2,
      lineHeight: 1.35,
    });
    parts.push(block.svg);
    currentY += block.height + 11;
  });

  return { svg: parts.join("\n"), height };
}

function formatObjectItem(item) {
  const labels = {
    user: "用户",
    point: "观点",
    resolution: "处理",
    source: "来源",
    symbol: "标的",
    name: "名称",
    summary: "摘要",
    reason: "原因",
  };
  return Object.entries(item)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${labels[key] ?? key}：${Array.isArray(value) ? value.join(" / ") : value}`)
    .join("；");
}

function parseLegacyDictString(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed.replaceAll("'", '"'));
  } catch {
    return null;
  }
}

function formatSummaryItem(item) {
  if (typeof item === "string") {
    const parsed = parseLegacyDictString(item);
    return parsed && typeof parsed === "object" ? formatObjectItem(parsed) : item;
  }
  if (!item || typeof item !== "object") return String(item ?? "");
  return formatObjectItem(item);
}

function isAdminSource(source) {
  const text = String(source ?? "").toLowerCase();
  return text.includes("admin") || text.includes("管理员") || text.includes("xiaozhaolucky") || text.includes("赵哥");
}

function formatSymbolLine(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  const symbol = item.symbol ?? item.name ?? "UNKNOWN";
  const name = item.name && item.name !== symbol ? `（${item.name}）` : "";
  const detail = item.summary ?? item.reason ?? "";
  return `${symbol}${name}：${detail || "暂无明确描述"}`;
}

function normalizeReport(summary) {
  const digest = normalizeDigest(summary);
  const fromSummary = (key, fallback = []) => {
    const items = asArray(summary?.[key]).map(formatSummaryItem).filter(Boolean);
    return items.length ? items : fallback;
  };
  const keySymbols = asArray(summary?.key_symbols);
  const digestSymbols = asArray(digest.symbols);
  const adminSymbols = asArray(summary?.admin_symbols).length
    ? asArray(summary.admin_symbols)
    : keySymbols.filter((item) => isAdminSource(item?.source));
  const digestAdminSymbols = digestSymbols.filter((item) => isAdminSource(item?.source));
  const fallbackSymbols = adminSymbols.length ? adminSymbols : digestAdminSymbols;
  const adminSymbolLines = (adminSymbols.length ? adminSymbols : fallbackSymbols).slice(0, 9).map(formatSymbolLine);

  return {
    title: digest.title,
    subtitle: digest.subtitle || "群内速读版",
    link: digest.link,
    sections: [
      { title: "三句话总结", items: fromSummary("event_summary", digest.core).slice(0, 3), tone: "summary" },
      { title: "xiaozhaolucky", items: fromSummary("admin_deep_reading", fromSummary("admin_core", digest.admin)).slice(0, 8), meta: "赵哥理论提炼" },
      { title: "管理员重点标的", items: adminSymbolLines },
      { title: "核心结论", items: fromSummary("overview", digest.core) },
      { title: "市场主线", items: fromSummary("market_context", digest.market) },
      { title: "期权与交易策略", items: fromSummary("options") },
      { title: "事件与关键日期", items: fromSummary("events") },
      { title: "风险与观察点", items: fromSummary("risks", digest.risks), tone: "risk" },
    ].filter((section) => section.items.length),
  };
}

function renderReportSection({ x, y, width, section, theme, index }) {
  const parts = [];
  const titleColor = section.tone === "risk" ? theme.risk : section.tone === "summary" ? theme.gold : theme.accentText;
  const bg = section.tone === "risk" ? theme.riskSoft : section.tone === "summary" ? theme.goldSoft : theme.paper;
  const marker = String(index + 1).padStart(2, "0");
  let currentY = y;
  const sectionPadding = 28;

  const contentParts = [];
  currentY += sectionPadding + 10;
  contentParts.push(`<text x="${x + sectionPadding}" y="${currentY}" font-size="18" font-weight="900" fill="${theme.gold}">${marker}</text>`);
  contentParts.push(`<text x="${x + sectionPadding + 42}" y="${currentY}" font-size="30" font-weight="900" fill="${titleColor}">${escapeXml(section.title)}</text>`);
  if (section.meta) {
    contentParts.push(`<text x="${x + width - sectionPadding - 190}" y="${currentY}" font-size="18" font-weight="700" fill="${theme.muted}">${escapeXml(section.meta)}</text>`);
  }
  currentY += 38;

  section.items.forEach((item, itemIndex) => {
    const fontSize = section.tone === "summary" ? 25 : section.title === "核心结论" ? 24 : 23;
    const block = textBlock({
      x: x + sectionPadding + 44,
      y: currentY,
      lines: item,
      size: fontSize,
      fill: section.tone === "risk" ? theme.risk : theme.text,
      weight: section.tone === "summary" || (section.title === "核心结论" && itemIndex === 0) ? 800 : 500,
      maxUnits: Math.floor((width - sectionPadding * 2 - 90) / (fontSize * 1.05)),
      maxLines: Number.POSITIVE_INFINITY,
      lineHeight: 1.42,
    });
    contentParts.push(`<circle cx="${x + sectionPadding + 15}" cy="${currentY - 8}" r="5" fill="${section.tone === "risk" ? theme.risk : theme.accent}"/>`);
    contentParts.push(block.svg);
    currentY += block.height + 16;
  });

  const height = currentY - y + sectionPadding - 6;
  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${bg}" stroke="${theme.line}"/>`);
  if (section.tone !== "summary") {
    parts.push(`<rect x="${x}" y="${y}" width="7" height="${height}" rx="4" fill="${section.tone === "risk" ? theme.risk : theme.accent}"/>`);
  }
  parts.push(contentParts.join("\n"));
  return { svg: parts.join("\n"), height };
}

export function renderSummarySvg(summary, options = {}) {
  const themeName = options.themeName ?? "light_report";
  const theme = THEMES[themeName] ?? THEMES.light_report;
  const report = normalizeReport(summary);
  const width = options.width ?? 1080;
  const margin = 54;
  const contentWidth = width - margin * 2;
  const parts = [];

  let y = 0;
  parts.push(`<rect x="0" y="0" width="${width}" height="190" fill="${theme.header}"/>`);
  parts.push(`<text x="${margin}" y="66" font-size="21" font-weight="800" fill="${theme.gold}">DAILY REPORT</text>`);
  parts.push(`<text x="${margin}" y="124" font-size="48" font-weight="900" fill="${theme.headerText}">${escapeXml(report.title)}</text>`);
  parts.push(`<text x="${margin}" y="160" font-size="21" fill="${theme.line}">${escapeXml(report.subtitle)}</text>`);

  y = 248;

  report.sections.forEach((section, index) => {
    const rendered = renderReportSection({ x: margin, y, width: contentWidth, section, theme, index });
    parts.push(rendered.svg);
    y += rendered.height + 22;
  });

  y += 10;

  const height = Math.max(options.height ?? 0, y + 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif; dominant-baseline: alphabetic; letter-spacing: 0; }
  </style>
  <rect width="${width}" height="${height}" fill="${theme.bg}"/>
  <rect x="26" y="26" width="${width - 52}" height="${height - 52}" rx="8" fill="${theme.paper}"/>
  ${parts.join("\n")}
</svg>`;
}

export async function renderSummaryPng(summary, options = {}) {
  const outputPath = options.outputPath ?? path.join("data", "generated", "daily-summary.png");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const svg = renderSummarySvg(summary, options);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);
  let info = await stat(outputPath);

  if (info.size > WEWORK_IMAGE_MAX_BYTES) {
    const tempPath = `${outputPath}.tmp.png`;
    await sharp(outputPath)
      .resize({ width: 960, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(tempPath);
    await rename(tempPath, outputPath);
    info = await stat(outputPath);
  }

  if (info.size > WEWORK_IMAGE_MAX_BYTES) {
    throw new Error(`Rendered image is too large for WeWork: ${info.size} bytes`);
  }

  return { outputPath, sizeBytes: info.size };
}

export function buildWeWorkImagePayload(pngBytes) {
  const bytes = Buffer.isBuffer(pngBytes) ? pngBytes : Buffer.from(pngBytes);
  return {
    msgtype: "image",
    image: {
      base64: bytes.toString("base64"),
      md5: crypto.createHash("md5").update(bytes).digest("hex"),
    },
  };
}

export async function buildWeWorkImagePayloadFromFile(imagePath) {
  return buildWeWorkImagePayload(await readFile(imagePath));
}

export async function sendWeWorkImage(webhookUrl, imagePath, fetchImpl = fetch) {
  const payload = await buildWeWorkImagePayloadFromFile(imagePath);
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`WeWork webhook HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  if (body.errcode !== 0) {
    throw new Error(`WeWork webhook error errcode=${body.errcode}: ${body.errmsg ?? JSON.stringify(body)}`);
  }
  return body;
}
