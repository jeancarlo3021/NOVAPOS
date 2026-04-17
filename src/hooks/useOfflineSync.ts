import { useEffect, useState, useCallback } from 'react';
import { offlineSyncService } from '@/services/offlineSyncService';

interface SyncStatus {
  pending: number;
  lastSync: string | null;
  isSyncing: boolean;
  error: string | null;
}

export function useOfflineSync() {
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
      const status = await offlineSyncService.getSyncStatus();
      setSyncStatus((prev) => ({
        ...prev,
        pending: status.pending,
        lastSync: status.lastSync,
        error: null,
      }));
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }));
    }
  }, []);

  // Sincronizar operaciones
  const sync = useCallback(async () => {
    setSyncStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      const result = await offlineSyncService.syncOperations();
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        pending: 0,
        lastSync: new Date().toISOString(),
        error: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      }));
      return result;
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Error en sincronización',
      }));
      throw error;
    }
  }, []);

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