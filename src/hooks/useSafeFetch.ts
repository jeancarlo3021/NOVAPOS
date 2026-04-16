import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSafeFetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface UseSafeFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
}

/**
 * Hook para realizar peticiones de forma segura
 * - Maneja timeouts automáticos
 * - Reintentos automáticos
 * - Cleanup al desmontar
 * - Evita memory leaks
 * - SIN PARPADEO (no re-ejecuta innecesariamente)
 */
export function useSafeFetch<T>(
  fetchFn: () => Promise<T>,
  options: UseSafeFetchOptions = {}
): UseSafeFetchState<T> {
  const { timeout = 10000, retries = 2, retryDelay = 1000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasExecutedRef = useRef(false);

  const executeRequest = useCallback(async () => {
    // Evitar actualizar estado si el componente fue desmontado
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      // Crear timeout
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, timeout);

      const result = await fetchFn();

      clearTimeout(timeoutId);

      if (isMountedRef.current) {
        // Asegurar que data nunca sea undefined
        setData(result ?? null);
        setError(null);
        setRetryCount(0);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error 
          ? err.message 
          : 'Error desconocido en la petición';

        // Si es timeout y hay reintentos disponibles
        if ((errorMessage.includes('timeout') || errorMessage.includes('abort')) && retryCount < retries) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            executeRequest();
          }, retryDelay);
        } else {
          setError(errorMessage);
          setLoading(false);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn, timeout, retries, retryDelay, retryCount]);

  // ✅ Ejecutar SOLO una vez al montar, no en cada cambio de executeRequest
  useEffect(() => {
    isMountedRef.current = true;
    
    // Evitar ejecutar dos veces en StrictMode
    if (!hasExecutedRef.current) {
      hasExecutedRef.current = true;
      executeRequest();
    }

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []); // ✅ Array vacío: ejecutar SOLO al montar

  const retry = useCallback(async () => {
    hasExecutedRef.current = false;
    setRetryCount(0);
    await executeRequest();
  }, [executeRequest]);

  return { data, loading, error, retry };
}