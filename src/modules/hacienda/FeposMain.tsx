import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, UserPlus, X, Loader2, FileText, Check } from 'lucide-react';
import { getAllProducts, createProduct } from '@/services/Inventory/InventoryProductsService';
import type { Product } from '@/types/Types_POS';
import { haciendaService } from '@/services/hacienda/haciendaService';
import { useTenantId } from '@/hooks/useTenant';
import { useCashSession } from '@/hooks/useCashSession';
import { POSCustomerSearch } from '@/modules/pos/POSCustomerSearch';
import { CabysPicker } from '@/modules/inventory/products/CabysPicker';
import type { Customer } from '@/services/customers/customersService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
const IVA_OPTIONS = [13, 4, 2, 1, 0];

interface Line {
  product_id?: string;
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  iva_rate: number;
  cabys_code?: string;
  unit?: string;
}

// Una FACTURA electrónica (01) exige receptor con datos fiscales completos:
// nombre + tipo de identificación + número. Sin eso Hacienda la rechaza.
const feReceptorComplete = (c: Customer | null): boolean =>
  !!(c && String(c.name ?? '').trim()
     && (c as any).identification_type
     && String((c as any).identification ?? '').replace(/\D/g, ''));

export const FeposMain: React.FC = () => {
  const { tenantId } = useTenantId();
  const { currentSession } = useCashSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [documentType, setDocumentType] = useState<'tiquete_electronico' | 'factura_electronica'>('tiquete_electronico');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe' | 'credit'>('cash');
  const [showSearch, setShowSearch] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [quota, setQuota] = useState<any | null>(null);

  useEffect(() => {
    getAllProducts(tenantId).then(p => setProducts(p ?? [])).catch(() => {}).finally(() => setLoading(false));
    haciendaService.quota().then(setQuota).catch(() => {});
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || String(p.sku ?? '').toLowerCase().includes(q));
  }, [products, search]);

  const addProduct = (p: Product) => {
    setLines(prev => {
      const i = prev.findIndex(l => l.product_id === p.id);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }; return c; }
      return [...prev, {
        product_id: p.id, name: p.name, sku: p.sku,
        quantity: 1, unit_price: Number(p.unit_price) || 0,
        iva_rate: Number((p as any).iva_rate ?? 13),
        cabys_code: (p as any).cabys_code ?? undefined,
        unit: p.unit_type?.abbreviation ?? 'Unid',
      }];
    });
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const iva = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.iva_rate / 100), 0);
  const total = subtotal + iva;

  // Con FE activa el selector solo ofrece electrónicos.
  useEffect(() => {
    if (documentType === 'factura_electronica' && !feReceptorComplete(customer)) {
      setDocumentType('tiquete_electronico');
    }
  }, [customer]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = async () => {
    if (lines.length === 0) { setMsg({ ok: false, text: 'Agregá al menos un producto' }); return; }
    if (documentType === 'factura_electronica' && !feReceptorComplete(customer)) {
      setMsg({ ok: false, text: 'La factura electrónica requiere un cliente con nombre, tipo y número de identificación. Completá los datos del cliente o emití un tiquete.' }); return;
    }
    // Aviso de cuota agotada: cobro por comprobante extra.
    if (quota && quota.available !== null && quota.available <= 0 && quota.extra_fee > 0) {
      const cont = window.confirm(
        `⚠ Se acabaron las facturas incluidas de tu plan.\n\n` +
        `Cada comprobante adicional se cobra ₡${Number(quota.extra_fee).toLocaleString('es-CR')}.\n` +
        `Este cobro extra aplica hasta pagar o hasta que se reinicie el mes.\n\n` +
        `¿Emitir de todos modos?`,
      );
      if (!cont) return;
    }
    setEmitting(true); setMsg(null);
    try {
      const res = await haciendaService.emitDirect({
        document_type: documentType,
        payment_method: paymentMethod,
        session_id: currentSession?.id ?? null,
        customer: customer ?? undefined,
        lines: lines.map(l => ({
          product_id: l.product_id, name: l.name, sku: l.sku,
          quantity: l.quantity, unit_price: l.unit_price, iva_rate: l.iva_rate,
          cabys_code: l.cabys_code, unit: l.unit,
        })),
      });
      const tipo = res.tipo === '01' ? 'Factura' : 'Tiquete';
      setMsg({ ok: true, text: `${tipo} ${res.invoice_number} emitido ✓${res.consecutivo ? ` · ${res.consecutivo}` : ''}` });
      setLines([]); setCustomer(null); setDocumentType('tiquete_electronico');
      haciendaService.quota().then(setQuota).catch(() => {});   // refrescar contador
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo emitir' });
    } finally { setEmitting(false); }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 p-4">
      {/* Lista de productos */}
      <div className="lg:w-1/2 flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold whitespace-nowrap">
            <Plus size={15} /> Nuevo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-14 text-sm">Sin productos</p>
          ) : filtered.map(p => (
            <button key={p.id} onClick={() => addProduct(p)}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.sku}</p>
              </div>
              <span className="font-bold text-gray-700 text-sm shrink-0">{fmt(Number(p.unit_price))}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Carrito / emisión */}
      <div className="lg:w-1/2 flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          <h2 className="font-black text-gray-900">Comprobante electrónico</h2>
          {quota && quota.available !== null && (
            <span className={`ml-auto text-xs font-bold px-2 py-1 rounded-full ${quota.available <= 0 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              {quota.available <= 0 ? `Sin cupo · ₡${Number(quota.extra_fee).toLocaleString('es-CR')} c/u` : `${quota.available} disponibles`}
            </span>
          )}
        </div>

        {/* Cliente + tipo */}
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-2">
            {customer ? (
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs font-bold text-emerald-700 truncate">{customer.name}</span>
                {customer.identification && <span className="text-[10px] font-mono text-emerald-500">· {customer.identification}</span>}
                <button onClick={() => setCustomer(null)} className="ml-auto text-emerald-600">×</button>
              </div>
            ) : (
              <span className="flex-1 text-sm text-gray-400">Sin cliente (Cliente General)</span>
            )}
            <button onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 text-xs font-bold">
              <UserPlus size={13} /> Buscar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDocumentType('tiquete_electronico')}
              className={`py-2 rounded-lg text-xs font-bold ${documentType === 'tiquete_electronico' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Tiquete electrónico</button>
            <button onClick={() => feReceptorComplete(customer) ? setDocumentType('factura_electronica') : setMsg({ ok: false, text: 'La factura requiere un cliente con nombre, tipo y número de identificación' })}
              disabled={!feReceptorComplete(customer)}
              className={`py-2 rounded-lg text-xs font-bold ${documentType === 'factura_electronica' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 disabled:opacity-50'}`}>
              Factura electrónica{!feReceptorComplete(customer) ? ' (requiere cliente)' : ''}
            </button>
          </div>
        </div>

        {/* Líneas editables */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {lines.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">Tocá un producto para agregarlo</p>
          ) : lines.map((l, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm text-gray-900 truncate">{l.name}</p>
                <button onClick={() => removeLine(idx)} className="text-red-500 shrink-0"><Trash2 size={15} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Cant.</label>
                  <input type="number" inputMode="decimal" value={l.quantity}
                    onChange={e => setLine(idx, { quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Precio</label>
                  <input type="number" inputMode="decimal" value={l.unit_price}
                    onChange={e => setLine(idx, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">IVA %</label>
                  <select value={l.iva_rate} onChange={e => setLine(idx, { iva_rate: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                    {IVA_OPTIONS.map(o => <option key={o} value={o}>{o}%</option>)}
                  </select>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500 mt-1">
                {!l.cabys_code && <span className="text-amber-600 mr-2">⚠ sin CABYS</span>}
                Subtotal: <b>{fmt(l.quantity * l.unit_price)}</b>
              </div>
            </div>
          ))}
        </div>

        {/* Totales + pago + emitir */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          <div className="flex justify-between text-sm text-gray-500"><span>IVA</span><span>{fmt(iva)}</span></div>
          <div className="flex justify-between text-lg font-black text-gray-900"><span>Total</span><span>{fmt(total)}</span></div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['cash', 'card', 'sinpe', 'credit'] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className={`py-1.5 rounded-lg text-xs font-bold ${paymentMethod === m ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'sinpe' ? 'SINPE' : 'Crédito'}
              </button>
            ))}
          </div>
          {msg && (
            <div className={`text-sm font-semibold rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
          )}
          <button onClick={emit} disabled={emitting || lines.length === 0}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-50 flex items-center justify-center gap-2">
            {emitting ? <><Loader2 size={16} className="animate-spin" /> Emitiendo…</> : <><Check size={16} /> Emitir a Hacienda</>}
          </button>
        </div>
      </div>

      {showSearch && (
        <POSCustomerSearch selected={customer} onPick={c => setCustomer(c)} onClose={() => setShowSearch(false)} />
      )}
      {showNew && (
        <NewProductModal onClose={() => setShowNew(false)} onCreated={(p) => { setProducts(prev => [p, ...prev]); addProduct(p); setShowNew(false); }} tenantId={tenantId} />
      )}
    </div>
  );
};

// ── Crear artículo rápido ─────────────────────────────────────────────────────
function NewProductModal({ onClose, onCreated, tenantId }: {
  onClose: () => void; onCreated: (p: Product) => void; tenantId: string | null | undefined;
}) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState(0);
  const [iva, setIva] = useState(13);
  const [cabys, setCabys] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!name.trim()) { setErr('Nombre requerido'); return; }
    setSaving(true);
    try {
      const p = await createProduct(tenantId ?? '', {
        name: name.trim(), sku: sku.trim() || name.trim().slice(0, 12).toUpperCase(),
        unit_price: price, stock_quantity: 0,
        // Campos FE (el backend los acepta aunque no estén en el tipo Product).
        ...( { iva_rate: iva, cabys_code: cabys, tracks_stock: false } as any),
      } as any);
      onCreated({ ...(p as any), iva_rate: iva, cabys_code: cabys } as any);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Error al crear'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-900">Nuevo artículo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Código (SKU)</label>
              <input value={sku} onChange={e => setSku(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Precio</label>
              <input type="number" inputMode="decimal" value={price}
                onChange={e => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Código CABYS (define el IVA)</label>
            <CabysPicker value={cabys} onSelect={(code, ivaRate) => { setCabys(code); setIva(ivaRate); }} />
            <p className="text-[11px] text-gray-500 mt-1">IVA: <b>{iva}%</b>{cabys ? ` · CABYS ${cabys}` : ''}</p>
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
              {saving ? 'Creando…' : 'Crear y agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FeposMain;
