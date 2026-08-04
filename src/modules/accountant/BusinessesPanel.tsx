import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Search, Loader2, RefreshCw, Pencil, X, Save, AlertCircle, CheckCircle2,
  FileText, ArrowRightCircle, UserPlus, KeyRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  accountantService,
  type AccountantClient, type ClientBusiness,
} from '@/services/accountant/accountantService';
import { AddClientModal } from './AddClientModal';

const money = (n?: number | null) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const fdate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

type SortKey = 'name' | 'emitidos' | 'disponibles' | 'plan';

/**
 * Panel de negocios.
 *
 * La misma tabla del Panel Admin pero recortada a lo que un contador realmente
 * usa: datos del negocio, plan y cuántos comprobantes electrónicos lleva. Sin
 * facturación del SaaS, ni usuarios, ni módulos — eso sigue siendo del
 * administrador. Editar un dato acá evita la vuelta completa por el Panel.
 */
export const BusinessesPanel: React.FC = () => {
  const { switchTenant, tenant } = useAuth();
  const [rows, setRows] = useState<AccountantClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [editing, setEditing] = useState<AccountantClient | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await accountantService.clients()); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudieron cargar los negocios' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 5000 : 8000);
    return () => clearTimeout(t);
  }, [msg]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(r => !needle ||
      `${r.name} ${r.emisor_name ?? ''} ${r.emisor_identification ?? ''} ${r.business?.email ?? ''}`
        .toLowerCase().includes(needle));
    const emitidos = (r: AccountantClient) => r.counters?.total ?? 0;
    const disp = (r: AccountantClient) =>
      r.quota?.unlimited ? Number.POSITIVE_INFINITY : (r.quota?.available ?? -1);
    return [...list].sort((a, b) => {
      if (sort === 'emitidos') return emitidos(b) - emitidos(a);
      if (sort === 'disponibles') return disp(a) - disp(b);
      if (sort === 'plan') return (a.plan?.name ?? '~').localeCompare(b.plan?.name ?? '~');
      return a.name.localeCompare(b.name);
    });
  }, [rows, q, sort]);

  const totales = useMemo(() => rows.reduce((acc, r) => ({
    emitidos: acc.emitidos + (r.counters?.total ?? 0),
    mes: acc.mes + (r.counters?.this_month ?? 0),
    rechazados: acc.rechazados + (r.counters?.rejected ?? 0),
  }), { emitidos: 0, mes: 0, rechazados: 0 }), [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 size={26} className="text-indigo-600" /> Negocios
          </h1>
          <p className="text-gray-600 text-sm">
            Datos, plan y comprobantes electrónicos de cada negocio que llevás.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition">
            <UserPlus size={16} /> Añadir cliente
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Negocios" value={rows.length} />
        <Stat label="Comprobantes emitidos" value={totales.emitidos} />
        <Stat label="Este mes" value={totales.mes} />
        <Stat label="Rechazados" value={totales.rechazados} tone={totales.rechazados > 0 ? 'bad' : undefined} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar negocio, cédula o correo…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-indigo-400" />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-indigo-400">
          <option value="name">Ordenar por nombre</option>
          <option value="emitidos">Más comprobantes emitidos</option>
          <option value="disponibles">Menos comprobantes disponibles</option>
          <option value="plan">Por plan</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-14">
          <Building2 size={40} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">
            {rows.length === 0 ? 'Todavía no tenés negocios.' : 'Ningún negocio coincide con la búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase">
                  <th className="text-left px-4 py-2.5">Negocio</th>
                  <th className="text-left px-4 py-2.5">Contacto</th>
                  <th className="text-left px-4 py-2.5">Plan</th>
                  <th className="text-center px-4 py-2.5">Comprobantes</th>
                  <th className="text-center px-4 py-2.5">Disponibles</th>
                  <th className="text-center px-4 py-2.5">Estado FE</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => {
                  const cnt = r.counters;
                  const qta = r.quota;
                  const low = qta && !qta.unlimited && (qta.available ?? 0) <= 20;
                  return (
                    <tr key={r.tenant_id} className="hover:bg-gray-50/60 align-top">
                      <td className="px-4 py-3">
                        <p className="font-black text-gray-900">{r.business?.business_name || r.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {r.emisor_identification || r.business?.identification || 'Sin cédula'}
                          {r.environment === 'sandbox' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-black">PRUEBAS</span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400">Desde {fdate(r.created_at)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <p>{r.business?.email || '—'}</p>
                        <p className="text-gray-400">{r.business?.phone || 'Sin teléfono'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-bold text-gray-800">{r.plan?.name ?? 'Sin plan'}</p>
                        {r.plan && <p className="text-gray-400">{money(r.plan.price)} / {r.plan.billing_cycle === 'yearly' ? 'año' : 'mes'}</p>}
                        {r.fe_plan && (
                          <p className="text-indigo-600 font-bold mt-0.5">
                            FE: {r.fe_plan.name} · {r.fe_plan.monthly_quota}/mes
                          </p>
                        )}
                        {r.subscription?.ends_at && (
                          <p className="text-gray-400">Vence {fdate(r.subscription.ends_at)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xl font-black text-gray-900 tabular-nums">{cnt?.total ?? 0}</p>
                        <p className="text-[10px] text-gray-400">{cnt?.this_month ?? 0} este mes</p>
                        {(cnt?.rejected ?? 0) > 0 && (
                          <p className="text-[10px] font-black text-red-600">{cnt?.rejected} rechazados</p>
                        )}
                        {((cnt?.credit_notes ?? 0) > 0 || (cnt?.debit_notes ?? 0) > 0) && (
                          <p className="text-[10px] text-gray-400">
                            {cnt?.credit_notes ?? 0} NC · {cnt?.debit_notes ?? 0} ND
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!qta ? <span className="text-xs text-gray-400">—</span>
                          : qta.unlimited ? <span className="text-xs font-bold text-emerald-700">Ilimitados</span>
                          : (
                            <>
                              <p className={`text-xl font-black tabular-nums ${low ? 'text-red-600' : 'text-gray-900'}`}>
                                {qta.available}
                              </p>
                              <p className="text-[10px] text-gray-400">de {qta.included}</p>
                            </>
                          )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block text-[10px] font-black px-2 py-1 rounded-full ${
                          r.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-800'}`}>
                          {r.ready ? 'LISTO' : 'FALTA CONFIGURAR'}
                        </span>
                        {!r.ready && r.missing.length > 0 && (
                          <p className="text-[10px] text-amber-700 mt-1 max-w-[160px] mx-auto">
                            {r.missing.slice(0, 2).join(' · ')}
                            {r.missing.length > 2 ? ` +${r.missing.length - 2}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setEditing(r)} title="Editar datos del negocio"
                            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              try { await switchTenant(r.tenant_id); setMsg({ kind: 'ok', text: `Entraste a ${r.name}.` }); }
                              catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo entrar' }); }
                            }}
                            disabled={tenant?.id === r.tenant_id}
                            title="Trabajar dentro de este negocio"
                            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                            <ArrowRightCircle size={14} />
                          </button>
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

      {editing && (
        <BusinessModal
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMsg({ kind: 'ok', text }); void load(); }}
        />
      )}

      {adding && (
        <AddClientModal
          submit={payload => accountantService.createClient(payload)}
          allowAccess={false}
          onClose={() => setAdding(false)}
          onCreated={(text) => { setAdding(false); setMsg({ kind: 'ok', text }); void load(); }}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone?: 'bad' }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl px-4 py-3 border ${tone === 'bad' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
    <p className="text-[11px] font-black text-gray-400 uppercase">{label}</p>
    <p className={`text-3xl font-black tabular-nums ${tone === 'bad' ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

/** Datos del negocio. Lo de Hacienda vive en el Portal del contador. */
const BusinessModal: React.FC<{
  client: AccountantClient;
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ client, onClose, onSaved }) => {
  const [b, setB] = useState<ClientBusiness>({
    business_name: client.business?.business_name ?? client.name,
    phone: client.business?.phone ?? '',
    email: client.business?.email ?? '',
    address: client.business?.address ?? '',
    identification: client.business?.identification ?? client.emisor_identification ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof ClientBusiness) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setB(prev => ({ ...prev, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (String(b.business_name ?? '').trim().length < 2) { setErr('Poné el nombre del negocio.'); return; }
    setSaving(true); setErr('');
    try {
      await accountantService.saveBusiness(client.tenant_id, b);
      onSaved(`Datos de ${b.business_name} guardados.`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400';
  const label = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-gray-900">Datos del negocio</h3>
            <p className="text-xs text-gray-500 truncate">{client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {err && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{err}</span>
            </div>
          )}
          <div>
            <label className={label}>Nombre del negocio</label>
            <input value={b.business_name ?? ''} onChange={set('business_name')} className={input} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Cédula</label>
              <input value={b.identification ?? ''} onChange={set('identification')} className={input} />
            </div>
            <div>
              <label className={label}>Teléfono</label>
              <input value={b.phone ?? ''} onChange={set('phone')} className={input} />
            </div>
          </div>
          <div>
            <label className={label}>Correo</label>
            <input value={b.email ?? ''} onChange={set('email')} className={input} />
          </div>
          <div>
            <label className={label}>Dirección</label>
            <input value={b.address ?? ''} onChange={set('address')} className={input} />
          </div>

          {/* Lo de Hacienda tiene su propia pantalla: mezclar el .p12 acá haría
              que un cambio de teléfono se sienta tan delicado como cambiar la llave. */}
          <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-800">
            <KeyRound size={14} className="mt-0.5 shrink-0" />
            <span>
              La llave criptográfica y los datos del emisor los aditan
              <b> el adminstrador del sistema</b>.
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-1">
            <FileText size={13} />
            {client.counters?.total ?? 0} comprobantes emitidos
            {client.quota && !client.quota.unlimited ? ` · quedan ${client.quota.available}` : ''}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
};

export default BusinessesPanel;
