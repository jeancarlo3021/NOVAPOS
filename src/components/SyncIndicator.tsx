import { Wifi, WifiOff } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export function SyncIndicator() {
  const { isOnline } = useOfflineSync();

  return (
    <div
      className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg flex items-center gap-3 transition z-40 ${
        isOnline
          ? 'bg-green-100 text-green-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={20} />
          <span className="text-sm font-semibold">En línea</span>
        </>
      ) : (
        <>
          <WifiOff size={20} />
          <span className="text-sm font-semibold">Sin conexión</span>
        </>
      )}
    </div>
  );
}