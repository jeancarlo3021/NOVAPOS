import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertCircle, CheckCircle, X, DollarSign, LockKeyhole, RefreshCw, Ban } from 'lucide-react';
import { CashSession } from '@/types/Types_POS';

interface POSHeaderProps {
  error: string;
  success: string;
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  productsCached: boolean;
  currentSession: CashSession | null;
  onClearError: () => void;
  onClearSuccess: () => void;
  onOpenCash: () => void;
  onCloseCash: () => void;
  onVoidInvoice?: () => void;
  onSync?: () => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({
  error,
  success,
  isOnline,
  pendingCount,
  syncing,
  productsCached,
  currentSession,
  onClearError,
  onClearSuccess,
  onOpenCash,
  onCloseCash,
  onVoidInvoice,
  onSync,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg transition font-medium text-sm min-h-10"
          title="Volver al menú principal"
        >
          <Home size={18} />
          <span className="hidden sm:inline">Menú</span>
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <DollarSign size={16} className="text-white" />
          </div>
          <h1 className="text-gray-900 font-bold text-lg hidden md:block">NovaPOS</h1>
        </div>

        {/* Divider */}
        <div className="hidden md:block h-6 w-px bg-gray-200" />

        {/* Cash session */}
        <div className="flex-1 flex justify-center">
          {currentSession ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-700 text-sm font-semibold">Caja abierta</span>
                <span className="text-emerald-600 text-sm font-medium">
                  ₡{currentSession.opening_amount?.toLocaleString()}
                </span>
              </div>
              <button
                onClick={onCloseCash}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-sm font-semibold px-3 py-2 rounded-lg transition min-h-10"
              >
                <LockKeyhole size={15} />
                Cerrar caja
              </button>
              {onVoidInvoice && (
                <button
                  onClick={onVoidInvoice}
                  className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-sm font-semibold px-3 py-2 rounded-lg transition min-h-10"
                  title="Anular factura"
                >
                  <Ban size={15} />
                  <span className="hidden sm:inline">Anular</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenCash}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg transition text-sm min-h-10"
            >
              <DollarSign size={16} />
              Abrir caja
            </button>
          )}
        </div>
      </div>

      {/* Status / alert bar */}
      <div className="mt-2 flex flex-col gap-1">
        {/* Connectivity + cache indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-2 py-1 rounded-lg">
              Sin conexión
            </span>
          )}
          {productsCached && (
            <span className="inline-flex items-center gap-1 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold px-2 py-1 rounded-lg">
              Productos en caché
            </span>
          )}
          {pendingCount > 0 && (
            <button
              onClick={onSync}
              disabled={!isOnline || syncing}
              className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {/* Error / success toasts */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} />
            <span className="flex-1">{error}</span>
            <button onClick={onClearError}><X size={15} /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
            <CheckCircle size={15} />
            <span className="flex-1">{success}</span>
            <button onClick={onClearSuccess}><X size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );
};
