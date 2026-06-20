import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, RefreshCw, Mail, Phone, IdCard, Users as UsersIcon, X, Check, Tag, Power } from 'lucide-react';
import { customersService, ID_TYPES, type Customer, type CustomerInput } from '@/services/customers/customersService';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { CustomerPricesModal } from './CustomerPricesModal';

export const CustomersList: React.FC = () => {
  const { canDo } = useRolePermissions();
  const canCreate = canDo('users', 'create'); // reusamos permisos de users por ahora
  const canEdit   = canDo('users', 'edit');
  const canDelete = canDo('users', 'delete');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Customer | null>(null);
  const [pricesFor, setPricesFor] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setCustomers(await customersService.list(search.trim() || undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleToggleActive = async (c: Customer) => {
    try { await customersService.setActive(c.id, !c.is_active); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`¿Eliminar definitivamente a "${c.name}"? Esta acción no se puede deshacer.`)) return;
    try { await customersService.remove(c.id, true); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon size={22} className="text-emerald-600" />
          <h1 className="text-2xl font-black text-gray-900">Clientes</h1>
          <span className="text-sm text-gray-400 font-bold">({customers.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, ID, email..."
              className="pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 w-64" />
          </div>
          <button onClick={load}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {canCreate && (
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition">
              <Plus size={14} /> Nuevo cliente
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400"><X size={14} /></button>
        </div>
      )}

      {loading && customers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <UsersIcon size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="font-bold text-gray-500">Sin clientes aún</p>
          {canCreate && (
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold">
              <Plus size={14} /> Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map(c => (
            <div key={c.id}
              className={`p-4 rounded-xl border-2 transition ${c.is_active ? 'border-gray-100 hover:border-emerald-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <h3 className="font-black text-gray-900 truncate">{c.name}</h3>
                  {c.commercial_name && (
                    <p className="text-xs text-gray-400 truncate">{c.commercial_name}</p>
                  )}
                </div>
                {!c.is_active && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">INACTIVO</span>
                )}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                {c.identification && (
                  <div className="flex items-center gap-1.5">
                    <IdCard size={11} className="text-gray-400" />
                    <span className="font-mono">
                      {ID_TYPES.find(t => t.value === c.identification_type)?.label.split(' ')[0] ?? ''} {c.identification}
                    </span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail size={11} className="text-gray-400" /> {c.email}
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={11} className="text-gray-400" /> {c.phone}
                  </div>
                )}
              </div>
              {(canEdit || canDelete) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  {canEdit && (
                    <button onClick={() => { setEditing(c); setShowForm(true); }}
                      className="flex-1 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
                      <Edit2 size={11} /> Editar
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => setPricesFor(c)}
                      className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 flex items-center justify-center gap-1">
                      <Tag size={11} /> Precios
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => handleToggleActive(c)}
                      title={c.is_active ? 'Desactivar cliente' : 'Activar cliente'}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 ${
                        c.is_active
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}>
                      <Power size={11} /> {c.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(c)}
                      title="Eliminar definitivamente"
                      className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CustomerFormModal
          customer={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await load(); }}
        />
      )}

      {pricesFor && (
        <CustomerPricesModal
          customer={pricesFor}
          onClose={() => setPricesFor(null)}
        />
      )}
    </div>
  );
};

// ── Form modal ───────────────────────────────────────────────────────────────

function CustomerFormModal({ customer, onClose, onSaved }: {
  customer: Customer | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerInput>({
    identification_type: customer?.identification_type ?? '01',
    identification:      customer?.identification ?? '',
    name:                customer?.name ?? '',
    commercial_name:     customer?.commercial_name ?? '',
    email:               customer?.email ?? '',
    phone:               customer?.phone ?? '',
    address:             customer?.address ?? '',
    zone:                customer?.zone ?? '',
    notes:               customer?.notes ?? '',
    is_active:           customer?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.name?.trim()) { setError('Nombre requerido'); return; }
    setSaving(true);
    try {
      if (customer) await customersService.update(customer.id, form);
      else          await customersService.create(form);
      onSaved();
    } catch (e2) { setError(e2 instanceof Error ? e2.message : 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-gray-900">
            {customer ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre / Razón Social *</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre comercial</label>
            <input value={form.commercial_name ?? ''} onChange={e => set('commercial_name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Tipo ID</label>
              <select value={form.identification_type ?? ''} onChange={e => set('identification_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Número</label>
              <input value={form.identification ?? ''} onChange={e => set('identification', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 1-1234-5678" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
              <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Dirección</label>
            <textarea value={form.address ?? ''} onChange={e => set('address', e.target.value)}
              rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Zona <span className="text-gray-400 font-normal">(para Distribución)</span></label>
            <input value={form.zone ?? ''} onChange={e => set('zone', e.target.value)}
              placeholder="Ej: Centro, Norte, San José…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Notas</label>
            <input value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? 'Guardando...' : <><Check size={14} /> Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CustomersList;
