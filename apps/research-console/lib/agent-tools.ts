import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AgentToolCall,
  AgentToolDefinition,
  AgentToolTrace,
  ResearchContextSummary,
} from "@stock-summary/summary-core";
import {
  buildOpportunityScores,
  formatOpportunityScoreReason,
  opportunityConfidence,
  totalOpportunityScore,
} from "./opportunity-scoring";

export type LocalResearchToolName =
  | "load_structured_summary"
  | "load_opportunity_observation"
  | "extract_watchlist"
  | "score_opportunities";
export type ExternalResearchToolName =
  | "longbridge_quote"
  | "alpha_vantage_quote"
  | "news_search"
  | "yfinance_history"
  | "yfinance_quote";
export type ResearchToolName = LocalResearchToolName | ExternalResearchToolName;
export type ResearchToolPlanItem = ResearchToolName | string | AgentToolCall;

export type { AgentToolDefinition };

const execFileAsync = promisify(execFile);

export function normalizeResearchToolCall(call: ResearchToolPlanItem): AgentToolCall {
  if (typeof call === "string") {
    return { name: call, input: {} };
  }

  return {
    name: call.name,
    input: call.input ?? {},
  };
}

function count(label: string, value: unknown[]) {
  return `${label} ${value.length} 条`;
}

function markdownLength(markdown: string | undefined) {
  return markdown?.trim() ? `${markdown.length} 字符` : "未找到机会观察 Markdown";
}

function workspaceRoot() {
  return process.env.STOCK_SUMMARY_ROOT
    ? path.resolve(process.env.STOCK_SUMMARY_ROOT)
    : path.resolve(process.cwd(), "../..");
}

