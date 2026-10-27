import React, { useEffect, useState } from 'react';
import { Clock, Delete, Fingerprint, Loader2, LogIn, LogOut, X } from 'lucide-react';
import { fichajeService, biometriaDisponible, type ResultadoFichaje } from '@/services/hr/hrService';

/**
 * MARCAR LA HORA.
 *
 * Pensada para el aparato de la entrada del local: una tablet vieja, el
 * teléfono del encargado, la computadora de la caja. Por eso las teclas son
 * grandes y el resultado se lee de un vistazo desde lejos.
 *
 * Dos formas de identificarse, y las dos las verifica el SERVIDOR:
 *  - el CÓDIGO personal, que funciona en cualquier aparato;
 *  - la HUELLA o la CARA, que es más rápida pero solo sirve en el aparato
 *    donde se registró (y necesita HTTPS, que es como corre el sistema).
 *
 * No hay botón de «entrada» ni de «salida»: el servidor sabe cuál toca. El que
 * ficha a las 6 a.m. medio dormido no tiene que elegir nada, y el error de
 * darle a «entrada» cuando se va deja de existir.
 */
export const FichajeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<ResultadoFichaje | null>(null);
  const [hayHuella, setHayHuella] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => { void biometriaDisponible().then(setHayHuella); }, []);

  /** El resultado se queda cinco segundos y la pantalla vuelve sola al teclado:
   *  en la entrada del local hay cola, y nadie va a cerrar el aviso. */
  useEffect(() => {
    if (!hecho) return;
    const t = setTimeout(() => { setHecho(null); setPin(''); }, 5000);
    return () => clearTimeout(t);
  }, [hecho]);

  const marcar = async (codigo: string) => {
    setCargando(true); setError('');
    try { setHecho(await fichajeService.conCodigo(codigo)); setPin(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo marcar'); setPin(''); }
    finally { setCargando(false); }
  };

  const tecla = (d: string) => {
    setError('');
    const n = (pin + d).slice(0, 8);
    setPin(n);
    // Con cuatro dígitos ya se intenta: el código más común es de cuatro y
    // obligar a tocar «Marcar» es un toque de más en una fila de gente.
    if (n.length === 4) void marcar(n);
  };

  const conHuella = async () => {
    setCargando(true); setError('');
    try { setHecho(await fichajeService.conBiometria()); }
    catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo leer la huella';
      setError(/not allowed|NotAllowed/i.test(m) ? 'Se canceló la lectura' : m);
    } finally { setCargando(false); }
  };

  const registrarHuella = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setError('Escribí tu código primero y después registrá la huella'); return; }
    setRegistrando(true); setError('');
    try {
      const r = await fichajeService.registrarBiometria(pin);
      setError('');
      setHecho({ accion: 'entrada', empleado: { id: '', full_name: `${r.nombre}: huella registrada en este aparato` }, hora: new Date().toISOString() } as any);
      setPin('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar'); }
    finally { setRegistrando(false); }
  };

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[70] bg-gray-900/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[95vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="font-black text-gray-900 flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" /> Marcar hora
          </span>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {hecho ? (
            /* El resultado, grande: se tiene que leer a un metro de distancia. */
            <div className={`rounded-2xl p-5 text-center ${hecho.accion === 'entrada' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${hecho.accion === 'entrada' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                {hecho.accion === 'entrada' ? <LogIn size={26} className="text-white" /> : <LogOut size={26} className="text-white" />}
              </div>
              <p className={`mt-3 text-2xl font-black ${hecho.accion === 'entrada' ? 'text-emerald-700' : 'text-blue-700'}`}>
                {hecho.empleado.id ? (hecho.accion === 'entrada' ? 'Entrada' : 'Salida') : '¡Listo!'}
              </p>
              <p className="text-base font-black text-gray-900 mt-0.5">{hecho.empleado.full_name}</p>
              {hecho.empleado.id && (
                <p className="text-sm font-bold text-gray-500 mt-1">
                  {hora(hecho.hora)}
                  {hecho.horas != null && ` · ${hecho.horas} h trabajadas`}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="h-14 rounded-2xl border-2 border-gray-200 flex items-center justify-center gap-2 mb-3">
                {cargando
                  ? <Loader2 size={22} className="animate-spin text-indigo-500" />
                  : pin.length === 0
                    ? <span className="text-sm font-bold text-gray-300">Tu código</span>
                    : Array.from(pin).map((_, i) => (
                        <span key={i} className="w-3 h-3 rounded-full bg-indigo-600" />
                      ))}
              </div>

              {error && <p className="text-xs font-bold text-red-600 text-center mb-2">{error}</p>}

              {/* Teclado grande: se usa de pie, con una mano y a veces con las
                  manos sucias. Cada tecla mide 64px de alto. */}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9'].map(d => (
                  <button key={d} onClick={() => tecla(d)} disabled={cargando}
                    className="h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-black text-gray-800 disabled:opacity-40">
                    {d}
                  </button>
                ))}
                <button onClick={() => { setPin(''); setError(''); }} disabled={cargando}
                  aria-label="Borrar" className="h-16 rounded-2xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-40">
                  <Delete size={20} />
                </button>
                <button onClick={() => tecla('0')} disabled={cargando}
                  className="h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-black text-gray-800 disabled:opacity-40">
                  0
                </button>
                <button onClick={() => pin.length >= 4 && marcar(pin)} disabled={cargando || pin.length < 4}
                  className="h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black disabled:bg-gray-200 disabled:text-gray-400">
                  Marcar
                </button>
              </div>

              {hayHuella && (
                <div className="mt-3 space-y-2">
                  <button onClick={conHuella} disabled={cargando}
                    className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-black flex items-center justify-center gap-2 disabled:opacity-40">
                    <Fingerprint size={20} /> Marcar con huella / FaceID
                  </button>
                  <button onClick={registrarHuella} disabled={registrando || cargando}
                    className="w-full text-xs font-bold text-gray-500 hover:text-gray-700 py-1">
                    {registrando ? 'Registrando…' : 'Registrar mi huella en este aparato (escribí tu código arriba)'}
                  </button>
                </div>
              )}
              {!hayHuella && (
                <p className="mt-3 text-[11px] font-semibold text-gray-400 text-center">
                  Este aparato no tiene lector de huella o FaceID disponible para el navegador.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FichajeModal;
