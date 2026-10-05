'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  X, Download, DatabaseBackup, Loader2, AlertCircle, CheckCircle2, Clock, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

interface Respaldo {
  /** Fecha del respaldo: 2026-10-06. */
  dia: string;
  bytes: number;
  creado: string | null;
}

const peso = (b: number) =>
  b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** «2026-10-06» → «lunes 6 de octubre». */
const enPalabras = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
};

/** «hoy», «ayer» o la cantidad de días, que es como uno piensa un respaldo. */
const haceCuanto = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const dias = Math.round(
    (new Date(`${hoy}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);
  return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
};

const fecha = (s?: string | null) =>
  s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * RESPALDOS DE UN NEGOCIO.
 *
 * El respaldo diario corre solo en el servidor, invisible. Un respaldo que nadie
 * puede ver no tranquiliza a nadie: acá se ven los días guardados con su peso
 * y su fecha, se baja cualquiera, y se puede forzar uno nuevo —lo que conviene
 * hacer ANTES de algo riesgoso, como borrar el catálogo o cambiarle el plan—.
 *
 * El archivo trae un JSON por tabla y un `manifest.json` con el negocio, el
 * día y las filas de cada tabla, así que se puede revisar sin restaurar nada.
 */
export const TenantBackupsModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [lista, setLista] = useState<Respaldo[]>([]);
  const [seGuardan, setSeGuardan] = useState(8);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState<string | null>(null);
  const [respaldando, setRespaldando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await apiFetch<{ respaldos: Respaldo[]; se_guardan: number }>(
        `/admin/tenants/${owner.id}/backups`);
      setLista(r?.respaldos ?? []);
      setSeGuardan(r?.se_guardan ?? 8);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los respaldos');
    } finally { setCargando(false); }
  }, [owner.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  const bajar = async (dia: string) => {
    setBajando(dia);
    try {
      /**
       * El enlace lo firma el servidor y vive diez minutos.
       *
       * El bucket es privado porque el archivo tiene los clientes, los precios y
       * las ventas del negocio: no puede quedar en una dirección pública que
       * alcance con adivinar.
       */
      const { url } = await apiFetch<{ url: string }>(
        `/admin/tenants/${owner.id}/backups/${dia}`);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo-${owner.name.replace(/[^\w.-]+/g, '_')}-${dia}.zip`;
      a.click();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo bajar el respaldo', 'error');
    } finally { setBajando(null); }
  };

  const respaldarAhora = async () => {
    setRespaldando(true);
    try {
      const r = await apiFetch<{ bytes: number; filas: Record<string, number>; dia: string }>(
        `/admin/tenants/${owner.id}/backups`, { method: 'POST' }, 120_000);
      const filas = Object.values(r?.filas ?? {}).reduce((a, b) => a + b, 0);
      onToast(`Respaldo de ${owner.name}: ${peso(r.bytes)} · ${filas.toLocaleString('es-CR')} filas`, 'success');
      await cargar();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo respaldar', 'error');
    } finally { setRespaldando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[88vh]">
        <div className="bg-slate-800 px-5 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-white font-black text-lg flex items-center gap-2">
            <DatabaseBackup size={18} /> Respaldos
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="font-black text-gray-900">{owner.name}</p>
          <p className="text-[11px] text-gray-500">
            Se guarda uno por día y se conservan los últimos {seGuardan}. Cada archivo trae
            todos los datos del negocio: ventas con sus líneas, inventario, clientes, cajas y
            configuración.
          </p>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm font-semibold shrink-0">
            <AlertCircle size={15} className="mt-0.5" /> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {cargando ? (
            <p className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Buscando respaldos…
            </p>
          ) : lista.length === 0 ? (
            <div className="py-8 text-center">
              <Clock size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-500">Todavía no hay respaldos de este negocio.</p>
              <p className="text-xs text-gray-400 mt-1">
                El automático corre todos los días. Si lo necesitás ya, tocá «Respaldar ahora».
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lista.map((r, i) => (
                <div key={r.dia}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    i === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                      {enPalabras(r.dia)}
                      {i === 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                          EL MÁS NUEVO
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {haceCuanto(r.dia)} · {peso(r.bytes)} · guardado {fecha(r.creado)}
                    </p>
                  </div>
                  <button onClick={() => void bajar(r.dia)} disabled={bajando === r.dia}
                    className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-700 text-xs font-black hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5">
                    {bajando === r.dia
                      ? <><Loader2 size={13} className="animate-spin" /> …</>
                      : <><Download size={13} /> Bajar</>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center gap-2 shrink-0">
          <button onClick={() => void cargar()} disabled={cargando}
            title="Actualizar la lista"
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-white">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => void respaldarAhora()} disabled={respaldando}
            title="Conviene antes de algo riesgoso: borrar el catálogo, cambiar el plan, una importación grande"
            className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:bg-gray-300 text-white font-black text-sm flex items-center justify-center gap-2">
            {respaldando
              ? <><Loader2 size={15} className="animate-spin" /> Respaldando… (puede tardar un minuto)</>
              : <><CheckCircle2 size={15} /> Respaldar ahora</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantBackupsModal;
