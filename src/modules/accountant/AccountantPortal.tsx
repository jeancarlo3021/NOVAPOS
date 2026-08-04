import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calculator, Loader2, AlertCircle, CheckCircle2, X, Upload, KeyRound, Save,
  ArrowRightCircle, Search, UserPlus, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CRLocationFields } from '@/components/CRLocationFields';
import { formatCedula, cleanCedula, cedulaPlaceholder } from '@/utils/cedula';
import { accountantService, type AccountantClient } from '@/services/accountant/accountantService';
import { AddClientModal } from './AddClientModal';

const fdate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

/**
 * Portal del CONTADOR.
 *
 * Lista los negocios que lleva —los mismos del selector de empresa, igual que las
 * sucursales— y para cada uno muestra si ya puede emitir, qué le falta y cuántos
 * comprobantes le quedan. Desde acá les carga la llave criptográfica y completa
 * los datos del emisor sin tener que entrar negocio por negocio.
 */
export const AccountantPortal: React.FC = () => {
  const { switchTenant, tenant } = useAuth();
  const [clients, setClients] = useState<AccountantClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<AccountantClient | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setClients(await accountantService.clients()); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar la cartera' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 5000 : 8000);
    return () => clearTimeout(t);
  }, [msg]);

  const filtered = clients.filter(c =>
    !q.trim() || `${c.name} ${c.emisor_name ?? ''} ${c.emisor_identification ?? ''}`
      .toLowerCase().includes(q.trim().toLowerCase()));

  const pendientes = clients.filter(c => !c.ready).length;
  const porAgotarse = clients.filter(c =>
    c.quota && !c.quota.unlimited && (c.quota.available ?? 0) <= 20).length;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Calculator size={26} className="text-indigo-600" /> Portal del contador
        </h1>
        <p className="text-gray-600 text-sm">
          Tus negocios: qué les falta para emitir y cuántos comprobantes les quedan.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Lo que necesita atención primero */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <p className="text-[11px] font-black text-gray-400 uppercase">Negocios</p>
          <p className="text-3xl font-black text-gray-900 tabular-nums">{clients.length}</p>
        </div>
        <div className={`rounded-2xl px-4 py-3 border ${pendientes > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] font-black text-gray-400 uppercase">Sin poder emitir</p>
          <p className={`text-3xl font-black tabular-nums ${pendientes > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{pendientes}</p>
        </div>
        <div className={`rounded-2xl px-4 py-3 border ${porAgotarse > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] font-black text-gray-400 uppercase">Bolsa por agotarse</p>
          <p className={`text-3xl font-black tabular-nums ${porAgotarse > 0 ? 'text-red-700' : 'text-gray-900'}`}>{porAgotarse}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar negocio, emisor o cédula…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-indigo-400" />
        </div>
        {/* El contador da de alta a su cliente acá mismo: negocio, datos de
            Hacienda y el usuario con el que el cliente entra. Sin Panel Admin. */}
        <button onClick={() => setAdding(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition">
          <UserPlus size={16} /> Añadir cliente
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-14">
          <Calculator size={40} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-400">No tenés negocios en tu cartera.</p>
          <p className="text-xs text-gray-400 mt-1">Tocá "Añadir cliente" para dar de alta el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(c => {
            const qta = c.quota;
            const low = qta && !qta.unlimited && (qta.available ?? 0) <= 20;
            const pct = qta && !qta.unlimited && qta.included
              ? Math.max(0, Math.min(100, ((qta.used ?? 0) / qta.included) * 100)) : 0;
            return (
              <div key={c.tenant_id} className={`bg-white border-2 rounded-2xl p-4 ${
                c.ready ? 'border-gray-200' : 'border-amber-300 bg-amber-50/30'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.emisor_name ?? 'Sin emisor configurado'}
                      {c.emisor_identification ? ` · ${c.emisor_identification}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full ${
                    c.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-800'}`}>
                    {c.ready ? 'LISTO PARA EMITIR' : 'FALTA CONFIGURAR'}
                  </span>
                </div>

                {/* Qué falta: la lista de tareas del contador */}
                {!c.ready && (
                  <ul className="mt-2 text-[11px] text-amber-800 space-y-0.5">
                    {c.missing.map(m => <li key={m}>• {m}</li>)}
                  </ul>
                )}

                {/* Comprobantes que le quedan */}
                <div className="mt-3">
                  {!qta ? (
                    <p className="text-xs text-gray-400">Facturación electrónica no activa.</p>
                  ) : qta.unlimited ? (
                    <p className="text-xs font-bold text-emerald-700">Comprobantes ilimitados</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-gray-500">Comprobantes</span>
                        <span className={`font-black tabular-nums ${low ? 'text-red-600' : 'text-gray-800'}`}>
                          Quedan {qta.available} de {qta.included}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${low ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Usados {qta.used} · vence {fdate(qta.expires_at)}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setEditing(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black">
                    <KeyRound size={14} /> Datos y llave
                  </button>
                  {/* Reintento manual: normalmente el alta en Alanube se hace sola al
                      guardar los datos, pero si Alanube estaba caído sirve. */}
                  <button
                    onClick={async () => {
                      setSyncing(c.tenant_id);
                      try {
                        const r = await accountantService.syncAlanube(c.tenant_id);
                        setMsg({ kind: 'ok', text: `${c.name}: ${r.message}` });
                        await load();
                      } catch (e) {
                        setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo registrar en Alanube' });
                      } finally { setSyncing(null); }
                    }}
                    disabled={syncing === c.tenant_id}
                    title="Crear o actualizar la empresa en Alanube"
                    className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50 disabled:opacity-40">
                    {syncing === c.tenant_id
                      ? <Loader2 size={16} className="animate-spin" />
                      : <RefreshCw size={16} />}
                  </button>
                  <button
                    onClick={async () => {
                      try { await switchTenant(c.tenant_id); setMsg({ kind: 'ok', text: `Entraste a ${c.name}.` }); }
                      catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo entrar' }); }
                    }}
                    disabled={tenant?.id === c.tenant_id}
                    title="Trabajar dentro de este negocio"
                    className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50 disabled:opacity-40">
                    <ArrowRightCircle size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddClientModal
          submit={payload => accountantService.createClient(payload)}
          allowAccess={false}
          onClose={() => setAdding(false)}
          onCreated={(text) => { setAdding(false); setMsg({ kind: 'ok', text }); void load(); }}
        />
      )}

      {editing && (
        <ClientFeModal
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMsg({ kind: 'ok', text }); void load(); }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

/** Datos del emisor + llave criptográfica de UN cliente. */
const ClientFeModal: React.FC<{
  client: AccountantClient;
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ client, onClose, onSaved }) => {
  const [fe, setFe] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: any) => setFe(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const cfg = await accountantService.feConfig(client.tenant_id);
        if (!cfg.environment) cfg.environment = 'production';
        // Igual que en el panel: si el tipo no se guardó, se deduce de la cédula.
        if (!cfg.emisor_identification_type) {
          const d = String(cfg.emisor_identification ?? '').replace(/\D/g, '');
          cfg.emisor_identification_type = d.length === 9 ? '01' : d.length >= 11 ? '03' : '02';
        }
        setFe(cfg);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se pudo cargar');
      } finally { setLoading(false); }
    })();
  }, [client.tenant_id]);

  const prod = String(fe.environment ?? 'production') !== 'sandbox';

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const res = await accountantService.saveFeConfig(client.tenant_id, fe);
      // El alta en Alanube va pegada al guardado: si el certificado se sube en
      // este mismo paso, el mensaje bueno es el de después de subirlo.
      let sync = res.alanube ?? null;
      if (file) sync = (await doUpload(false)) ?? sync;
      onSaved(`Datos de ${client.name} guardados.` + (sync?.message ? ` ${sync.message}` : ''));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const doUpload = async (close = true) => {
    if (!file) return null;
    setUploading(true); setErr('');
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('No se pudo leer el archivo'));
        r.readAsDataURL(file);
      });
      const up = await accountantService.uploadCertificate(client.tenant_id, {
        file_base64: b64,
        filename: file.name,
        p12_password: prod ? fe.p12_password_production : fe.p12_password_sandbox,
        environment: prod ? 'production' : 'sandbox',
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      if (close) {
        onSaved(`Llave criptográfica de ${client.name} cargada.`
          + (up.alanube?.message ? ` ${up.alanube.message}` : ''));
      }
      return up.alanube ?? null;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo subir el certificado');
      return null;
    } finally { setUploading(false); }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400';
  const labelCls = 'block text-[11px] font-black text-gray-500 uppercase mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900 truncate">{client.name}</h2>
            <p className="text-xs text-gray-500">Datos del emisor y llave criptográfica</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {err && (
          <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{err}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo ID</label>
                  <select value={fe.emisor_identification_type ?? '02'}
                    onChange={e => set('emisor_identification_type', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="01">Física</option>
                    <option value="02">Jurídica</option>
                    <option value="03">DIMEX</option>
                    <option value="04">NITE</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Cédula del emisor</label>
                  <input
                    value={formatCedula(fe.emisor_identification ?? '', fe.emisor_identification_type ?? '02')}
                    onChange={e => set('emisor_identification', cleanCedula(e.target.value, fe.emisor_identification_type ?? '02'))}
                    placeholder={cedulaPlaceholder(fe.emisor_identification_type ?? '02')}
                    inputMode="numeric" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Nombre / razón social</label>
                <input value={fe.emisor_name ?? ''} onChange={e => set('emisor_name', e.target.value)} className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Correo del emisor</label>
                  <input value={fe.emisor_email ?? ''} onChange={e => set('emisor_email', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Actividad económica</label>
                  <input value={fe.economic_activity_code ?? ''} inputMode="numeric"
                    onChange={e => set('economic_activity_code', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="Ej. 620100" className={inputCls} />
                </div>
              </div>

              <CRLocationFields
                province={fe.emisor_province_code ?? ''}
                canton={fe.emisor_canton_code ?? ''}
                district={fe.emisor_district_code ?? ''}
                onChange={(field, value) => set(
                  field === 'province' ? 'emisor_province_code'
                    : field === 'canton' ? 'emisor_canton_code' : 'emisor_district_code',
                  value,
                )}
              />
              <div>
                <label className={labelCls}>Otras señas (dirección exacta)</label>
                <input value={fe.emisor_address ?? ''} onChange={e => set('emisor_address', e.target.value)} className={inputCls} />
              </div>

              {/* Credenciales de ATV — por ambiente */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                  Credenciales de ATV · {prod ? 'Producción' : 'QA / Sandbox'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Usuario de API</label>
                    <input
                      value={(prod ? fe.atv_username_production : fe.atv_username_sandbox) ?? ''}
                      onChange={e => set(prod ? 'atv_username_production' : 'atv_username_sandbox', e.target.value)}
                      autoComplete="off" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className={labelCls}>Contraseña de API</label>
                    <input type="password"
                      value={(prod ? fe.atv_password_production : fe.atv_password_sandbox) ?? ''}
                      onChange={e => set(prod ? 'atv_password_production' : 'atv_password_sandbox', e.target.value)}
                      autoComplete="new-password" className={`${inputCls} font-mono`} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Se generan en ATV para <b>esa cédula</b>. No son el PIN del certificado.
                </p>
              </div>

              {/* Llave criptográfica */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                  Llave criptográfica (.p12) · {prod ? 'Producción' : 'QA / Sandbox'}
                </p>
                {client.has_certificate && !file && (
                  <p className="text-xs text-emerald-700 font-bold mb-2">
                    ✓ Ya tiene certificado cargado{client.certificate_name ? `: ${client.certificate_name}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".p12,application/x-pkcs12"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    className="flex-1 text-xs" />
                  <button onClick={() => doUpload()} disabled={!file || uploading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black disabled:bg-gray-200 disabled:text-gray-400">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir
                  </button>
                </div>
                <div className="mt-2">
                  <label className={labelCls}>PIN del certificado</label>
                  <input type="password"
                    value={(prod ? fe.p12_password_production : fe.p12_password_sandbox) ?? ''}
                    onChange={e => set(prod ? 'p12_password_production' : 'p12_password_sandbox', e.target.value)}
                    autoComplete="new-password" className={`${inputCls} font-mono`} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 shrink-0 flex gap-2">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountantPortal;
