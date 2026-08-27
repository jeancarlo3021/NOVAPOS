import React, { useMemo, useState } from 'react';
import { Trash2, Plus, Minus, Loader2, Save, X, AlertCircle, Tag, Search, PackagePlus, Pencil } from 'lucide-react';
import { agentOrdersService, type AgentOrder, type AgentOrderItem } from '@/services/agents/salesAgentsService';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Ajuste del pedido antes de cobrarlo.
 *
 * En la puerta del cliente el pedido cambia: se devuelven productos que no se
 * dejaron, se bajan cantidades, se suman cosas que pidió de más y a veces se
 * negocia el precio. Antes había que anular y rehacer el pedido en caja; acá se
 * corrige —quitando o agregando— y el total se recalcula.
 *
 * Solo funciona mientras el pedido NO esté cobrado: después de facturado, la
 * corrección es una nota de crédito, no una edición.
 */
export const OrderItemsEditor: React.FC<{
  order: AgentOrder;
  onClose: () => void;
  onSaved: (updated: AgentOrder) => void;
}> = ({ order, onClose, onSaved }) => {
  const [items, setItems] = useState<AgentOrderItem[]>(
    order.items.map(it => ({ ...it })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Agregar productos al pedido, no solo quitarlos.
   *
   * En la puerta el cliente pide cosas de más tan seguido como devuelve: sin
   * esto había que anular el pedido y rehacerlo entero en caja para sumar una
   * línea. Es el mismo catálogo del punto de venta.
   */
  const { filteredProducts, searchTerm, setSearchTerm, loading: cargandoCatalogo } = usePOSProducts();
  const [buscando, setBuscando] = useState(false);
  /**
   * Producto suelto: se cobra sin darlo de alta en el catálogo.
   *
   * Pasa todo el tiempo — un flete, un repuesto que se compró para ese cliente,
   * algo que se vende una sola vez. Crearlo en inventario para poder cobrarlo
   * ensucia el catálogo con productos que nadie va a volver a vender.
   */
  const [suelto, setSuelto] = useState<{ nombre: string; precio: string; cantidad: string } | null>(null);

  const agregarSuelto = () => {
    const nombre = (suelto?.nombre ?? '').trim();
    const precio = round2(Number(suelto?.precio ?? 0));
    const cantidad = round2(Number(suelto?.cantidad ?? 1));
    if (!nombre) { setError('Escribí qué se está cobrando.'); return; }
    if (!(cantidad > 0)) { setError('La cantidad tiene que ser mayor a cero.'); return; }
    setError(null);
    // Sin `product_id`: la factura lo lleva por nombre y no toca el inventario.
    setItems(prev => [...prev, {
      product_id: null, product_name: nombre,
      quantity: cantidad, unit_price: precio, subtotal: round2(cantidad * precio),
    }]);
    setSuelto(null);
    setBuscando(false);
  };

  const sugerencias = useMemo(
    () => (searchTerm.trim() ? filteredProducts.slice(0, 8) : []),
    [filteredProducts, searchTerm],
  );

  const agregar = (p: any) => {
    const precio = round2(Number(p.unit_price ?? 0));
    setItems(prev => {
      // Si el producto ya está en el pedido se suma una unidad, en vez de
      // repetir la línea: dos renglones del mismo producto confunden al cliente
      // cuando lee el tiquete.
      const i = prev.findIndex(x => x.product_id && x.product_id === p.id);
      if (i >= 0) {
        return prev.map((x, j) => j === i
          ? { ...x, quantity: round2(x.quantity + 1), subtotal: round2((x.quantity + 1) * x.unit_price) }
          : x);
      }
      return [...prev, {
        product_id: p.id, product_name: p.name,
        quantity: 1, unit_price: precio, subtotal: precio,
      }];
    });
    setSearchTerm('');
    setBuscando(false);
  };

  const setQty = (i: number, qty: number) => {
    const q = Math.max(0, round2(qty));
    setItems(prev => prev.map((x, j) => j === i
      ? { ...x, quantity: q, subtotal: round2(q * x.unit_price) } : x));
  };
  const setPrice = (i: number, price: number) => {
    const p = Math.max(0, round2(price));
    setItems(prev => prev.map((x, j) => j === i
      ? { ...x, unit_price: p, subtotal: round2(x.quantity * p) } : x));
  };
  const remove = (i: number) => setItems(prev => prev.filter((_, j) => j !== i));

  // Una línea en 0 es lo mismo que no llevarla: no se manda al servidor.
  const kept = items.filter(it => it.quantity > 0);
  const total = kept.reduce((s, x) => s + x.subtotal, 0);
  const original = order.items.reduce((s, x) => s + Number(x.subtotal || 0), 0);
  const diff = round2(total - original);

  const save = async () => {
    if (kept.length === 0) {
      setError('El pedido no puede quedar vacío. Si el cliente no se quedó con nada, anulá el pedido.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const updated = await agentOrdersService.updateItems(order.id, kept);
      onSaved({ ...updated, items: kept });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">
            Ajustar {order.number ?? 'pedido'}
            <span className="block text-xs font-bold text-gray-400">
              {order.customer_name ?? 'Sin cliente'}
            </span>
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
          {/* Agregar productos: el pedido crece tan seguido como se recorta. */}
          {buscando ? (
            <div className="border-2 border-blue-200 rounded-xl p-2.5 space-y-2 bg-blue-50/40">
              <div className="flex items-center gap-2">
                <Search size={15} className="text-blue-500 shrink-0" />
                <input
                  autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto por nombre o código"
                  className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-blue-200 text-sm font-semibold outline-none"
                />
                <button onClick={() => { setBuscando(false); setSearchTerm(''); }}
                  className="p-2 rounded-lg text-gray-400 hover:bg-white"><X size={15} /></button>
              </div>
              {cargandoCatalogo && (
                <p className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" /> Cargando el catálogo…
                </p>
              )}
              {!cargandoCatalogo && searchTerm.trim() && sugerencias.length === 0 && (
                <p className="text-xs font-bold text-gray-400">Ningún producto coincide.</p>
              )}
              {sugerencias.map(p => (
                <button key={p.id} onClick={() => agregar(p)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white
                             border border-gray-200 hover:border-blue-400 text-left">
                  <span className="text-sm font-black text-gray-800 min-w-0 truncate">{p.name}</span>
                  <span className="text-sm font-black tabular-nums text-gray-600 shrink-0">
                    {money(Number((p as any).unit_price ?? 0))}
                  </span>
                </button>
              ))}
            </div>
          ) : suelto ? (
            <div className="border-2 border-amber-200 rounded-xl p-2.5 space-y-2 bg-amber-50/50">
              <p className="text-xs font-black text-amber-800">
                Producto suelto — se cobra sin agregarlo al catálogo
              </p>
              <input
                autoFocus value={suelto.nombre}
                onChange={e => setSuelto({ ...suelto, nombre: e.target.value })}
                placeholder="Qué se cobra (ej. Flete, Instalación)"
                className="w-full px-2.5 py-2 rounded-lg border border-amber-200 text-sm font-semibold outline-none"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-2">
                  <span className="text-[11px] font-bold text-gray-400">Cant.</span>
                  <input type="number" min={0} step="any" value={suelto.cantidad}
                    onChange={e => setSuelto({ ...suelto, cantidad: e.target.value })}
                    className="w-14 text-sm font-black text-gray-800 outline-none" />
                </label>
                <label className="flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-2">
                  <span className="text-xs font-bold text-gray-400">₡</span>
                  <input type="number" min={0} step="any" value={suelto.precio}
                    onChange={e => setSuelto({ ...suelto, precio: e.target.value })}
                    placeholder="Precio"
                    className="w-24 text-sm font-black text-gray-800 outline-none" />
                </label>
                <button onClick={agregarSuelto}
                  className="ml-auto px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-black">
                  Agregar
                </button>
                <button onClick={() => { setSuelto(null); setError(null); }}
                  className="p-2 rounded-lg text-gray-400 hover:bg-white"><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setBuscando(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed
                           border-blue-300 text-blue-700 text-sm font-black hover:bg-blue-50">
                <PackagePlus size={16} /> Agregar producto
              </button>
              <button onClick={() => setSuelto({ nombre: '', precio: '', cantidad: '1' })}
                title="Cobrar algo que no está en el catálogo"
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed
                           border-amber-300 text-amber-700 text-sm font-black hover:bg-amber-50">
                <Pencil size={15} /> Suelto
              </button>
            </div>
          )}

          {items.map((it, i) => (
            <div key={i} className={`border-2 rounded-xl p-2.5 ${
              it.quantity === 0 ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-black text-gray-800 min-w-0 truncate">{it.product_name}</span>
                <button onClick={() => remove(i)} title="Quitar la línea"
                  className="p-2 sm:p-1 rounded-lg text-red-500 hover:bg-red-50 shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Cantidad */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                  <button onClick={() => setQty(i, it.quantity - 1)}
                    className="px-3 py-2.5 sm:px-2 sm:py-1.5 hover:bg-gray-50"><Minus size={13} className="text-gray-500" /></button>
                  <input type="number" min={0} step="any" value={it.quantity}
                    onChange={e => setQty(i, Number(e.target.value))}
                    className="w-14 text-center text-sm font-black text-gray-800 outline-none" />
                  <button onClick={() => setQty(i, it.quantity + 1)}
                    className="px-3 py-2.5 sm:px-2 sm:py-1.5 hover:bg-gray-50"><Plus size={13} className="text-gray-500" /></button>
                </div>

                {/* Precio de venta editable */}
                <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-2.5 sm:py-1.5">
                  <Tag size={12} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-400">₡</span>
                  <input type="number" min={0} step="any" value={it.unit_price}
                    onChange={e => setPrice(i, Number(e.target.value))}
                    className="w-20 text-sm font-black text-gray-800 outline-none" />
                </label>

                <span className="ml-auto text-sm font-black tabular-nums text-gray-800">
                  {money(it.subtotal)}
                </span>
              </div>

              {it.quantity === 0 && (
                <p className="mt-1 text-[11px] font-bold text-red-600">
                  En 0: esta línea no se va a cobrar.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <div className="flex items-center justify-between text-sm font-black text-gray-800">
            <span>Total</span>
            <span className="tabular-nums">
              {money(total)}
              {diff !== 0 && (
                <span className={`ml-2 text-xs ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ({diff > 0 ? '+' : ''}{money(diff)})
                </span>
              )}
            </span>
          </div>
          <button onClick={() => void save()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderItemsEditor;
