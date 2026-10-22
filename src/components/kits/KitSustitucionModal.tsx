import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, PackageSearch, Repeat2, X } from 'lucide-react';
import { productKitsService, type KitLeaf } from '@/services/Inventory/productKitsService';

/**
 * CAMBIAR UN COMPONENTE DEL KIT AL VENDERLO.
 *
 * Un combo se vende como una sola cosa, pero por dentro lleva productos reales.
 * Cuando uno de esos productos se acabó, hasta ahora pasaban dos cosas malas:
 * la venta salía igual y el inventario quedaba en negativo, o el cajero tenía
 * que deshacer el combo y armarlo a mano producto por producto, con el cliente
 * esperando.
 *
 * Acá se resuelve en el momento: se muestra lo que falta y con qué se puede
 * reemplazar. El cambio vale SOLO para esta venta —la receta del kit no se
 * toca, mañana vuelve a haber— y viaja con la línea para que el inventario baje
 * lo que de verdad salió de la bodega.
 */

export interface SustitucionKit {
  from: string;
  to: string;
  from_name?: string;
  to_name?: string;
}

interface Props {
  /** El kit que se está agregando. */
  kit: { id: string; name: string };
  /** Cuántos kits se agregan: decide si el stock alcanza. */
  cantidad: number;
  /** Catálogo ya cargado por la pantalla que llama (POS, proforma). */
  productos: any[];
  onConfirmar: (subs: SustitucionKit[]) => void;
  onCancelar: () => void;
}

