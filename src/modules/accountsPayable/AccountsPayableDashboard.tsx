'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Wallet, Clock, AlertTriangle, CheckCircle2,
  RefreshCw, Filter, ChevronDown, Truck, Calendar,
  CreditCard, X, Loader, Search, WifiOff, UploadCloud,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import {
  accountsPayableService,
  type AccountPayable, type APStatus,
} from '@/services/accountsPayable/accountsPayableService';
import { apOfflineService } from '@/services/accountsPayable/apOfflineService';
import { StatusBadge } from './components/StatusBadge';
import { KPI } from './components/KPI';
import { PaymentModal } from './components/PaymentModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' });

// ── Main dashboard ────────────────────────────────────────────────────────────

export const AccountsPayableDashboard: React.FC = () => {
  const { tenantId } = useTenantId();

  const [items, setItems]                 = useState<AccountPayable[]>([]);
  const [loading, setLoading]             = useState(true);
  const [fromCache, setFromCache]         = useState(false);
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [pendingCount, setPendingCount]   = useState(0);
  const [syncing, setSyncing]             = useState(false);
  const [syncResult, setSyncResult]       = useState<{ synced: number; errors: Array<{ op: string; message: string }> } | null>(null);
  const [filterStatus, setFilterStatus]   = useState<APStatus | ''>('');
  const [search, setSearch]               = useState('');
  const [payingAP, setPayingAP]           = useState<AccountPayable | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [error, setError]                 = useState('');
  const syncRef = useRef(false);

  const loadAP = useCallback(async (tid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      if (navigator.onLine) {
        const data = await accountsPayableService.getAll(tid);
        await apOfflineService.cacheAP(tid, data);
        setItems(data);
        setFromCache(false);
      } else {
        const merged = await apOfflineService.getMergedAP(tid);
        setItems(merged as AccountPayable[]);
        setFromCache(true);
      }
    } catch {
      const merged = await apOfflineService.getMergedAP(tid);
      setItems(merged as AccountPayable[]);
      setFromCache(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshPendingCount = useCallback(async (tid: string) => {
    const count = await apOfflineService.getPendingCount(tid);
    setPendingCount(count);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadAP(tenantId);
    refreshPendingCount(tenantId);
  }, [tenantId]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (!tenantId || syncRef.current) return;
      const count = await apOfflineService.getPendingCount(tenantId);
      if (count > 0) handleSync();
      else loadAP(tenantId, true);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenantId]);

  const handleSync = useCallback(async () => {
    if (!tenantId || syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await apOfflineService.syncAll(tenantId);
      setSyncResult(result);
      await loadAP(tenantId);
      await refreshPendingCount(tenantId);
    } finally {
      setSyncing(false);
      syncRef.current = false;
    }
  }, [tenantId, loadAP, refreshPendingCount]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta cuenta por pagar?')) return;
    setDeleteLoading(id);
    try {
      await accountsPayableService.delete(id);
      if (tenantId) await loadAP(tenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeleteLoading(null);
    }
  }, [tenantId, loadAP]);

  const filtered = items.filter(ap => {
    const matchStatus = !filterStatus || ap.status === filterStatus;
    const matchSearch = !search.trim() ||
      ap.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
      ap.purchase_number.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const summary = accountsPayableService.getSummary(items);

  const daysUntil = (due: string) =>
    Math.ceil((new Date(due + 'T00:00:00').getTime() - new Date().getTime()) / 86400000);

  return (
    <div className="space-y-0 max-w-7xl mx-auto">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Cuentas por Pagar</h1>
            <p className="text-gray-400 text-sm">
              Pagos pendientes a proveedores con crédito
              {fromCache && <span className="ml-2 text-orange-500 text-xs">· desde caché</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Offline banner */}
        {(!isOnline || pendingCount > 0) && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex flex-wrap items-center gap-3">
            <WifiOff size={16} className="text-orange-600 shrink-0" />
            <span className="text-sm font-semibold text-orange-800 flex-1">
              Sin conexión
              {pendingCount > 0 && ` · ${pendingCount} pago${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} de sincronizar`}
            </span>
            {pendingCount > 0 && navigator.onLine && (
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white text-xs font-bold rounded-lg transition">
                {syncing ? <Loader size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
            {syncResult && syncResult.synced > 0 && (
              <span className="text-xs text-emerald-700 font-semibold">✓ {syncResult.synced} sincronizado{syncResult.synced !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex justify-between">
            {error}
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI icon={Wallet}       label="Total pendiente"  value={fmt(summary.totalPending)}  color="bg-amber-500"   sub={`${summary.countPending} cuenta${summary.countPending !== 1 ? 's' : ''}`} />
          <KPI icon={AlertTriangle} label="Vencido"         value={fmt(summary.totalOverdue)}  color="bg-red-500"    sub={`${summary.countOverdue} cuenta${summary.countOverdue !== 1 ? 's' : ''}`} />
          <KPI icon={Clock}        label="Próx. 7 días"     value={fmt(summary.totalUpcoming)} color="bg-blue-500"   />
          <KPI icon={CheckCircle2} label="Pagado (total)"   value={fmt(summary.totalPaid)}     color="bg-emerald-500" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor o N° orden..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400" />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as APStatus | '')}
              className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-rose-400">
              <option value="">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="partial">Pago parcial</option>
              <option value="overdue">Vencido</option>
              <option value="paid">Pagado</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <button onClick={() => tenantId && loadAP(tenantId)} disabled={loading}
            className="p-2 border border-gray-200 rounded-xl hover:border-rose-300 text-gray-500 hover:text-rose-600 transition">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
              <RefreshCw size={18} className="animate-spin" /> Cargando cuentas...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Wallet size={28} className="text-gray-300" />
              </div>
              <p className="text-gray-500 font-semibold">
                {search || filterStatus ? 'Sin resultados' : 'No hay cuentas por pagar'}
              </p>
              {!search && !filterStatus && (
                <p className="text-xs text-gray-400 text-center max-w-xs">
                  Se crean automáticamente al recibir una orden de un proveedor con crédito.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Proveedor / Orden</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Plazo</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase"><div className="flex items-center gap-1"><Calendar size={12} /> Vencimiento</div></th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Total</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Pendiente</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(ap => {
                    const remaining  = ap.total_amount - ap.paid_amount;
                    const days       = daysUntil(ap.due_date);
                    const isOverdue  = ap.status === 'overdue' || days < 0;
                    const isSoon     = days >= 0 && days <= 7 && ap.status !== 'paid';
                    const isPaid     = ap.status === 'paid';
                    const busy       = deleteLoading === ap.id;
                    const pendingSync = !!(ap as any).__pendingSync;

                    return (
                      <tr key={ap.id} className={`transition ${isOverdue && !isPaid ? 'bg-red-50/30' : isSoon ? 'bg-amber-50/20' : 'hover:bg-gray-50/50'}`}>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
                              <Truck size={13} className="text-rose-600" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{ap.supplier_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{ap.purchase_number}</p>
                            </div>
                            {pendingSync && (
                              <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-semibold ml-1">
                                local
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-1 rounded-full">
                            {ap.payment_terms ?? '—'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div>
                            <p className={`font-semibold text-sm ${isOverdue && !isPaid ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-gray-700'}`}>
                              {fmtDate(ap.due_date)}
                            </p>
                            {!isPaid && (
                              <p className={`text-xs ${isOverdue ? 'text-red-500' : isSoon ? 'text-amber-500' : 'text-gray-400'}`}>
                                {days < 0 ? `Vencido hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}` :
                                 days === 0 ? 'Vence hoy' :
                                 `${days} día${days !== 1 ? 's' : ''}`}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right font-bold text-gray-700">{fmt(ap.total_amount)}</td>

                        <td className="px-5 py-4 text-right">
                          <span className={`font-black text-sm ${isPaid ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                            {isPaid ? '—' : fmt(remaining)}
                          </span>
                          {ap.paid_amount > 0 && !isPaid && (
                            <p className="text-xs text-gray-400">pagado: {fmt(ap.paid_amount)}</p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <StatusBadge status={ap.status} pendingSync={pendingSync} />
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isPaid && (
                              <button onClick={() => setPayingAP(ap)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition">
                                <CreditCard size={11} /> Pagar
                              </button>
                            )}
                            {isPaid && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                                <CheckCircle2 size={13} /> Saldado
                              </span>
                            )}
                            <button onClick={() => handleDelete(ap.id)} disabled={busy || !!pendingSync}
                              className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-30 transition rounded"
                              title={pendingSync ? 'Sincroniza primero para eliminar' : 'Eliminar'}>
                              {busy ? <Loader size={13} className="animate-spin" /> : <X size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            {filtered.length} cuenta{filtered.length !== 1 ? 's' : ''} · Pendiente total: <strong>{fmt(summary.totalPending)}</strong>
          </p>
        )}
      </div>

      {/* Payment Modal */}
      {payingAP && tenantId && (
        <PaymentModal
          ap={payingAP}
          tenantId={tenantId}
          onClose={() => setPayingAP(null)}
          onPaid={async () => {
            setPayingAP(null);
            if (tenantId) {
              await loadAP(tenantId);
              await refreshPendingCount(tenantId);
            }
          }}
        />
      )}
    </div>
  );
};
