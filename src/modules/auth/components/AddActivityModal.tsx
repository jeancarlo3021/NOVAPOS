import { useEffect, useMemo, useState } from 'react';
import { X, Layers } from 'lucide-react';
import {
  tenantGroupsService,
  type BranchMember, type AddActivityResult,
} from '@/services/admin/tenantGroupsService';

const fmt = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;

/**
 * Otra actividad económica de la misma sociedad, llevada como una sucursal.
 *
 * Queda como un negocio más del grupo —inventario, cajas y reportes propios— que
 * factura con la cédula, el certificado y la empresa de Alanube del principal,
 * pero declarando SU actividad y con su propia sucursal y consecutivos ante
 * Hacienda.
 */
export function AddActivityModal({
  groupId, members, onClose, onAdded,
}: {
  groupId: string;
  members: BranchMember[];
  onClose: () => void;
  onAdded: (r: AddActivityResult) => void;
}) {
  // Principal posible: tiene cédula en sus datos de FE y no es actividad de otro.
  const principales = useMemo(() => members.filter(m =>
    m.tenant?.id && m.actividad?.tiene_cedula && !m.actividad?.shared_from), [members]);
  // Negocios del grupo que se pueden convertir: sin datos de FE propios.
  const convertibles = useMemo(() => members.filter(m =>
    m.tenant?.id && !m.actividad?.shared_from && !m.actividad?.tiene_cedula), [members]);

  const [principal, setPrincipal] = useState(
    principales.find(m => m.role === 'main')?.tenant?.id ?? principales[0]?.tenant?.id ?? '');
  const [actividad, setActividad] = useState('');
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [name, setName] = useState('');
  const [linkId, setLinkId] = useState('');
  const [planId, setPlanId] = useState('');
  const [copiar, setCopiar] = useState(false);
  const [saasPlans, setSaasPlans] = useState<Array<{ id: string; name: string; price: number; billing_cycle?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { plansService } = await import('@/services/users/plansService');
        const list = await plansService.getAllPlans();
        setSaasPlans((Array.isArray(list) ? list : [])
          .filter((p: any) => p?.is_active !== false)
          .map((p: any) => ({ id: p.id, name: p.name, price: p.price ?? 0, billing_cycle: p.billing_cycle })));
      } catch { /* el selector queda vacío */ }
    })();
  }, []);

  const datosPrincipal = principales.find(m => m.tenant?.id === principal)?.actividad;
  // Actividades que la sociedad ya tiene asignadas a algún negocio.
  const ocupadas = members
    .filter(m => m.tenant?.id === principal || m.actividad?.shared_from === principal)
    .map(m => ({ nombre: m.tenant?.name ?? '', codigo: m.actividad?.economic_activity_code ?? '', sucursal: m.actividad?.sucursal ?? '' }))
    .filter(x => x.codigo);

  const save = async () => {
    setErr('');
    if (!principal) { setErr('Elegí el negocio principal de la sociedad.'); return; }
    if (!actividad.trim()) { setErr('Poné el código de la actividad (ej. 4752.1).'); return; }
    if (mode === 'new' && name.trim().length < 2) { setErr('Poné el nombre del negocio de esta actividad.'); return; }
    if (mode === 'link' && !linkId) { setErr('Elegí el negocio del grupo que va a llevar esta actividad.'); return; }
    setSaving(true);
    try {
      const r = await tenantGroupsService.addActivityBranch(groupId, {
        from_tenant: principal,
        economic_activity_code: actividad.trim(),
        ...(mode === 'new'
          ? { new_tenant: { name: name.trim(), plan_id: planId || null } }
          : { tenant_id: linkId }),
        copy_products: copiar,
      });
      onAdded(r);
    } catch (e: any) { setErr(e?.message ?? 'No se pudo agregar la actividad'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-violet-600" /> Agregar actividad
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
            Para una <b>misma sociedad</b> con otra actividad económica. Funciona como una sucursal:
            inventario, cajas y reportes aparte. Factura con la cédula y el certificado del negocio
            principal, declarando <b>su</b> actividad y con su propia numeración ante Hacienda.
          </p>

          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 whitespace-pre-line">{err}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Sociedad (negocio principal) *</label>
            {principales.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Ningún negocio del grupo tiene cédula en sus datos de facturación electrónica.
                Completá primero los datos de FE del negocio principal.
              </p>
            ) : (
              <select value={principal} onChange={e => setPrincipal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                {principales.map(m => (
                  <option key={m.tenant!.id} value={m.tenant!.id}>{m.tenant!.name}</option>
                ))}
              </select>
            )}
            {datosPrincipal && ocupadas.length > 0 && (
              <ul className="mt-1.5 text-[10px] text-gray-500 space-y-0.5">
                {ocupadas.map(o => (
                  <li key={o.nombre + o.codigo}>
                    {o.nombre}: actividad <b className="font-mono">{o.codigo}</b>
                    {o.sucursal && <> · sucursal <b className="font-mono">{String(o.sucursal).padStart(3, '0')}</b></>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Código de la actividad *</label>
            <input value={actividad} onChange={e => setActividad(e.target.value)}
              placeholder="Ej. 4752.1 (como aparece en el ATV)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <p className="text-[10px] text-gray-400 mt-1">
              Tiene que estar inscrita ante Hacienda a nombre de la sociedad. Se agrega sola a la empresa en Alanube.
            </p>
          </div>

          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setMode('new')}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-bold ${mode === 'new' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}>
              Negocio nuevo
            </button>
            <button onClick={() => setMode('link')} disabled={convertibles.length === 0}
              title={convertibles.length === 0 ? 'No hay negocios del grupo sin datos de facturación propios' : undefined}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-bold disabled:opacity-40 ${mode === 'link' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}>
              Uno del grupo
            </button>
          </div>

          {mode === 'new' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del negocio *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ej. Taller Rosales"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Plan de módulos (SaaS)</label>
                <select value={planId} onChange={e => setPlanId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">— Sin plan asignado —</option>
                  {saasPlans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {fmt(p.price)}/{p.billing_cycle === 'yearly' ? 'año' : 'mes'}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Negocio del grupo *</label>
              <select value={linkId} onChange={e => setLinkId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="">Elegí…</option>
                {convertibles.filter(m => m.tenant!.id !== principal).map(m => (
                  <option key={m.tenant!.id} value={m.tenant!.id}>{m.tenant!.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Solo aparecen los que no tienen datos de facturación propios.
              </p>
            </div>
          )}

          {/* Sin plan FE propio: la bolsa de comprobantes se cobra por razón social
              y esta actividad gasta la del negocio principal. */}
          <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Usa la <b>bolsa de comprobantes de la sociedad</b>: lo que emita se descuenta de la del
            negocio principal. No se cobra aparte.
          </p>

          <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
            <input type="checkbox" checked={copiar} onChange={e => setCopiar(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded text-violet-600" />
            <span className="text-xs text-gray-700">
              <b>Copiar los productos</b> del negocio principal
              <span className="block text-[10px] text-gray-400">Sin existencias. Dejalo sin marcar si esta actividad vende otras cosas.</span>
            </span>
          </label>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || principales.length === 0}
            className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
            {saving ? 'Agregando…' : 'Agregar actividad'}
          </button>
        </div>
      </div>
    </div>
  );
}
