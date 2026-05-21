export const WEWORK_MARKDOWN_MAX_BYTES = 4096;

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function isAdminSource(source) {
  const text = String(source ?? "").toLowerCase();
  return text.includes("admin") || text.includes("管理员") || text.includes("xiaozhaolucky") || text.includes("赵哥");
}

function formatItem(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  if (item.symbol || item.name) {
    const symbol = item.symbol ?? item.name;
    const name = item.name && item.name !== symbol ? `（${item.name}）` : "";
    return `${symbol}${name}：${item.summary ?? item.reason ?? "暂无明确描述"}`;
  }
  const labels = {
    user: "用户",
    point: "观点",
    resolution: "处理",
    summary: "摘要",
    reason: "原因",
  };
  return Object.entries(item)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${labels[key] ?? key}：${Array.isArray(value) ? value.join(" / ") : value}`)
    .join("；");
}

function stripUnsafeMarkdown(text) {
  return String(text ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanItems(items) {
  return asArray(items).map(formatItem).map(stripUnsafeMarkdown).filter(Boolean);
}

function takeFirst(...groups) {
  for (const group of groups) {
    const items = cleanItems(group);
    if (items.length) return items;
  }
  return [];
}

function compactDate(day) {
  const match = String(day ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(day ?? "");
  return `${Number(match[2])}/${Number(match[3])}`;
}

function renderBulletSection(title, items, limit) {
  const selected = cleanItems(items).slice(0, limit);
  if (!selected.length) return "";
  return [`### ${title}`, ...selected.map((item) => `- ${item}`)].join("\n");
}

function trimUtf8(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const suffix = "\n\n（内容已压缩，完整见本地 Markdown）";
  const budget = maxBytes - Buffer.byteLength(suffix, "utf8");
  let out = "";
  for (const ch of text) {
    const next = out + ch;
    if (Buffer.byteLength(next, "utf8") > budget) break;
    out = next;
  }
  return `${out.replace(/[，。；、,.!?！？\s]+$/u, "")}${suffix}`;
}

export function buildSummaryBriefMarkdown(summary, options = {}) {
  const day = options.day || summary?.day || "";
  const localMarkdownPath = options.localMarkdownPath || "";
  const keySymbols = asArray(summary?.key_symbols);
  const adminSymbols = asArray(summary?.admin_symbols).length
    ? asArray(summary.admin_symbols)
    : keySymbols.filter((item) => isAdminSource(item?.source));
  const userSymbols = asArray(summary?.user_symbols).length
    ? asArray(summary.user_symbols)
    : keySymbols.filter((item) => !isAdminSource(item?.source));
  const fallbackAdminSymbols = adminSymbols.length ? adminSymbols : keySymbols;

  const sections = [
    renderBulletSection("三句话总结", takeFirst(summary?.event_summary, summary?.overview, summary?.image_digest?.core), 3),
    renderBulletSection("赵哥 / xiaozhaolucky", takeFirst(summary?.admin_deep_reading, summary?.admin_core, summary?.image_digest?.admin), 3),
    renderBulletSection("管理员重点标的", fallbackAdminSymbols, 4),
    renderBulletSection("普通用户补充", [...cleanItems(summary?.user_core), ...cleanItems(summary?.disagreements)], 3),
    renderBulletSection("普通用户提到的标的", userSymbols, 3),
    renderBulletSection("风险与观察点", takeFirst(summary?.risks, summary?.image_digest?.risks), 3),
  ].filter(Boolean);

  const title = `## ${compactDate(day)} 每日财经总结`;
  const footer = localMarkdownPath ? `\n\n本地完整文档：${localMarkdownPath}` : "";
  const markdown = [title, ...sections].join("\n\n") + footer;
  return trimUtf8(markdown, options.maxBytes ?? WEWORK_MARKDOWN_MAX_BYTES);
}

export function buildWeWorkMarkdownPayload(markdown) {
  const content = trimUtf8(markdown, WEWORK_MARKDOWN_MAX_BYTES);
  return {
    msgtype: "markdown",
    markdown: {
      content,
    },
  };
}

export async function sendWeWorkMarkdown(webhookUrl, payload, fetchImpl = fetch) {
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
