import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, UserX, Check } from 'lucide-react';
import { employeesService, fichajeService } from '@/services/hr/hrService';
import type { Employee } from '../types/HR.types';

/**
 * EL PORTAL DE ADMINISTRACIÓN DEL FICHAJE.
 *
 * Lo que necesita quien lleva la planilla, en una sola pantalla:
 *  - darle a cada empleado su CÓDIGO para marcar;
 *  - ver quién marcó hoy y a qué hora;
 *  - ver quién NO tiene usuario del sistema vinculado, porque sin eso no se
 *    le pueden calcular las comisiones por ventas (lo dice la propia pantalla
 *    de salarios, pero no había dónde verlo junto).
 */
export const CodigosFichaje: React.FC = () => {
  const [empleados, setEmpleados] = useState<Employee[]>([]);
  const [hoy, setHoy] = useState<Awaited<ReturnType<typeof fichajeService.deHoy>> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [e, h] = await Promise.allSettled([employeesService.list(), fichajeService.deHoy()]);
    if (e.status === 'fulfilled') setEmpleados(e.value.filter(x => x.status === 'active'));
    if (h.status === 'fulfilled') setHoy(h.value);
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async (id: string) => {
    if (!/^\d{4,8}$/.test(codigo)) { setError('El código es de 4 a 8 dígitos'); return; }
    setGuardando(true); setError('');
    try {
      await fichajeService.ponerCodigo(id, codigo);
      setListo(id); setEditando(null); setCodigo('');
      setTimeout(() => setListo(null), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  /* `marcajes?` y no `marcajes`: si el servidor todavía no tiene el endpoint
     —o devuelve otra forma— la pantalla no puede caerse entera por eso. Pasó
     en la prueba: una respuesta sin `marcajes` tiraba toda la vista de
     asistencia con «Cannot read properties of undefined». */
  const marcaDe = (id: string) => hoy?.marcajes?.find(m => m.employee_id === id);
  const hora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '—';

  const sinUsuario = empleados.filter(e => !e.user_id).length;

  if (cargando) {
    return <p className="flex items-center gap-2 text-sm font-bold text-gray-400 py-8 justify-center">
      <Loader2 size={16} className="animate-spin" /> Cargando…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm font-black text-indigo-900 flex items-center gap-2">
          <ShieldCheck size={16} /> Cómo marca el personal
        </p>
        <p className="text-xs font-semibold text-indigo-800 mt-1 leading-relaxed">
          Cada persona marca su entrada y salida desde <b>Marcar hora</b>, en el tablero, con el
          código que le pongas acá o con su huella/FaceID. El sistema decide solo si es entrada o
          salida. La huella se registra una vez por aparato y <b>nunca se guarda</b>: el teléfono
          solo firma, y acá queda una llave pública.
        </p>
      </div>

      {sinUsuario > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <UserX size={16} className="text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs font-bold text-amber-900">
            {sinUsuario} empleado(s) sin usuario del sistema vinculado. Pueden marcar hora igual,
            pero <b>no se les calcula comisión por ventas</b>: eso cruza el usuario con el cajero o
            agente de cada factura. Se vincula en el expediente del empleado.
          </p>
        </div>
      )}

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {empleados.length === 0 && (
          <p className="text-sm font-bold text-gray-400 text-center py-8">No hay empleados activos.</p>
        )}
        {empleados.map(e => {
          const m = marcaDe(e.id);
          return (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-800 truncate">
                  {e.full_name}
                  {!e.user_id && (
                    <span className="ml-1.5 text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      sin usuario
                    </span>
                  )}
                </p>
                <p className="text-[11px] font-bold text-gray-400 truncate">
                  {e.position}
                  {m && ` · entró ${hora(m.entrada)}${m.salida ? ` · salió ${hora(m.salida)}` : ' · trabajando'}`}
                </p>
              </div>

              {editando === e.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input autoFocus type="password" inputMode="numeric" maxLength={8}
                    value={codigo} onChange={ev => { setCodigo(ev.target.value.replace(/\D/g, '')); setError(''); }}
                    placeholder="4 a 8 dígitos"
                    className="w-28 h-10 px-2 text-center border-2 border-indigo-200 rounded-lg text-sm font-black" />
                  <button onClick={() => guardar(e.id)} disabled={guardando}
                    className="h-10 px-3 rounded-lg bg-indigo-600 text-white text-xs font-black disabled:opacity-50">
                    {guardando ? '…' : 'Guardar'}
                  </button>
                  <button onClick={() => { setEditando(null); setCodigo(''); setError(''); }}
                    className="h-10 px-2 rounded-lg text-xs font-bold text-gray-500">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => { setEditando(e.id); setCodigo(''); setError(''); }}
                  className={`h-10 px-3 rounded-lg text-xs font-black flex items-center gap-1.5 shrink-0 ${
                    listo === e.id ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {listo === e.id ? <><Check size={13} /> Guardado</> : <><KeyRound size={13} /> Código</>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(hoy?.marcajes?.length ?? 0) > 0 && (
        <p className="text-[11px] font-bold text-gray-400">
          {hoy?.marcajes?.length} marcaje(s) hoy ({hoy?.date}).
        </p>
      )}
    </div>
  );
};

export default CodigosFichaje;
