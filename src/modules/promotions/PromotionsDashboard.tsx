'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, Pencil, Trash2, Power,
  Tag, Calendar, Zap,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import { notifyPromotionsUpdated } from '@/hooks/POS/usePOSPromotions';
import {
  promotionsService,
  type Promotion,
  getPromoStatus, promoLabel,
} from '@/services/promotions/promotionsService';

import { StatusBadge } from './components/StatusBadge';
import { KPI } from './components/KPI';
import { FormModal } from './components/FormModal';
import { TYPE_CFG, today, fmtDate, type FilterTab } from './components/types';

// ── Offline queue for promotions ──────────────────────────────────────────────

type PendingPromoOp =
  | { localId: string; tenantId: string; op: 'create'; form: import('@/services/promotions/promotionsService').PromotionPayload }
  | { localId: string; tenantId: string; op: 'update'; promotionId: string; form: import('@/services/promotions/promotionsService').PromotionPayload }
  | { localId: string; tenantId: string; op: 'toggle'; promotionId: string; isActive: boolean };

const PROMO_QUEUE_KEY = (tid: string) => `promo_pending_${tid}`;

function getPromoQueue(tid: string): PendingPromoOp[] {
  try { return JSON.parse(localStorage.getItem(PROMO_QUEUE_KEY(tid)) ?? '[]'); } catch { return []; }
}
function enqueuePromoOp(tid: string, op: Record<string, unknown>) {
  const q = getPromoQueue(tid);
  q.push({ localId: Math.random().toString(36).slice(2), tenantId: tid, ...op } as PendingPromoOp);
  localStorage.setItem(PROMO_QUEUE_KEY(tid), JSON.stringify(q));
}
function clearPromoQueue(tid: string) {
  localStorage.removeItem(PROMO_QUEUE_KEY(tid));
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export const PromotionsDashboard: React.FC = () => {
  const { tenantId } = useTenantId();
  const { canDo } = useRolePermissions();
  const canCreate = canDo('promotions', 'create');
  const canEdit   = canDo('promotions', 'edit');
  const canDelete = canDo('promotions', 'delete');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [filterTab,  setFilterTab]  = useState<FilterTab>('all');
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Promotion | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(() => {
    if (tenantId) setPendingCount(getPromoQueue(tenantId).length);
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    const ck = cacheKey(tenantId, 'promotions_list');
    refreshPendingCount();
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<Promotion[]>(ck);
        setPromotions(cached ?? []);
        if (!cached) setError('Sin conexión — sin datos en caché');
        return;
      }
      // Sync pending ops first
      const queue = getPromoQueue(tenantId);
      for (const op of queue) {
        try {
          if (op.op === 'create')  await promotionsService.create(tenantId, op.form);
          if (op.op === 'update')  await promotionsService.update(op.promotionId, op.form);
          if (op.op === 'toggle')  await promotionsService.toggleActive(op.promotionId, op.isActive);
        } catch { /* leave failures in queue */ }
      }
      clearPromoQueue(tenantId);
      refreshPendingCount();
      const data = await promotionsService.getAll(tenantId);
      setPromotions(data);
      cacheSet(ck, data);
      // Also refresh active-promotions cache for POS
      promotionsService.getActiveToday(tenantId)
        .then(d => cacheSet(cacheKey(tenantId, 'active_promotions'), d))
        .catch(() => {});
    } catch (err) {
      const cached = cacheGet<Promotion[]>(ck);
      if (cached) { setPromotions(cached); return; }
      const msg = err instanceof Error ? err.message : 'Error al cargar';
      setError(msg.includes('relation') || msg.includes('exist')
        ? 'Tabla no encontrada — ejecuta la migración SQL en promotionsService.ts'
        : msg);
    } finally {
      setLoading(false);
    }
  }, [tenantId, refreshPendingCount]);

  useEffect(() => { load(); }, [load]);

  const refreshActiveCache = () => {
    if (!tenantId) return;
    if (navigator.onLine) {
      promotionsService.getActiveToday(tenantId)
        .then(data => {
          cacheSet(cacheKey(tenantId, 'active_promotions'), data);
          notifyPromotionsUpdated(); // tell POS to refresh
        })
        .catch(() => {});
    } else {
      notifyPromotionsUpdated(); // cache already updated by caller; tell POS to re-read
    }
  };

  const handleToggle = async (p: Promotion) => {
    const newActive = !p.is_active;
    // Optimistic update always — even offline
    setPromotions(prev => prev.map(x => x.id === p.id ? { ...x, is_active: newActive } : x));
    // Update list cache optimistically
    if (tenantId) {
      const ck = cacheKey(tenantId, 'promotions_list');
      const cached = cacheGet<Promotion[]>(ck) ?? [];
      cacheSet(ck, cached.map(x => x.id === p.id ? { ...x, is_active: newActive } : x));
    }
    if (!navigator.onLine) {
      if (tenantId) {
        enqueuePromoOp(tenantId, { op: 'toggle', promotionId: p.id, isActive: newActive });
        refreshPendingCount();
        // Update active-promo cache for POS
        const acKey = cacheKey(tenantId, 'active_promotions');
        const acCached = cacheGet<Promotion[]>(acKey) ?? [];
        const todayS = today();
        const updated = newActive
          ? (p.starts_at <= todayS && (!p.ends_at || p.ends_at >= todayS) ? [...acCached, { ...p, is_active: true }] : acCached)
          : acCached.filter(x => x.id !== p.id);
        cacheSet(acKey, updated);
      }
      return;
    }
    setTogglingId(p.id);
    try {
      await promotionsService.toggleActive(p.id, newActive);
      refreshActiveCache();
    } catch (err) {
      // Revert optimistic update on error
      setPromotions(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !newActive } : x));
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    setDeletingId(id);
    try {
      await promotionsService.delete(id);
      setPromotions(prev => prev.filter(p => p.id !== id));
      refreshActiveCache();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const todayStr    = today();
  const activeToday = promotions.filter(p => p.is_active && p.starts_at <= todayStr && (!p.ends_at || p.ends_at >= todayStr));

  const filtered = filterTab === 'all' ? promotions : promotions.filter(p => getPromoStatus(p) === filterTab);

  const TABS: Array<{ id: FilterTab; label: string }> = [
    { id: 'all',       label: `Todas (${promotions.length})`         },
    { id: 'active',    label: `Activas hoy (${activeToday.length})`  },
    { id: 'scheduled', label: 'Programadas'                          },
    { id: 'expired',   label: 'Vencidas'                             },
  ];

  return (
    <div className="space-y-0 max-w-7xl mx-auto">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <Tag size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Promociones del día</h1>
              <p className="text-gray-400 text-sm">
                {activeToday.length > 0
                  ? `${activeToday.length} promoción${activeToday.length !== 1 ? 'es' : ''} activa${activeToday.length !== 1 ? 's' : ''} hoy`
                  : 'Sin promociones activas hoy'}
              </p>
            </div>
          </div>
          {canCreate && (
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition shadow-sm text-sm">
              <Plus size={16} /> Nueva Promoción
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {pendingCount > 0 && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
            <span className="font-semibold">
              {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} guardado{pendingCount !== 1 ? 's' : ''} localmente — se sincronizarán al conectarte a internet
            </span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Total"          value={promotions.length}   color="text-gray-800" />
          <KPI label="Activas hoy"    value={activeToday.length}  color="text-emerald-600" />
          <KPI label="Programadas"    value={promotions.filter(p => getPromoStatus(p) === 'scheduled').length} color="text-blue-600" />
          <KPI label="Vencidas"       value={promotions.filter(p => getPromoStatus(p) === 'expired').length}   color="text-gray-400" />
        </div>

        {/* Activas hoy banner */}
        {activeToday.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Zap size={13} /> Activas ahora mismo
            </p>
            <div className="flex flex-wrap gap-2">
              {activeToday.map(p => {
                const typeCfg = TYPE_CFG[p.type];
                return (
                  <div key={p.id}
                    className="flex items-center gap-2 bg-white border border-violet-200 rounded-xl px-3 py-2 shadow-sm">
                    <div className={`w-6 h-6 rounded-lg ${typeCfg.color} text-white font-black text-xs flex items-center justify-center`}>
                      {typeCfg.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{p.name}</p>
                      <p className="text-xs text-violet-600 font-semibold">{promoLabel(p)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setFilterTab(t.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition ${
                filterTab === t.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
            <RefreshCw size={18} className="animate-spin" /> Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Tag size={36} className="text-gray-200" />
            <p className="text-gray-400 text-sm font-medium">Sin promociones en esta categoría</p>
            {filterTab === 'all' && (
              <button onClick={() => { setEditing(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition mt-1">
                <Plus size={14} /> Crear primera promoción
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const status     = getPromoStatus(p);
              const typeCfg    = TYPE_CFG[p.type];
              const isToggling = togglingId === p.id;
              const isDeleting = deletingId === p.id;
              const isLocal    = !!(p as any).__local;

              return (
                <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 transition ${
                  status === 'active' ? 'border-violet-200' : 'border-gray-100'
                } ${!p.is_active ? 'opacity-60' : ''} ${isLocal ? 'bg-orange-50/30 border-orange-200' : ''}`}>

                  {/* Type badge */}
                  <div className={`w-12 h-12 rounded-xl ${typeCfg.color} flex items-center justify-center text-white font-black text-lg shrink-0`}>
                    {typeCfg.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-black text-gray-900">{p.name}</p>
                      <StatusBadge status={status} />
                      {isLocal && (
                        <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-semibold">
                          pendiente sync
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                      <span className="font-bold text-violet-700">{promoLabel(p)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {fmtDate(p.starts_at)} — {p.ends_at ? fmtDate(p.ends_at) : 'Permanente'}
                      </span>
                      <span>·</span>
                      <span>
                        {p.type === 'combo'            ? `🍔 Combo de ${p.product_ids.length} producto${p.product_ids.length !== 1 ? 's' : ''}` : <>
                        {p.applies_to === 'all'      && '✦ Todos los productos'}
                        {p.applies_to === 'category' && `📁 ${p.category?.icon ?? ''} ${p.category?.name ?? 'Categoría'}`}
                        {p.applies_to === 'products' && `📦 ${p.product_ids.length} producto${p.product_ids.length !== 1 ? 's' : ''}`}
                        </>}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{p.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggle(p)} disabled={isToggling}
                      className={`p-2 rounded-lg transition disabled:opacity-40 ${
                        p.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                      }`} title={p.is_active ? 'Desactivar' : 'Activar'}>
                      {isToggling ? <RefreshCw size={16} className="animate-spin" /> : <Power size={16} />}
                    </button>
                    {canEdit && (
                      <button onClick={() => { setEditing(p); setShowForm(true); }}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Editar">
                        <Pencil size={16} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(p.id)} disabled={isDeleting}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40" title="Eliminar">
                        {isDeleting ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && tenantId && (
        <FormModal
          editing={editing}
          tenantId={tenantId}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
};
