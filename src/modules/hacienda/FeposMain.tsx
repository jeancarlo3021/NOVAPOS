import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Trash2, UserPlus, X, Loader2, FileText, Check, ShoppingCart, FlaskConical } from 'lucide-react';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { getAllProducts, createProduct } from '@/services/Inventory/InventoryProductsService';
import { proformasService } from '@/services/proformas/proformasService';
import type { Product } from '@/types/Types_POS';
import { haciendaService } from '@/services/hacienda/haciendaService';

/**
 * Medios de pago, con el código que Hacienda espera en el XML.
 *
 * «Crédito» no es un medio de pago sino una CONDICIÓN de venta (no entra plata
 * ahora), por eso no lleva código: el sistema lo declara aparte.
 */
type MedioPago = 'cash' | 'card' | 'sinpe' | 'transfer' | 'check' | 'third_party' | 'digital' | 'credit';

const MEDIOS_PAGO: Array<{ id: MedioPago; label: string; hacienda: string | null }> = [
  { id: 'cash',        label: 'Efectivo',    hacienda: '01' },
  { id: 'card',        label: 'Tarjeta',     hacienda: '02' },
  { id: 'sinpe',       label: 'SINPE',       hacienda: '06' },
  { id: 'transfer',    label: 'Transfer.',   hacienda: '04' },
  { id: 'check',       label: 'Cheque',      hacienda: '03' },
  { id: 'third_party', label: 'Plataforma',  hacienda: '05' },
  { id: 'digital',     label: 'Billetera',   hacienda: '07' },
  { id: 'credit',      label: 'Crédito',     hacienda: null },
];
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
  /**
   * Medios de pago del comprobante electrónico.
   *
   * Hacienda tiene un código por medio y lo pide en el XML. Con solo cuatro
   * opciones, un cobro por cheque, transferencia o plataforma de delivery había
   * que declararlo como otra cosa —normalmente efectivo—, lo que dice que entró
   * plata a la caja que nunca entró y no cuadra cuando Hacienda cruza la
   * información con el banco.
   */
  const [paymentMethod, setPaymentMethod] = useState<MedioPago>('cash');
  /**
   * Nota del comprobante.
   *
   * Hay datos que el cliente pide en la factura y no caben en ninguna línea: el
   * número de orden de compra, a nombre de quién va el trabajo, la placa del
   * vehículo, una condición acordada. Sin un lugar para eso terminaban metidos
   * en el nombre de un producto, que además viaja al XML de Hacienda.
   */
  const [notes, setNotes] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [savingPf, setSavingPf] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);   // carrito como overlay en móvil
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [quota, setQuota] = useState<any | null>(null);

  useEffect(() => {
    getAllProducts(tenantId).then(p => setProducts(p ?? [])).catch(() => {}).finally(() => setLoading(false));
    haciendaService.quota().then(setQuota).catch(() => {});
  }, [tenantId]);

  // Cargar una PROFORMA (?proforma=<id>) en las líneas. Al emitir se marca convertida.
  const [searchParams, setSearchParams] = useSearchParams();
  const proformaToConvert = useRef<string | null>(null);
  useEffect(() => {
    const pid = searchParams.get('proforma');
    if (!pid || loading) return;
    searchParams.delete('proforma'); setSearchParams(searchParams, { replace: true });
    proformasService.get(pid).then(pf => {
      if (pf.status !== 'open') { setMsg({ ok: false, text: `La proforma ${pf.number} ya está ${pf.status === 'converted' ? 'convertida' : 'anulada'}` }); return; }
      setLines(pf.items.map(it => ({
        product_id: it.product_id ?? undefined, name: it.name, sku: it.sku ?? undefined,
        quantity: it.quantity, unit_price: it.unit_price, iva_rate: Number(it.iva_rate ?? 13),
        cabys_code: it.cabys ?? undefined, unit: it.unit ?? undefined,
      })));
      proformaToConvert.current = pf.id;
      setMsg({ ok: true, text: `Proforma ${pf.number} cargada — emití para convertirla en venta` });
    }).catch(() => setMsg({ ok: false, text: 'No se pudo cargar la proforma' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading]);

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

  // Guardar el carrito actual como PROFORMA (cotización) para pasarla a venta luego.
  const saveProforma = async () => {
    if (lines.length === 0) { setMsg({ ok: false, text: 'Agregá al menos un producto' }); return; }
    setSavingPf(true); setMsg(null);
    try {
      const pf = await proformasService.create({
        customer_id: (customer as any)?.id ?? null,
        customer_name: customer?.name ?? null,
        customer_identification: customer?.identification ?? null,
        items: lines.map(l => ({
          product_id: l.product_id ?? null, name: l.name, sku: l.sku ?? null,
          quantity: l.quantity, unit_price: l.unit_price, iva_rate: l.iva_rate,
          cabys: l.cabys_code ?? null, unit: l.unit ?? null,
        })),
      });
      setMsg({ ok: true, text: `Proforma ${pf.number} guardada ✓` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar la proforma' }); }
    finally { setSavingPf(false); }
  };

  /**
   * Prueba en seco.
   *
   * Arma el comprobante con los datos reales del emisor, del cliente y de los
   * productos del carrito, tal cual saldría a Hacienda — pero con un consecutivo
   * imaginario y sin enviar ni guardar nada. Sirve para descubrir un CABYS
   * faltante o un dato del emisor incompleto ANTES de quemar un consecutivo:
   * una emisión fallida deja el número consumido igual.
   */
  const [preview, setPreview] = useState<any | null>(null);
  const [testing, setTesting] = useState(false);
  const runTest = async () => {
    if (lines.length === 0) { setMsg({ ok: false, text: 'Agregá al menos un producto para probar' }); return; }
    setTesting(true); setMsg(null);
    try {
      const res = await haciendaService.emitPreview({
        document_type: documentType,
        payment_method: paymentMethod,
        session_id: currentSession?.id ?? null,
        notes: notes.trim() || undefined,
        customer: customer ?? undefined,
        lines: lines.map(l => ({
          product_id: l.product_id, name: l.name, sku: l.sku,
          quantity: l.quantity, unit_price: l.unit_price, iva_rate: l.iva_rate,
          cabys_code: l.cabys_code, unit: l.unit,
        })),
      });
      // Lo que de verdad se quiere ver es el TIQUETE: cómo sale en papel, con los
      // productos, los totales y el consecutivo. Se imprime siempre, marcado como
      // prueba para que nadie lo confunda con un comprobante válido.
      let printErr: string | null = null;
      try {
        const now = new Date();
        await posPrinterService.printAuto({
          invoiceNumber: res.consecutivo_imaginario ?? 'PRUEBA',
          date: now.toLocaleDateString('es-CR'),
          time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          customerName: customer?.name ?? undefined,
          customerEmail: (customer as any)?.email ?? undefined,
          items: lines.map(l => ({
            name: l.name, quantity: l.quantity,
            unitPrice: l.unit_price,
            subtotal: Math.round(l.quantity * l.unit_price * 100) / 100,
          })),
          subtotal: res.totales?.subtotal ?? 0,
          tax: res.totales?.iva ?? 0,
          total: res.totales?.total ?? 0,
          paymentMethod: paymentMethod,
          notes: notes.trim() || undefined,
          // `copyLabel` sale centrado y en grande arriba del tiquete, y además
          // fuerza UNA sola copia: una prueba no se imprime por duplicado.
          copyLabel: 'PRUEBA - SIN VALOR FISCAL',
          hideThanks: true,
        }, tenantId ?? '');
      } catch (pe) {
        printErr = pe instanceof Error ? pe.message : 'No se pudo imprimir la prueba';
      }

      // El modal solo aparece cuando tiene algo que decir: si falta un dato o la
      // impresión falló. Si todo salió bien, el papel ya es la respuesta.
      if (res.faltantes?.length > 0 || printErr) {
        setPreview({ ...res, _printErr: printErr });
      } else {
        setMsg({ ok: true, text: `Prueba impresa ✓ · el consecutivo real sería ${res.proximo_consecutivo_real}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo generar la prueba' });
    } finally { setTesting(false); }
  };

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
        notes: notes.trim() || undefined,
        customer: customer ?? undefined,
        lines: lines.map(l => ({
          product_id: l.product_id, name: l.name, sku: l.sku,
          quantity: l.quantity, unit_price: l.unit_price, iva_rate: l.iva_rate,
          cabys_code: l.cabys_code, unit: l.unit,
        })),
      });
      const tipo = res.tipo === '01' ? 'Factura' : 'Tiquete';
      setMsg({ ok: true, text: `${tipo} ${res.invoice_number} emitido ✓${res.consecutivo ? ` · ${res.consecutivo}` : ''}` });
      if (proformaToConvert.current) {
        proformasService.convert(proformaToConvert.current, res.invoice_number).catch(() => {});
        proformaToConvert.current = null;
      }
      setLines([]); setCustomer(null); setDocumentType('tiquete_electronico'); setCartOpen(false);
      setNotes('');
      haciendaService.quota().then(setQuota).catch(() => {});   // refrescar contador
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo emitir' });
    } finally { setEmitting(false); }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row gap-4 p-4">
      {/* Lista de productos */}
      <div className="flex-1 min-h-0 md:flex-none md:w-1/2 flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden">
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

      {/* Carrito / emisión — en móvil es overlay (botón flotante abajo); en md+ va al lado. */}
      <div className={`${cartOpen ? 'fixed inset-0 z-50 bg-black/40 p-3 flex' : 'hidden'} md:static md:z-auto md:bg-transparent md:p-0 md:flex md:w-1/2`}>
      <div className="flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden w-full max-h-full">
        <button onClick={() => setCartOpen(false)} className="md:hidden flex items-center justify-center gap-1 py-2 text-sm font-bold text-gray-500 border-b border-gray-100">
          <X size={16} /> Cerrar carrito
        </button>
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          <h2 className="font-black text-gray-900">Comprobante electrónico</h2>
          {/* Prueba en seco, al lado del título: es lo que se hace ANTES de
              emitir, así que conviene tenerlo a la vista desde el inicio y no
              hasta el fondo del carrito. */}
          <button onClick={runTest} disabled={testing || lines.length === 0}
            title="Arma el comprobante con los datos reales, sin enviarlo ni consumir consecutivo"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-[11px] font-bold disabled:opacity-40">
            {testing ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />}
            Probar
          </button>
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
            {MEDIOS_PAGO.map(m => (
              <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                title={m.hacienda ? `Hacienda: código ${m.hacienda}` : 'Condición de venta: crédito'}
                className={`py-1.5 rounded-lg text-xs font-bold ${paymentMethod === m.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              rows={notes ? 2 : 1}
              placeholder="Nota del comprobante (opcional) — ej. orden de compra, placa, referencia"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            {notes.length > 400 && (
              <p className="text-[11px] text-gray-400 text-right mt-0.5">{notes.length}/500</p>
            )}
          </div>
          {msg && (
            <div className={`text-sm font-semibold rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={saveProforma} disabled={savingPf || lines.length === 0}
              className="py-3 rounded-xl border-2 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1">
              {savingPf ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Proforma
            </button>
            <button onClick={emit} disabled={emitting || lines.length === 0}
              className="col-span-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-50 flex items-center justify-center gap-2">
              {emitting ? <><Loader2 size={16} className="animate-spin" /> Emitiendo…</> : <><Check size={16} /> Emitir a Hacienda</>}
            </button>
          </div>
        </div>
      </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <FlaskConical size={18} className="text-amber-600" /> Prueba — no se envió nada
                </h3>
                <p className="text-xs text-gray-500">
                  {preview.tipo === '01' ? 'Factura electrónica' : 'Tiquete electrónico'} ·
                  {' '}{preview.ambiente === 'sandbox' ? 'Ambiente de pruebas' : 'Ambiente de producción'} ·
                  {' '}{preview.provider}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {preview._printErr && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <b>No se pudo imprimir la prueba:</b> {preview._printErr}
                </div>
              )}
              {preview.faltantes?.length > 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-black text-amber-900 mb-1">
                    {preview.faltantes.length} cosa(s) que revisar antes de emitir
                  </p>
                  <ul className="text-[13px] text-amber-900 space-y-0.5">
                    {preview.faltantes.map((f: string, i: number) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  ✓ El comprobante está completo. No se detectaron datos faltantes.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] font-black text-gray-400 uppercase">Consecutivo de la prueba</p>
                  <p className="font-mono text-xs text-gray-500 break-all">{preview.consecutivo_imaginario}</p>
                  <p className="text-[11px] text-gray-400 mt-1">Imaginario: no se consumió.</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] font-black text-gray-400 uppercase">El real sería</p>
                  <p className="font-mono text-xs text-gray-800 break-all">{preview.proximo_consecutivo_real}</p>
                  <p className="text-[11px] text-gray-400 mt-1">Se usa al emitir de verdad.</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Líneas</span><b>{preview.lineas}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><b>₡{Number(preview.totales?.subtotal ?? 0).toLocaleString('es-CR')}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">IVA</span><b>₡{Number(preview.totales?.iva ?? 0).toLocaleString('es-CR')}</b></div>
                <div className="flex justify-between border-t border-gray-100 mt-1 pt-1">
                  <span className="font-black text-gray-700">Total</span>
                  <b className="text-blue-700">₡{Number(preview.totales?.total ?? 0).toLocaleString('es-CR')}</b>
                </div>
              </div>

              <details className="rounded-xl border border-gray-200">
                <summary className="px-3 py-2 text-xs font-black text-gray-600 cursor-pointer">
                  Ver el documento exacto que se enviaría
                </summary>
                <pre className="px-3 pb-3 text-[10px] text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(preview.documento, null, 2)}
                </pre>
              </details>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setPreview(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cerrar</button>
              <button
                onClick={() => { setPreview(null); void emit(); }}
                disabled={preview.faltantes?.length > 0}
                title={preview.faltantes?.length > 0 ? 'Corregí lo que falta antes de emitir' : ''}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-lg disabled:opacity-40">
                Emitir de verdad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón flotante del carrito (solo móvil) */}
      <button onClick={() => setCartOpen(true)}
        className="md:hidden fixed bottom-18 right-5 z-30 flex items-center gap-2 px-5 py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-black shadow-xl">
        <ShoppingCart size={18} /> Carrito{lines.length > 0 ? ` (${lines.length})` : ''}
      </button>

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
