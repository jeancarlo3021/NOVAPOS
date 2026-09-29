'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Monitor, Save, CheckCircle, AlertCircle, Loader, Upload, Trash2, Plus, X, ExternalLink,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { storageService } from '@/services/storage/storageService';
import { useAuth } from '@/context/AuthContext';
import {
  CONFIG_PANTALLA_POR_DEFECTO, type ConfigPantallaCliente,
} from '@/modules/pos/CustomerDisplayScreen';
import { abrirPantallaCliente, publicarEnPantalla } from '@/services/pos/customerDisplayService';

/** Colores listos, para no obligar a nadie a escribir un código hexadecimal. */
const COLORES: Array<[string, string]> = [
  ['#10b981', 'Verde'],
  ['#0ea5e9', 'Celeste'],
  ['#6366f1', 'Morado'],
  ['#f59e0b', 'Naranja'],
  ['#ef4444', 'Rojo'],
  ['#111827', 'Negro'],
];

const ESCALAS: Array<[ConfigPantallaCliente['escala'], string, string]> = [
  ['normal', 'Normal', 'Monitor cerca de la caja'],
  ['grande', 'Grande', 'A un metro o más'],
  ['enorme', 'Enorme', 'Televisor o monitor lejano'],
];

const money = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

/**
 * PANTALLA DEL CLIENTE — personalización.
 *
 * El segundo monitor lo ve el cliente, no el cajero: es parte de la imagen del
 * local. Acá se decide si se usa, si se abre sola, con qué colores, con qué
 * saludo y qué avisos van rotando mientras no hay una venta en curso.
 *
 * Lo que se guarda lo leen dos lugares: la caja (para abrirla y mandarle la
 * venta) y la propia pantalla (para dibujarse). Por eso queda en `settings`, que
 * ya se cachea para trabajar sin internet.
 */
