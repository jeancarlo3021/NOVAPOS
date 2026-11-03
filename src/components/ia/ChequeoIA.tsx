import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Plug } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * ¿ESTÁ CONECTADA LA API DE LA IA?
 *
 * Un botón que la prueba DE VERDAD: el servidor le habla al proveedor y
 * contesta qué pasó. Mirar si las variables están puestas no sirve —una llave
 * vencida, un modelo que ya no existe o la facturación sin activar se ven
 * igual que «todo bien»—, y como el sistema por diseño nunca se cae por culpa
 * del modelo, cuando falla simplemente sigue con el buscador local y nadie se
 * entera de que la IA no está haciendo nada.
 *
 * Cuando algo falla muestra el mensaje TEXTUAL del proveedor: «API key not
 * valid» y «model not found» se arreglan distinto, y un «no funciona» no
 * distingue.
 */
export interface DiagnosticoIA {
  conectada: boolean;
  modo: 'demo' | 'real';
  modo_pedido: string;
  proveedor: string;
  modelo: string;
  llave: { presente: boolean; largo: number };
  /** ¿Se LLEGA al proveedor? Es lo que separa «no hay internet» de «tarda». */
  alcance?: { ok: boolean; ms: number; estado: number | null; error: string | null };
  prueba: { ok: boolean; ms: number; respuesta: string | null; error: string | null; sin_pensamiento?: boolean };
  que_hacer: string | null;
  usos: string[];
}

export const ChequeoIA: React.FC<{ compacto?: boolean }> = ({ compacto }) => {
  const [cargando, setCargando] = useState(false);
  const [d, setD] = useState<DiagnosticoIA | null>(null);
  const [error, setError] = useState<string | null>(null);

  const probar = async () => {
    setCargando(true); setError(null); setD(null);
    try {
      setD(await apiFetch<DiagnosticoIA>('/ia/diagnostico', {}, 30_000));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      /* El aviso genérico de la pantalla («achicá el rango de fechas») no
         tiene nada que ver con esto y confunde: acá significa que ni el
         diagnóstico contestó, que ya es un dato. */
      setError(/tardó más de|abort/i.test(msg)
        ? 'Ni el diagnóstico contestó a tiempo. Eso ya dice algo: el servidor no está llegando al proveedor. Probá de nuevo en un minuto.'
        : msg || 'No se pudo probar la conexión');
    } finally { setCargando(false); }
  };

  return (
    <div className={compacto ? '' : 'space-y-2'}>
      <button type="button" onClick={() => void probar()} disabled={cargando}
        className="px-3 py-1.5 rounded-lg border-2 border-violet-300 bg-white text-xs font-black text-violet-700 hover:bg-violet-50 disabled:opacity-40 inline-flex items-center gap-1.5">
        {cargando ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
        {cargando ? 'Probando…' : 'Probar la conexión con la IA'}
      </button>

      {error && (
        <p className="mt-1.5 text-[11px] font-bold text-red-700">{error}</p>
      )}

      {d && (
        <div className={`mt-1.5 rounded-xl border-2 px-3 py-2.5 text-[11px] ${
          d.conectada ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <p className={`font-black flex items-center gap-1.5 ${d.conectada ? 'text-emerald-800' : 'text-amber-900'}`}>
            {d.conectada ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {d.conectada
              ? `Conectada · ${d.proveedor} · ${d.modelo} · contestó en ${d.prueba.ms} ms`
              : 'La IA no está contestando'}
          </p>

          {/* QUÉ HAY QUE HACER primero, y el detalle después. Un diagnóstico
              que deja al usuario interpretando cuatro banderas no sirve. */}
          {d.que_hacer && <p className="mt-1 font-bold text-amber-900">{d.que_hacer}</p>}

          <ul className="mt-1.5 space-y-0.5 text-gray-600">
            <li>Modo: <b>{d.modo === 'real' ? 'real (usa el modelo)' : 'demostración (solo datos del negocio)'}</b>
              {d.modo !== 'real' && d.modo_pedido === 'real' && ' — se pidió «real» pero falta algo'}</li>
            <li>Proveedor: <b>{d.proveedor}</b> · Modelo: <b>{d.modelo}</b></li>
            <li>Llave: {d.llave.presente
              ? <b className="text-emerald-700">puesta ({d.llave.largo} caracteres)</b>
              : <b className="text-red-700">no está</b>}</li>
            {/* Las dos pruebas por separado: «llegar» y «generar» fallan por
                motivos distintos y se arreglan distinto. */}
            {d.alcance && (
              <li>Salida hacia el proveedor: {d.alcance.ok
                ? <b className="text-emerald-700">sí ({d.alcance.ms} ms)</b>
                : <b className="text-red-700">no — {d.alcance.error}</b>}</li>
            )}
            <li>Generar una respuesta: {d.prueba.ok
              ? <b className="text-emerald-700">sí ({d.prueba.ms} ms){d.prueba.sin_pensamiento ? ' — solo con el pensamiento apagado' : ''}</b>
              : d.prueba.error
                ? <b className="text-red-700">no</b>
                : <span className="text-gray-400">no se intentó</span>}</li>
            {d.prueba.error && (
              /* El mensaje del proveedor, tal cual: es lo que dice qué arreglar. */
              <li className="text-red-700">Respuesta del proveedor: <span className="font-mono">{d.prueba.error}</span></li>
            )}
          </ul>

          {!d.conectada && (
            <p className="mt-1.5 text-gray-600">
              Mientras tanto nada se rompe: las sugerencias y el asistente siguen funcionando con los
              datos del negocio y el buscador local, solo que sin la ayuda del modelo.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ChequeoIA;
