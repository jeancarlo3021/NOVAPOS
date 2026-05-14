import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSafeFetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  /**
   * When `key` changes, the fetch re-executes automatically.
   * Use this to pass values like `tenantId` that are resolved asynchronously
   * so the fetch re-runs once they become available.
   */
  key?: unknown;
}

interface UseSafeFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
}

export function useSafeFetch<T>(
  fetchFn: () => Promise<T>,
  options: UseSafeFetchOptions = {}
): UseSafeFetchState<T> {
  const { timeout = 10000, retries = 2, retryDelay = 1000, key } = options;

  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);
  // Always keep the latest fetchFn — avoids stale-closure issues
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const execute = useCallback(async () => {
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);
    retryCountRef.current = 0;

    const doFetch = async (): Promise<void> => {
      if (!isMountedRef.current) return;

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await fetchFnRef.current();
        clearTimeout(timeoutId);
        if (isMountedRef.current) {
          setData(result ?? null);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (!isMountedRef.current) return;

        const msg = err instanceof Error ? err.message : 'Error desconocido';

        if (
          (msg.includes('timeout') || msg.includes('abort')) &&
          retryCountRef.current < retries
        ) {
          retryCountRef.current++;
          setTimeout(doFetch, retryDelay);
        } else {
          setError(msg);
          setLoading(false);
        }
      }
    };

    await doFetch();
  }, [timeout, retries, retryDelay]); // stable — fetchFn read via ref

  // Re-execute whenever `key` changes (e.g., tenantId resolves from null → real value)
  useEffect(() => {
    isMountedRef.current = true;
    execute();
    return () => {
      isMountedRef.current = false;
    };
  }, [execute, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(async () => {
    await execute();
  }, [execute]);

  return { data, loading, error, retry };
}
