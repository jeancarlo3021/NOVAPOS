import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus, Home, Loader2, Trash2, AlertCircle, CheckCircle2, Banknote, CreditCard, Smartphone, Wallet,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const dia = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('es-CR', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
});

interface DiaCargado {
  date: string;
  cash: number; card: number; sinpe: number; other: number; total: number;
  notes: string | null;
  invoices: Array<{ id: string; number: string; method: string; total: number }>;
}

const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * VENTAS SIN SISTEMA.
 *
 * Para los días en que se vendió pero no se usó el POS: se fue la luz, se cayó
 * internet, o el negocio arrancó después y las primeras semanas se cobraron en
 * un cuaderno. Esa plata existió, pero para el sistema ese día está en cero y el
 * mes no cuadra.
 *
 * Se carga el TOTAL del día por medio de pago. No reconstruye venta por venta
 * —ese detalle no existe— pero deja el día registrado en los reportes.
 */
export const ManualSalesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DiaCargado[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [fecha, setFecha] = useState(() => {
    // Por defecto, AYER: es el caso normal («ayer vendimos sin sistema»).
    const d = new Date(Date.now() - 6 * 3600 * 1000 - 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [efectivo, setEfectivo] = useState('');
  const [tarjeta, setTarjeta] = useState('');
  const [sinpe, setSinpe] = useState('');
  const [otros, setOtros] = useState('');
  const [nota, setNota] = useState('');

  const num = (v: string) => Math.round((Number(String(v).replace(/[^\d.]/g, '')) || 0) * 100) / 100;
  const total = num(efectivo) + num(tarjeta) + num(sinpe) + num(otros);
  const yaCargado = rows.find(r => r.date === fecha);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setRows(await apiFetch<DiaCargado[]>('/manual-sales')); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo cargar la lista' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    if (total <= 0) { setMsg({ ok: false, text: 'Poné al menos un monto: efectivo, tarjeta o SINPE.' }); return; }
    if (fecha > hoyCR()) { setMsg({ ok: false, text: 'Esa fecha todavía no llegó.' }); return; }
    if (yaCargado && !confirm(
      `El ${dia(fecha)} ya tiene ${money(yaCargado.total)} cargados.\n\n`
      + '¿Reemplazar por lo que acabás de escribir?')) return;

    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch<{ total: number; reemplazadas: number }>('/manual-sales', {
        method: 'POST',
        body: JSON.stringify({
          date: fecha, cash: num(efectivo), card: num(tarjeta), sinpe: num(sinpe), other: num(otros),
          notes: nota.trim() || null,
        }),
      });
      setMsg({
        ok: true,
        text: `${dia(fecha)}: ${money(r.total)} cargados`
          + (r.reemplazadas > 0 ? ' (se reemplazó lo que estaba antes)' : ''),
      });
      setEfectivo(''); setTarjeta(''); setSinpe(''); setOtros(''); setNota('');
      await cargar();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setBusy(false); }
  };

  const borrar = async (r: DiaCargado) => {
    if (!confirm(`¿Quitar las ventas cargadas del ${dia(r.date)} (${money(r.total)})?\n\n`
      + 'Ese día vuelve a quedar en cero en los reportes.')) return;
    setBusy(true);
    try {
      await apiFetch(`/manual-sales/${r.date}`, { method: 'DELETE' });
      setMsg({ ok: true, text: `Se quitaron las ventas del ${dia(r.date)}` });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo quitar' });
    } finally { setBusy(false); }
  };

  const campos: Array<[string, string, (v: string) => void, any, string]> = [
    ['Efectivo', efectivo, setEfectivo, Banknote, 'text-emerald-600'],
    ['Tarjeta', tarjeta, setTarjeta, CreditCard, 'text-blue-600'],
    ['SINPE', sinpe, setSinpe, Smartphone, 'text-violet-600'],
    ['Otros', otros, setOtros, Wallet, 'text-gray-500'],
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} title="Inicio"
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><Home size={16} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <CalendarPlus size={20} className="text-cyan-600" /> Ventas sin sistema
          </h1>
          <p className="text-xs text-gray-500">
            Para los días que se vendió sin el POS. Se carga el total del día por medio de pago.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
          msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Día de las ventas *</label>
          <input type="date" value={fecha} max={hoyCR()} onChange={e => setFecha(e.target.value)}
            className="w-full sm:w-64 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-cyan-400" />
          {yaCargado && (
            <p className="text-[11px] font-bold text-amber-700 mt-1">
              Ese día ya tiene {money(yaCargado.total)} cargados. Si guardás otra vez, se reemplaza.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {campos.map(([etiqueta, valor, set, Icono, color]) => (
            <div key={etiqueta}>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 mb-1">
                <Icono size={13} className={color} /> {etiqueta}
              </label>
              <div className="flex items-center gap-1 rounded-xl border-2 border-gray-200 px-3 py-2 focus-within:border-cyan-400">
                <span className="text-sm font-bold text-gray-400">₡</span>
                <input value={valor} onChange={e => set(e.target.value)} inputMode="decimal" placeholder="0"
                  className="w-full min-w-0 text-right text-base font-black text-gray-900 outline-none" />
              </div>
            </div>
          ))}
        </div>

        <input value={nota} onChange={e => setNota(e.target.value.slice(0, 300))}
          placeholder="Nota (opcional) — ej. se fue la luz todo el día"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-black text-gray-800">
            Total del día: <span className="text-lg">{money(total)}</span>
          </p>
          <button onClick={() => void guardar()} disabled={busy || total <= 0}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center gap-2">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
            {yaCargado ? 'Reemplazar el día' : 'Cargar el día'}
          </button>
        </div>

        <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Estas ventas <b>entran en los reportes</b> con la fecha que pongas. No mueven inventario
          (no se sabe qué se vendió), <b>no se envían a Hacienda</b> —un comprobante electrónico se
          emite al hacer la venta, no después— y <b>no entran al cierre de caja de hoy</b>, porque son
          de otro día.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-black text-gray-800 text-sm">Días ya cargados</p>
        </div>
        {loading ? (
          <p className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Cargando…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-gray-400 text-sm">Todavía no cargaste ningún día.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map(r => (
              <div key={r.date} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 text-sm">{dia(r.date)}</p>
                  <p className="text-[11px] font-semibold text-gray-500">
                    {[
                      r.cash > 0 && `Efectivo ${money(r.cash)}`,
                      r.card > 0 && `Tarjeta ${money(r.card)}`,
                      r.sinpe > 0 && `SINPE ${money(r.sinpe)}`,
                      r.other > 0 && `Otros ${money(r.other)}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {r.notes && <p className="text-[11px] text-gray-400 italic">{r.notes}</p>}
                </div>
                <span className="font-black text-gray-900">{money(r.total)}</span>
                <button onClick={() => void borrar(r)} disabled={busy}
                  title="Quitar lo cargado de ese día"
                  className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualSalesDashboard;
