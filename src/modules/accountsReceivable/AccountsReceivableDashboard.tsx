import React, { useEffect, useState, useCallback } from 'react';
import {
  HandCoins, Plus, X, Search, RefreshCw, Loader2,
  CheckCircle2, Trash2, Wallet,
} from 'lucide-react';
import { accountsReceivableService, type Receivable, type ReceivableSummary } from '@/services/accountsReceivable/accountsReceivableService';
import { customersService, type Customer } from '@/services/customers/customersService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  partial: { label: 'Abonada',   cls: 'bg-blue-100 text-blue-700' },
  paid:    { label: 'Pagada',    cls: 'bg-emerald-100 text-emerald-700' },
  overdue: { label: 'Vencida',   cls: 'bg-red-100 text-red-700' },
};
const SOURCE: Record<string, string> = { pos: 'POS', manual: 'Manual', distribution: 'Distribución' };

export const AccountsReceivableDashboard: React.FC = () => {
  const [rows, setRows] = useState<Receivable[]>([]);
  const [summary, setSummary] = useState<ReceivableSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [payTarget, setPayTarget] = useState<Receivable | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        accountsReceivableService.list(filter ? { status: filter } : undefined).catch(() => []),
        accountsReceivableService.summary().catch(() => null),
      ]);
      setRows(r ?? []); setSummary(s);
    } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => !search ||
    (r.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.invoice_number ?? '').toLowerCase().includes(search.toLowerCase()));

  const del = async (r: Receivable) => {
    if (!confirm('¿Eliminar esta cuenta por cobrar?')) return;
    await accountsReceivableService.remove(r.id); await load();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-linear-to-r from-teal-600 to-emerald-600 text-white px-4 sm:px-6 pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><HandCoins size={24} /> Cuentas por Cobrar</h1>
            <p className="text-emerald-100 text-sm">Créditos de clientes y abonos</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><RefreshCw size={18} /></button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-white text-emerald-700 font-bold px-3 py-2 rounded-lg text-sm">
              <Plus size={16} /> Nueva cuenta
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-emerald-100 text-xs">Saldo por cobrar</p>
            <p className="text-2xl font-black">{fmt(summary?.outstanding ?? 0)}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-emerald-100 text-xs">Vencido</p>
            <p className="text-2xl font-black">{fmt(summary?.overdue_amount ?? 0)}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-emerald-100 text-xs">Cuentas pendientes</p>
            <p className="text-2xl font-black">{summary?.pending_count ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-45">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente o factura…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        {['', 'pending', 'partial', 'overdue', 'paid'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === s ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {s === '' ? 'Todas' : STATUS[s].label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="px-4 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
            <HandCoins size={34} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-500 font-semibold">Sin cuentas por cobrar</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(r => {
              const balance = Number(r.total_amount) - Number(r.paid_amount);
              const st = STATUS[r.status] ?? STATUS.pending;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-40">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900 truncate">{r.customer_name ?? 'Sin cliente'}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {r.invoice_number ? `Factura ${r.invoice_number} · ` : ''}{SOURCE[r.source] ?? r.source}
                      {r.due_date ? ` · vence ${r.due_date}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400">Saldo</p>
                    <p className="font-black text-gray-900">{fmt(balance)}</p>
                    {Number(r.paid_amount) > 0 && <p className="text-[10px] text-emerald-600">Abonado {fmt(r.paid_amount)} / {fmt(r.total_amount)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status !== 'paid' && (
                      <button onClick={() => setPayTarget(r)}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                        <Wallet size={14} /> Abonar
                      </button>
                    )}
                    <button onClick={() => del(r)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payTarget && <PayModal ar={payTarget} onClose={() => setPayTarget(null)} onDone={async () => { setPayTarget(null); await load(); }} />}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={async () => { setShowCreate(false); await load(); }} />}
    </div>
  );
};

// ── Modal: abonar ────────────────────────────────────────────────────────────
function PayModal({ ar, onClose, onDone }: { ar: Receivable; onClose: () => void; onDone: () => void }) {
  const balance = Number(ar.total_amount) - Number(ar.paid_amount);
  const [amount, setAmount] = useState<string>(String(balance));
  const [method, setMethod] = useState<'cash' | 'card' | 'sinpe'>('cash');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const pay = async () => {
    const n = Number(amount);
    if (!n || n <= 0) { setErr('Monto inválido'); return; }
    if (n > balance) { setErr('El abono supera el saldo'); return; }
    setSaving(true); setErr('');
    try { await accountsReceivableService.pay(ar.id, n, method); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">Registrar abono</h2>
            <p className="text-xs text-gray-400">{ar.customer_name ?? 'Cliente'} · saldo {fmt(balance)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Monto</label>
            <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-lg font-bold" />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setAmount(String(balance))} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-bold">Total {fmt(balance)}</button>
              <button onClick={() => setAmount(String(Math.round(balance / 2)))} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-bold">Mitad</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Método</label>
            <div className="flex gap-2">
              {(['cash', 'card', 'sinpe'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${method === m ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : 'SINPE'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={pay} disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm">
            {saving ? 'Guardando…' : <><CheckCircle2 size={16} /> Registrar abono</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: nueva cuenta manual ───────────────────────────────────────────────
function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { customersService.list().then(cs => setCustomers((cs ?? []).filter(c => c.is_active))).catch(() => {}); }, []);

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) { setErr('Monto inválido'); return; }
    const cust = customers.find(c => c.id === customerId);
    setSaving(true); setErr('');
    try {
      await accountsReceivableService.create({
        customer_id: customerId || null,
        customer_name: cust?.name ?? customerName ?? null,
        total_amount: n, due_date: dueDate || null, source: 'manual', notes: notes || null,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Nueva cuenta por cobrar</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cliente</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Cliente sin registrar —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!customerId && (
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre del cliente (opcional)"
                className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Monto</label>
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Vence</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Notas</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm">
            {saving ? 'Guardando…' : <><Plus size={16} /> Crear cuenta</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountsReceivableDashboard;