function codeRoot() {
  if (process.env.STOCK_SUMMARY_CODE_ROOT?.trim()) {
    return path.resolve(process.env.STOCK_SUMMARY_CODE_ROOT);
  }

  const cwd = process.cwd();
  if (path.basename(cwd) === "research-console" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

function normalizeSymbol(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
}

function normalizeQuery(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function newsSearchCacheKey(query: string) {
  return crypto.createHash("sha1").update(query).digest("hex");
}

function allowedNewsHosts() {
  return (process.env.NEWS_SEARCH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("."))
    .filter(Boolean);
}

function isAllowedNewsUrl(url: string, allowedHosts: string[]) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

function redactNewsValue(value: string) {
  const secret = process.env.NEWS_SEARCH_API_KEY;
  return secret ? value.replaceAll(secret, "[redacted]") : value;
}

function symbolFromContext(context: ResearchContextSummary) {
  const first = context.adminSymbols[0] ?? "";
  const match = first.match(/[A-Z]{1,6}(?:[.\-][A-Z])?/);
  return match?.[0] ?? "";
}

function formatOpportunityScores(scores: ReturnType<typeof buildOpportunityScores>) {
  if (!scores.length) {
    return "score_opportunities: no admin symbols available for local scoring.";
  }

  return [
    "score_opportunities: local deterministic research triage; not a transaction instruction.",
    ...scores.map((score, index) => {
      const total = totalOpportunityScore(score);
      return `${index + 1} | ${score.symbol} | ${total} | ${opportunityConfidence(total)} | ${formatOpportunityScoreReason(score)}; summary=${score.summary}`;
    }),
  ].join("\n");
}

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

function longbridgeQuoteEndpoint() {
  return (
    process.env.LONGBRIDGE_QUOTE_ENDPOINT?.trim() ||
    "https://openapi.longportapp.com/v1/quote/stock_quote"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const data = record.data;
  if (Array.isArray(data)) return asRecord(data[0]);
  if (data && typeof data === "object") {
    const dataRecord = asRecord(data);
    if (Array.isArray(dataRecord.list)) return asRecord(dataRecord.list[0]);
    return dataRecord;
  }
  if (Array.isArray(record.list)) return asRecord(record.list[0]);
  return record;
}

function finiteNumber(value: unknown) {
  const text = String(value ?? "").replace(/,/g, "").replace(/%$/, "").trim();
  if (!text) return NaN;
  return Number(text);
}

function boundedString(value: unknown, maxLength = 80) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function longbridgeSecretValues() {
  return [
    process.env.LONGBRIDGE_APP_KEY,
    process.env.LONGBRIDGE_APP_SECRET,
    process.env.LONGBRIDGE_ACCESS_TOKEN,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function sanitizeLongbridgeText(value: unknown, maxLength = 80) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (/authorization|bearer/i.test(raw)) return "";
  if (longbridgeSecretValues().some((secret) => raw.includes(secret))) return "";
  return raw.trim().slice(0, maxLength);
}

function sanitizeLongbridgeQuotePayload(payload: unknown, fallbackSymbol: string) {
  const quote = firstRecord(payload);
  const symbol = normalizeSymbol(
    boundedString(quote.symbol ?? quote.security ?? quote.code ?? quote.ticker ?? fallbackSymbol),
  );
  const price = finiteNumber(
    quote.last_done ?? quote.last ?? quote.price ?? quote.current_price ?? quote.last_price,
  );
  const previousClose = finiteNumber(quote.prev_close ?? quote.previous_close ?? quote.close);
  const explicitChange = finiteNumber(quote.change ?? quote.net_change);
  const change = Number.isFinite(explicitChange)
    ? explicitChange
    : Number.isFinite(price) && Number.isFinite(previousClose)
      ? price - previousClose
      : NaN;
  const rawChangeRate = finiteNumber(quote.change_rate ?? quote.change_percent ?? quote.changePercent);
  const changePercent = Number.isFinite(rawChangeRate)
    ? Math.abs(rawChangeRate) <= 1
      ? rawChangeRate * 100
      : rawChangeRate
    : Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0
      ? (change / previousClose) * 100
      : NaN;

  return {
    symbol,
    price,
    change,
    changePercent,
    volume: finiteNumber(quote.volume ?? quote.trade_volume),
    currency: sanitizeLongbridgeText(quote.currency, 12),
    marketStatus: sanitizeLongbridgeText(
      quote.marketStatus ?? quote.trade_status ?? quote.market_status ?? quote.status,
      32,
    ),
    timestamp: sanitizeLongbridgeText(quote.timestamp ?? quote.time ?? quote.updated_at, 40),
  };
}

function formatLongbridgeQuote(payload: unknown, fromCache: boolean) {
  const quote = sanitizeLongbridgeQuotePayload(payload, "");
  if (!quote.symbol) return `Longbridge${fromCache ? " cache" : ""}: quote unavailable`;

  const price = Number.isFinite(quote.price) ? quote.price.toFixed(2) : "N/A";
  const change = Number.isFinite(quote.change) ? `change ${quote.change.toFixed(2)}` : "";
  const changePercent = Number.isFinite(quote.changePercent)
    ? `change% ${quote.changePercent.toFixed(2)}%`
    : "";
  const volume = Number.isFinite(quote.volume) ? `volume ${Math.trunc(quote.volume)}` : "";

  return [
    `Longbridge${fromCache ? " cache" : ""}`,
    quote.symbol,
    `price ${price}${quote.currency ? ` ${quote.currency}` : ""}`,
    change,
    changePercent,
    volume,
    quote.marketStatus ? `market ${quote.marketStatus}` : "",
    quote.timestamp ? `time ${quote.timestamp}` : "",
  ].filter(Boolean).join("; ");
}

function formatAlphaVantageQuote(payload: unknown, fromCache: boolean) {
  const quote = (payload as { "Global Quote"?: Record<string, string> })?.["Global Quote"];
  if (!quote) return `Alpha Vantage${fromCache ? " cache" : ""}: quote unavailable`;

  const symbol = quote["01. symbol"] || "UNKNOWN";
  const price = Number.parseFloat(quote["05. price"] || "");
  const change = quote["09. change"];
  const changePercent = quote["10. change percent"];
  const tradingDay = quote["07. latest trading day"];
  const priceText = Number.isFinite(price) ? price.toFixed(2) : "N/A";
  const parts = [
    `Alpha Vantage${fromCache ? " cache" : ""}`,
    symbol,
    `price ${priceText}`,
    change ? `change ${change}` : "",
    changePercent ? `change% ${changePercent}` : "",
    tradingDay ? `date ${tradingDay}` : "",
  ].filter(Boolean);

  return parts.join("; ");
}

function yfinancePythonExecutable() {
  if (process.env.YFINANCE_PYTHON_BIN?.trim()) return process.env.YFINANCE_PYTHON_BIN.trim();
  const root = codeRoot();
  return process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
}

function sanitizeYfinanceQuotePayload(payload: unknown, fallbackSymbol: string) {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const symbol = normalizeSymbol(String(record.symbol ?? fallbackSymbol));
  return {
    symbol,
    regularMarketPrice: Number(record.regularMarketPrice ?? record.lastPrice ?? record.price),
    regularMarketChange: Number(record.regularMarketChange ?? record.change),
    regularMarketChangePercent: Number(record.regularMarketChangePercent ?? record.changePercent),
    regularMarketVolume: Number(record.regularMarketVolume ?? record.volume),
    currency: String(record.currency ?? "").trim().slice(0, 12),
    exchange: String(record.exchange ?? "").trim().slice(0, 24),
    shortName: String(record.shortName ?? record.longName ?? "").trim().slice(0, 80),
  };
}

function formatYfinanceQuote(payload: unknown, fromCache: boolean) {
  const quote = sanitizeYfinanceQuotePayload(payload, "");
  if (!quote.symbol) return `yfinance${fromCache ? " cache" : ""}: quote unavailable`;

  const price = Number.isFinite(quote.regularMarketPrice)
    ? quote.regularMarketPrice.toFixed(2)
    : "N/A";
  const change = Number.isFinite(quote.regularMarketChange)
    ? `change ${quote.regularMarketChange.toFixed(2)}`
    : "";
  const changePercent = Number.isFinite(quote.regularMarketChangePercent)
    ? `change% ${quote.regularMarketChangePercent.toFixed(2)}%`
    : "";
  const volume = Number.isFinite(quote.regularMarketVolume)
    ? `volume ${Math.trunc(quote.regularMarketVolume)}`
    : "";

  return [
    `yfinance${fromCache ? " cache" : ""}`,
    quote.symbol,
    quote.shortName,
    `price ${price}${quote.currency ? ` ${quote.currency}` : ""}`,
    change,
    changePercent,
    volume,
    quote.exchange ? `exchange ${quote.exchange}` : "",
  ].filter(Boolean).join("; ");
}

function normalizeHistoryPeriod(value: unknown) {
  const period = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, 16);
  return period || "30d";
}

function yfinanceHistoryCacheName(symbol: string, period: string) {
  return `${symbol}-${normalizeHistoryPeriod(period)}.json`;
}

function sanitizeYfinanceHistoryPayload(payload: unknown, fallbackSymbol: string, fallbackPeriod: string) {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    symbol: normalizeSymbol(String(record.symbol ?? fallbackSymbol)),
    period: normalizeHistoryPeriod(record.period ?? fallbackPeriod),
    observations: Number(record.observations ?? 0),
    start_date: String(record.start_date ?? "").trim().slice(0, 24),
    end_date: String(record.end_date ?? "").trim().slice(0, 24),
    first_close: Number(record.first_close),
    last_close: Number(record.last_close),
    close_change_percent: Number(record.close_change_percent),
    max_drawdown_percent: Number(record.max_drawdown_percent),
    realized_volatility_percent: Number(record.realized_volatility_percent),
    average_volume: Number(record.average_volume),
    latest_volume: Number(record.latest_volume),
    latest_volume_ratio: Number(record.latest_volume_ratio),
  };
}

function percentText(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "N/A";
}

function ratioText(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "N/A";
}

function integerText(value: number) {
  return Number.isFinite(value) ? `${Math.trunc(value)}` : "N/A";
}

function formatYfinanceHistory(payload: unknown, fromCache: boolean) {
  const history = sanitizeYfinanceHistoryPayload(payload, "", "");
  if (!history.symbol) return `yfinance history${fromCache ? " cache" : ""}: unavailable`;

  return [
    `yfinance history${fromCache ? " cache" : ""}`,
    history.symbol,
    `period ${history.period}`,
    `observations ${Number.isFinite(history.observations) ? Math.trunc(history.observations) : 0}`,
    `close change ${percentText(history.close_change_percent)}`,
    `max drawdown ${percentText(history.max_drawdown_percent)}`,
    `realized volatility ${percentText(history.realized_volatility_percent)}`,
    `latest volume ratio ${ratioText(history.latest_volume_ratio)}`,
    `average volume ${integerText(history.average_volume)}`,
  ].filter(Boolean).join("; ");
}

async function loadYfinanceQuoteViaPython(symbol: string) {
  const script = String.raw`
import json
import sys

symbol = sys.argv[1]
try:
    import yfinance as yf
    ticker = yf.Ticker(symbol)
    fast = getattr(ticker, "fast_info", {}) or {}
    info = {}
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    def pick(*keys):
        for source in (fast, info):
            for key in keys:
                try:
                    value = source.get(key)
                except AttributeError:
                    value = getattr(source, key, None)
                if value is not None:
                    return value
        return None

    payload = {
        "symbol": symbol.upper(),
        "regularMarketPrice": pick("lastPrice", "regularMarketPrice", "currentPrice"),
        "regularMarketChange": pick("regularMarketChange"),
        "regularMarketChangePercent": pick("regularMarketChangePercent"),
        "regularMarketVolume": pick("lastVolume", "regularMarketVolume", "volume"),
        "currency": pick("currency"),
        "exchange": pick("exchange", "fullExchangeName"),
        "shortName": pick("shortName", "longName"),
    }
    print(json.dumps(payload, ensure_ascii=False))
except Exception as error:
    print(json.dumps({"symbol": symbol.upper(), "error": str(error)}, ensure_ascii=False))
    sys.exit(2)
`;
  const { stdout } = await execFileAsync(
    yfinancePythonExecutable(),
    ["-c", script, symbol],
    {
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout.trim()) as unknown;
}

async function loadYfinanceHistoryViaPython(symbol: string, period: string) {
  const scriptPath = path.join(codeRoot(), "scripts", "research", "yfinance_history_snapshot.py");
  const { stdout } = await execFileAsync(
    yfinancePythonExecutable(),
    [scriptPath, symbol, "--period", period],
    {
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout.trim()) as unknown;
}

function formatNewsSearch(payload: unknown, fromCache: boolean, allowedHosts: string[]) {
  const rawResults =
    (payload as { results?: unknown[] })?.results ??
    (payload as { articles?: unknown[] })?.articles ??
    [];

  const results = rawResults
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? "").trim();
      const url = String(record.url ?? record.link ?? "").trim();
      const source = String(record.source ?? record.publisher ?? "").trim();
      const publishedAt = String(record.published_at ?? record.publishedAt ?? record.date ?? "").trim();
      const snippet = String(record.snippet ?? record.description ?? record.summary ?? "").trim();
      if (!title || !url || !isAllowedNewsUrl(url, allowedHosts)) return [];
      const hostname = new URL(url).hostname;
      return [{ title, url, source, publishedAt, snippet, hostname }];
    })
    .slice(0, 5);

  if (!results.length) {
    return `news_search${fromCache ? " cache" : ""}: no allowed-source results`;
  }

  return [
    `news_search${fromCache ? " cache" : ""}: ${results.length} allowed-source result(s)`,
    ...results.map((item, index) => {
      const meta = [item.source || item.hostname, item.publishedAt, item.hostname].filter(Boolean).join(", ");
      const snippet = item.snippet ? ` - ${item.snippet.slice(0, 180)}` : "";
      return `${index + 1}. ${item.title} (${meta}) ${item.url}${snippet}`;
    }),
  ].join("\n");
}

function sanitizeNewsSearchPayload(payload: unknown, allowedHosts: string[]) {
  const rawResults =
    (payload as { results?: unknown[] })?.results ??
    (payload as { articles?: unknown[] })?.articles ??
    [];

  const results = rawResults.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = redactNewsValue(String(record.title ?? "").trim());
    const url = String(record.url ?? record.link ?? "").trim();
    const source = redactNewsValue(String(record.source ?? record.publisher ?? "").trim());
    const published_at = redactNewsValue(
      String(record.published_at ?? record.publishedAt ?? record.date ?? "").trim(),
    );
    const snippet = redactNewsValue(
      String(record.snippet ?? record.description ?? record.summary ?? "").trim(),
    );
    if (!title || !url || !isAllowedNewsUrl(url, allowedHosts)) return [];
    if (process.env.NEWS_SEARCH_API_KEY && url.includes(process.env.NEWS_SEARCH_API_KEY)) return [];
    return [{ title, url, source, published_at, snippet }];
  });

  return { results };
}

