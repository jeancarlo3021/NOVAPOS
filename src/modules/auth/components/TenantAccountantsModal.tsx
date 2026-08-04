import React, { useCallback, useEffect, useState } from 'react';
import { X, Calculator, Loader2, Check, AlertCircle, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface AccountantRow {
  id: string;
  email: string;
  full_name?: string | null;
  role: string;
  /** Cuántos negocios lleva en total. */
  clients: number;
  /** ¿Lleva ESTE negocio? */
  assigned: boolean;
}

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

/**
 * Contadores de un negocio.
 *
 * Dar acceso escribe en `user_tenants`, lo mismo que el acceso a una sucursal: el
 * contador pasa a ver el negocio en su selector de empresa y en su portal, donde
 * le carga la llave criptográfica y ve cuántos comprobantes le quedan.
 */
export const TenantAccountantsModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [rows, setRows] = useState<AccountantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<AccountantRow[]>(`/admin/accountants?tenant_id=${owner.id}`));
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo cargar la lista', 'error');
    } finally { setLoading(false); }
  }, [owner.id, onToast]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (r: AccountantRow) => {
    setBusyId(r.id);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/accountants`, {
        method: 'POST',
        body: JSON.stringify({
          accountant_id: r.id,
          assigned: !r.assigned,
          // Al darle acceso, si no es contador todavía se le pone el rol para que
          // le aparezca el portal. Sin esto habría que ir a Usuarios a cambiarlo.
          make_role: !r.assigned && r.role !== 'contador',
        }),
      });
      onToast(!r.assigned
        ? `${r.full_name || r.email} ahora lleva ${owner.name}`
        : `${r.full_name || r.email} ya no lleva ${owner.name}`, 'success');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
    } finally { setBusyId(null); }
  };

  const filtered = rows.filter(r =>
    !q.trim() || `${r.full_name ?? ''} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const asignados = rows.filter(r => r.assigned).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Calculator size={18} className="text-indigo-600" /> Contadores
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {owner.name} · {asignados} asignado{asignados === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuario…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400" />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            El contador ve este negocio en su selector de empresa y en su <b>Portal del contador</b>,
            donde le carga la llave criptográfica y ve los comprobantes que le quedan.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <AlertCircle size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin usuarios que coincidan.</p>
              <p className="text-xs text-gray-400 mt-1">
                Creá el usuario del contador en <b>Usuarios</b> y volvé acá.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map(r => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-800 truncate">
                      {r.full_name || r.email.replace('@nexoerp.local', '')}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {r.email.replace('@nexoerp.local', '')}
                      {r.role === 'contador' ? ' · Contador' : ` · ${r.role}`}
                      {r.clients > 0 ? ` · lleva ${r.clients} negocio(s)` : ''}
                    </span>
                  </span>
                  <button
                    onClick={() => toggle(r)}
                    disabled={busyId === r.id}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition disabled:opacity-50 ${
                      r.assigned
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
                    }`}
                  >
                    {busyId === r.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : r.assigned ? <><Check size={13} /> Asignado</> : 'Asignar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantAccountantsModal;
