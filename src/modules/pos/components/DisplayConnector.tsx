import React from 'react';
import { Monitor, MonitorOff, AlertCircle } from 'lucide-react';
import { useDisplay } from '@/context/CustomerDisplayContext';

export const DisplayConnector: React.FC = () => {
  const { isConnected, error, connect, disconnect } = useDisplay();

  return (
    <div className="flex items-center gap-2">
      {error && (
        <div className="hidden md:flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-2 py-1 rounded-lg">
          <AlertCircle size={12} />
          <span className="max-w-48 truncate" title={error}>{error}</span>
        </div>
      )}

      {!isConnected ? (
        <button
          onClick={connect}
          className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-semibold px-3 py-2 rounded-lg transition min-h-10"
          title="Activar pantalla del cliente"
          type="button"
        >
          <MonitorOff size={15} />
          <span className="hidden sm:inline">LCD</span>
        </button>
      ) : (
        <button
          onClick={disconnect}
          className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-sm font-semibold px-3 py-2 rounded-lg transition min-h-10"
          title="LCD del cliente conectado · click para desconectar"
          type="button"
        >
          <Monitor size={15} className="text-emerald-600" />
          <span className="hidden sm:inline">LCD ●</span>
        </button>
      )}
    </div>
  );
};
