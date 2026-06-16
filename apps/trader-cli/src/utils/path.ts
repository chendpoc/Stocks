/** Strip leading slash so ky prefix + path joins correctly. */
export function normalizePath(pathValue: string): string {
  return pathValue.startsWith("/") ? pathValue.slice(1) : pathValue;
}
