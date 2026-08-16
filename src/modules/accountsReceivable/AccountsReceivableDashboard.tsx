import React, { useEffect, useState, useCallback } from 'react';
import {
  HandCoins, Plus, X, Search, RefreshCw, Loader2,
  CheckCircle2, Trash2, Wallet, Printer, FileText, Clock, Package,
} from 'lucide-react';
import { accountsReceivableService, type Receivable, type ReceivableSummary, type ReceivablePayment } from '@/services/accountsReceivable/accountsReceivableService';
import { useAuth } from '@/context/AuthContext';
import { customersService, type Customer } from '@/services/customers/customersService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { PrintTicketModal } from '@/modules/distribution/PrintTicketModal';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

type DocLine = { t: 'title' | 'center' | 'row' | 'text' | 'sep'; a?: string; b?: string };
/** Nombre legible del comprobante elegido en el abono masivo. */
const DOC_LABEL: Record<string, string> = {
  ticket: 'Tiquete corriente',
  tiquete_electronico: 'Tiquete electrónico',
  factura_electronica: 'Factura electrónica',
};

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

/** Productos de una cuenta, ya resueltos para el detalle impreso. */
type ItemsByReceivable = Map<string, Array<{ name: string; qty: number; total: number }>>;

/**
 * Lista de facturas/cuentas pendientes, DESGLOSADAS por cliente y factura.
 *
 * Con `items` se imprime además QUÉ se llevó en cada factura. Es la diferencia
 * entre un estado de cuenta que el cliente acepta y uno que discute: ante un
 * saldo sin detalle, la respuesta siempre es «¿y esto de qué es?».
 */
