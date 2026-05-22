import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function byteTrim(text, maxBytes) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  let out = "";
  for (const ch of raw) {
    const next = out + ch;
    if (Buffer.byteLength(next, "utf8") > maxBytes) {
      return `${out.replace(/[，。；、,.!?！？\s]+$/u, "")}…`;
    }
    out = next;
  }
  return out;
}

function compactDate(day) {
  const match = String(day ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(day ?? "");
  return `${Number(match[2])}/${Number(match[3])}`;
}

function formatItem(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  if (item.symbol || item.name) {
    const symbol = item.symbol ?? item.name;
    const name = item.name && item.name !== symbol ? `（${item.name}）` : "";
    return `${symbol}${name}：${item.summary ?? item.reason ?? ""}`.trim();
  }
  return Object.entries(item)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}：${Array.isArray(value) ? value.join(" / ") : value}`)
    .join("；");
}

function isAdminSource(source) {
  const text = String(source ?? "").toLowerCase();
  return text.includes("admin") || text.includes("管理员") || text.includes("xiaozhaolucky") || text.includes("赵哥");
}

function firstNonEmpty(...groups) {
  for (const group of groups) {
    const values = asArray(group).map(formatItem).filter(Boolean);
    if (values.length) return values;
  }
  return [];
}

function joinUrl(baseUrl, route) {
  const base = String(baseUrl || "https://stock.autoin.me").replace(/\/+$/, "");
  const pathPart = String(route || "/").startsWith("/") ? route : `/${route}`;
  return encodeURI(`${base}${pathPart}`);
}

function publicHomeUrl(siteBaseUrl) {
  const parsed = new URL(String(siteBaseUrl || "https://stock.autoin.me"));
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function buildSummaryCardDigest(summary, options = {}) {
  const day = options.day || summary?.day || "";
  const digest = summary?.image_digest ?? {};
  const keySymbols = asArray(summary?.key_symbols);
  const adminSymbols = asArray(summary?.admin_symbols).length
    ? asArray(summary.admin_symbols)
    : keySymbols.filter((item) => isAdminSource(item?.source));

  const adminMainline = firstNonEmpty(summary?.admin_deep_reading, summary?.admin_core, digest.admin).slice(0, 3);
  const overview = firstNonEmpty(summary?.event_summary, summary?.overview, digest.core).slice(0, 3);
  const risks = firstNonEmpty(summary?.risks, digest.risks).slice(0, 3);
  const symbols = (adminSymbols.length ? adminSymbols : keySymbols).slice(0, 5).map(formatItem);
  const reportUrl = options.reportUrl || publicHomeUrl(options.siteBaseUrl);
  const title = `${compactDate(day)} 每日财经总结`;
  const mainline = adminMainline[0] || overview[0] || "今日暂无明确管理员主线。";
  const symbolText = symbols
    .map((item) => String(item).split(/[：:]/)[0])
    .filter(Boolean)
    .slice(0, 4)
    .join(" / ");

  return {
    day,
    title,
    reportUrl,
    mainline,
    description: byteTrim(`${symbolText ? `重点：${symbolText}｜` : ""}${mainline}`, 90),
    overview,
    adminMainline,
    symbols,
    risks,
  };
}

export function buildDailySummaryCard(digest, options = {}) {
  const coverImageUrl = options.coverImageUrl || "https://stock.autoin.me/assets/summary-cards/default.png";
  const actionUrl = options.reportUrl || digest.reportUrl || publicHomeUrl(options.siteBaseUrl);
  const mainline = digest.adminMainline?.[0] || digest.mainline;
  const conclusion = digest.overview?.[0] || digest.description;
  const symbols = (digest.symbols || []).slice(0, 3).join("；");
  const risks = (digest.risks || []).slice(0, 2).join("；");
  const verticalContent = [
    { title: "赵哥主线", desc: byteTrim(mainline, 96) },
    { title: "核心结论", desc: byteTrim(conclusion, 96) },
    { title: "管理员重点", desc: byteTrim(symbols, 110) },
    { title: "风险", desc: byteTrim(risks, 96) },
  ].filter((item) => item.desc);
  const horizontalContent = [
    { keyname: "日期", value: digest.day || "" },
    { keyname: "入口", value: "公开站首页", type: 1, url: actionUrl },
  ];

  return {
    msgtype: "template_card",
    template_card: {
      card_type: "news_notice",
      source: {
        desc: "每日总结",
        desc_color: 0,
      },
      main_title: {
        title: byteTrim(digest.title, 72),
        desc: byteTrim(digest.description, 88),
      },
      card_image: {
        url: coverImageUrl,
        aspect_ratio: 2.25,
      },
      image_text_area: {
        type: 1,
        url: actionUrl,
        title: byteTrim(mainline, 44),
        desc: "点击进入公开站首页",
        image_url: coverImageUrl,
      },
      vertical_content_list: verticalContent.slice(0, 4),
      horizontal_content_list: horizontalContent.filter((item) => item.value).slice(0, 6),
      jump_list: [
        {
          type: 1,
          url: actionUrl,
          title: "打开公开站",
        },
      ],
      card_action: {
        type: 1,
        url: actionUrl,
      },
    },
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, maxChars, maxLines) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  const lines = [];
  let line = "";
  let units = 0;
  let consumed = 0;
  for (const ch of raw) {
    const unit = /[\u0000-\u00ff]/.test(ch) ? 0.55 : 1;
    if (units + unit > maxChars && line) {
      lines.push(line);
      line = ch;
      units = unit;
      if (lines.length >= maxLines) break;
    } else {
      line += ch;
      units += unit;
    }
    consumed += 1;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (consumed < raw.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。；、,.!?！？\s]+$/u, "")}…`;
  }
  return lines;
}

