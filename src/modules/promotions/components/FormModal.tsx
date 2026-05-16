'use client';

import React, { useState, useEffect } from 'react';
import {
  Tag, X, RefreshCw, Check,
  Zap, Layers, Package, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import { notifyPromotionsUpdated } from '@/hooks/POS/usePOSPromotions';
import {
  promotionsService,
  type Promotion, type PromotionPayload, type PromoType, type PromoScope,
} from '@/services/promotions/promotionsService';
import { apiFetch } from '@/lib/api';
import { TYPE_CFG, today, type FormModalProps } from './types';

// ── Offline queue helpers (local to FormModal) ────────────────────────────────

type PendingPromoOp =
  | { localId: string; tenantId: string; op: 'create'; form: PromotionPayload }
  | { localId: string; tenantId: string; op: 'update'; promotionId: string; form: PromotionPayload }
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

// ── Default empty form ────────────────────────────────────────────────────────

const EMPTY: PromotionPayload = {
  name: '', description: null, type: 'percentage', value: 10,
  applies_to: 'all', category_id: null, product_ids: [],
  starts_at: today(), ends_at: today(), is_active: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FormModal({ editing, tenantId, onClose, onSaved }: FormModalProps) {
  const [form, setForm]       = useState<PromotionPayload>(editing
    ? {
        name: editing.name, description: editing.description, type: editing.type,
        value: editing.value, applies_to: editing.applies_to, category_id: editing.category_id,
        product_ids: editing.product_ids ?? [], starts_at: editing.starts_at,
        ends_at: editing.ends_at, is_active: editing.is_active,
      }
    : { ...EMPTY, starts_at: today(), ends_at: today() }
  );
  const [categories,    setCategories]    = useState<any[]>([]);
  const [products,      setProducts]      = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    const catKey  = cacheKey(tenantId, 'inv_categories');
    const prodKey = cacheKey(tenantId, 'products_list');

    // Load from cache immediately so form is usable offline
    const cachedCats  = cacheGet<any[]>(catKey);
    const cachedProds = cacheGet<any[]>(prodKey);
    if (cachedCats)  setCategories(cachedCats);
    if (cachedProds) setProducts(cachedProds);

    if (!navigator.onLine) return;

    apiFetch<any[]>('/categories')
      .then(data => {
        if (data) { setCategories(data); cacheSet(catKey, data); }
      })
      .catch(() => {});
    apiFetch<any[]>('/products')
      .then(data => {
        if (data) { setProducts(data); cacheSet(prodKey, data); }
      })
      .catch(() => {});
  }, [tenantId]);

  const set = <K extends keyof PromotionPayload>(k: K, v: PromotionPayload[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleProduct = (id: string) =>
    set('product_ids', form.product_ids.includes(id)
      ? form.product_ids.filter(p => p !== id)
      : [...form.product_ids, id]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (form.type !== '2x1' && form.value <= 0) { setError('El valor del descuento debe ser mayor a 0'); return; }
    if (form.applies_to === 'category' && !form.category_id) { setError('Selecciona una categoría'); return; }
    if (form.applies_to === 'products' && form.product_ids.length === 0) { setError('Selecciona al menos un producto'); return; }
    if (form.starts_at > form.ends_at) { setError('La fecha de inicio no puede ser posterior a la de fin'); return; }
    setSaving(true);
    setError('');
    try {
      if (!navigator.onLine) {
        const listCk = cacheKey(tenantId, 'promotions_list');
        if (editing) {
          // Edit: update cache + state optimistically
          enqueuePromoOp(tenantId, { op: 'update', promotionId: editing.id, form });
          const cached = cacheGet<Promotion[]>(listCk) ?? [];
          const updated = cached.map(p => p.id === editing.id ? { ...p, ...form } : p);
          cacheSet(listCk, updated);
          // Update active-promotions cache for POS
          const todayS = today();
          const acKey = cacheKey(tenantId, 'active_promotions');
          const acCached = cacheGet<Promotion[]>(acKey) ?? [];
          const isActiveToday = form.is_active && form.starts_at <= todayS && form.ends_at >= todayS;
          let newAc = acCached.filter(p => p.id !== editing.id);
          if (isActiveToday) newAc = [{ ...editing, ...form } as Promotion, ...newAc];
          cacheSet(acKey, newAc);
          notifyPromotionsUpdated();
        } else {
          // Create: add a local placeholder immediately to list + cache
          enqueuePromoOp(tenantId, { op: 'create', form });
          const localPromo = {
            id: `local_${Math.random().toString(36).slice(2)}`,
            tenant_id: tenantId,
            __local: true,
            name: form.name,
            description: form.description ?? null,
            type: form.type,
            value: form.value,
            applies_to: form.applies_to,
            category_id: form.category_id ?? null,
            product_ids: form.product_ids ?? [],
            starts_at: form.starts_at,
            ends_at: form.ends_at,
            is_active: form.is_active,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as unknown as Promotion;
          const cached = cacheGet<Promotion[]>(listCk) ?? [];
          cacheSet(listCk, [localPromo, ...cached]);
          // If promo is active today, add it to the POS active-promotions cache
          const todayS = today();
          if (form.is_active && form.starts_at <= todayS && form.ends_at >= todayS) {
            const acKey = cacheKey(tenantId, 'active_promotions');
            const acCached = cacheGet<Promotion[]>(acKey) ?? [];
            cacheSet(acKey, [localPromo, ...acCached]);
          }
          notifyPromotionsUpdated();
        }
        onSaved();
        onClose();
        return;
      }
      if (editing) await promotionsService.update(editing.id, form);
      else         await promotionsService.create(tenantId, form);
      // Refresh active-promotions cache + notify POS immediately
      promotionsService.getActiveToday(tenantId)
        .then(data => {
          cacheSet(cacheKey(tenantId, 'active_promotions'), data);
          notifyPromotionsUpdated();
        })
        .catch(() => {});
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-violet-600 px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-violet-200" />
            <h2 className="text-white font-black text-lg">{editing ? 'Editar Promoción' : 'Nueva Promoción'}</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Nombre */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre de la promoción *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ej. 2x1 en refrescos, 20% en mariscos..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Descripción <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || null)}
              rows={2} placeholder="Descripción visible en el POS..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
          </div>

          {/* Tipo de descuento */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Tipo de descuento *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['percentage', 'fixed', '2x1'] as PromoType[]).map(t => {
                const cfg = TYPE_CFG[t];
                return (
                  <button key={t} type="button" onClick={() => set('type', t)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                      form.type === t ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-300'
                    }`}>
                    <div className={`w-8 h-8 rounded-lg ${cfg.color} text-white font-black text-sm flex items-center justify-center`}>
                      {cfg.icon}
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Valor (solo para porcentaje y fijo) */}
          {form.type !== '2x1' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                {form.type === 'percentage' ? 'Porcentaje de descuento (%)' : 'Monto a descontar (₡)'}
              </label>
              <input type="number" min="0.01" step={form.type === 'percentage' ? '1' : '100'}
                max={form.type === 'percentage' ? '100' : undefined}
                value={form.value} onChange={e => set('value', parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              {form.type === 'percentage' && (
                <p className="text-xs text-gray-400 mt-1">Ingresa un número entre 1 y 100</p>
              )}
            </div>
          )}
          {form.type === '2x1' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              El cliente paga solo 1 de cada 2 unidades — el sistema calcula el total automáticamente.
            </div>
          )}

          {/* Aplica a */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">¿A qué aplica? *</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'all' as PromoScope,      icon: Zap,     label: 'Todos' },
                { v: 'category' as PromoScope, icon: Layers,  label: 'Categoría' },
                { v: 'products' as PromoScope, icon: Package, label: 'Productos' },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button key={v} type="button" onClick={() => set('applies_to', v)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                    form.applies_to === v ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-300'
                  }`}>
                  <Icon size={16} className={form.applies_to === v ? 'text-violet-600' : 'text-gray-400'} />
                  <span className="text-xs font-semibold text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Categoría */}
          {form.applies_to === 'category' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Categoría *</label>
              <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value || null)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">Selecciona una categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}

          {/* Productos específicos */}
          {form.applies_to === 'products' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                Productos * <span className="font-normal text-gray-400">({form.product_ids.length} seleccionados)</span>
              </label>
              <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 mb-2" />
              <div className="border border-gray-200 rounded-xl overflow-y-auto max-h-40 divide-y divide-gray-50">
                {filteredProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 rounded text-violet-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {p.sku && <p className="text-xs text-gray-400">{p.sku}</p>}
                    </div>
                  </label>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-center py-4 text-sm text-gray-400">Sin resultados</p>
                )}
              </div>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Desde *</label>
              <input type="date" value={form.starts_at} onChange={e => set('starts_at', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Hasta *</label>
              <input type="date" value={form.ends_at} onChange={e => set('ends_at', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>

          {/* Estado */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button type="button" onClick={() => set('is_active', !form.is_active)}
              className={`shrink-0 ${form.is_active ? 'text-emerald-500' : 'text-gray-400'}`}>
              {form.is_active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
            </button>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {form.is_active ? 'Activa' : 'Inactiva'}
              </p>
              <p className="text-xs text-gray-400">
                {form.is_active ? 'Se aplicará en el POS dentro del período' : 'No se aplica en el POS'}
              </p>
            </div>
          </label>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
            Cancelar
          </button>
          <button onClick={handleSubmit as any} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
