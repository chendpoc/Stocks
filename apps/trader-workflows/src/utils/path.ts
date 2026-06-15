/** Strip leading slash so ky prefix + path joins correctly. */
export function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
