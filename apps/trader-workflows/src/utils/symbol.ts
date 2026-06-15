/** Uppercase ticker and drop market suffix (.US, .HK, etc.). */
export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(US|HK|SH|SZ|SG)$/i, "");
}