function docPendientes(rows: Receivable[], items?: ItemsByReceivable): DocLine[] {
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
        for (const it of items?.get(r.id) ?? []) {
          // El nombre se recorta al ancho del papel para que la cantidad y el
          // monto no se caigan a la línea siguiente.
          lines.push({ t: 'row', a: `    ${it.qty}x ${it.name}`.slice(0, 30), b: fmt(it.total) });
        }
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
  const [pickMode, setPickMode] = useState<'pendientes' | 'historico' | 'consolidado' | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  /** Todas las cuentas, sin el filtro de estado: es lo que usan los modales. */
  const [allRows, setAllRows] = useState<Receivable[]>([]);

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
      // Dos listas a propósito:
      //  · `rows`    — lo que se ve en pantalla, con el filtro de estado activo.
      //  · `allRows` — TODO, para los modales de abono e impresión.
      // Los modales trabajan sobre el total: si usaran la lista filtrada, tener
      // «Pagadas» seleccionado dejaba el selector de clientes vacío y parecía
      // que el cliente no existía.
      const [r, all, s] = await Promise.all([
        accountsReceivableService.list(filter ? { status: filter } : undefined).catch(() => []),
        filter
          ? accountsReceivableService.list().catch(() => [])
          : Promise.resolve(null),
        accountsReceivableService.summary().catch(() => null),
      ]);
      setRows(r ?? []);
      setAllRows((all ?? r ?? []) as typeof rows);
      setSummary(s);
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
            <button onClick={() => setPickMode('consolidado')}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-lg text-sm">
              <Package size={16} /> Consolidado
            </button>
            <button onClick={() => setPickMode('historico')}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-lg text-sm">
              <Clock size={16} /> Histórico
            </button>
            {/* Abono masivo: el cliente entrega UN monto y se reparte entre sus
                facturas. Es como se cobra de verdad en la calle — nadie paga
                factura por factura— y hasta ahora había que ir una por una. */}
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-lg text-sm">
              <Wallet size={16} /> Abono masivo
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
                      {r.due_date && r.status !== 'paid' ? ` · vence ${r.due_date}` : ''}
                    </p>
                    {/* Cuándo quedó cancelada. Es la pregunta que aparece cuando
                        el cliente reclama, y hasta ahora el dato no existía:
                        `updated_at` cambia con cualquier edición posterior. */}
                    {r.status === 'paid' && r.paid_at && (
                      <p className="text-[11px] font-bold text-emerald-600">
                        Cancelada el {dateOnly(r.paid_at)}
                      </p>
                    )}
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

      {showBulk && (
        <BulkPayModal
          rows={allRows}
          onClose={() => setShowBulk(false)}
          onDone={async () => { setShowBulk(false); await load(); }}
          onPrint={printDoc}
        />
      )}
      {payTarget && <PayModal ar={payTarget} onClose={() => setPayTarget(null)} onDone={async () => { setPayTarget(null); await load(); }} onPrint={printDoc} />}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={async () => { setShowCreate(false); await load(); }} />}

      {pickMode && (
        <PrintPickerModal mode={pickMode} rows={allRows} onClose={() => setPickMode(null)} onPrint={printDoc} />
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

/**
 * CONSOLIDADO: todos los productos de las facturas pendientes, sumados.
 *
 * Responde una pregunta que el detalle por factura no contesta: qué mercadería
 * está en la calle sin cobrar. Para un distribuidor eso decide qué reponer y con
 * quién insistir; verlo repartido en veinte facturas no sirve.
 *
 * Se agrupa por NOMBRE y no por id: las facturas viejas guardan el nombre del
 * producto tal como estaba al venderse, y un producto renombrado o borrado no
 * debe partirse en dos renglones.
 */
function docConsolidado(rows: Receivable[], items: ItemsByReceivable, cliente?: string): DocLine[] {
  const pend = rows.filter(r => Number(r.total_amount) - Number(r.paid_amount) > 0);
  const agg = new Map<string, { qty: number; total: number }>();
  for (const r of pend) {
    for (const it of items.get(r.id) ?? []) {
      const key = it.name.trim();
      const prev = agg.get(key) ?? { qty: 0, total: 0 };
      agg.set(key, { qty: prev.qty + it.qty, total: prev.total + it.total });
    }
  }
  const list = [...agg.entries()].sort((a, b) => b[1].total - a[1].total);
  const saldo = pend.reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
  const totalProd = list.reduce((s, [, v]) => s + v.total, 0);

  const lines: DocLine[] = [
    { t: 'title', a: 'CONSOLIDADO PENDIENTE' },
    ...(cliente ? [{ t: 'center' as const, a: cliente.slice(0, 24) }] : []),
    { t: 'center', a: new Date().toLocaleDateString('es-CR') },
    { t: 'sep' },
  ];
  if (list.length === 0) {
    lines.push({ t: 'center', a: '(sin productos por cobrar)' });
  } else {
    for (const [name, v] of list) {
      lines.push({ t: 'row', a: `${v.qty} ${name}`.slice(0, 30), b: fmt(v.total) });
    }
    lines.push({ t: 'sep' });
    lines.push({ t: 'row', a: `Productos: ${list.length}`, b: fmt(totalProd) });
    lines.push({ t: 'row', a: `Facturas: ${pend.length}`, b: `Saldo ${fmt(saldo)}` });
    // El total de productos es el FACTURADO; el saldo es lo que falta cobrar.
    // Si hubo abonos parciales no coinciden, y sin decirlo parece un error.
    if (Math.round(totalProd) !== Math.round(saldo)) {
      lines.push({ t: 'text', a: 'La diferencia son abonos ya recibidos.' });
    }
  }
  return lines;
}

// ── Modal: ABONO MASIVO ──────────────────────────────────────────────────────
/**
 * Un solo monto repartido entre las cuentas de un cliente.
 *
 * Es como se cobra de verdad: el cliente entrega ₡50 000 y hay que aplicarlos a
 * lo que debe. Antes había que abrir cuenta por cuenta y calcular a mano cuánto
 * le tocaba a cada una, y ahí es donde aparecen los descuadres.
 *
 * Se aplica de la MÁS VIEJA a la más nueva. Es lo que espera cualquiera —y lo
 * que conviene al negocio, porque saca primero lo que lleva más tiempo sin
 * cobrarse.
 */
function BulkPayModal({ rows, onClose, onDone, onPrint }: {
  rows: Receivable[];
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onPrint: (title: string, lines: DocLine[]) => void;
}) {
  const clientes = Array.from(
    new Map(rows
      .filter(r => Number(r.total_amount) - Number(r.paid_amount) > 0)
      .map(r => [r.customer_id ?? r.customer_name ?? '—', { id: r.customer_id ?? '', name: r.customer_name ?? 'Sin cliente' }])
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const [cliente, setCliente] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  /** Comprobante a emitir por el abono (solo para cuentas sin factura previa). */
  const [docType, setDocType] = useState<'ninguno' | 'ticket' | 'tiquete_electronico' | 'factura_electronica'>('ninguno');

  /** Cuentas pendientes del cliente, de la más vieja a la más nueva. */
  const cuentas = React.useMemo(() => rows
    .filter(r => (r.customer_id ?? r.customer_name ?? '') === cliente)
    .filter(r => Number(r.total_amount) - Number(r.paid_amount) > 0)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [rows, cliente]);

  const deuda = cuentas.reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
  const monto = Math.max(0, Number(amount) || 0);

  /** Cómo se reparte el monto. Se calcula ANTES de cobrar, y se muestra. */
  const reparto = React.useMemo(() => {
    let queda = monto;
    return cuentas.map(r => {
      const saldo = Number(r.total_amount) - Number(r.paid_amount);
      const aplica = Math.min(queda, saldo);
      queda = Math.round((queda - aplica) * 100) / 100;
      return { r, saldo, aplica, quedaEnCuenta: saldo - aplica };
    }).filter(x => x.aplica > 0);
  }, [cuentas, monto]);

  const aplicado = reparto.reduce((s, x) => s + x.aplica, 0);
  /**
   * Cuentas cuyo ingreso YA se declaró: las que tienen comprobante ELECTRÓNICO.
   *
   * Tener factura interna no cuenta. Una venta documentada con tiquete corriente
   * nunca llegó a Hacienda, así que al cobrarla corresponde emitir — es la
   * primera vez que ese ingreso se declara.
   */
  const yaFacturadas = reparto.filter(x => x.r.invoice_electronic === true).length;
  const sinFacturar = reparto.length - yaFacturadas;
  const sobrante = Math.round((monto - aplicado) * 100) / 100;

  const run = async () => {
    if (!cliente) { setErr('Elegí un cliente'); return; }
    if (monto <= 0) { setErr('Ingresá el monto recibido'); return; }
    if (reparto.length === 0) { setErr('Ese cliente no tiene saldo pendiente'); return; }
    setBusy(true); setErr('');
    const hechos: Array<{ ref: string; amount: number; saldada: boolean }> = [];
    // Un id compartido por todos los abonos de ESTE pago. Sin él, en la base
    // quedan cinco abonos sueltos y nadie puede reconstruir después que fueron
    // un solo pago del cliente.
    const batchId = (crypto as any)?.randomUUID?.()
      ?? `b-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      // En serie y no en paralelo: cada abono recalcula el saldo de su cuenta en
      // el servidor, y mandarlos todos a la vez invita a que dos se pisen.
      let i = 0;
      for (const x of reparto) {
        setProgress(`${++i} / ${reparto.length}`);
        // El tipo elegido queda en la nota del abono: aunque todavía no se emita
        // el comprobante, el rastro de qué se acordó emitir no se pierde.
        const nota = [note.trim(), docType !== 'ninguno' && x.r.invoice_electronic !== true ? `Comprobante: ${docType}` : '']
          .filter(Boolean).join(' · ');
        await accountsReceivableService.pay(x.r.id, x.aplica, method, nota || undefined, undefined, batchId);
        hechos.push({
          ref: x.r.invoice_number ? `Fact. ${x.r.invoice_number}` : `Cuenta ${dateOnly(x.r.created_at)}`,
          amount: x.aplica,
          // Saber CUÁLES quedaron saldadas es lo que el cliente revisa del
          // recibo: un monto total no le dice si ya puede olvidarse de la
          // factura de marzo.
          saldada: x.quedaEnCuenta <= 0,
        });
      }
    } catch (e) {
      // Se informa QUÉ alcanzó a aplicarse: si falla el cuarto de seis abonos,
      // los tres primeros ya están hechos y volver a mandar todo cobraría doble.
      setErr(`${e instanceof Error ? e.message : 'Error al aplicar'}${
        hechos.length ? ` · Se aplicaron ${hechos.length} de ${reparto.length}. Revisá antes de reintentar.` : ''}`);
      setBusy(false); setProgress('');
      if (hechos.length) await onDone();
      return;
    }

    const nombre = clientes.find(c => (c.id || c.name) === cliente)?.name ?? 'Cliente';

    // Comprobante del abono, SOLO por las cuentas que no tenían uno. Va después
    // de aplicar los abonos y con el error contenido: la plata ya se recibió y
    // se registró, así que un fallo al emitir no puede deshacer el cobro.
    let comprobante = '';
    if (docType !== 'ninguno' && sinFacturar > 0) {
      const montoSinFactura = reparto
        .filter(x => x.r.invoice_electronic !== true)
        .reduce((s, x) => s + x.aplica, 0);
      if (montoSinFactura > 0) {
        try {
          const r = await accountsReceivableService.emitReceipt({
            amount: montoSinFactura,
            document_type: docType,
            customer_id: reparto.find(x => x.r.invoice_electronic !== true)?.r.customer_id ?? null,
            customer_name: nombre,
            batch_id: batchId,
            payment_method: method,
            // Para que el servidor pueda verificar por su cuenta cuáles no se
            // han declarado, en vez de confiar en lo que mandó la pantalla.
            account_ids: reparto.filter(x => x.r.invoice_electronic !== true).map(x => x.r.id),
          });
          comprobante = r?.invoice_number ? `Comprobante ${r.invoice_number}` : '';
          if (r?.error) setErr(`Abonos aplicados. El comprobante no se emitió: ${r.error}`);
        } catch (e) {
          setErr(`Abonos aplicados. El comprobante no se emitió: ${
            e instanceof Error ? e.message : 'error'}`);
        }
      }
    }
    onPrint(`Abono · ${nombre}`, [
      { t: 'title', a: 'RECIBO DE ABONO' },
      { t: 'center', a: nombre.slice(0, 24) },
      { t: 'center', a: new Date().toLocaleString('es-CR') },
      { t: 'sep' },
      ...hechos.flatMap(h => [
        { t: 'row' as const, a: h.ref, b: fmt(h.amount) },
        ...(h.saldada ? [{ t: 'text' as const, a: '    >> PAGADA <<' }] : []),
      ]),
      { t: 'sep' },
      { t: 'row', a: 'Total abonado:', b: fmt(aplicado) },
      ...(hechos.some(h => h.saldada)
        ? [{ t: 'row' as const, a: 'Facturas saldadas:', b: String(hechos.filter(h => h.saldada).length) }]
        : []),
      { t: 'row', a: 'Saldo anterior:', b: fmt(deuda) },
      { t: 'row', a: 'Nuevo saldo:', b: fmt(deuda - aplicado) },
      ...(comprobante
        ? [{ t: 'text' as const, a: `${DOC_LABEL[docType]} · ${comprobante}` }]
        : docType !== 'ninguno' && sinFacturar > 0
          ? [{ t: 'text' as const, a: `${DOC_LABEL[docType]}: no se pudo emitir` }]
          : []),
      ...(sobrante > 0 ? [{ t: 'text' as const, a: `Sobrante no aplicado: ${fmt(sobrante)}` }] : []),
      { t: 'sep' },
      { t: 'center', a: 'Gracias por su pago' },
    ]);
    setBusy(false); setProgress('');
    await onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-black text-gray-900">Abono masivo</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cliente</label>
            <select value={cliente} onChange={e => { setCliente(e.target.value); setErr(''); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Elegí un cliente —</option>
              {clientes.map(c => <option key={c.id || c.name} value={c.id || c.name}>{c.name}</option>)}
            </select>
          </div>

          {cliente && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm">
              Debe <b>{fmt(deuda)}</b> en {cuentas.length} cuenta(s).
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">Monto recibido</label>
              <input type="number" inputMode="decimal" min="0" value={amount}
                onChange={e => { setAmount(e.target.value); setErr(''); }}
                placeholder={cliente ? String(Math.round(deuda)) : '0'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="w-36">
              <label className="block text-xs font-bold text-gray-600 mb-1">Forma</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="sinpe">SINPE</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>
          {cliente && deuda > 0 && (
            <button type="button" onClick={() => setAmount(String(Math.round(deuda)))}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900">
              Cancelar todo ({fmt(deuda)})
            </button>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nota <span className="font-normal text-gray-400">(opcional)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Recibo 123, depósito…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ── Comprobante del abono ─────────────────────────────────────
              La distinción es fiscal, no cosmética: una cuenta que nació de una
              venta YA tiene su comprobante emitido con condición de venta
              «crédito». Emitir otro al cobrar declararía el mismo ingreso dos
              veces ante Hacienda.
              Las cuentas MANUALES nunca tuvieron comprobante, y ahí sí
              corresponde emitirlo al recibir la plata. */}
          {reparto.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <label className="block text-xs font-bold text-gray-600">Comprobante por este abono</label>
              <select value={docType} onChange={e => setDocType(e.target.value as typeof docType)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="ninguno">Ninguno · solo recibo interno</option>
                <option value="ticket">Tiquete corriente</option>
                <option value="tiquete_electronico">Tiquete electrónico</option>
                <option value="factura_electronica">Factura electrónica</option>
              </select>
              {yaFacturadas > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  {yaFacturadas} de estas {reparto.length} cuenta(s) <b>ya se declararon a Hacienda</b>
                  cuando se vendió a crédito. Emitir otro declararía el mismo ingreso dos veces:
                  el comprobante saldría solo por las {sinFacturar} restante(s).
                </p>
              )}
              {docType !== 'ninguno' && sinFacturar === 0 && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  Ninguna de estas cuentas necesita comprobante: todas se declararon a Hacienda al
                  venderse.
                </p>
              )}
            </div>
          )}

          {/* El reparto se MUESTRA antes de aplicarlo: es dinero del cliente y
              tiene que poder verse a qué factura va cada colón. */}
          {reparto.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <p className="px-3 py-2 bg-gray-50 text-xs font-black text-gray-700">
                Se aplica de la más vieja a la más nueva
              </p>
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {reparto.map(x => (
                  <div key={x.r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-gray-700 truncate">
                      {x.r.invoice_number ? `Fact. ${x.r.invoice_number}` : `Cuenta ${dateOnly(x.r.created_at)}`}
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="text-emerald-700">{fmt(x.aplica)}</b>
                      {x.quedaEnCuenta > 0 && (
                        <span className="block text-[10px] text-amber-600">queda {fmt(x.quedaEnCuenta)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {sobrante > 0 && (
                <p className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-t border-amber-100">
                  Sobran {fmt(sobrante)}: el cliente entregó más de lo que debe. Solo se aplica lo
                  adeudado; el resto no se registra como saldo a favor.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={run} disabled={busy || reparto.length === 0}
            className="flex-[1.4] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm">
            {busy ? `Aplicando… ${progress}` : `Aplicar ${fmt(aplicado)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: seleccionar cliente (y fechas) para imprimir ──────────────────────
function PrintPickerModal({ mode, rows, onClose, onPrint }: {
  mode: 'pendientes' | 'historico' | 'consolidado';
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
  /** Nivel de detalle del estado de cuenta impreso. */
  const [detalle, setDetalle] = useState<'simple' | 'detallado'>('simple');
  const [progress, setProgress] = useState('');

  const rowsOf = () => cliente
    ? rows.filter(r => (r.customer_id ?? r.customer_name ?? '') === cliente)
    : rows;
  const clienteName = clientes.find(c => (c.id || c.name) === cliente)?.name;

  /**
   * Trae los productos de las facturas pendientes del alcance elegido.
   *
   * Va en serie y con avance porque son N llamadas: un cliente con veinte
   * facturas tarda, y sin avance parece que el botón no hizo nada. Una factura
   * que falle no frena al resto — un renglón de menos es mejor que un documento
   * que no sale.
   */
  const cargarItems = async (): Promise<ItemsByReceivable> => {
    const target = rowsOf().filter(r => Number(r.total_amount) - Number(r.paid_amount) > 0);
    const items: ItemsByReceivable = new Map();
    let done = 0;
    for (const r of target) {
      setProgress(`${++done} / ${target.length}`);
      if (!r.invoice_id) continue;
      try {
        const inv = await apiFetch<any>(`/invoices/${r.invoice_id}`);
        const list = (inv?.invoice_items ?? []).map((it: any) => ({
          name: String(it.product_name ?? it.product?.name ?? 'Producto'),
          qty: Number(it.quantity) || 0,
          total: Number(it.subtotal ?? 0),
        }));
        if (list.length) items.set(r.id, list);
      } catch { /* una factura sin detalle no debe frenar el resto */ }
    }
    return items;
  };

  const doPrint = async () => {
    setErr('');
    if (mode === 'consolidado') {
      setBusy(true);
      try {
        const items = await cargarItems();
        onPrint(`Consolidado${clienteName ? ' · ' + clienteName : ''}`,
          docConsolidado(rowsOf(), items, clienteName));
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se pudo armar el consolidado');
      } finally { setBusy(false); setProgress(''); }
      return;
    }
    if (mode === 'pendientes') {
      if (detalle === 'simple') {
        onPrint(`Pendientes${clienteName ? ' · ' + clienteName : ''}`, docPendientes(rowsOf()));
        onClose();
        return;
      }
      // DETALLADO: hay que traer los productos de cada factura. Va en serie y con
      // aviso de avance porque son N llamadas: un cliente con veinte facturas
      // tarda, y sin avance parece que el botón no hizo nada.
      setBusy(true);
      try {
        const items = await cargarItems();
        onPrint(`Pendientes detallado${clienteName ? ' · ' + clienteName : ''}`,
          docPendientes(rowsOf(), items));
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se pudo armar el detalle');
      } finally { setBusy(false); setProgress(''); }
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
        paidInRange: number; balance: number; settled: boolean; paidAt: string | null;
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
        accounts.push({
          inv: label, pays, paidInRange, balance, settled,
          paidAt: settled && (full?.paid_at ?? r.paid_at) ? dateOnly((full?.paid_at ?? r.paid_at) as string) : null,
        });
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
          if (a.settled && a.paidAt) lines.push({ t: 'text', a: `  Cancelada el ${a.paidAt}` });
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
          <h2 className="font-black text-gray-900">
            {mode === 'pendientes' ? 'Imprimir pendientes'
              : mode === 'consolidado' ? 'Consolidado de productos'
              : 'Imprimir histórico'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cliente</label>
            <select value={cliente} onChange={e => setCliente(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">{mode === 'historico' ? '— Elegí un cliente —' : 'Todos los clientes'}</option>
              {clientes.map(c => <option key={c.id || c.name} value={c.id || c.name}>{c.name}</option>)}
            </select>
          </div>
          {mode === 'consolidado' && (
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Suma los productos de <b>todas las facturas pendientes</b>: cuánta mercadería está
              en la calle sin cobrar.
              {progress && <b className="text-gray-800"> {progress}</b>}
            </p>
          )}
          {mode === 'pendientes' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Nivel de detalle</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDetalle('simple')}
                  className={`text-left rounded-xl border-2 px-3 py-2 transition ${
                    detalle === 'simple' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="text-sm font-black text-gray-900">Simplificado</p>
                  <p className="text-[10px] text-gray-500 leading-tight">Solo facturas y saldos</p>
                </button>
                <button type="button" onClick={() => setDetalle('detallado')}
                  className={`text-left rounded-xl border-2 px-3 py-2 transition ${
                    detalle === 'detallado' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="text-sm font-black text-gray-900">Detallado</p>
                  <p className="text-[10px] text-gray-500 leading-tight">Con los productos de cada factura</p>
                </button>
              </div>
              {detalle === 'detallado' && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Tarda un poco más: hay que traer el detalle de cada factura.
                  {progress && <b className="text-gray-600"> {progress}</b>}
                </p>
              )}
            </div>
          )}
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