async function executeLongbridgeQuote(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const symbol = normalizeSymbol(call.input?.symbol) || symbolFromContext(context);
  const input = { symbol };

  if (process.env.RESEARCH_ENABLE_EXTERNAL_TOOLS !== "1") {
    return {
      name: "longbridge_quote",
      reason: "Longbridge quote requires explicit external-tool opt-in before cache or network access.",
      input,
      result_summary: `Longbridge quote blocked${symbol ? ` for ${symbol}` : ""}: missing external-tool opt-in`,
    };
  }

  if (!symbol) {
    return {
      name: "longbridge_quote",
      reason: "Longbridge quote requires a ticker symbol from the request or admin watchlist.",
      input,
      result_summary: "Longbridge quote skipped: missing symbol",
    };
  }

  const appKey = process.env.LONGBRIDGE_APP_KEY;
  const appSecret = process.env.LONGBRIDGE_APP_SECRET;
  const accessToken = process.env.LONGBRIDGE_ACCESS_TOKEN;
  if (!appKey || !appSecret || !accessToken) {
    return {
      name: "longbridge_quote",
      reason: "Longbridge quote requires server-side Longbridge credentials.",
      input,
      result_summary: `Longbridge quote skipped for ${symbol}: missing credentials`,
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "longbridge_quote",
    context.day,
    `${symbol}.json`,
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "longbridge_quote",
      reason: "Read Longbridge quote local cache to avoid repeated external market-data requests.",
      input,
      result_summary: formatLongbridgeQuote(cached, true),
    };
  }

  let payload: unknown;
  if (process.env.LONGBRIDGE_QUOTE_FIXTURE_JSON?.trim()) {
    payload = JSON.parse(process.env.LONGBRIDGE_QUOTE_FIXTURE_JSON);
  } else {

    const url = new URL(longbridgeQuoteEndpoint());
    url.searchParams.set("symbol", symbol);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Longbridge-App-Key": appKey,
        "X-Longbridge-App-Secret": appSecret,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        name: "longbridge_quote",
        reason: "Longbridge quote request failed; the trace keeps the failure visible for audit.",
        input,
        result_summary: `Longbridge quote failed for ${symbol}: HTTP ${response.status}`,
      };
    }
    payload = await response.json();
  }

  const sanitized = sanitizeLongbridgeQuotePayload(payload, symbol);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(sanitized, null, 2), "utf8");

  return {
    name: "longbridge_quote",
    reason: "Explicitly enabled Longbridge quote lookup with sanitized local cache.",
    input,
    result_summary: formatLongbridgeQuote(sanitized, false),
  };
}

