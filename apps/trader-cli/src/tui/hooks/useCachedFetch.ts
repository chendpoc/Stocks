import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIntel } from "../../api/client.js";

const cache = new Map<string, unknown>();

/**
 * 会话内缓存：仅在无缓存且页面激活时拉取一次；[r] / reload(true) 强制刷新。
 */
export function useCachedFetch<T>(
  path: string,
  isActive: boolean,
  loadingLabel = "加载数据",
) {
  const [data, setData] = useState<T | null>(() => {
    const hit = cache.get(path);
    return hit != null ? (hit as T) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const triedRef = useRef(cache.has(path));

  const reload = useCallback(
    async (force = false) => {
      if (!force && cache.has(path)) {
        setData(cache.get(path) as T);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await fetchIntel(path);
        cache.set(path, result);
        setData(result as T);
        triedRef.current = true;
      } catch (e: unknown) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    if (!isActive) return;
    if (cache.has(path)) {
      setData(cache.get(path) as T);
      return;
    }
    if (!triedRef.current) {
      triedRef.current = true;
      void reload(false);
    }
  }, [isActive, path, reload]);

  return {
    data,
    error,
    loading,
    loadingLabel,
    /** @param force 为 true 时忽略缓存强制请求 */
    reload: (force = false) => reload(force),
    hasCache: cache.has(path),
  };
}
