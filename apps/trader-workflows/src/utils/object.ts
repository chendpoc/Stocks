export function filterUndefined(
  params?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | boolean> = {};
  let hasEntries = false;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    result[key] = value;
    hasEntries = true;
  }
  return hasEntries ? result : undefined;
}