async function executeAlphaVantageQuote(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const symbol = normalizeSymbol(call.input?.symbol) || symbolFromContext(context);
  const input = { symbol };

  if (!symbol) {
    return {
      name: "alpha_vantage_quote",
      reason: "外部行情工具需要明确标的代码。",
      input,
      result_summary: "Alpha Vantage quote skipped: missing symbol",
    };
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return {
      name: "alpha_vantage_quote",
      reason: "Alpha Vantage 行情工具未配置 API key。",
      input,
      result_summary: `Alpha Vantage quote skipped for ${symbol}: missing API key`,
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "alpha_vantage_quote",
    context.day,
    `${symbol}.json`,
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "alpha_vantage_quote",
      reason: "读取 Alpha Vantage 本地缓存，避免重复消耗免费 API 配额。",
      input,
      result_summary: formatAlphaVantageQuote(cached, true),
    };
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    return {
      name: "alpha_vantage_quote",
      reason: "Alpha Vantage 请求失败，保留工具 trace 供审计。",
      input,
      result_summary: `Alpha Vantage quote failed for ${symbol}: HTTP ${response.status}`,
    };
  }

  const payload = await response.json();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    name: "alpha_vantage_quote",
    reason: "显式启用的 Alpha Vantage 免费行情查询，用于补充机会观察的最新价格上下文。",
    input,
    result_summary: formatAlphaVantageQuote(payload, false),
  };
}

