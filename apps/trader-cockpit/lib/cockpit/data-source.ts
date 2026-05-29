export type CockpitDataSource = "mock" | "real";

export const DATA_SOURCE_STORAGE_KEY = "trader-cockpit.dataSource";

export function readStoredDataSource(): CockpitDataSource {
  if (typeof window === "undefined") {
    return "mock";
  }

  const stored = window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
  if (stored === "real" || stored === "mock") {
    return stored;
  }

  if (process.env.NEXT_PUBLIC_COCKPIT_REAL_ADAPTER === "1") {
    return "real";
  }

  return "mock";
}

export function storeDataSource(source: CockpitDataSource) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, source);
  }
}
