'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtCRDateTime } from '@/utils/crDate';
import { ArrowDownCircle, ArrowUpCircle, Wallet, RefreshCw, Download, FileSpreadsheet, Pencil, X, Save, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/utils/csv';
import { downloadXlsx } from '@/utils/xlsx';

interface Props { tenantId: string | null; from: string; to: string }

interface Movement {
  id: string;
  type: string;                 // income | expense | opening | closing | adjustment
  amount: number;               // firmado
  description: string;
  reference_id?: string | null;
  created_at: string;
  cashier_name?: string;
  session_opened_at?: string | null;
}

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) =>
  iso ? fmtCRDateTime(iso, '') : '';

// Clasifica un movimiento como entrada (+) o salida (−) del fondo.
const isEntrada = (m: Movement) =>
  m.type === 'opening' || m.type === 'income' || /^entrada/i.test(m.description) || (m.type !== 'expense' && m.amount > 0);

// Extrae proveedor / factura / motivo del texto de la descripción.
const parseDesc = (d: string) => {
  const motivo = d.replace(/^(Entrada|Salida):\s*/i, '').split(' · ')[0]?.trim() ?? d;
  const prov = d.match(/·\s*Proveedor:\s*([^·]+)/i)?.[1]?.trim() ?? '';
  const fact = d.match(/·\s*Factura:\s*([^·]+)/i)?.[1]?.trim() ?? '';
  return { motivo, prov, fact };
};

/**
 * Rearma la descripción con el mismo formato que escribe la caja
 * («Motivo · Proveedor: X · Factura: Y»), para que `parseDesc` la vuelva a leer
 * igual y el reporte y el Excel no se enteren de que se editó a mano.
 */
const buildDesc = (motivo: string, prov: string, fact: string) => {
  const parts = [motivo.trim() || 'Sin motivo'];
  if (prov.trim()) parts.push(`Proveedor: ${prov.trim()}`);
  if (fact.trim()) parts.push(`Factura: ${fact.trim()}`);
  return parts.join(' · ');
};

const TYPE_LABEL: Record<string, string> = {
  opening: 'Apertura', closing: 'Cierre', income: 'Entrada', expense: 'Salida', adjustment: 'Ajuste',
};

