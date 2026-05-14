import React from 'react';
import { WifiOff, Loader, UploadCloud } from 'lucide-react';

// ── Props ─────────────────────────────────────────────────────────────────────

interface OfflineBannerProps {
  pendingCount: number;
  syncing: boolean;
  onSync: () => void;
  syncResult: { synced: number; errors: Array<{ op: string; message: string }> } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OfflineBanner({ pendingCount, syncing, onSync, syncResult }: OfflineBannerProps) {
  return (
    <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex flex-wrap items-center gap-3">
      <WifiOff size={16} className="text-orange-600 shrink-0" />
      <span className="text-sm font-semibold text-orange-800 flex-1">
        Sin conexión
        {pendingCount > 0 && ` · ${pendingCount} operación${pendingCount !== 1 ? 'es' : ''} pendiente${pendingCount !== 1 ? 's' : ''}`}
      </span>
      {pendingCount > 0 && navigator.onLine && (
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white text-xs font-bold rounded-lg transition"
        >
          {syncing ? <Loader size={12} className="animate-spin" /> : <UploadCloud size={12} />}
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
      {syncResult && syncResult.synced > 0 && (
        <span className="text-xs text-emerald-700 font-semibold">
          ✓ {syncResult.synced} sincronizada{syncResult.synced !== 1 ? 's' : ''}
        </span>
      )}
      {syncResult && syncResult.errors.length > 0 && (
        <span className="text-xs text-red-600 font-semibold">
          {syncResult.errors.length} error{syncResult.errors.length !== 1 ? 'es' : ''}
        </span>
      )}
    </div>
  );
}
