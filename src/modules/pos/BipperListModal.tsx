import React, { useEffect, useState } from 'react';
import { BellRing, X, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props { onClose: () => void }
interface Row { invoice_number: string; bipper: string; time: string; total: number }

// El bipper se guarda en las notas de la factura como "Bipper: X".
const parseBipper = (notes?: string | null): string => {
  const m = String(notes ?? '').match(/Bipper:\s*([^·|]+)/i);
  return m ? m[1].trim() : '';
};
const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR')}`;
const hhmm = (s?: string | null) => {
  if (!s) return '—';
  const m = String(s).match(/T(\d{2}):(\d{2})/);   // hora local guardada (wall clock)
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
};

/** Lista de BIPPERS asignados hoy (derivados de las notas de las facturas). */
export const BipperListModal: React.FC<Props> = ({ onClose }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await apiFetch<any>(`/invoices?from=${today}&to=${today}&limit=1000`);
      const list: any[] = Array.isArray(data) ? data : (data?.invoices ?? data?.data ?? []);
      const out: Row[] = [];
      for (const inv of list) {
        const b = parseBipper(inv.notes);
        if (!b) continue;
        out.push({ invoice_number: inv.invoice_number, bipper: b, time: inv.issued_at ?? inv.created_at, total: Number(inv.total ?? 0) });
      }
      out.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));  // más reciente primero
      setRows(out);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <BellRing size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-gray-900">Bippers de hoy</h3>
            <p className="text-xs text-gray-500">{rows.length} asignado(s)</p>
          </div>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100" title="Actualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-600'} />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Sin bippers asignados hoy.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 px-2">
                  <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {r.bipper.length <= 4 ? r.bipper : '🔔'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800 truncate">🔔 {r.bipper}</p>
                    <p className="text-[11px] text-gray-400">Factura {r.invoice_number} · {hhmm(r.time)}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-700 tabular-nums shrink-0">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BipperListModal;