function KPI({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

export const CashMovementsReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      const d = await apiFetch<{ movements: Movement[] }>(`/cash-sessions/movements-report?from=${from}&to=${to}`);
      // El cierre es solo un conteo final, no un movimiento del fondo → se omite.
      setRows((d?.movements ?? []).filter(m => m.type !== 'closing'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar movimientos');
    } finally { setLoading(false); }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const [editing, setEditing] = useState<Movement | null>(null);

  const totals = useMemo(() => {
    let entradas = 0, salidas = 0;
    for (const m of rows) {
      const abs = Math.abs(Number(m.amount) || 0);
      if (isEntrada(m)) entradas += abs; else salidas += abs;
    }
    return { entradas, salidas, neto: entradas - salidas };
  }, [rows]);

  // Filas planas para exportar (montos como NÚMERO para sumar en Excel).
  const exportRows = () => {
    const header = ['Fecha', 'Tipo', 'Motivo', 'Proveedor', 'N° Factura', 'Cajero', 'Entrada', 'Salida'];
    const body = rows.map(m => {
      const { motivo, prov, fact } = parseDesc(m.description || '');
      const abs = Math.round((Math.abs(Number(m.amount) || 0)) * 100) / 100;
      const entrada = isEntrada(m);
      return [
        fmtDate(m.created_at), TYPE_LABEL[m.type] ?? m.type, motivo,
        prov, fact || (m.reference_id ?? ''), m.cashier_name ?? '',
        entrada ? abs : 0, entrada ? 0 : abs,
      ];
    });
    return { header, body };
  };

  const dlCsv = () => {
    const { header, body } = exportRows();
    downloadCsv(`fondo_caja_${from}_${to}`, [header, ...body,
      [], ['', '', '', '', '', 'TOTALES', Math.round(totals.entradas * 100) / 100, Math.round(totals.salidas * 100) / 100]]);
  };
  const dlXlsx = () => {
    const { header, body } = exportRows();
    downloadXlsx(`fondo_caja_${from}_${to}`, [{ name: 'Fondo de caja', rows: [header, ...body,
      [], ['', '', '', '', '', 'TOTALES', Math.round(totals.entradas * 100) / 100, Math.round(totals.salidas * 100) / 100]] }]);
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><RefreshCw size={18} className="animate-spin" /> Cargando movimientos…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI icon={ArrowDownCircle} label="Entradas al fondo" value={fmt(totals.entradas)} color="bg-emerald-500" />
        <KPI icon={ArrowUpCircle}   label="Salidas del fondo"  value={fmt(totals.salidas)}  color="bg-red-500" />
        <KPI icon={Wallet}          label="Neto"               value={fmt(totals.neto)}     color={totals.neto >= 0 ? 'bg-blue-500' : 'bg-amber-500'} />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-black text-gray-900">Entradas y salidas del fondo de caja</h3>
        <div className="flex gap-2">
          <button onClick={dlCsv} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 disabled:opacity-40">
            <Download size={15} /> CSV
          </button>
          <button onClick={dlXlsx} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40">
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-bold">Fecha</th>
              <th className="px-4 py-3 text-left font-bold">Tipo</th>
              <th className="px-4 py-3 text-left font-bold">Motivo</th>
              <th className="px-4 py-3 text-left font-bold">Proveedor</th>
              <th className="px-4 py-3 text-left font-bold">N° Factura</th>
              <th className="px-4 py-3 text-left font-bold">Cajero</th>
              <th className="px-4 py-3 text-right font-bold">Monto</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin movimientos en el período.</td></tr>
            ) : rows.map(m => {
              const { motivo, prov, fact } = parseDesc(m.description || '');
              const entrada = isEntrada(m);
              const abs = Math.abs(Number(m.amount) || 0);
              return (
                <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${entrada ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {entrada ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />} {TYPE_LABEL[m.type] ?? m.type}
                    </span>
                  </td>
                  {/* Lo que falta se marca en ámbar: es justo lo que hay que ir a completar. */}
                  <td className={`px-4 py-2.5 ${motivo ? 'text-gray-800' : 'text-amber-600 font-bold'}`}>
                    {motivo || 'Sin motivo'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{prov || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{fact || m.reference_id || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.cashier_name || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-black ${entrada ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entrada ? '+' : '−'}{fmt(abs)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* La apertura y el cierre son conteos, no movimientos con motivo. */}
                    {(m.type === 'income' || m.type === 'expense' || m.type === 'adjustment') && (
                      <button onClick={() => setEditing(m)}
                        title="Completar motivo, proveedor o factura"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditMovementModal
          movement={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
};

/**
 * Completa los datos que faltaron al registrar la entrada o salida.
 *
 * El monto y el tipo se muestran pero no se editan: si un arqueo ya cerró con ese
 * número, cambiarlo desde un reporte dejaría la caja descuadrada sin rastro.
 */
const EditMovementModal: React.FC<{
  movement: Movement;
  onClose: () => void;
  onSaved: () => void;
}> = ({ movement, onClose, onSaved }) => {
  const parsed = parseDesc(movement.description || '');
  const [motivo, setMotivo] = useState(parsed.motivo);
  const [prov, setProv]     = useState(parsed.prov);
  const [fact, setFact]     = useState(parsed.fact || movement.reference_id || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const entrada = isEntrada(movement);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) { setErr('Poné al menos el motivo del movimiento.'); return; }
    setSaving(true); setErr('');
    try {
      await apiFetch(`/cash-sessions/movements/${movement.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: buildDesc(motivo, prov, fact),
          reference_id: fact.trim() || null,
        }),
      });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400';
  const label = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-black text-gray-900">
              Modificar {entrada ? 'entrada' : 'salida'}
            </h3>
            <p className="text-xs text-gray-500">
              {fmtDate(movement.created_at)}
              {movement.cashier_name ? ` · ${movement.cashier_name}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {err && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{err}</span>
            </div>
          )}

          <div className={`rounded-xl px-4 py-3 ${entrada ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className="text-[11px] font-bold text-gray-500 uppercase">Monto (no se modifica)</p>
            <p className={`text-2xl font-black ${entrada ? 'text-emerald-700' : 'text-red-700'}`}>
              {entrada ? '+' : '−'}{fmt(Math.abs(Number(movement.amount) || 0))}
            </p>
          </div>

          <div>
            <label className={label}>Motivo *</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} className={input}
              placeholder="Pago a proveedor, compra de insumos…" autoFocus />
          </div>
          <div>
            <label className={label}>Proveedor</label>
            <input value={prov} onChange={e => setProv(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>N° de factura</label>
            <input value={fact} onChange={e => setFact(e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
};

export default CashMovementsReport;