const money = (n: number) =>
  `₡${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/** Texto comparable: sin tildes y en minúsculas. */
const sinTildes = (v: any) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * ¿Hace falta preguntar antes de agregar este kit?
 *
 * Se resuelve con una consulta al servidor porque el stock de las hojas puede
 * estar tres niveles abajo, dentro de sub-kits, y el catálogo del POS no sabe
 * nada de eso. Si la consulta falla NO se interrumpe la venta: se agrega el kit
 * como siempre y el faltante se verá en el inventario, que es exactamente lo
 * que pasaba antes de esta pantalla.
 */
export async function kitNecesitaCambios(kitId: string, cantidad: number): Promise<KitLeaf[]> {
  try {
    const kit = await productKitsService.get(kitId);
    return (kit.leaves ?? []).filter(l =>
      l.tracks_stock && l.stock_quantity < l.quantity * cantidad);
  } catch { return []; }
}

export const KitSustitucionModal: React.FC<Props> = ({
  kit, cantidad, productos, onConfirmar, onCancelar,
}) => {
  const [hojas, setHojas] = useState<KitLeaf[] | null>(null);
  const [error, setError] = useState('');
  /** component_id original → producto elegido en su lugar. */
  const [cambios, setCambios] = useState<Record<string, any>>({});
  /** Cuál fila está eligiendo reemplazo. */
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let vivo = true;
    productKitsService.get(kit.id)
      .then(k => { if (vivo) setHojas(k.leaves ?? []); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el kit'); })
      .finally(() => { if (vivo && !hojas) setHojas(h => h ?? []); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.id]);

  const falta = (h: KitLeaf) => h.tracks_stock && h.stock_quantity < h.quantity * cantidad;

  /**
   * Los reemplazos que se ofrecen, en orden de parecido.
   *
   * Primero los de la MISMA CATEGORÍA —que es lo que el negocio ya decidió que
   * se parece entre sí— y después el resto, para que igual se pueda poner
   * cualquier cosa cuando la categoría no alcanza. Nunca se ofrece algo que
   * tampoco hay: cambiar un agotado por otro agotado no resuelve nada.
   */
  const similares = useMemo(() => {
    if (!eligiendo) return [];
    const original = productos.find(p => String(p.id) === String(eligiendo));
    const term = sinTildes(q.trim());
    const hay = (p: any) => p.tracks_stock === false || Number(p.stock_quantity ?? 0) > 0;
    const puntaje = (p: any) => {
      let n = 0;
      if (original && p.category_id && p.category_id === original.category_id) n += 100;
      const a = sinTildes(p.name), b = sinTildes(original?.name);
      if (b && a.split(' ')[0] === b.split(' ')[0]) n += 20;   // «Llanta …» con «Llanta …»
      return n;
    };
    return productos
      .filter(p => String(p.id) !== String(eligiendo) && p.is_kit !== true && hay(p))
      .filter(p => !term || sinTildes(p.name).includes(term) || sinTildes(p.sku).includes(term))
      .sort((x, y) => puntaje(y) - puntaje(x) || String(x.name).localeCompare(String(y.name)))
      .slice(0, 30);
  }, [eligiendo, productos, q]);

  const subs: SustitucionKit[] = Object.entries(cambios).map(([from, p]) => ({
    from, to: String(p.id),
    from_name: hojas?.find(h => h.product_id === from)?.name ?? undefined,
    to_name: p.name,
  }));

  const faltantesSinResolver = (hojas ?? []).filter(h => falta(h) && !cambios[h.product_id]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancelar}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <p className="font-black text-gray-900 truncate">{kit.name}</p>
            <p className="text-[11px] font-bold text-gray-400">
              {cantidad > 1 ? `${cantidad} combos · ` : ''}qué lleva adentro
            </p>
          </div>
          <button onClick={onCancelar} className="p-2 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertTriangle size={14} /> {error}
            </p>
          )}
          {hojas === null ? (
            <p className="flex items-center gap-2 text-sm font-bold text-gray-400 py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> Revisando existencias…
            </p>
          ) : hojas.length === 0 ? (
            <p className="text-sm font-bold text-gray-400 py-6 text-center">
              Este kit no tiene componentes cargados.
            </p>
          ) : hojas.map(h => {
            const cambiado = cambios[h.product_id];
            const necesita = h.quantity * cantidad;
            return (
              <div key={h.product_id}
                className={`rounded-xl border p-3 ${
                  cambiado ? 'border-emerald-200 bg-emerald-50'
                    : falta(h) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black truncate ${cambiado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {necesita} × {h.name}
                    </p>
                    <p className="text-[11px] font-bold text-gray-500">
                      {!h.tracks_stock ? 'sin control de existencias'
                        : falta(h)
                          ? `solo hay ${h.stock_quantity} — faltan ${Math.max(0, necesita - h.stock_quantity)}`
                          : `hay ${h.stock_quantity}`}
                    </p>
                    {cambiado && (
                      <p className="text-xs font-black text-emerald-700 mt-1 flex items-center gap-1">
                        <Repeat2 size={13} /> sale {cambiado.name}
                      </p>
                    )}
                  </div>
                  {cambiado ? (
                    <button onClick={() => setCambios(c => { const n = { ...c }; delete n[h.product_id]; return n; })}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-black text-gray-500 hover:bg-white shrink-0">
                      Deshacer
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEligiendo(eligiendo === h.product_id ? null : h.product_id); setQ(''); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 ${
                        falta(h) ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      Cambiar
                    </button>
                  )}
                </div>

                {eligiendo === h.product_id && (
                  <div className="mt-2.5">
                    <div className="relative">
                      <PackageSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                        placeholder="Buscar otro modelo…"
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-bold" />
                    </div>
                    <div className="mt-1.5 max-h-44 overflow-y-auto no-scrollbar rounded-lg border border-gray-100">
                      {similares.length === 0 ? (
                        <p className="text-xs font-bold text-gray-400 px-3 py-3">
                          No hay otro producto con existencias para poner en su lugar.
                        </p>
                      ) : similares.map(p => (
                        <button key={p.id}
                          onClick={() => {
                            setCambios(c => ({ ...c, [h.product_id]: p }));
                            setEligiendo(null); setQ('');
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50 border-b border-gray-50">
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-gray-800 truncate">{p.name}</span>
                            <span className="block text-[11px] font-bold text-gray-400">
                              {p.tracks_stock === false ? 'sin control' : `quedan ${p.stock_quantity}`}
                              {' · '}{money(p.unit_price ?? p.price ?? 0)}
                            </span>
                          </span>
                          <Check size={15} className="text-emerald-600 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {faltantesSinResolver.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-700">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Si lo agregás así, el inventario va a quedar en negativo por {faltantesSinResolver.length} producto(s).
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onCancelar}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 font-black text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            {/* Agregar igual SIEMPRE se puede: el cajero tiene al cliente
                enfrente y a veces el stock del sistema está mal. La decisión es
                suya; lo que no puede pasar es que nadie se lo haya dicho. */}
            <button onClick={() => onConfirmar(subs)}
              className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">
              {subs.length > 0 ? `Agregar con ${subs.length} cambio(s)` : 'Agregar así'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KitSustitucionModal;
