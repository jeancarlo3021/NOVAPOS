import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertCircle, CheckCircle, X, DollarSign, LockKeyhole, RefreshCw, Ban, ArrowDownCircle, ArrowUpCircle, Printer, Inbox } from 'lucide-react';
import { CashSession } from '@/types/Types_POS';

interface POSHeaderProps {
  error: string;
  success: string;
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  productsCached: boolean;
  productsCachedAt?: Date | null;
  currentSession: CashSession | null;
  onClearError: () => void;
  onClearSuccess: () => void;
  onOpenCash: () => void;
  onCloseCash: () => void;
  onVoidInvoice?: () => void;
  onReprintInvoice?: () => void;
  onSync?: () => void;
  onCashIn?: () => void;
  onCashOut?: () => void;
  onOpenDrawer?: () => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({
  error,
  success,
  isOnline,
  pendingCount,
  syncing,
  productsCached,
  productsCachedAt,
  currentSession,
  onClearError,
  onClearSuccess,
  onOpenCash,
  onCloseCash,
  onVoidInvoice,
  onReprintInvoice,
  onSync,
  onCashIn,
  onCashOut,
  onOpenDrawer,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Back - siempre habilitado */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 rounded-lg transition font-semibold text-sm min-h-10 shadow-sm"
          title="Volver al menú principal"
          type="button"
        >
          <Home size={18} />
          <span className="hidden sm:inline">Menú</span>
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <DollarSign size={16} className="text-white" />
          </div>
          <h1 className="text-gray-900 font-bold text-lg hidden md:block">ColònClick</h1>
        </div>

        {/* Divider */}
        <div className="hidden md:block h-6 w-px bg-gray-200" />

        {/* Reimprimir factura — siempre disponible, no requiere sesión abierta */}
        {onReprintInvoice && (
          <button
            onClick={onReprintInvoice}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-semibold px-3 py-2 rounded-lg transition min-h-10"
            title="Reimprimir factura"
          >
            <Printer size={15} />
            <span className="hidden lg:inline">Reimprimir</span>
          </button>
        )}

        {/* Cash session */}
        <div className="flex-1 flex justify-center min-w-full sm:min-w-0 mt-2 sm:mt-0">
          {currentSession && currentSession.status === 'open' ? (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 min-h-10">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-700 text-sm font-semibold">Caja abierta</span>
                <span className="text-emerald-600 text-sm font-medium hidden sm:inline">
                  ₡{currentSession.opening_amount?.toLocaleString()}
                </span>
              </div>
              {onCashIn && (
                <button
                  onClick={onCashIn}
                  className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 text-emerald-700 text-sm pointer-coarse:text-xs font-semibold px-3 py-2.5 pointer-coarse:px-2 pointer-coarse:py-1.5 rounded-lg transition min-h-11 pointer-coarse:min-h-9"
                  title="Entrada de efectivo"
                >
                  <ArrowDownCircle size={17} />
                  <span className="hidden sm:inline">Entrada</span>
                </button>
              )}
              {onCashOut && (
                <button
                  onClick={onCashOut}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 text-sm pointer-coarse:text-xs font-semibold px-3 py-2.5 pointer-coarse:px-2 pointer-coarse:py-1.5 rounded-lg transition min-h-11 pointer-coarse:min-h-9"
                  title="Salida de efectivo"
                >
                  <ArrowUpCircle size={17} />
                  <span className="hidden sm:inline">Salida</span>
                </button>
              )}
              {onOpenDrawer && (
                <button
                  onClick={onOpenDrawer}
                  className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 text-sm pointer-coarse:text-xs font-semibold px-3 py-2.5 pointer-coarse:px-2 pointer-coarse:py-1.5 rounded-lg transition min-h-11 pointer-coarse:min-h-9"
                  title="Abrir cajón de dinero"
                >
                  <Inbox size={17} />
                  <span className="hidden sm:inline">Cajón</span>
                </button>
              )}
              <button
                onClick={onCloseCash}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 text-red-700 text-sm pointer-coarse:text-xs font-semibold px-3 py-2.5 pointer-coarse:px-2 pointer-coarse:py-1.5 rounded-lg transition min-h-11 pointer-coarse:min-h-9"
              >
                <LockKeyhole size={17} />
                <span className="hidden sm:inline">Cerrar caja</span>
              </button>
              {onVoidInvoice && (
                <button
                  onClick={onVoidInvoice}
                  className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 border border-orange-200 text-orange-700 text-sm pointer-coarse:text-xs font-semibold px-3 py-2.5 pointer-coarse:px-2 pointer-coarse:py-1.5 rounded-lg transition min-h-11 pointer-coarse:min-h-9"
                  title="Anular factura"
                >
                  <Ban size={17} />
                  <span className="hidden sm:inline">Anular</span>
                </button>
              )}
            </div>
          ) : currentSession && currentSession.status === 'closed' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2">
                <span className="w-2 h-2 bg-gray-500 rounded-full" />
                <span className="text-gray-700 text-sm font-semibold">Caja cerrada</span>
              </div>
              <button
                onClick={onOpenCash}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg transition text-sm min-h-10"
              >
                <DollarSign size={16} />
                Abrir nueva caja
              </button>
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
            <span className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold px-2 py-1 rounded-lg">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse shrink-0" />
              Caché
              {productsCachedAt && (
                <span className="font-normal text-sky-500">
                  · {productsCachedAt.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
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