async function executeNewsSearch(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const query = normalizeQuery(call.input?.query) || normalizeQuery(context.adminSymbols[0]);
  const input = { query };

  if (!query) {
    return {
      name: "news_search",
      reason: "External news search requires a query derived from the user question or admin watchlist.",
      input,
      result_summary: "news_search skipped: missing query",
    };
  }

  const endpoint = process.env.NEWS_SEARCH_ENDPOINT;
  const allowedHosts = allowedNewsHosts();
  if (!endpoint || !allowedHosts.length) {
    return {
      name: "news_search",
      reason: "news_search requires NEWS_SEARCH_ENDPOINT and NEWS_SEARCH_ALLOWED_HOSTS.",
      input,
      result_summary: "news_search skipped: missing endpoint or allowed hosts",
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "news_search",
    context.day,
    `${newsSearchCacheKey(query)}.json`,
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "news_search",
      reason: "Read cached news search response to avoid repeated external queries.",
      input,
      result_summary: formatNewsSearch(cached, true, allowedHosts),
    };
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.NEWS_SEARCH_API_KEY) {
    headers.Authorization = `Bearer ${process.env.NEWS_SEARCH_API_KEY}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    return {
      name: "news_search",
      reason: "news_search request failed; the trace keeps the failure visible for audit.",
      input,
      result_summary: `news_search failed for ${query}: HTTP ${response.status}`,
    };
  }

  const payload = sanitizeNewsSearchPayload(await response.json(), allowedHosts);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    name: "news_search",
    reason: "Explicitly enabled external news search with source whitelist and local cache.",
    input,
    result_summary: formatNewsSearch(payload, false, allowedHosts),
  };
}

async function executeYfinanceQuote(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const symbol = normalizeSymbol(call.input?.symbol) || symbolFromContext(context);
  const input = { symbol };

  if (!symbol) {
    return {
      name: "yfinance_quote",
      reason: "yfinance quote requires a ticker symbol from the request or admin watchlist.",
      input,
      result_summary: "yfinance quote skipped: missing symbol",
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "yfinance_quote",
    context.day,
    `${symbol}.json`,
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "yfinance_quote",
      reason: "Read yfinance local cache to avoid repeated Yahoo Finance requests.",
      input,
      result_summary: formatYfinanceQuote(cached, true),
    };
  }

  let payload: unknown;
  if (process.env.YFINANCE_QUOTE_FIXTURE_JSON?.trim()) {
    payload = JSON.parse(process.env.YFINANCE_QUOTE_FIXTURE_JSON);
  } else {
    try {
      payload = await loadYfinanceQuoteViaPython(symbol);
    } catch (error) {
      return {
        name: "yfinance_quote",
        reason: "Local Python yfinance execution failed; keep the failure visible for audit.",
        input,
        result_summary: `yfinance quote failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const sanitized = sanitizeYfinanceQuotePayload(payload, symbol);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(sanitized, null, 2), "utf8");

  return {
    name: "yfinance_quote",
    reason: "Explicitly enabled local Python yfinance quote lookup with sanitized local cache.",
    input,
    result_summary: formatYfinanceQuote(sanitized, false),
  };
}

