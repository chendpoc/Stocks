import { PREFERRED_SYMBOLS } from "../symbols.js";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeTicker(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!TICKER_RE.test(s)) return null;
  return s;
}

/** 偏好列表前缀匹配 + 输入作为自定义候选（合法 ticker 时） */
export function filterSymbolChoices(query: string): string[] {
  const q = query.trim().toUpperCase();
  if (!q) return [...PREFERRED_SYMBOLS];

  const fromMvp = PREFERRED_SYMBOLS.filter((s) => s.startsWith(q));
  const seen = new Set(fromMvp);
  const out: string[] = [];

  if (TICKER_RE.test(q) && !seen.has(q)) {
    out.push(q);
    seen.add(q);
  }
  for (const s of fromMvp) {
    out.push(s);
  }
  return out.slice(0, 10);
}
