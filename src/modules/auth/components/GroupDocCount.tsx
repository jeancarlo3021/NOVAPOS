import { useEffect, useState } from 'react';
import { tenantGroupsService, type BranchReportTotals } from '@/services/admin/tenantGroupsService';

/** Recuento de documentos emitidos por el grupo en el mes en curso. */
export function GroupDocCount() {
  const [totals, setTotals] = useState<BranchReportTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = now.toISOString();
    tenantGroupsService.myBranchesReport(from, to)
      .then(r => setTotals(r.totals))
      .catch(() => setTotals(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !totals) return null;

  const items = [
    { label: 'Tiquetes corrientes',   value: totals.doc_ticket,              color: 'bg-slate-100 text-slate-700' },
    { label: 'Tiquetes electrónicos', value: totals.doc_tiquete_electronico, color: 'bg-cyan-100 text-cyan-700' },
    { label: 'Facturas electrónicas', value: totals.doc_factura_electronica, color: 'bg-blue-100 text-blue-700' },
  ];

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
      <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">
        Documentos emitidos este mes (grupo)
      </p>
      <div className="grid grid-cols-3 gap-3">
        {items.map(it => (
          <div key={it.label} className={`rounded-xl p-3 ${it.color}`}>
            <p className="text-2xl font-black tabular-nums">{it.value}</p>
            <p className="text-[11px] font-bold mt-0.5">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GroupDocCount;
