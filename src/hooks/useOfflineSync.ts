import { useEffect, useState, useCallback } from 'react';
import { offlineSyncService } from '@/services/offlineSyncService';
import { purchasesOfflineService } from '@/services/Inventory/purchasesOfflineService';
import { cashSessionOfflineService } from '@/services/cashManagement/cashSessionOfflineService';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { posOfflineService } from '@/services/pos/posOfflineService';
import { invoicesService } from '@/services/invoice/invoiceService';
import { offlineQueue } from '@/services/offlineQueue';
import { apiFetch } from '@/lib/api';
import { useTenantId } from './useTenant';

interface SyncStatus {
  pending: number;
  lastSync: string | null;
  isSyncing: boolean;
  error: string | null;
}

export function useOfflineSync() {
  const { tenantId } = useTenantId();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pending: 0,
    lastSync: null,
    isSyncing: false,
    error: null,
  });

  // Obtener estado de sincronización
  const updateSyncStatus = useCallback(async () => {
    try {
      const [genericStatus, purchasesCount, cashSessionCount, invoicesCount, voidsCount] = await Promise.all([
        offlineSyncService.getSyncStatus(),
        tenantId ? purchasesOfflineService.getPendingCount(tenantId) : Promise.resolve(0),
        cashSessionOfflineService.getPendingCount(),
        posOfflineService.getPendingCount(),
        posOfflineService.getPendingVoidCount(),
      ]);
      setSyncStatus((prev) => ({
        ...prev,
        pending: genericStatus.pending + purchasesCount + cashSessionCount + invoicesCount + voidsCount,
        lastSync: genericStatus.lastSync,
        error: null,
      }));
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }));
    }
  }, [tenantId]);

  // Sincronizar operaciones (caja primero, luego otros)
  const sync = useCallback(async () => {
    setSyncStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      const sessionIdMappings: Record<string, string> = {};

      const cashSessionSyncFn = async (op: any) => {
        if (op.type === 'open') {
          const newSession = await cashSessionService.createCashSession(op.data);
          // Track mapping from offline ID to server ID
          if (op.id && newSession?.id && op.id !== newSession.id) {
            sessionIdMappings[op.id] = newSession.id;
            await posOfflineService.remapSessionId(op.id, newSession.id);
            await posOfflineService.updateInvoiceSessionIds(op.id, newSession.id);
          }
          return newSession;
        } else if (op.type === 'close') {
          // Use mapped session ID if available
          const closeData = { ...op.data, id: sessionIdMappings[op.data.id] ?? op.data.id };
          return await cashSessionService.closeCashSession(closeData);
        }
      };

      // Sync cash sessions first (invoices depend on this)
      const cashSessionResult = await cashSessionOfflineService.syncAll(cashSessionSyncFn);

      // Then sync everything else in parallel
      const [genericResult, purchasesResult, queueResult, voidsResult] = await Promise.all([
        offlineSyncService.syncOperations(),
        tenantId ? purchasesOfflineService.syncAll(tenantId) : Promise.resolve({ synced: 0, errors: [] }),
        offlineQueue.syncAll(apiFetch),
        posOfflineService.syncPendingVoids((invoiceId) => invoicesService.cancelInvoice(invoiceId)),
      ]);

      const totalErrors = [...(genericResult.errors || []), ...(purchasesResult.errors || []), ...(voidsResult.details || [])];
      const totalSynced = (genericResult.synced || 0) + (purchasesResult.synced || 0) + (cashSessionResult.synced || 0) + (queueResult.synced || 0) + (voidsResult.synced || 0);

      // Update sync status
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSync: new Date().toISOString(),
        error: totalErrors.length > 0 ? JSON.stringify(totalErrors) : null,
      }));

      // Refresh pending count to ensure it's accurate
      await updateSyncStatus();

      return { synced: totalSynced, errors: totalErrors };
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Error en sincronización',
      }));
      throw error;
    }
  }, [tenantId]);

  // Escuchar cambios de conexión
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updateSyncStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync, updateSyncStatus]);

  return {
    isOnline,
    syncStatus,
    sync,
    updateSyncStatus,
  };
}