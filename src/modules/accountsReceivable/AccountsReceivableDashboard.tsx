import React, { useEffect, useState, useCallback } from 'react';
import {
  HandCoins, Plus, X, Search, RefreshCw, Loader2,
  CheckCircle2, Trash2, Wallet, Printer, FileText, Clock,
} from 'lucide-react';
import { accountsReceivableService, type Receivable, type ReceivableSummary, type ReceivablePayment } from '@/services/accountsReceivable/accountsReceivableService';
import { useAuth } from '@/context/AuthContext';
import { customersService, type Customer } from '@/services/customers/customersService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { useTenantId } from '@/hooks/useTenant';
import { PrintTicketModal } from '@/modules/distribution/PrintTicketModal';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

type DocLine = { t: 'title' | 'center' | 'row' | 'text' | 'sep'; a?: string; b?: string };
const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE', transfer: 'Transf.', check: 'Cheque' };
const dateOnly = (iso?: string) => (iso ? String(iso).slice(0, 10) : '');

/** Comprobante del ABONO recién registrado. */
function docAbono(ar: Receivable, amount: number, method: string, newBalance: number): DocLine[] {
  return [
    { t: 'title', a: 'COMPROBANTE DE ABONO' },
    { t: 'center', a: new Date().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) },
    { t: 'sep' },
    { t: 'row', a: 'Cliente:', b: (ar.customer_name ?? 'Cliente').slice(0, 20) },
    ...(ar.invoice_number ? [{ t: 'row' as const, a: 'Factura:', b: ar.invoice_number }] : []),
    { t: 'row', a: 'Método:', b: METHOD_LABEL[method] ?? method },
    { t: 'sep' },
    { t: 'title', a: `ABONO: ${fmt(amount)}` },
    { t: 'row', a: 'Saldo anterior:', b: fmt(newBalance + amount) },
    { t: 'row', a: 'Nuevo saldo:', b: fmt(newBalance) },
    { t: 'sep' },
    { t: 'center', a: 'Gracias por su pago' },
  ];
}

/** Lista de facturas/cuentas pendientes, DESGLOSADAS por cliente y factura. */
function docPendientes(rows: Receivable[]): DocLine[] {
  const pend = rows.filter(r => Number(r.total_amount) - Number(r.paid_amount) > 0);
  const total = pend.reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);

  // Agrupar por cliente.
  const byCustomer = new Map<string, Receivable[]>();
  for (const r of pend) {
    const key = r.customer_name ?? 'Sin cliente';
    (byCustomer.get(key) ?? byCustomer.set(key, []).get(key)!).push(r);
  }

  const lines: DocLine[] = [
    { t: 'title', a: 'FACTURAS PENDIENTES' },
    { t: 'center', a: new Date().toLocaleDateString('es-CR') },
    { t: 'sep' },
  ];
  if (pend.length === 0) {
    lines.push({ t: 'center', a: '(sin facturas pendientes)' });
  } else {
    for (const [cliente, cuentas] of [...byCustomer.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      const subtotal = cuentas.reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
      lines.push({ t: 'row', a: cliente.slice(0, 26), b: fmt(subtotal) });
      for (const r of cuentas) {
        const saldo = Number(r.total_amount) - Number(r.paid_amount);
        const ref = r.invoice_number ? `Fact. ${r.invoice_number}` : `Cuenta ${dateOnly(r.created_at)}`;
        lines.push({ t: 'row', a: `  ${ref}`, b: fmt(saldo) });
        lines.push({ t: 'text', a: `    Total ${fmt(r.total_amount)} · Abon. ${fmt(r.paid_amount)}` });
      }
    }
    lines.push({ t: 'sep' });
    lines.push({ t: 'row', a: `Cuentas: ${pend.length}`, b: `Saldo ${fmt(total)}` });
  }
  return lines;
}

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
  const [zoneFilter, setZoneFilter] = useState('');
  const [payTarget, setPayTarget] = useState<Receivable | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { tenantId } = useTenantId();
  const [printJob, setPrintJob] = useState<{ title: string; lines: DocLine[] } | null>(null);
  const [pickMode, setPickMode] = useState<'pendientes' | 'historico' | null>(null);

  // Bluetooth → modal de reintentar/reconexión; corriente (térmica/navegador/QZ) → directo.
  const printDoc = async (title: string, lines: DocLine[]) => {
    try {
      const cfg: any = await posPrinterService.loadReceiptConfig(tenantId ?? '');
      // Solo Bluetooth muestra el modal de reintentar; el resto imprime directo.
      if (cfg.printerType === 'bluetooth') { setPrintJob({ title, lines }); return; }
      await posPrinterService.printDoc(lines as any, tenantId ?? '');   // impresión directa (navegador/QZ)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo imprimir');
    }
  };

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

  const zones = Array.from(new Set(rows.map(r => (r as any).zone).filter(Boolean))).sort() as string[];
  const filtered = rows.filter(r =>
    (!zoneFilter || (r as any).zone === zoneFilter) &&
    (!search ||
      (r.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.invoice_number ?? '').toLowerCase().includes(search.toLowerCase())));

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
            <button onClick={() => setPickMode('pendientes')}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-lg text-sm">
              <FileText size={16} /> Pendientes
            </button>
            <button onClick={() => setPickMode('historico')}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-lg text-sm">
              <Clock size={16} /> Histórico
            </button>
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
        {zones.length > 0 && (
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">Todas las zonas</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
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

      {payTarget && <PayModal ar={payTarget} onClose={() => setPayTarget(null)} onDone={async () => { setPayTarget(null); await load(); }} onPrint={printDoc} />}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={async () => { setShowCreate(false); await load(); }} />}

      {pickMode && (
        <PrintPickerModal mode={pickMode} rows={rows} onClose={() => setPickMode(null)} onPrint={printDoc} />
      )}

      {printJob && (
        <PrintTicketModal
          tenantId={tenantId ?? ''}
          printFn={() => posPrinterService.printDoc(printJob.lines as any, tenantId ?? '')}
          onClose={() => setPrintJob(null)}
        />
      )}
    </div>
  );
};

