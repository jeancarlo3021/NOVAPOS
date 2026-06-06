import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt, Plus, Trash2, X, RefreshCw, Filter, Search,
  AlertCircle, FileText, Banknote, CreditCard,
} from 'lucide-react';
import {
  paymentReceiptsService, type PaymentReceipt, type ReceiptType,
} from '@/services/admin/paymentReceiptsService';
import type { OwnerData } from './RenewModal';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (s: string | undefined | null) =>
  s ? new Date(s + (s.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

const today = () => new Date().toISOString().slice(0, 10);

const TYPE_META: Record<ReceiptType, { label: string; color: string; emoji: string }> = {
  subscription: { label: 'Plan Software',  color: 'blue',    emoji: '💼' },
  invoicing:    { label: 'Facturación',    color: 'violet',  emoji: '📄' },
};

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  sinpe: 'SINPE',
  card: 'Tarjeta',
  other: 'Otro',
};

interface Props {
  owners: OwnerData[];
  /** Callback opcional cuando se registra un comprobante de tipo "subscription".
   *  El parent (CreateOwner) lo usa para refrescar los owners y reflejar el
   *  nuevo `ends_at` (próximo cobro). */
  onReceiptCreated?: () => void | Promise<void>;
}

export function PaymentReceiptsView({ owners, onReceiptCreated }: Props) {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState('');
  const [search,  setSearch]    = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterType,   setFilterType]   = useState<ReceiptType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await paymentReceiptsService.list();
      setReceipts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar comprobantes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
      if (filterTenant !== 'all' && r.tenant_id !== filterTenant) return false;
      if (filterType   !== 'all' && r.type      !== filterType)   return false;
      if (!q) return true;
      return (
        (r.tenant?.name?.toLowerCase() ?? '').includes(q) ||
        (r.reference?.toLowerCase() ?? '').includes(q) ||
        (r.notes?.toLowerCase() ?? '').includes(q)
      );
    });
  }, [receipts, search, filterTenant, filterType]);

  const stats = useMemo(() => {
    const totals = { subscription: 0, invoicing: 0, count: receipts.length };
    receipts.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (r.type === 'subscription') totals.subscription += amt;
      else if (r.type === 'invoicing') totals.invoicing += amt;
    });
    return totals;
  }, [receipts]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este comprobante? Esta acción no se puede deshacer.')) return;
    try {
      await paymentReceiptsService.remove(id);
      setReceipts(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI icon={Banknote}  label="Total Plan Software"  value={fmt(stats.subscription)} color="bg-blue-500"   />
        <KPI icon={FileText}  label="Total Facturación"     value={fmt(stats.invoicing)}    color="bg-violet-500" />
        <KPI icon={Receipt}   label="Comprobantes"          value={String(stats.count)}     color="bg-emerald-500"/>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-emerald-500" />
          <h2 className="text-base font-black text-gray-900">Comprobantes de pago</h2>
          <span className="text-xs text-gray-400 font-semibold">({filtered.length})</span>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition">
          <Plus size={15} /> Registrar comprobante
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar negocio, referencia o nota…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400" />
          </div>
          <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400">
            <option value="all">Todos los negocios</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <div className="flex gap-1.5">
            {(['all', 'subscription', 'invoicing'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition ${
                  filterType === t ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {t === 'all' ? 'Todos' : TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-12">
          <Receipt size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">Sin comprobantes</p>
          <p className="text-gray-400 text-xs mt-1">Registra el primero con el botón de arriba</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Negocio</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Monto</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Método</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Referencia / Notas</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Periodo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const meta = TYPE_META[r.type];
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 text-xs font-mono text-gray-600">{fmtDate(r.payment_date)}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{r.tenant?.name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-${meta.color}-50 text-${meta.color}-700`}>
                          {meta.emoji} {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-black text-emerald-600 font-mono">{fmt(Number(r.amount))}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">{METHOD_LABEL[r.payment_method ?? ''] ?? r.payment_method ?? '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">
                        {r.reference && <span className="font-mono">{r.reference}</span>}
                        {r.notes && <p className="text-gray-400 mt-0.5">{r.notes}</p>}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {r.period_start || r.period_end ? `${fmtDate(r.period_start)} → ${fmtDate(r.period_end)}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => handleDelete(r.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <ReceiptFormModal
          owners={owners}
          onClose={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-lg leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Modal de registro ────────────────────────────────────────────────────────
interface FormProps {
  owners: OwnerData[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

function addMonthsISO(dateStr: string, months: number): string {
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'));
  if (isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function ReceiptFormModal({ owners, onClose, onCreated }: FormProps) {
  const [tenantId, setTenantId] = useState(owners[0]?.id ?? '');
  const [type, setType] = useState<ReceiptType>('subscription');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [periodMonths, setPeriodMonths] = useState<number>(1); // 0 = sin periodo
  const [method, setMethod] = useState<string>('transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // El periodo cubierto se deriva del pago + meses elegidos.
  const periodStart = periodMonths > 0 ? paymentDate : '';
  const periodEnd   = periodMonths > 0 ? addMonthsISO(paymentDate, periodMonths) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!tenantId) { setError('Selecciona un negocio'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('El monto debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      await paymentReceiptsService.create({
        tenant_id: tenantId,
        type,
        amount: amt,
        payment_date: paymentDate,
        period_start: periodStart || null,
        period_end:   periodEnd   || null,
        payment_method: method || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="bg-emerald-600 px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-black text-lg">Registrar comprobante</h2>
            <p className="text-emerald-200 text-xs">Pago recibido de un negocio</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Negocio *</label>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400">
              {owners.length === 0 && <option value="">Sin negocios</option>}
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Tipo de pago *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['subscription', 'invoicing'] as ReceiptType[]).map(t => {
                const meta = TYPE_META[t];
                const active = type === t;
                return (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`px-3 py-2 rounded-xl border-2 text-sm font-bold transition flex items-center justify-center gap-1.5 ${
                      active
                        ? `border-${meta.color}-500 bg-${meta.color}-50 text-${meta.color}-700`
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span>{meta.emoji}</span> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Monto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₡</span>
                <input type="number" min="0" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)} required
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Fecha de pago *</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Método de pago</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['cash', 'transfer', 'sinpe', 'card', 'other'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-bold transition ${
                    method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Referencia</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="N° comprobante, SINPE, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Periodo cubierto</label>
            <div className="grid grid-cols-6 gap-1.5">
              {[
                { v: 0,  l: '—' },
                { v: 1,  l: '1m' },
                { v: 3,  l: '3m' },
                { v: 6,  l: '6m' },
                { v: 12, l: '1a' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => setPeriodMonths(opt.v)}
                  className={`py-1.5 rounded-lg border-2 text-xs font-bold transition ${
                    periodMonths === opt.v
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {opt.l}
                </button>
              ))}
              <input type="number" min={0} value={periodMonths}
                onChange={e => setPeriodMonths(Math.max(0, parseInt(e.target.value) || 0))}
                title="Personalizado (meses)"
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-center focus:outline-none focus:border-emerald-400" />
            </div>
            {periodMonths > 0 && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Cobertura: {fmtDate(periodStart)} → {fmtDate(periodEnd)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Detalle opcional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm">
              {saving
                ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                : <><CreditCard size={14} /> Registrar pago</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentReceiptsView;
