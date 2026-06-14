import { useEffect, useMemo, useState } from 'react';
import { X, Search, Plus, Minus, Check, ChevronLeft, UtensilsCrossed } from 'lucide-react';
import { getAllProducts, categoriesService } from '@/services/Inventory/InventoryProductsService';
import { modifiersService, type ModifierGroup } from '@/services/Inventory/modifiersService';
import type { Product } from '@/types/Pos.types';
import type { ProductCategory } from '@/services/Inventory/categoriesService';
import type { BillItem, BillItemModifier } from './types';

const fmt = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

interface Props {
  tenantId: string;
  onClose: () => void;
  onAdd: (item: Omit<BillItem, 'id'>) => void;
  /** Si true, se renderiza inline (sin overlay fixed) llenando su contenedor. */
  embedded?: boolean;
}

export function OrderCatalogModal({ tenantId, onClose, onAdd, embedded = false }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  // Producto en configuración de adicionales (null = mostrando catálogo)
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  const [configGroups, setConfigGroups] = useState<ModifierGroup[]>([]);
  const [loadingMods, setLoadingMods] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [prods, cats] = await Promise.all([
          getAllProducts(tenantId),
          categoriesService.getAllCategories(tenantId).catch(() => []),
        ]);
        setProducts(prods ?? []);
        setCategories(cats ?? []);
      } finally { setLoading(false); }
    })();
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (activeCat !== 'all' && (p as any).category_id !== activeCat) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, activeCat]);

  const pickProduct = async (p: Product) => {
    setLoadingMods(true);
    setConfigProduct(p);
    try {
      const groups = await modifiersService.forProduct(p.id);
      if (Array.isArray(groups) && groups.length > 0) {
        setConfigGroups(groups);
      } else {
        // Sin modificadores → agregar directo y volver al catálogo
        onAdd({ product_id: p.id, name: p.name, unit_price: p.unit_price, quantity: 1, modifiers: [] });
        setConfigProduct(null);
      }
    } catch {
      onAdd({ product_id: p.id, name: p.name, unit_price: p.unit_price, quantity: 1, modifiers: [] });
      setConfigProduct(null);
    } finally { setLoadingMods(false); }
  };

  const inner = (
      <div className={embedded
        ? 'bg-white w-full h-full flex flex-col overflow-hidden'
        : 'bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden'}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
          {configProduct ? (
            <button onClick={() => { setConfigProduct(null); setConfigGroups([]); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <ChevronLeft size={18} />
            </button>
          ) : (
            <UtensilsCrossed size={20} className="text-emerald-600" />
          )}
          <h2 className="text-lg font-black text-gray-900 flex-1">
            {configProduct ? configProduct.name : 'Agregar al pedido'}
          </h2>
          {!embedded && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          )}
        </div>

        {/* Vista: catálogo o adicionales */}
        {!configProduct ? (
          <>
            {/* Buscador */}
            <div className="px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar plato o bebida..."
                  className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
              </div>
              {/* Tabs categorías */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                <CatTab label="Todos" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
                {categories.map(c => (
                  <CatTab key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
                ))}
              </div>
            </div>

            {/* Grid de productos */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-12 text-gray-400">Cargando productos…</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400">Sin productos en esta categoría</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {filtered.map(p => (
                    <button key={p.id} onClick={() => pickProduct(p)}
                      disabled={loadingMods}
                      className="text-left p-3 rounded-xl border-2 border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/40 transition active:scale-95 disabled:opacity-50">
                      <p className="font-bold text-sm text-gray-900 line-clamp-2 leading-tight">{p.name}</p>
                      <p className="text-emerald-600 font-black text-base mt-1.5 tabular-nums">{fmt(p.unit_price)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <ModifierPicker
            product={configProduct}
            groups={configGroups}
            loading={loadingMods}
            onConfirm={(item) => { onAdd(item); setConfigProduct(null); setConfigGroups([]); }}
          />
        )}
      </div>
  );

  if (embedded) return inner;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {inner}
    </div>
  );
}

function CatTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
        active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}>
      {label}
    </button>
  );
}

// ── Selector de adicionales ──────────────────────────────────────────────────
function ModifierPicker({ product, groups, loading, onConfirm }: {
  product: Product;
  groups: ModifierGroup[];
  loading: boolean;
  onConfirm: (item: Omit<BillItem, 'id'>) => void;
}) {
  // selección: groupName → set de opciones elegidas (por name)
  const [selected, setSelected] = useState<Record<string, BillItemModifier[]>>({});
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');

  const toggle = (g: ModifierGroup, opt: { name: string; price_delta: number }) => {
    setError('');
    setSelected(prev => {
      const cur = prev[g.name] ?? [];
      const exists = cur.some(m => m.name === opt.name);
      let next: BillItemModifier[];
      if (exists) {
        next = cur.filter(m => m.name !== opt.name);
      } else if (g.max_select === 1) {
        next = [{ group: g.name, name: opt.name, price_delta: opt.price_delta }];
      } else {
        if (cur.length >= g.max_select) return prev; // tope
        next = [...cur, { group: g.name, name: opt.name, price_delta: opt.price_delta }];
      }
      return { ...prev, [g.name]: next };
    });
  };

  const allMods = Object.values(selected).flat();
  const modsTotal = allMods.reduce((s, m) => s + m.price_delta, 0);
  const lineTotal = (product.unit_price + modsTotal) * qty;

  const confirm = () => {
    // Validar grupos obligatorios
    for (const g of groups) {
      const count = (selected[g.name] ?? []).length;
      if (count < g.min_select) {
        setError(`Elegí al menos ${g.min_select} en "${g.name}"`);
        return;
      }
    }
    onConfirm({
      product_id: product.id,
      name: product.name,
      unit_price: product.unit_price,
      quantity: qty,
      modifiers: allMods,
      notes: notes.trim() || undefined,
    });
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando opciones…</div>;

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-black text-gray-800 text-sm">{g.name}</p>
              <span className="text-[10px] font-bold text-gray-400 uppercase">
                {g.min_select > 0 ? 'Obligatorio' : 'Opcional'}
                {g.max_select > 1 ? ` · hasta ${g.max_select}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.modifiers.map((opt, oi) => {
                const isSel = (selected[g.name] ?? []).some(m => m.name === opt.name);
                return (
                  <button key={oi} onClick={() => toggle(g, opt)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-left transition ${
                      isSel ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <span className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-${g.max_select === 1 ? 'full' : 'md'} border-2 flex items-center justify-center ${
                        isSel ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                      }`}>
                        {isSel && <Check size={12} className="text-white" />}
                      </span>
                      <span className="text-sm font-semibold text-gray-800">{opt.name}</span>
                    </span>
                    {opt.price_delta !== 0 && (
                      <span className="text-xs font-bold text-emerald-600">
                        {opt.price_delta > 0 ? '+' : ''}{fmt(opt.price_delta)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Nota */}
        <div>
          <p className="font-black text-gray-800 text-sm mb-2">Nota / solicitud especial</p>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ej: sin cebolla, bien cocido…"
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{error}</div>
        )}
      </div>

      {/* Footer: cantidad + confirmar */}
      <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setQty(q => Math.max(1, q - 1))}
            className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50">
            <Minus size={15} />
          </button>
          <span className="w-8 text-center font-black text-lg">{qty}</span>
          <button onClick={() => setQty(q => q + 1)}
            className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50">
            <Plus size={15} />
          </button>
        </div>
        <button onClick={confirm}
          className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 transition">
          <Plus size={16} /> Agregar · {fmt(lineTotal)}
        </button>
      </div>
    </>
  );
}

export default OrderCatalogModal;
