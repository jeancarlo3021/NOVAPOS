import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building, Plus, Trash2, Star, Edit2, X, Save, AlertCircle, Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  branchesService, warehousesService,
  type Branch, type Warehouse,
} from '@/services/branches/branchesService';
import { GroupBranchesPanel } from '@/modules/dashboard/components/GroupBranchesPanel';

export function BranchesAdmin() {
  const { reloadBranches } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [creatingWarehouseFor, setCreatingWarehouseFor] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [bs, ws] = await Promise.all([branchesService.list(), warehousesService.list()]);
      setBranches(bs);
      setWarehouses(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const warehousesByBranch = useMemo(() => {
    const m = new Map<string, Warehouse[]>();
    warehouses.forEach(w => {
      const arr = m.get(w.branch_id) ?? [];
      arr.push(w);
      m.set(w.branch_id, arr);
    });
    return m;
  }, [warehouses]);

  const handleSetBranchDefault = async (b: Branch) => {
    await branchesService.setDefault(b.id);
    await load();
    await reloadBranches();
  };

  const handleDeleteBranch = async (b: Branch) => {
    if (!confirm(`¿Desactivar la sucursal "${b.name}"? Sus datos se conservan en histórico.`)) return;
    try {
      await branchesService.remove(b.id);
      await load();
      await reloadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDeleteWarehouse = async (w: Warehouse) => {
    if (!confirm(`¿Desactivar la bodega "${w.name}"?`)) return;
    try {
      await warehousesService.remove(w.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Building size={22} className="text-blue-600" />
        <h1 className="text-2xl font-black text-gray-900">Sucursales y Bodegas</h1>
      </div>

      {/* Panel multi-empresa con stats por sucursal del grupo */}
      <GroupBranchesPanel />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <Building size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="font-bold text-gray-500">Sin sucursales aún</p>
          <p className="text-sm text-gray-400">Crea la primera con el botón de arriba</p>
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map(b => {
            const whs = warehousesByBranch.get(b.id) ?? [];
            return (
              <div key={b.id} className={`bg-white rounded-2xl border-2 overflow-hidden ${b.is_default ? 'border-blue-200' : 'border-gray-100'}`}>
                <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.is_default ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Building size={18} className={b.is_default ? 'text-blue-600' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-gray-900 truncate">{b.name}</h3>
                      <span className="text-[10px] font-mono font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{b.code}</span>
                      {b.is_default && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">PRINCIPAL</span>
                      )}
                      {!b.is_active && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">INACTIVA</span>
                      )}
                    </div>
                    {(b.address || b.city) && (
                      <p className="text-xs text-gray-500 truncate">{[b.address, b.city].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!b.is_default && (
                      <button onClick={() => handleSetBranchDefault(b)} title="Marcar como principal"
                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg">
                        <Star size={15} />
                      </button>
                    )}
                    <button onClick={() => setEditingBranch(b)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDeleteBranch(b)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Warehouses */}
                <div className="px-5 py-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <WarehouseIcon size={11} /> Bodegas ({whs.length})
                    </p>
                    <button onClick={() => setCreatingWarehouseFor(b)}
                      className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                      <Plus size={10} /> Agregar bodega
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {whs.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin bodegas</p>
                    ) : whs.map(w => (
                      <div key={w.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${w.is_default ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
                        <WarehouseIcon size={13} className={w.is_default ? 'text-emerald-600' : 'text-gray-400'} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{w.name}</p>
                          <p className="text-[10px] font-mono text-gray-400">{w.code}{w.is_default ? ' · default' : ''}</p>
                        </div>
                        <button onClick={() => setEditingWarehouse(w)}
                          className="p-1 text-blue-500 hover:bg-blue-50 rounded">
                          <Edit2 size={12} />
                        </button>
                        {!w.is_default && (
                          <button onClick={() => handleDeleteWarehouse(w)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creatingBranch || editingBranch) && (
        <BranchFormModal
          branch={editingBranch}
          onClose={() => { setCreatingBranch(false); setEditingBranch(null); }}
          onSaved={async () => { setCreatingBranch(false); setEditingBranch(null); await load(); await reloadBranches(); }}
        />
      )}

      {(creatingWarehouseFor || editingWarehouse) && (
        <WarehouseFormModal
          branch={creatingWarehouseFor}
          warehouse={editingWarehouse}
          onClose={() => { setCreatingWarehouseFor(null); setEditingWarehouse(null); }}
          onSaved={async () => { setCreatingWarehouseFor(null); setEditingWarehouse(null); await load(); }}
        />
      )}
    </div>
  );
}

// ── Modales ──────────────────────────────────────────────────────────────────

function BranchFormModal({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    phone: branch?.phone ?? '',
    hacienda_branch_code: branch?.hacienda_branch_code ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        address: form.address || null,
        city:    form.city    || null,
        phone:   form.phone   || null,
        hacienda_branch_code: form.hacienda_branch_code || null,
      };
      if (branch) await branchesService.update(branch.id, payload);
      else        await branchesService.create(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">{branch ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <Field label="Nombre *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Field label="Código *" value={form.code} onChange={v => setForm({ ...form, code: v.toUpperCase() })} placeholder="SUC01" />
          <Field label="Dirección" value={form.address} onChange={v => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ciudad" value={form.city} onChange={v => setForm({ ...form, city: v })} />
            <Field label="Teléfono" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          </div>
          <Field label="Código sucursal Hacienda" value={form.hacienda_branch_code} onChange={v => setForm({ ...form, hacienda_branch_code: v })} placeholder="00001" />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold text-sm flex items-center justify-center gap-1.5">
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WarehouseFormModal({ branch, warehouse, onClose, onSaved }: {
  branch: Branch | null; warehouse: Warehouse | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: warehouse?.name ?? '',
    code: warehouse?.code ?? '',
    type: ((warehouse as any)?.type === 'truck' ? 'truck' : 'central') as 'central' | 'truck',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (warehouse) {
        await warehousesService.update(warehouse.id, form);
      } else if (branch) {
        await warehousesService.create({ branch_id: branch.id, ...form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">{warehouse ? 'Editar bodega' : 'Nueva bodega'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <Field label="Nombre *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Field label="Código *" value={form.code} onChange={v => setForm({ ...form, code: v.toUpperCase() })} placeholder="BOD01" />
          <label className="flex items-start gap-3 p-3 rounded-xl border border-cyan-200 bg-cyan-50/50 cursor-pointer">
            <input type="checkbox" checked={form.type === 'truck'}
              onChange={e => setForm({ ...form, type: e.target.checked ? 'truck' : 'central' })}
              className="mt-0.5 w-5 h-5 rounded text-cyan-600" />
            <span>
              <span className="block font-bold text-cyan-900 text-sm">Es un camión (Distribución)</span>
              <span className="block text-xs text-cyan-700">Marcala para usarla como camión de reparto en el módulo Distribución.</span>
            </span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold text-sm flex items-center justify-center gap-1.5">
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
    </div>
  );
}

export default BranchesAdmin;
