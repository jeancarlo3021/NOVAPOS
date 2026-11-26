'use client';

import React from 'react';
import { Loader2, Plus, Boxes, RefreshCw, Ban, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * ACTIVOS FIJOS Y DEPRECIACIÓN.
 *
 * ── Por qué el equipo no es un gasto ─────────────────────────────────────
 * Una refrigeradora de ₡1.200.000 cargada como gasto del mes en que se
 * compró hace que ese mes se vea pésimo y los sesenta siguientes se vean
 * mejor de lo que son. La depreciación reparte el costo en los meses en que
 * de verdad se usa. Es la diferencia entre saber cuánto gana el negocio y
 * creer que gana más porque el equipo ya «estaba pagado».
 *
 * ── Lo que esta pantalla NO hace sola ────────────────────────────────────
 * Dar de baja un activo lo saca de la depreciación, pero no lo saca del
 * balance: eso depende de si se vendió y por cuánto, y eso se registra como
 * venta. Decirlo es mejor que hacer medio asiento.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

/** El mes anterior al de hoy: el que normalmente se deprecia. */
const mesPasado = () => {
  const h = hoyCR();
  const [a, m] = h.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
};

const CATEGORIAS: Array<[string, string]> = [
  ['mobiliario', 'Mobiliario y equipo'],
  ['computo', 'Equipo de cómputo'],
  ['vehiculo', 'Vehículo'],
  ['maquinaria', 'Maquinaria'],
  ['edificio', 'Edificio'],
  ['otro', 'Otro'],
];

/** Vidas útiles de referencia, en meses. Sugerencias, no reglas. */
const VIDA_SUGERIDA: Record<string, number> = {
  mobiliario: 120, computo: 36, vehiculo: 120, maquinaria: 120, edificio: 600, otro: 60,
};

export const ActivosFijos: React.FC = () => {
  const [d, setD] = React.useState<any>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState('');
  const [aviso, setAviso] = React.useState('');
  const [nuevo, setNuevo] = React.useState(false);
  const [periodo, setPeriodo] = React.useState(mesPasado());
  const [corriendo, setCorriendo] = React.useState(false);

  const cargar = async () => {
    setCargando(true); setError('');
    try { setD(await apiFetch<any>('/accounting/activos', {}, 30000)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  };
  React.useEffect(() => { void cargar(); }, []);

  const depreciar = async () => {
    setCorriendo(true); setError(''); setAviso('');
    try {
      const r = await apiFetch<any>('/accounting/activos/depreciar', {
        method: 'POST', body: JSON.stringify({ periodo }),
      }, 60000);
      if (!r.asiento) {
        setAviso(`No había nada que depreciar en ${periodo}.`
          + (r.saltados?.length ? ` ${r.saltados.join(' · ')}` : ''));
      } else {
        setAviso(`Depreciación de ${periodo}: ${crc(r.monto)} en ${r.activos} activo(s), `
          + `asiento #${r.asiento.numero}.`
          + (r.saltados?.length ? ` Quedaron fuera: ${r.saltados.join(' · ')}.` : ''));
      }
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo depreciar'); }
    finally { setCorriendo(false); }
  };

  const darDeBaja = async (a: any) => {
    const motivo = prompt(`¿Por qué se da de baja «${a.nombre}»?\n\n`
      + 'Deja de depreciarse desde el mes siguiente. El retiro del balance se registra aparte, '
      + 'según si se vendió o se descartó.');
    if (motivo === null) return;
    setError(''); setAviso('');
    try {
      const r = await apiFetch<any>(`/accounting/activos/${a.id}/baja`, {
        method: 'POST', body: JSON.stringify({ motivo, fecha: hoyCR() }),
      });
      setAviso(r.nota ?? 'Activo dado de baja.');
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo dar de baja'); }
  };

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando los activos…</p>;

  if (d?.sin_tabla) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 max-w-2xl">
        Falta correr la migración <b>148_contabilidad_ramas.sql</b>. Crea la ficha de los activos
        fijos y el registro de la depreciación ya corrida — ese registro es lo que evita que correr
        la depreciación dos veces en el mismo mes duplique el gasto.
      </p>
    );
  }

  const t = d?.totales;

  return (
    <div className="space-y-4">
      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Costo original" valor={crc(t?.costo)} nota={`${t?.activos ?? 0} activo(s) en uso`} />
        <Tarjeta titulo="Depreciación acumulada" valor={crc(t?.depreciado)} color="text-amber-700" />
        <Tarjeta titulo="Valor en libros" valor={crc(t?.valor_libros)} color="text-indigo-700"
          nota="Lo que vale el equipo hoy según la contabilidad." />
        <Tarjeta titulo="De baja" valor={String(t?.de_baja ?? 0)}
          nota="Ya no se deprecian." />
      </div>

      {/* CORRER LA CUOTA DEL MES */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Depreciar el mes</label>
          <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <button onClick={() => void depreciar()} disabled={corriendo}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
          {corriendo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Correr la depreciación
        </button>
        <button onClick={() => setNuevo(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold ml-auto">
          <Plus size={13} /> Agregar activo
        </button>
        <p className="text-[11px] text-gray-400 w-full leading-snug">
          Se corre una vez por mes, al cerrar. Si ya se corrió, no vuelve a hacerlo: lo dice y no
          duplica el gasto. Un mes que todavía no terminó no se puede depreciar.
        </p>
      </div>

      {nuevo && <FormularioActivo onCerrar={() => setNuevo(false)}
        onListo={(msg) => { setNuevo(false); setAviso(msg); void cargar(); }} />}

      {/* LA LISTA */}
      {(d?.activos ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <Boxes size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-bold text-gray-700">Todavía no hay activos fijos</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
            Van acá las cosas que el negocio compró y le duran años: refrigeradoras, vehículos,
            computadoras, mobiliario. Lo que se consume en el mes es un gasto y va en Gastos.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Activo</th>
                <th className="text-right px-3 py-2 font-bold">Costo</th>
                <th className="text-right px-3 py-2 font-bold">Cuota/mes</th>
                <th className="text-right px-3 py-2 font-bold">Corridas</th>
                <th className="text-right px-3 py-2 font-bold">Acumulada</th>
                <th className="text-right px-3 py-2 font-bold">En libros</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.activos.map((a: any) => (
                <tr key={a.id} className={a.baja_fecha ? 'opacity-60' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-2">
                    <p className="font-semibold text-gray-900">{a.nombre}</p>
                    <p className="text-[11px] text-gray-400">
                      {CATEGORIAS.find(c => c[0] === a.categoria)?.[1] ?? a.categoria}
                      {' · '}comprado {String(a.fecha_compra).slice(0, 10)}
                      {' · '}{a.vida_meses} meses de vida
                      {Number(a.valor_residual) > 0 && ` · residual ${crc(a.valor_residual)}`}
                    </p>
                    {a.baja_fecha && (
                      <p className="text-[11px] font-bold text-gray-500">
                        De baja el {String(a.baja_fecha).slice(0, 10)}
                        {a.baja_motivo ? ` · ${a.baja_motivo}` : ''}
                      </p>
                    )}
                    {a.agotado && !a.baja_fecha && (
                      <span className="text-[9px] font-black uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                        totalmente depreciado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{crc(a.costo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{crc(a.cuota)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-500">
                    {a.meses_corridos}/{a.vida_meses}
                    {a.ultimo_periodo && <span className="block text-[10px] text-gray-400">hasta {a.ultimo_periodo}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{crc(a.depreciado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{crc(a.valor_libros)}</td>
                  <td className="px-3 py-2 text-right">
                    {!a.baja_fecha && (
                      <button onClick={() => void darDeBaja(a)} title="Dar de baja"
                        className="text-gray-300 hover:text-red-500"><Ban size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-snug">
        La depreciación es en línea recta: (costo − valor residual) ÷ meses de vida, igual todos los
        meses. La última cuota es el resto exacto y no la cuota llena, para que el activo no termine
        valiendo menos que su residual. El asiento lleva una línea por activo, así el mayor de la
        cuenta de depreciación dice qué equipo aportó cuánto.
      </p>
    </div>
  );
};

const Tarjeta: React.FC<{ titulo: string; valor: string; nota?: string; color?: string }> =
  ({ titulo, valor, nota, color }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <p className="text-xs font-bold text-gray-500">{titulo}</p>
    <p className={`text-xl font-black tabular-nums ${color ?? 'text-gray-900'}`}>{valor}</p>
    {nota && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{nota}</p>}
  </div>
);

const FormularioActivo: React.FC<{ onCerrar: () => void; onListo: (msg: string) => void }> =
  ({ onCerrar, onListo }) => {
  const [f, setF] = React.useState({
    nombre: '', categoria: 'maquinaria', fecha_compra: hoyCR(),
    costo: '', valor_residual: '0', vida_meses: '120', notas: '',
  });
  const [error, setError] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));

  const cambiarCategoria = (cat: string) => {
    // La vida sugerida se mueve con la categoría, pero se puede cambiar.
    setF(x => ({ ...x, categoria: cat, vida_meses: String(VIDA_SUGERIDA[cat] ?? 60) }));
  };

  const costo = Number(f.costo) || 0;
  const residual = Number(f.valor_residual) || 0;
  const vida = Number(f.vida_meses) || 0;
  const cuota = vida > 0 && costo > residual ? Math.round((costo - residual) / vida) : 0;

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      await apiFetch('/accounting/activos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: f.nombre, categoria: f.categoria, fecha_compra: f.fecha_compra,
          costo, valor_residual: residual, vida_meses: vida,
          notas: f.notas,
        }),
      });
      onListo(`«${f.nombre}» queda registrado. Su cuota mensual es ${crc(cuota)}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900">Activo nuevo</h3>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-bold text-gray-500">Qué es</label>
          <input value={f.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder="Refrigeradora exhibidora"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Categoría</label>
          <select value={f.categoria} onChange={e => cambiarCategoria(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Fecha de compra</label>
          <input type="date" value={f.fecha_compra} onChange={e => set('fecha_compra', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Costo</label>
          <input type="number" inputMode="decimal" value={f.costo} onChange={e => set('costo', e.target.value)}
            placeholder="1200000" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Vida útil (meses)</label>
          <input type="number" value={f.vida_meses} onChange={e => set('vida_meses', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Valor residual</label>
          <input type="number" inputMode="decimal" value={f.valor_residual}
            onChange={e => set('valor_residual', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
            Lo que espera recibir por él al final. En cero si se usa hasta que no sirve.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold text-gray-500">Notas</label>
          <input value={f.notas} onChange={e => set('notas', e.target.value)}
            placeholder="Serie, proveedor, dónde está…"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {cuota > 0 && (
        <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          Se va a depreciar <b>{crc(cuota)} por mes</b> durante {vida} meses
          ({Math.round(vida / 12 * 10) / 10} años).
        </p>
      )}
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => void guardar()} disabled={guardando || !f.nombre.trim() || costo <= 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
          {guardando && <Loader2 size={13} className="animate-spin" />} Guardar
        </button>
        <button onClick={onCerrar} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default ActivosFijos;
