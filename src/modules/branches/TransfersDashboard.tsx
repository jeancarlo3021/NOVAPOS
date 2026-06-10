import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Plus, X, Send, CheckCircle, XCircle,
  Truck, AlertCircle, Trash2, Package,
} from 'lucide-react';
import {
  warehousesService, transfersService,
  type Warehouse, type Transfer,
} from '@/services/branches/branchesService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { useTenantId } from '@/hooks/useTenant';
import { tenantGroupsService } from '@/services/admin/tenantGroupsService';
import { useNavigate } from 'react-router-dom';

const STATUS_META: Record<Transfer['status'], { label: string; color: string }> = {
  pending:    { label: 'Pendiente',   color: 'amber'    },
  in_transit: { label: 'En tránsito', color: 'blue'     },
  received:   { label: 'Recibida',    color: 'emerald'  },
  cancelled:  { label: 'Cancelada',   color: 'gray'     },
};

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function TransfersDashboard() {
  const { tenantId } = useTenantId();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Transfer['status'] | 'all'>('all');
  const [creatingWh, setCreatingWh] = useState(false);
  const [showCrossModal, setShowCrossModal] = useState(false);
  const [groupBranches, setGroupBranches] = useState<{ tenant_id: string; tenant_name: string }[]>([]);

  useEffect(() => {
    tenantGroupsService.myTenants()
      .then(rows => setGroupBranches(
        (rows ?? []).filter(r => r.role === 'owner')
          .map(r => ({ tenant_id: r.tenant_id, tenant_name: r.tenant_name }))
      ))
      .catch(() => setGroupBranches([]));
  }, []);

  const handleCreateCentralWarehouse = async () => {
    setCreatingWh(true); setError('');
    try {
      await tenantGroupsService.createCentralWarehouse(tenantId ?? undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setCreatingWh(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [ws, ts] = await Promise.all([warehousesService.list(), transfersService.list()]);
      setWarehouses(ws);
      setTransfers(ts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => statusFilter === 'all' ? transfers : transfers.filter(t => t.status === statusFilter), [transfers, statusFilter]);

  const handleAction = async (id: string, action: 'send' | 'receive' | 'cancel') => {
    try {
      if (action === 'send')    await transfersService.send(id);
      if (action === 'receive') await transfersService.receive(id);
      if (action === 'cancel')  await transfersService.cancel(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Truck size={22} className="text-cyan-600" />
          <h1 className="text-2xl font-black text-gray-900">Transferencias entre Bodegas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {groupBranches.length > 1 && warehouses.length >= 1 && (
            <button
              onClick={() => setShowCrossModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition"
            >
              <ArrowRight size={14} /> Enviar a otra sucursal
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            disabled={warehouses.length < 2}
            title={warehouses.length < 2 ? 'Necesitás al menos 2 bodegas para hacer transferencias' : ''}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-bold transition"
          >
            <Plus size={14} /> Nueva (bodega → bodega)
          </button>
        </div>
      </div>

      {/* Empty-state cuando no hay bodegas suficientes */}
      {!loading && warehouses.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <Package size={36} className="mx-auto text-amber-500" />
          <div>
            <h3 className="font-black text-amber-900">No hay bodegas en esta sucursal</h3>
            <p className="text-sm text-amber-700 mt-1">
              Para hacer transferencias necesitás crear bodegas primero. Empezá con la bodega central.
            </p>
          </div>
          <button
            onClick={handleCreateCentralWarehouse}
            disabled={creatingWh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-50"
          >
            <Plus size={14} /> {creatingWh ? 'Creando…' : 'Crear bodega central'}
          </button>
        </div>
      )}


      {/* Filtros */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'pending', 'in_transit', 'received', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            {s === 'all' ? 'Todas' : STATUS_META[s].label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <Truck size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="font-bold text-gray-500">Sin transferencias en este filtro</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Origen → Destino</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Items</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(t => {
                  const meta = STATUS_META[t.status];
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-gray-800">{t.from_wh?.name ?? '?'}</span>
                          <ArrowRight size={13} className="text-gray-300" />
                          <span className="font-bold text-gray-800">{t.to_wh?.name ?? '?'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {t.items?.length ?? 0} producto{(t.items?.length ?? 0) !== 1 ? 's' : ''}
                        {t.items && t.items.length > 0 && (
                          <p className="text-[11px] text-gray-400 truncate max-w-xs">
                            {t.items.slice(0, 3).map(i => `${i.product?.name ?? '?'} ×${i.quantity}`).join(', ')}
                            {t.items.length > 3 ? '…' : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-${meta.color}-50 text-${meta.color}-700`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {t.status === 'pending' && (
                            <button onClick={() => handleAction(t.id, 'send')}
                              className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-[11px] font-bold flex items-center gap-1">
                              <Send size={11} /> Enviar
                            </button>
                          )}
                          {t.status === 'in_transit' && (
                            <button onClick={() => handleAction(t.id, 'receive')}
                              className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[11px] font-bold flex items-center gap-1">
                              <CheckCircle size={11} /> Recibir
                            </button>
                          )}
                          {(t.status === 'pending' || t.status === 'in_transit') && (
                            <button onClick={() => handleAction(t.id, 'cancel')}
                              className="p-1 text-red-500 hover:bg-red-50 rounded" title="Cancelar">
                              <XCircle size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <TransferFormModal
          tenantId={tenantId}
          warehouses={warehouses}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await load(); }}
        />
      )}

      {showCrossModal && (
        <CrossTenantTransferModal
          tenantId={tenantId}
          warehouses={warehouses}
          branches={groupBranches}
          onClose={() => setShowCrossModal(false)}
          onSaved={async () => { setShowCrossModal(false); await load(); }}
        />
      )}
    </div>
  );
}

// ── Modal cross-tenant: bodega → sucursal del grupo ────────────────────────

function CrossTenantTransferModal({ tenantId, warehouses, branches, onClose, onSaved }: {
  tenantId: string | null;
  warehouses: Warehouse[];
  branches: { tenant_id: string; tenant_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState(warehouses[0]?.id ?? '');
  const [toTenant, setToTenant] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ product_id: string; quantity: number; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; sku?: string }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ moved: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    inventoryProductsService.getAllProducts(tenantId)
      .then((d: any[]) => setProducts(d.map(p => ({ id: p.id, name: p.name, sku: p.sku }))))
      .catch(() => setProducts([]));
  }, [tenantId]);

  // Sucursales destino disponibles (todas las del grupo menos la actual)
  const destOptions = branches.filter(b => b.tenant_id !== tenantId);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q
      ? products.filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      : products
    ).slice(0, 8);
  }, [products, search]);

  const addItem = (p: { id: string; name: string }) => {
    if (items.some(i => i.product_id === p.id)) return;
    setItems([...items, { product_id: p.id, quantity: 1, name: p.name }]);
    setSearch('');
  };
  const removeItem = (id: string) => setItems(items.filter(i => i.product_id !== id));
  const updateQty = (id: string, q: number) =>
    setItems(items.map(i => i.product_id === id ? { ...i, quantity: Math.max(1, q) } : i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setResult(null);
    if (!from)     { setError('Elegí bodega origen'); return; }
    if (!toTenant) { setError('Elegí sucursal destino'); return; }
    if (items.length === 0) { setError('Agregá al menos un producto'); return; }
    setSaving(true);
    try {
      const r = await transfersService.crossTenant({
        from_warehouse: from, to_tenant_id: toTenant, notes,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      setResult({ moved: r.moved, errors: r.errors ?? [] });
      if ((r.errors ?? []).length === 0) setTimeout(onSaved, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-gray-900">Enviar a otra sucursal</h2>
            <p className="text-xs text-gray-500">Bodega → inventario de otra sucursal del grupo</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          {result && (
            <div className={`text-sm rounded-lg px-3 py-2 ${result.errors.length === 0 ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
              ✓ {result.moved} producto{result.moved !== 1 ? 's' : ''} movido{result.moved !== 1 ? 's' : ''}
              {result.errors.length > 0 && (
                <ul className="mt-1 text-xs list-disc pl-4">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Bodega origen</label>
            <select value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Sucursal destino</label>
            <select value={toTenant} onChange={e => setToTenant(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Elegir —</option>
              {destOptions.map(b => (
                <option key={b.tenant_id} value={b.tenant_id}>{b.tenant_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Va al inventario (bodega central) de la sucursal destino. Si el producto no existe ahí, se crea automáticamente.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Productos</label>
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {search && candidates.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {candidates.map(p => (
                    <button key={p.id} type="button" onClick={() => addItem(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                      {p.name} {p.sku && <span className="text-gray-400">· {p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {items.map(i => (
                <div key={i.product_id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                  <span className="flex-1 text-sm truncate">{i.name}</span>
                  <input type="number" min={1} value={i.quantity}
                    onChange={e => updateQty(i.product_id, Number(e.target.value))}
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
                  <button type="button" onClick={() => removeItem(i.product_id)}
                    className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Notas</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal de creación ───────────────────────────────────────────────────────

interface SimpleProduct { id: string; name: string; sku?: string }

function TransferFormModal({ tenantId, warehouses, onClose, onSaved }: {
  tenantId: string | null;
  warehouses: Warehouse[];
  onClose: () => void; onSaved: () => void;
}) {
  const [from, setFrom] = useState<string>(warehouses[0]?.id ?? '');
  const [to, setTo]     = useState<string>(warehouses[1]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ product_id: string; quantity: number; name: string }[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    inventoryProductsService.getAllProducts(tenantId)
      .then((data: any[]) => setProducts(data.map(p => ({ id: p.id, name: p.name, sku: p.sku }))))
      .catch(() => setProducts([]));
  }, [tenantId]);

  const candidates = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
    ).slice(0, 8);
  }, [products, productSearch]);

  const addItem = (p: SimpleProduct) => {
    if (items.some(i => i.product_id === p.id)) return;
    setItems([...items, { product_id: p.id, quantity: 1, name: p.name }]);
    setProductSearch('');
  };

  const removeItem = (id: string) => setItems(items.filter(i => i.product_id !== id));

  const updateQty = (id: string, q: number) => {
    setItems(items.map(i => i.product_id === id ? { ...i, quantity: Math.max(1, q) } : i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!from || !to || from === to) { setError('Elige bodega origen y destino distintas'); return; }
    if (items.length === 0) { setError('Agrega al menos un producto'); return; }
    setSaving(true);
    try {
      await transfersService.create({
        from_warehouse: from, to_warehouse: to, notes,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-gray-900">Nueva transferencia</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Desde</label>
              <select value={from} onChange={e => setFrom(e.target.value)} required
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400">
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.branch?.name} · {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Hacia</label>
              <select value={to} onChange={e => setTo(e.target.value)} required
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400">
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.branch?.name} · {w.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Buscar producto</label>
            <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              placeholder="Nombre o SKU"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400" />
            {candidates.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto bg-white shadow-sm">
                {candidates.map(p => (
                  <button key={p.id} type="button" onClick={() => addItem(p)}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-xs flex items-center gap-2">
                    <Package size={11} className="text-gray-400" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.sku && <span className="text-[10px] text-gray-400 font-mono">{p.sku}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items agregados */}
          {items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Items ({items.length})</p>
              {items.map(it => (
                <div key={it.product_id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                  <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{it.name}</span>
                  <input type="number" min={1} value={it.quantity}
                    onChange={e => updateQty(it.product_id, parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-gray-200 rounded text-xs font-mono text-right" />
                  <button type="button" onClick={() => removeItem(it.product_id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 text-white font-bold text-sm">
              {saving ? 'Creando...' : 'Crear transferencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TransfersDashboard;
