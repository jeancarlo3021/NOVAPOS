import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, UtensilsCrossed } from 'lucide-react';
import { getAllProducts, categoriesService } from '@/services/Inventory/InventoryProductsService';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { modifiersService, type ModifierGroup } from '@/services/Inventory/modifiersService';
import { ModifierPickerModal } from '@/modules/pos/ModifierPickerModal';
import type { Product } from '@/types/Pos.types';
import type { ProductCategory } from '@/services/Inventory/categoriesService';
import type { BillItem } from './types';

const fmt = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

interface Props {
  tenantId: string;
  onClose: () => void;
  onAdd: (item: Omit<BillItem, 'id'>) => void;
  /** Si true, se renderiza inline (sin overlay fixed) llenando su contenedor. */
  embedded?: boolean;
}

export function OrderCatalogModal({ tenantId, onClose, onAdd, embedded = false }: Props) {
  // El menú por recetas se activa por plan: un negocio que no es restaurante
  // sigue viendo su catálogo completo.
  const { planFeatures } = useAuth();
  const menuOn = !!(planFeatures as any).restaurant_menu_recipes;
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
        // El menú son las RECETAS, no el catálogo entero: el mesero no tiene por
        // qué ver el tomate ni el aceite, que también son productos. Cada plato
        // sigue viniendo con forma de producto porque la venta se hace sobre el
        // producto (factura, CABYS, IVA, consumo de ingredientes).
        //
        // Si el negocio no tiene recetas cargadas todavía, se cae al catálogo
        // completo: dejar el menú vacío haría que no se pudiera vender nada.
        const [menu, cats] = await Promise.all([
          menuOn
            ? apiFetch<Product[]>('/recipes/menu').catch(() => [] as Product[])
            : Promise.resolve([] as Product[]),
          categoriesService.getAllCategories(tenantId).catch(() => []),
        ]);
        const prods = menu.length > 0 ? menu : await getAllProducts(tenantId);
        setProducts(prods ?? []);
        setCategories(cats ?? []);
      } finally { setLoading(false); }
    })();
  }, [tenantId, menuOn]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (activeCat !== 'all' && (p as any).category_id !== activeCat) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, activeCat]);

  // Cache de modificadores por producto → el segundo toque es instantáneo.
  const modsCache = useRef<Map<string, ModifierGroup[]>>(new Map());

  const addDirect = (p: Product) =>
    onAdd({ product_id: p.id, category_id: (p as any).category_id ?? undefined, name: p.name, unit_price: p.unit_price, quantity: 1, modifiers: [] });

  const pickProduct = async (p: Product) => {
    // Cache hit: decide al instante, sin llamada ni parpadeo.
    const cached = modsCache.current.get(p.id);
    if (cached) {
      if (cached.length > 0) { setConfigGroups(cached); setConfigProduct(p); }
      else addDirect(p);
      return;
    }
    setLoadingMods(true);
    try {
      const groups = await modifiersService.forProduct(p.id);
      const list = Array.isArray(groups) ? groups : [];
      modsCache.current.set(p.id, list);
      // Solo cambiamos a la pantalla de adicionales SI hay modificadores (así el
      // catálogo NO se pone en blanco para productos sin adicionales).
      if (list.length > 0) { setConfigGroups(list); setConfigProduct(p); }
      else addDirect(p);
    } catch {
      addDirect(p);
    } finally { setLoadingMods(false); }
  };

  const inner = (
      <div className={embedded
        ? 'bg-white w-full h-full flex flex-col overflow-hidden'
        : 'bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden'}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
          <UtensilsCrossed size={20} className="text-emerald-600" />
          <h2 className="text-lg font-black text-gray-900 flex-1">Agregar al pedido</h2>
          {!embedded && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          )}
        </div>

        {/* El catálogo se queda SIEMPRE: los adicionales van en un modal encima. */}
        {(
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
                      {/* Foto del plato: en el salón el mesero reconoce antes por
                          imagen que leyendo veinte nombres parecidos. Sale de la
                          receta cuando la tiene. */}
                      {(p as any).image_url ? (
                        <div className="w-full h-20 mb-2 rounded-lg overflow-hidden bg-gray-50">
                          <img src={(p as any).image_url} alt="" loading="lazy"
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ) : null}
                      <p className="font-bold text-sm text-gray-900 line-clamp-2 leading-tight">{p.name}</p>
                      <p className="text-emerald-600 font-black text-base mt-1.5 tabular-nums">{fmt(p.unit_price)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Adicionales en MODAL, encima del catálogo. Antes reemplazaban la
            pantalla entera y el mesero perdía de vista lo que estaba pidiendo;
            además, al volver había que buscar otra vez dónde estaba. */}
        {configProduct && (
          <ModifierPickerModal
            product={configProduct as any}
            groups={configGroups as any}
            basePrice={Number(configProduct.unit_price ?? 0)}
            onConfirm={(mods, qty, _extra, note) => {
              onAdd({
                product_id: configProduct.id,
                category_id: (configProduct as any).category_id ?? undefined,
                name: configProduct.name,
                unit_price: Number(configProduct.unit_price ?? 0),
                quantity: qty,
                modifiers: mods.map(m => ({ group: m.group, name: m.name, price_delta: m.price_delta })),
                notes: note,
              });
              setConfigProduct(null); setConfigGroups([]);
            }}
            onClose={() => { setConfigProduct(null); setConfigGroups([]); }}
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


export default OrderCatalogModal;
