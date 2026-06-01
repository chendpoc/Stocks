import { filterSymbolChoices } from "./symbolSearch.js";
import { PREFERRED_SYMBOLS } from "../symbols.js";

export { PREFERRED_SYMBOLS, MVP_SYMBOLS } from "../symbols.js";

export const SLASH_COMMANDS = [
  "/scan",
  "/help",
  "/lessons",
  "/analyze SYMBOL",
  "/report SYMBOL",
  "/quit",
];

export function getChatSuggestions(query: string): string[] {
  const raw = query.trim();
  if (!raw) {
    return [...SLASH_COMMANDS.slice(0, 4), ...PREFERRED_SYMBOLS.slice(0, 4)];
  }

  const lower = raw.toLowerCase();

  if (raw.startsWith("/")) {
    return SLASH_COMMANDS.filter((cmd) => cmd.toLowerCase().startsWith(lower));
  }

  const symbols = filterSymbolChoices(raw);
  const cmdHits = SLASH_COMMANDS.filter((cmd) => cmd.toLowerCase().includes(lower));
  const merged = [...cmdHits, ...symbols];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}