async function executeYfinanceHistory(
  call: AgentToolCall,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const symbol = normalizeSymbol(call.input?.symbol) || symbolFromContext(context);
  const period = normalizeHistoryPeriod(call.input?.period);
  const input = { symbol, period };

  if (process.env.RESEARCH_ENABLE_EXTERNAL_TOOLS !== "1") {
    return {
      name: "yfinance_history",
      reason: "yfinance history requires explicit external-tool opt-in before cache or network access.",
      input,
      result_summary: `yfinance history blocked${symbol ? ` for ${symbol}` : ""}: missing external-tool opt-in`,
    };
  }

  if (!symbol) {
    return {
      name: "yfinance_history",
      reason: "yfinance history requires a ticker symbol from the request or admin watchlist.",
      input,
      result_summary: "yfinance history skipped: missing symbol",
    };
  }

  const cachePath = path.join(
    workspaceRoot(),
    ".cache",
    "research-tools",
    "yfinance_history",
    context.day,
    yfinanceHistoryCacheName(symbol, period),
  );
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    return {
      name: "yfinance_history",
      reason: "Read yfinance history local cache to avoid repeated Yahoo Finance requests.",
      input,
      result_summary: formatYfinanceHistory(cached, true),
    };
  }

  let payload: unknown;
  try {
    payload = await loadYfinanceHistoryViaPython(symbol, period);
  } catch (error) {
    return {
      name: "yfinance_history",
      reason: "Local Python yfinance history execution failed; keep the failure visible for audit.",
      input,
      result_summary: `yfinance history failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const sanitized = sanitizeYfinanceHistoryPayload(payload, symbol, period);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(sanitized, null, 2), "utf8");

  return {
    name: "yfinance_history",
    reason: "Explicitly enabled local Python yfinance history snapshot with metric-only local cache.",
    input,
    result_summary: formatYfinanceHistory(sanitized, false),
  };
}

export async function executeResearchTool(
  rawCall: ResearchToolPlanItem,
  context: ResearchContextSummary,
): Promise<AgentToolTrace> {
  const call = normalizeResearchToolCall(rawCall);
  const name = call.name as ResearchToolName;

  if (name === "load_structured_summary") {
    return {
      name,
      reason: "读取结构化日报，建立事件、核心理论、风险和管理员标的的上下文。",
      input: { day: context.day },
      result_summary: [
        count("三句话总结", context.eventSummary),
        count("核心理论", context.adminCore),
        count("风险条件", context.risks),
      ].join("; "),
    };
  }

  if (name === "load_opportunity_observation") {
    return {
      name,
      reason: "读取本地机会观察页，保留交易向推演和来源文档线索。",
      input: { day: context.day },
      result_summary: markdownLength(context.opportunityMarkdown),
    };
  }

  if (name === "score_opportunities") {
    const requestedSymbol = normalizeSymbol(call.input?.symbol);
    const scores = buildOpportunityScores(context, requestedSymbol);

    return {
      name,
      reason: "Score local admin watchlist symbols against summary evidence, trigger wording, invalidation context, and liquidity risk.",
      input: requestedSymbol ? { symbol: requestedSymbol } : { day: context.day },
      result_summary: formatOpportunityScores(scores),
    };
  }

  if (name === "longbridge_quote") {
    return executeLongbridgeQuote(call, context);
  }

  if (name === "alpha_vantage_quote") {
    return executeAlphaVantageQuote(call, context);
  }

  if (name === "news_search") {
    return executeNewsSearch(call, context);
  }

  if (name === "yfinance_history") {
    return executeYfinanceHistory(call, context);
  }

  if (name === "yfinance_quote") {
    return executeYfinanceQuote(call, context);
  }

  return {
    name: "extract_watchlist",
    reason: "抽取管理员重点标的，避免普通用户热度污染交易观察。",
    input: { day: context.day },
    result_summary: context.adminSymbols.length
      ? context.adminSymbols.slice(0, 8).join(" | ")
      : "暂无管理员重点标的",
  };
}