// ── Modal: abonar ────────────────────────────────────────────────────────────
function PayModal({ ar, onClose, onDone, onPrint }: {
  ar: Receivable; onClose: () => void; onDone: () => void;
  onPrint: (title: string, lines: DocLine[]) => void;
}) {
  const balance = Number(ar.total_amount) - Number(ar.paid_amount);
  const [amount, setAmount] = useState<string>(String(balance));
  const [method, setMethod] = useState<'cash' | 'card' | 'sinpe'>('cash');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Abono registrado (para ofrecer imprimir el comprobante del abono).
  const [paid, setPaid] = useState<{ amount: number; method: string; newBalance: number } | null>(null);
  // Abonos existentes + permiso para ANULARLOS (solo admin/gerente/contador/dueño).
  const { user } = useAuth();
  const canVoid = ['owner', 'admin', 'gerente', 'contador'].includes(user?.role ?? '');
  const [pays, setPays] = useState<ReceivablePayment[]>([]);
  const [voiding, setVoiding] = useState<string | null>(null);
  const loadPays = useCallback(() => {
    accountsReceivableService.get(ar.id).then(r => setPays(r.payments ?? [])).catch(() => {});
  }, [ar.id]);
  useEffect(() => { loadPays(); }, [loadPays]);

  const voidPay = async (pid: string) => {
    if (!confirm('¿Anular este abono? El saldo del cliente se recalcula.')) return;
    setVoiding(pid); setErr('');
    try {
      await accountsReceivableService.voidPayment(pid);
      onDone();   // refresca la lista y saldos del padre (cierra el modal)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular el abono');
      setVoiding(null);
    }
  };

  const pay = async () => {
    const n = Number(amount);
    if (!n || n <= 0) { setErr('Monto inválido'); return; }
    if (n > balance) { setErr('El abono supera el saldo'); return; }
    setSaving(true); setErr('');
    try {
      await accountsReceivableService.pay(ar.id, n, method);
      setPaid({ amount: n, method, newBalance: balance - n });   // muestra opción de imprimir
    }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">{paid ? 'Abono registrado' : 'Registrar abono'}</h2>
            <p className="text-xs text-gray-400">{ar.customer_name ?? 'Cliente'} · saldo {fmt(paid ? paid.newBalance : balance)}</p>
          </div>
          <button onClick={paid ? onDone : onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        {paid ? (
          /* ── Éxito: imprimir el abono ── */
          <div className="p-5 space-y-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle2 size={28} className="text-emerald-600" /></div>
            <p className="text-sm text-gray-600">Abono de <b>{fmt(paid.amount)}</b> registrado. Nuevo saldo <b>{fmt(paid.newBalance)}</b>.</p>
            <button onClick={() => onPrint('Comprobante de abono', docAbono(ar, paid.amount, paid.method, paid.newBalance))}
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-sm">
              <Printer size={16} /> Imprimir abono
            </button>
            <button onClick={onDone}
              className="w-full flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">
              Cerrar
            </button>
          </div>
        ) : (
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

          {/* Abonos registrados — con opción de ANULAR (solo admin/gerente/contador) */}
          {pays.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-1.5">Abonos registrados</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {pays.map(p => {
                  const anulado = !!p.voided_at;
                  return (
                  <div key={p.id} className={`flex items-center gap-2 text-sm rounded-lg px-2.5 py-1.5 ${anulado ? 'bg-red-50/60' : 'bg-gray-50'}`}>
                    <span className="text-gray-400 text-[11px] shrink-0">{dateOnly(p.created_at)}</span>
                    <span className={`font-bold ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{fmt(Number(p.amount || 0))}</span>
                    <span className="text-[11px] text-gray-400">{METHOD_LABEL[p.method] ?? p.method}</span>
                    {anulado ? (
                      <span className="ml-auto text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">ANULADO</span>
                    ) : canVoid ? (
                      <button onClick={() => voidPay(p.id)} disabled={voiding === p.id}
                        className="ml-auto text-[11px] font-bold text-red-600 hover:text-red-800 disabled:opacity-40">
                        {voiding === p.id ? 'Anulando…' : 'Anular'}
                      </button>
                    ) : null}
                  </div>
                  );
                })}
              </div>
              {!canVoid && <p className="text-[10px] text-gray-400 mt-1">Solo el administrador, gerente o contador pueden anular abonos.</p>}
            </div>
          )}
        </div>
        )}
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

// ── Modal: seleccionar cliente (y fechas) para imprimir ──────────────────────
function PrintPickerModal({ mode, rows, onClose, onPrint }: {
  mode: 'pendientes' | 'historico';
  rows: Receivable[];
  onClose: () => void;
  onPrint: (title: string, lines: DocLine[]) => void;
}) {
  // Clientes únicos con cuentas.
  const clientes = Array.from(
    new Map(rows.map(r => [r.customer_id ?? r.customer_name ?? '—', { id: r.customer_id ?? '', name: r.customer_name ?? 'Sin cliente' }])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const [cliente, setCliente] = useState('');   // '' = todos (solo pendientes)
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rowsOf = () => cliente
    ? rows.filter(r => (r.customer_id ?? r.customer_name ?? '') === cliente)
    : rows;
  const clienteName = clientes.find(c => (c.id || c.name) === cliente)?.name;

  const doPrint = async () => {
    setErr('');
    if (mode === 'pendientes') {
      onPrint(`Pendientes${clienteName ? ' · ' + clienteName : ''}`, docPendientes(rowsOf()));
      onClose();
      return;
    }
    // Histórico: requiere cliente. Junta los abonos de sus cuentas en el rango.
    if (!cliente) { setErr('Elegí un cliente para el histórico'); return; }
    setBusy(true);
    try {
      const custRows = rowsOf();
      // Por cada CUENTA: sus abonos en el rango + estado (pagada / saldo).
      const accounts: Array<{
        inv: string; pays: Array<{ d: string; method: string; amount: number }>;
        paidInRange: number; balance: number; settled: boolean;
      }> = [];
      let total = 0, cuentasPagadas = 0;
      for (const r of custRows) {
        const full = await accountsReceivableService.get(r.id).catch(() => null);
        const pays = (full?.payments ?? [])
          .map(p => ({ d: dateOnly(p.created_at), method: p.method, amount: Number(p.amount || 0) }))
          .filter(p => (!from || p.d >= from) && (!to || p.d <= to))
          .sort((a, b) => a.d.localeCompare(b.d));
        if (pays.length === 0) continue;
        const paidInRange = pays.reduce((s, p) => s + p.amount, 0);
        const balance = Number(r.total_amount) - Number(r.paid_amount);
        const settled = balance <= 0;
        if (settled) cuentasPagadas++;
        total += paidInRange;
        const invNum = full?.invoice_number ?? r.invoice_number;
        const label = invNum ? `Fact. ${invNum}` : `Cuenta ${dateOnly(r.created_at)}`;
        accounts.push({ inv: label, pays, paidInRange, balance, settled });
      }

      const lines: DocLine[] = [
        { t: 'title', a: 'HISTORICO DE ABONOS' },
        { t: 'center', a: (clienteName ?? 'Cliente').slice(0, 24) },
        { t: 'center', a: `${from || '...'} a ${to || '...'}` },
        { t: 'sep' },
      ];
      if (accounts.length === 0) {
        lines.push({ t: 'center', a: '(sin abonos en el periodo)' });
      } else {
        for (const a of accounts) {
          lines.push({ t: 'row', a: a.inv, b: a.settled ? 'PAGADA' : `saldo ${fmt(a.balance)}` });
          for (const p of a.pays) lines.push({ t: 'row', a: `  ${p.d} ${METHOD_LABEL[p.method] ?? p.method}`, b: fmt(p.amount) });
        }
        lines.push({ t: 'sep' });
        lines.push({ t: 'row', a: 'Cuentas abonadas:', b: String(accounts.length) });
        lines.push({ t: 'row', a: 'Cuentas pagadas:', b: String(cuentasPagadas) });
        lines.push({ t: 'row', a: 'Total abonado:', b: fmt(total) });
      }
      onPrint(`Histórico · ${clienteName ?? ''}`, lines);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">{mode === 'pendientes' ? 'Imprimir pendientes' : 'Imprimir histórico'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cliente</label>
            <select value={cliente} onChange={e => setCliente(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">{mode === 'pendientes' ? 'Todos los clientes' : '— Elegí un cliente —'}</option>
              {clientes.map(c => <option key={c.id || c.name} value={c.id || c.name}>{c.name}</option>)}
            </select>
          </div>
          {mode === 'historico' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Desde</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} max={to || undefined}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Hasta</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} min={from || undefined}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}
          <button onClick={doPrint} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountsReceivableDashboard;