export const CustomerDisplaySettings: React.FC = () => {
  const { settings, updateSettings, loading, error } = useSettings('customer-display');
  const { user, planFeatures } = useAuth();
  const enElPlan = !!(planFeatures as any)?.pos_customer_screen;
  const [cfg, setCfg] = useState<ConfigPantallaCliente>(CONFIG_PANTALLA_POR_DEFECTO);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (settings) setCfg({ ...CONFIG_PANTALLA_POR_DEFECTO, ...(settings as any) });
  }, [settings]);

  const set = <K extends keyof ConfigPantallaCliente>(k: K, v: ConfigPantallaCliente[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings(cfg);
      setMsg({ ok: true, text: 'Guardado. La pantalla del cliente toma los cambios al recargarla.' });
      setTimeout(() => setMsg(null), 4000);
    } catch {
      setMsg({ ok: false, text: 'No se pudo guardar. Revisá la conexión e intentá otra vez.' });
    }
  };

  const subirLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const tenantId = user?.tenant_id;
    if (!tenantId) { setMsg({ ok: false, text: 'No se pudo identificar el negocio' }); return; }
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      setMsg({ ok: false, text: 'Subí una imagen PNG o JPG.' });
      return;
    }
    setSubiendo(true); setMsg(null);
    try {
      const url = await storageService.uploadImage('logos', tenantId, file, 'pantalla');
      set('logoUrl', `${url}?t=${Date.now()}`);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'No se pudo subir la imagen' });
    } finally { setSubiendo(false); }
  };

  const quitarLogo = async () => {
    if (!cfg.logoUrl) return;
    try {
      const path = storageService.extractPathFromUrl(cfg.logoUrl, 'logos');
      if (path) await storageService.remove('logos', [path]).catch(() => {});
    } finally { set('logoUrl', null); }
  };

  const agregarMensaje = () => {
    const t = nuevoMensaje.trim();
    if (!t) return;
    set('mensajes', [...cfg.mensajes, t.slice(0, 80)]);
    setNuevoMensaje('');
  };

  /**
   * Probar: abre la pantalla y le manda una venta de ejemplo.
   *
   * Sin esto habría que hacer una venta de verdad para ver cómo quedó el color o
   * si el texto se lee de lejos, que es justo lo que no se puede hacer con un
   * cliente esperando en la caja.
   */
  const probar = async () => {
    const r = await abrirPantallaCliente();
    if (!r.ok) { setMsg({ ok: false, text: r.motivo ?? 'No se pudo abrir la pantalla' }); return; }
    if (r.motivo) setMsg({ ok: true, text: r.motivo });
    setTimeout(() => publicarEnPantalla({
      tipo: 'venta',
      lineas: [
        { nombre: 'Café molido 500 g', cantidad: 1, precio: 4500, total: 4500 },
        { nombre: 'Pan cuadrado', cantidad: 2, precio: 1350, total: 2700 },
      ],
      subtotal: 7200, descuento: 0, impuesto: 0, total: 7200,
      cliente: 'Cliente de prueba',
    }), 1200);
  };

  const oscuro = cfg.tema === 'oscuro';
  const vista = useMemo(() => ({
    fondo: oscuro ? '#0b1220' : '#f8fafc',
    texto: oscuro ? '#e5edff' : '#0f172a',
    suave: oscuro ? '#93a4c4' : '#64748b',
    tarjeta: oscuro ? '#131c2e' : '#ffffff',
  }), [oscuro]);

  /**
   * A la pestaña se puede llegar por URL (?tab=customer_display) aunque el plan
   * no la traiga: el filtro del menú no alcanza. Se avisa y no se muestra nada
   * que se pueda guardar.
   */
  if (!enElPlan) {
    return (
      <div className="max-w-2xl space-y-3">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Monitor size={24} className="text-gray-400" /> Pantalla del cliente
        </h2>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Tu plan no incluye la pantalla del cliente (el segundo monitor que ve el cliente con
          los productos, el total y su vuelto). Consultanos para activarla.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Monitor size={24} className="text-cyan-600" /> Pantalla del cliente
        </h2>
        <p className="text-gray-500 text-sm">
          El segundo monitor que mira el cliente: ve lo que se le va cobrando, el total y su vuelto.
          Nunca muestra botones ni datos del negocio.
        </p>
      </div>

      {(msg || error) && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
          msg && !msg.ok || error
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {msg?.ok && !error ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{msg?.text ?? error}</span>
        </div>
      )}

      {/* ── Encendido ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} onChange={e => set('enabled', e.target.checked)}
            className="mt-1 w-5 h-5 accent-cyan-600" />
          <span>
            <span className="block font-black text-gray-900">Usar la pantalla del cliente</span>
            <span className="block text-xs text-gray-500">
              Activala solo si esta computadora tiene un segundo monitor para el cliente.
              Apagada, el punto de venta trabaja igual que siempre.
            </span>
          </span>
        </label>

        <label className={`flex items-start gap-3 cursor-pointer ${cfg.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <input type="checkbox" checked={cfg.autoOpen} onChange={e => set('autoOpen', e.target.checked)}
            className="mt-1 w-5 h-5 accent-cyan-600" />
          <span>
            <span className="block font-black text-gray-900">Abrirla sola al entrar al punto de venta</span>
            <span className="block text-xs text-gray-500">
              El cajero no tiene que acordarse. La primera vez el navegador pide permiso para
              usar las dos pantallas: hay que aceptarlo una sola vez.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => void probar()}
            className="px-4 py-2 rounded-xl border-2 border-cyan-200 text-cyan-700 font-bold text-sm hover:bg-cyan-50 flex items-center gap-2">
            <ExternalLink size={14} /> Abrir y probar con una venta de ejemplo
          </button>
        </div>
      </div>

      {/* ── Apariencia ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 p-5 space-y-5 ${cfg.enabled ? '' : 'opacity-50'}`}>
        <div>
          <p className="text-xs font-black text-gray-600 mb-2">Fondo</p>
          <div className="flex gap-2">
            {(['oscuro', 'claro'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('tema', t)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border-2 ${
                  cfg.tema === t ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600'}`}>
                {t === 'oscuro' ? 'Oscuro' : 'Claro'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Oscuro cansa menos la vista y se ve mejor en un local con poca luz.
          </p>
        </div>

        <div>
          <p className="text-xs font-black text-gray-600 mb-2">Color del total y los títulos</p>
          <div className="flex flex-wrap items-center gap-2">
            {COLORES.map(([hex, nombre]) => (
              <button key={hex} type="button" title={nombre} onClick={() => set('color', hex)}
                style={{ background: hex }}
                className={`w-9 h-9 rounded-full border-2 ${cfg.color === hex ? 'border-gray-900 scale-110' : 'border-white'} shadow`} />
            ))}
            <input type="color" value={cfg.color} onChange={e => set('color', e.target.value)}
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white" title="Otro color" />
          </div>
        </div>

        <div>
          <p className="text-xs font-black text-gray-600 mb-2">Tamaño de la letra</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {ESCALAS.map(([valor, etiqueta, pista]) => (
              <button key={valor} type="button" onClick={() => set('escala', valor)}
                className={`px-3 py-2 rounded-xl border-2 text-left ${
                  cfg.escala === valor ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200'}`}>
                <span className="block text-sm font-black text-gray-900">{etiqueta}</span>
                <span className="block text-[11px] text-gray-500">{pista}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-gray-600 mb-1">Saludo (cuando no hay venta)</label>
            <input value={cfg.bienvenida} maxLength={60}
              onChange={e => set('bienvenida', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-cyan-400" />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-600 mb-1">Despedida (al terminar de cobrar)</label>
            <input value={cfg.gracias} maxLength={60}
              onChange={e => set('gracias', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-cyan-400" />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.mostrarCliente} onChange={e => set('mostrarCliente', e.target.checked)}
            className="mt-1 w-5 h-5 accent-cyan-600" />
          <span>
            <span className="block font-bold text-gray-900 text-sm">Mostrar el nombre del cliente de la venta</span>
            <span className="block text-[11px] text-gray-500">
              Apagalo si en la fila de atrás pueden leer la pantalla y no querés que vean de quién es la cuenta.
            </span>
          </span>
        </label>
      </div>

      {/* ── Avisos rotativos ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 p-5 space-y-3 ${cfg.enabled ? '' : 'opacity-50'}`}>
        <div>
          <p className="font-black text-gray-900 text-sm">Avisos mientras no hay venta</p>
          <p className="text-[11px] text-gray-500">
            Se van cambiando cada 6 segundos. Sirven para promociones, el horario o el número de WhatsApp.
          </p>
        </div>
        {cfg.mensajes.length > 0 && (
          <div className="space-y-2">
            {cfg.mensajes.map((m, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm font-semibold text-gray-700">{m}</span>
                <button type="button" title="Quitar"
                  onClick={() => set('mensajes', cfg.mensajes.filter((_, j) => j !== i))}
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={nuevoMensaje} onChange={e => setNuevoMensaje(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarMensaje(); } }}
            placeholder="Ej. Aceptamos SINPE Móvil al 8888-8888"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-cyan-400" />
          <button type="button" onClick={agregarMensaje} disabled={!nuevoMensaje.trim()}
            className="px-3 py-2 rounded-xl bg-gray-900 text-white font-bold text-sm disabled:bg-gray-200 disabled:text-gray-400 flex items-center gap-1">
            <Plus size={14} /> Agregar
          </button>
        </div>
      </div>

      {/* ── Logo ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 p-5 space-y-3 ${cfg.enabled ? '' : 'opacity-50'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.mostrarLogo} onChange={e => set('mostrarLogo', e.target.checked)}
            className="mt-1 w-5 h-5 accent-cyan-600" />
          <span>
            <span className="block font-black text-gray-900">Mostrar el logo</span>
            <span className="block text-[11px] text-gray-500">
              Si no subís uno acá, usa el mismo logo del ticket.
            </span>
          </span>
        </label>
        {cfg.mostrarLogo && (
          <div className="flex items-center gap-3 flex-wrap">
            {cfg.logoUrl && (
              <img src={cfg.logoUrl} alt="" className="h-16 object-contain bg-gray-50 rounded-lg px-2" />
            )}
            <label className="px-4 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2">
              {subiendo ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
              {cfg.logoUrl ? 'Cambiar imagen' : 'Subir una imagen'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => void subirLogo(e)} disabled={subiendo} />
            </label>
            {cfg.logoUrl && (
              <button type="button" onClick={() => void quitarLogo()}
                className="px-3 py-2 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 flex items-center gap-1">
                <Trash2 size={14} /> Quitar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Vista previa ── */}
      <div>
        <p className="text-xs font-black text-gray-600 mb-2">Así la va a ver el cliente</p>
        <div className="rounded-2xl overflow-hidden border border-gray-200"
          style={{ background: vista.fondo, color: vista.texto }}>
          <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: `2px solid ${cfg.color}` }}>
            {cfg.mostrarLogo && cfg.logoUrl && <img src={cfg.logoUrl} alt="" className="h-7 object-contain" />}
            <p className="font-black">Tu negocio</p>
            {cfg.mostrarCliente && (
              <p className="ml-auto text-xs font-bold" style={{ color: vista.suave }}>Cliente de prueba</p>
            )}
          </div>
          <div className="px-4 py-3 space-y-1">
            {[['Café molido 500 g', 4500], ['Pan cuadrado', 2700]].map(([n, t]) => (
              <div key={String(n)} className="flex justify-between text-sm font-bold">
                <span>{n}</span><span>{money(Number(t))}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 flex justify-between items-end" style={{ background: vista.tarjeta }}>
            <span className="font-black">TOTAL</span>
            <span className="text-3xl font-black" style={{ color: cfg.color }}>{money(7200)}</span>
          </div>
          <div className="px-4 py-3 text-center" style={{ borderTop: `1px solid ${vista.suave}33` }}>
            <p className="font-black" style={{ color: cfg.color }}>{cfg.bienvenida}</p>
            {cfg.mensajes[0] && (
              <p className="text-xs font-bold" style={{ color: vista.suave }}>{cfg.mensajes[0]}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center gap-2">
          {loading ? <Loader size={15} className="animate-spin" /> : <Save size={15} />} Guardar
        </button>
        <p className="text-[11px] text-gray-500">
          Para que quede en pantalla completa: tocá la ventana del cliente una vez, o apretá F11.
        </p>
      </div>
    </form>
  );
};

export default CustomerDisplaySettings;
