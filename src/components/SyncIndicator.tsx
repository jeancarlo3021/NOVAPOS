import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export function SyncIndicator() {
  const { isOnline, syncStatus } = useOfflineSync();

  return (
    <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg flex items-center gap-2 ${
      isOnline ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      {isOnline ? (
        <>
          <Wifi size={20} />
          <span className="text-sm font-semibold">Conectado</span>
        </>
      ) : (
        <>
          <WifiOff size={20} />
          <span className="text-sm font-semibold">Offline</span>
        </>
      )}
      
      {syncStatus.pending > 0 && (
        <div className="ml-2 flex items-center gap-1">
          {syncStatus.isSyncing && <RefreshCw size={16} className="animate-spin" />}
          <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
            {syncStatus.pending}
          </span>
        </div>
      )}
    </div>
  );
}