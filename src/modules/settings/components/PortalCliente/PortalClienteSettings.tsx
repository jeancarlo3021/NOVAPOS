'use client';

import React, { useEffect, useState } from 'react';
import { Save, CheckCircle, Link2, Loader2, AlertCircle } from 'lucide-react';
import { portalAdmin, puedeDelPortal, type PortalConfig } from '@/services/customers/portalClienteService';
import { useRolePermissions } from '@/hooks/useRolePermissions';

/**
 * PORTAL DEL CLIENTE — la hora de corte y lo demás.
 *
 * Lo que se decide acá se aplica EN EL SERVIDOR: la cuenta regresiva que ve el
 * cliente en su teléfono es un adorno —basta cambiarle la hora al aparato para
 * burlarla—, así que el corte se verifica cada vez que llega un pedido.
 */

const DIAS = [
  { n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mié' }, { n: 4, l: 'Jue' },
  { n: 5, l: 'Vie' }, { n: 6, l: 'Sáb' }, { n: 0, l: 'Dom' },
];

export const PortalClienteSettings: React.FC = () => {
  /* El dueño y el administrador siempre; otro rol, solo si se lo concedieron
     en Usuarios → Roles. Lo mismo que verifica el servidor. */
  const { matrix, isOwnerOrAdmin } = useRolePermissions();
  const puedeGuardar = puedeDelPortal(matrix as any, isOwnerOrAdmin, 'edit');

  const [cfg, setCfg] = useState<PortalConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    portalAdmin.config()
      .then(setCfg)
      .catch(e => setErr(e instanceof Error ? e.message : 'No se pudo traer la configuración'))
      .finally(() => setCargando(false));
  }, []);

  const set = <K extends keyof PortalConfig>(k: K, v: PortalConfig[K]) =>
    setCfg(c => (c ? { ...c, [k]: v } : c));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg) return;
    setGuardando(true); setErr('');
    try {
      setCfg(await portalAdmin.guardarConfig(cfg));
      setListo(true); setTimeout(() => setListo(false), 2000);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-10">
        <Loader2 size={18} className="animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Link2 size={24} className="text-cyan-600" /> Portal del cliente
        </h2>
        <p className="text-gray-500 text-sm">
          El enlace que le mandás a cada cliente para que vea sus precios, haga pedidos y
          consulte lo que debe. El enlace se crea en la ficha de cada cliente.
        </p>
      </div>

      {listo && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} /> Guardado
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      {cfg && (
        <form onSubmit={guardar} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span>
              <span className="block font-bold text-gray-800">Recibir pedidos por el portal</span>
              <span className="block text-xs text-gray-500">
                Apagado, los enlaces siguen abriendo y mostrando la cuenta, pero nadie puede pedir.
              </span>
            </span>
            <input type="checkbox" checked={cfg.activo} disabled={!puedeGuardar}
              onChange={e => set('activo', e.target.checked)}
              className="w-5 h-5 rounded text-cyan-600 mt-0.5 shrink-0" />
          </label>

          <div className="border-t border-gray-100 pt-5">
            <label className="block font-bold text-gray-800">Hasta qué hora se reciben</label>
            <p className="text-xs text-gray-500 mb-2">
              Hora de Costa Rica. Después de esa hora el cliente ve el mensaje de abajo y no
              puede enviar nada más por hoy.
            </p>
            <input type="time" value={cfg.hora_corte} disabled={!puedeGuardar}
              onChange={e => set('hora_corte', e.target.value || '16:00')}
              className="px-3 py-2.5 border-2 border-gray-200 rounded-xl font-black text-gray-800 disabled:bg-gray-100" />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block font-bold text-gray-800">Días que se atienden</label>
            <p className="text-xs text-gray-500 mb-2">El domingo apagado evita pedidos que nadie va a despachar.</p>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(d => {
                const on = cfg.dias.includes(d.n);
                return (
                  <button key={d.n} type="button" disabled={!puedeGuardar}
                    onClick={() => set('dias', on ? cfg.dias.filter(x => x !== d.n) : [...cfg.dias, d.n])}
                    className={`px-3.5 py-2 rounded-xl text-sm font-black border-2 ${
                      on ? 'bg-cyan-600 border-cyan-600 text-white'
                         : 'bg-white border-gray-200 text-gray-500'} disabled:opacity-50`}>
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block font-bold text-gray-800">Cuánto puede cambiar su pedido</label>
            <p className="text-xs text-gray-500 mb-2">
              Minutos desde que lo envía. En 0, puede corregirlo hasta la hora de corte. En
              cuanto la caja lo toma deja de poder tocarlo, pase lo que pase: cambiarlo por
              debajo sería mandar a despachar otra cosa de la que están alistando.
            </p>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={1440} value={cfg.minutos_para_editar} disabled={!puedeGuardar}
                onChange={e => set('minutos_para_editar', Math.max(0, Number(e.target.value) || 0))}
                className="w-28 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-right font-black disabled:bg-gray-100" />
              <span className="text-sm font-bold text-gray-500">minutos</span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block font-bold text-gray-800">Mensaje cuando ya cerró</label>
            <textarea value={cfg.mensaje_cerrado} rows={2} maxLength={300} disabled={!puedeGuardar}
              onChange={e => set('mensaje_cerrado', e.target.value)}
              className="w-full mt-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm resize-none disabled:bg-gray-100" />
          </div>

          <div className="border-t border-gray-100 pt-5 space-y-3">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span>
                <span className="block font-bold text-gray-800">Mostrarle las existencias</span>
                <span className="block text-xs text-gray-500">
                  Ve cuánto hay de cada producto y no puede pedir más. Apagado, pide a ciegas y
                  la caja tiene que llamar a recortar el pedido.
                </span>
              </span>
              <input type="checkbox" checked={cfg.ver_existencias} disabled={!puedeGuardar}
                onChange={e => set('ver_existencias', e.target.checked)}
                className="w-5 h-5 rounded text-cyan-600 mt-0.5 shrink-0" />
            </label>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span>
                <span className="block font-bold text-gray-800">Avisarle si pasa su límite de crédito</span>
                <span className="block text-xs text-gray-500">
                  Es un aviso, no un bloqueo: el pedido entra igual y lo decide el negocio. Frenarlo
                  dejaría al cliente sin poder ni pedir por una deuda que quizá ya pagó hoy.
                </span>
              </span>
              <input type="checkbox" checked={cfg.avisar_limite} disabled={!puedeGuardar}
                onChange={e => set('avisar_limite', e.target.checked)}
                className="w-5 h-5 rounded text-cyan-600 mt-0.5 shrink-0" />
            </label>
          </div>

          {puedeGuardar ? (
            <button type="submit" disabled={guardando}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black disabled:opacity-60">
              {guardando ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Guardar
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-center">
              Tu rol puede ver esto pero no cambiarlo. El dueño lo concede en
              Usuarios → Roles, en «Portal del cliente».
            </p>
          )}
        </form>
      )}
    </div>
  );
};

export default PortalClienteSettings;
