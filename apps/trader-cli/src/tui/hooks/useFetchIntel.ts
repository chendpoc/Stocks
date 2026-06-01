import { useCallback, useEffect, useState } from "react";
import { fetchIntel } from "../../api/client.js";

export function useFetchIntel<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIntel(path);
      setData(result as T);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [path, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
