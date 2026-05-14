import { useState, useEffect, useCallback } from 'react';
import { promotionsService, type Promotion } from '@/services/promotions/promotionsService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';

/** Custom event dispatched whenever the active-promotions cache changes. */
export const PROMOTIONS_UPDATED_EVENT = 'novapos:promotions-updated';

/** Call this after any create/update/toggle/delete that affects active promotions. */
export function notifyPromotionsUpdated() {
  window.dispatchEvent(new CustomEvent(PROMOTIONS_UPDATED_EVENT));
}

export function usePOSPromotions(tenantId: string | null | undefined): Promotion[] {
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  const applyCache = useCallback((tid: string) => {
    const ck = cacheKey(tid, 'active_promotions');
    const cached = cacheGet<Promotion[]>(ck);
    if (cached !== null) setPromotions(cached);
  }, []);

  const fetchAndCache = useCallback((tid: string) => {
    const ck = cacheKey(tid, 'active_promotions');
    promotionsService.getActiveToday(tid)
      .then(data => { setPromotions(data); cacheSet(ck, data); })
      .catch(() => {}); // keep cached value on error
  }, []);

  // On mount / tenantId change: load from cache then fetch if online
  useEffect(() => {
    if (!tenantId) return;
    applyCache(tenantId);
    if (navigator.onLine) fetchAndCache(tenantId);
  }, [tenantId, applyCache, fetchAndCache]);

  // Re-sync when promotions are created/edited/toggled anywhere in the app
  useEffect(() => {
    if (!tenantId) return;
    const handler = () => {
      applyCache(tenantId);                        // always read cache
      if (navigator.onLine) fetchAndCache(tenantId); // and re-fetch if online
    };
    window.addEventListener(PROMOTIONS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(PROMOTIONS_UPDATED_EVENT, handler);
  }, [tenantId, applyCache, fetchAndCache]);

  // Re-fetch when connection restores
  useEffect(() => {
    if (!tenantId) return;
    const onOnline = () => fetchAndCache(tenantId);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tenantId, fetchAndCache]);

  return promotions;
}