export function renderSummaryCardCoverSvg(digest, options = {}) {
  const width = options.width ?? 1068;
  const height = options.height ?? 455;
  const title = escapeXml(digest.title);
  const mainLines = wrapText(digest.mainline || digest.description, 31, 2);
  const symbols = (digest.symbols || []).slice(0, 3).map((item) => String(item).split(/[：:]/)[0]).join(" / ");
  const risk = (digest.risks || [])[0] || "控制仓位，避免追高。";
  const lineSvg = mainLines
    .map((line, index) => `<text x="58" y="${178 + index * 48}" font-size="34" font-weight="800" fill="#111827">${escapeXml(line)}</text>`)
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>text{font-family:"Noto Sans CJK SC","Microsoft YaHei","PingFang SC",Arial,sans-serif;letter-spacing:0}</style>
  <rect width="${width}" height="${height}" fill="#f4f6f8"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="18" fill="#ffffff"/>
  <rect x="24" y="24" width="${width - 48}" height="82" rx="18" fill="#111827"/>
  <text x="58" y="75" font-size="24" font-weight="900" fill="#facc15">DAILY FINANCE REPORT</text>
  <text x="${width - 210}" y="75" font-size="22" font-weight="700" fill="#d1d5db">${escapeXml(digest.day || "")}</text>
  <text x="58" y="142" font-size="30" font-weight="900" fill="#0f766e">${title}</text>
  ${lineSvg}
  <rect x="58" y="300" width="952" height="1" fill="#d7dde5"/>
  <text x="58" y="350" font-size="24" font-weight="800" fill="#0f766e">重点标的</text>
  <text x="188" y="350" font-size="24" fill="#1f2937">${escapeXml(symbols || "暂无明确标的")}</text>
  <text x="58" y="392" font-size="24" font-weight="800" fill="#b91c1c">风险</text>
  <text x="128" y="392" font-size="24" fill="#1f2937">${escapeXml(byteTrim(risk, 96))}</text>
</svg>`;
}

export async function renderSummaryCardCoverPng(digest, options = {}) {
  const outputPath = options.outputPath ?? path.join("data", "generated", "summary-card-cover.png");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const svg = renderSummaryCardCoverSvg(digest, options);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);
  const info = await stat(outputPath);
  return { outputPath, sizeBytes: info.size };
}

export async function sendWeWorkTemplateCard(webhookUrl, payload, fetchImpl = fetch) {
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

export function buildPublicReportUrl(archivePath, siteBaseUrl) {
  return publicHomeUrl(siteBaseUrl);
}

export function buildPublicAssetUrl(assetPath, siteBaseUrl) {
  const normalized = String(assetPath ?? "").replaceAll("\\", "/");
  const docsIndex = normalized.indexOf("docs/");
  const rel = docsIndex >= 0 ? normalized.slice(docsIndex + "docs/".length) : normalized;
  return joinUrl(siteBaseUrl, `/${rel}`);
}
