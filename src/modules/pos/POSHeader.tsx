import React from 'react';
import { AlertCircle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

interface POSHeaderProps {
  sessionError: string | null;
  error: string;
  success: string;
  isOnline: boolean;
  pendingCount: number;
  onClearSessionError: () => void;
  onClearError: () => void;
  onClearSuccess: () => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({
  sessionError,
  error,
  success,
  isOnline,
  onClearSessionError,
  onClearError,
  onClearSuccess,
}) => {
  return (
    <div className="bg-slate-900 border-b border-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Sistema POS</h1>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={20} className="text-green-500" />
            ) : (
              <WifiOff size={20} className="text-red-500" />
            )}
            <span className="text-sm text-slate-400">
              {isOnline ? 'En línea' : 'Sin conexión'}
            </span>
          </div>
        </div>

        {/* Alerts */}
        <div className="flex gap-2">
          {sessionError && (
            <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 flex items-center gap-2">
              <AlertCircle size={18} className="text-red-400" />
              <span className="text-sm text-red-400">{sessionError}</span>
              <button
                onClick={onClearSessionError}
                className="ml-2 text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 flex items-center gap-2">
              <AlertCircle size={18} className="text-red-400" />
              <span className="text-sm text-red-400">{error}</span>
              <button
                onClick={onClearError}
                className="ml-2 text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-700 rounded px-3 py-2 flex items-center gap-2">
              <CheckCircle size={18} className="text-green-400" />
              <span className="text-sm text-green-400">{success}</span>
              <button
                onClick={onClearSuccess}
                className="ml-2 text-green-400 hover:text-green-300"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};