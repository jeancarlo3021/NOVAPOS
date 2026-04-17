import React from 'react';
import { Settings } from 'lucide-react';
import { CashSession } from '@/types/Types_POS';

interface POSSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentSession: CashSession | null;
  user: any;
  isOnline: boolean;
  pendingCount: number;
  onOpenCash: () => void;
  onCloseCash: () => void;
  onShowOriginalSidebar: () => void;
}



export const POSSidebar: React.FC<POSSidebarProps> = ({
  sidebarOpen,
  currentSession,
  user,
  isOnline,
  onOpenCash,
  onCloseCash,
  onShowOriginalSidebar,
}) => {
  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800 flex flex-col shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white">POS System</h2>
      </div>

      {/* Session Info */}
      <div className="p-4 border-b border-slate-800">
        {currentSession ? (
          <div className="bg-green-900/30 border border-green-700 rounded p-3">
            <p className="text-sm text-green-400">✅ Caja Abierta</p>
            <p className="text-xs text-slate-400 mt-1">
              ${currentSession.opening_amount?.toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3">
            <p className="text-sm text-yellow-400">⚠️ Sin Caja</p>
            <button
              onClick={onOpenCash}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded transition"
            >
              Abrir Caja
            </button>
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-slate-800">
        <p className="text-sm text-slate-300">Usuario:</p>
        <p className="text-xs text-slate-500">{user?.email}</p>
      </div>

      {/* Status */}
      <div className="p-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span className="text-xs text-slate-400">
          {isOnline ? 'En línea' : 'Sin conexión'}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1"></div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-800 space-y-2">
        {currentSession && (
          <button
            onClick={onCloseCash}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded transition"
          >
            Cerrar Caja
          </button>
        )}
        <button
          onClick={onShowOriginalSidebar}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded transition flex items-center justify-center gap-2"
        >
          <Settings size={16} />
          Configuración
        </button>
      </div>
    </aside>
  );
};