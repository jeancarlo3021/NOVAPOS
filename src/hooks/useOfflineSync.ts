import { useEffect, useState } from 'react';
import { offlineSyncService } from '@/services/offlineSyncService';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState({ pending: 0, lastSync: null });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      try {
        const result = await offlineSyncService.syncOperations();
        console.log('Sincronización completada:', result);
        setSyncStatus(await offlineSyncService.getSyncStatus());
      } catch (error) {
        console.error('Error en sincronización:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, syncStatus, isSyncing };
}
