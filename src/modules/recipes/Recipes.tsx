import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, X, Loader2, ChefHat, Utensils, RefreshCw, Save, Factory, AlertTriangle, Layers } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { getAllProducts } from '@/services/Inventory/InventoryProductsService';
import { storageService } from '@/services/storage/storageService';
import { ModifierGroupsModal } from '@/modules/modifiers/ModifierGroupsModal';
import type { Product } from '@/types/Types_POS';

/** Unidad del catálogo (g, kg, ml, l, und…) con su factor a la unidad base. */
export interface MeasureUnit { code: string; name: string; dimension: string; to_base: number }

interface Ingredient {
  type: 'product' | 'subrecipe';
  product_id?: string | null;
  sub_recipe_id?: string | null;
  quantity: number;
  unit?: string | null;
  /** Unidad del catálogo. Sin ella el costo NO convierte (comportamiento viejo). */
  unit_code?: string | null;
  waste_pct: number;
  note?: string | null;
}
interface Recipe {
  id: string;
  name: string;
  is_subrecipe: boolean;
  product_id?: string | null;
  yield_qty: number;
  yield_unit?: string | null;
  prep_minutes?: number | null;
  instructions?: string | null;
  notes?: string | null;
  yield_unit_code?: string | null;
  /** Producto donde se acumula lo producido (subrecetas por lote). */
  output_product_id?: string | null;
  total: number;       // costo total (calculado)
  perYield: number;    // costo por porción
  /** Problemas de unidades detectados por el servidor al costear. */
  warnings?: string[];
  ingredients?: Ingredient[];
  // Extras
  target_margin_pct?: number | null;
  station?: string | null;
  allergens?: string | null;
  diet_tags?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  photo_url?: string | null;
  available_from?: string | null;
  available_to?: string | null;
}

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;

export const Recipes: React.FC = () => {
  const { tenantId } = useTenantId();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'recipe' | 'sub'>('all');
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [units, setUnits] = useState<MeasureUnit[]>([]);
  /** Subreceta que se está produciendo por lote. */
  const [producing, setProducing] = useState<Recipe | null>(null);
  const { planFeatures } = useAuth();
  const unitsOn      = !!(planFeatures as any).recipe_units;
  const productionOn = !!(planFeatures as any).recipe_production;
  /** ¿El plan permite platos CON existencias? Si no, se crean infinitos. */
  const inventoryOn  = !!(planFeatures as any).recipe_inventory;

  const productCost = useMemo(() => new Map(products.map(p => [p.id, Number(p.cost_price) || 0])), [products]);
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const unitByCode = useMemo(() => new Map(units.map(u => [u.code, u])), [units]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, ps, us] = await Promise.all([
        apiFetch<Recipe[]>('/recipes'),
        getAllProducts(tenantId).catch(() => [] as Product[]),
        // El catálogo de unidades solo existe con la migración 84 corrida; sin él
        // todo sigue funcionando como antes, con la unidad de texto libre.
        apiFetch<MeasureUnit[]>('/recipes/units').catch(() => [] as MeasureUnit[]),
      ]);
      setRecipes(rs ?? []); setProducts(ps ?? []); setUnits(us ?? []);
    } finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const shown = recipes.filter(r => filter === 'all' || (filter === 'sub' ? r.is_subrecipe : !r.is_subrecipe));
  const subrecipes = recipes.filter(r => r.is_subrecipe);

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta receta?')) return;
    await apiFetch(`/recipes/${id}`, { method: 'DELETE' }); await load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="bg-linear-to-r from-orange-500 to-amber-500 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><BookOpen size={22} /></div>
            <div>
              <h1 className="text-xl font-black">Recetas y subrecetas</h1>
              <p className="text-white/80 text-sm">Fichas técnicas, costo por porción y control de ingredientes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><RefreshCw size={16} /></button>
            <button onClick={() => setEditing('new')}
              className="flex items-center gap-1.5 bg-white text-orange-600 font-black px-4 py-2 rounded-xl text-sm hover:bg-orange-50">
              <Plus size={16} /> Nueva receta
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['all', 'Todas'], ['recipe', 'Recetas'], ['sub', 'Subrecetas']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${filter === id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          <ChefHat size={36} className="mx-auto mb-2 opacity-30" />
          <p className="font-bold">Sin recetas todavía</p>
          <p className="text-sm">Creá una receta (o una subreceta, ej. una salsa) para calcular su costo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map(r => {
            const prodPrice = r.product_id ? (products.find(p => p.id === r.product_id)?.unit_price ?? 0) : 0;
            const margin = prodPrice > 0 ? ((prodPrice - r.perYield) / prodPrice) * 100 : null;
            return (
              <button key={r.id} onClick={() => setEditing(r)}
                className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-orange-300 transition">
                <div className="flex items-center gap-2 mb-1">
                  {r.is_subrecipe ? <Utensils size={15} className="text-amber-500" /> : <ChefHat size={15} className="text-orange-500" />}
                  <p className="font-black text-gray-900 flex-1 truncate">{r.name}</p>
                  <Trash2 size={14} className="text-gray-300 hover:text-red-500" onClick={e => { e.stopPropagation(); del(r.id); }} />
                </div>
                <p className="text-[11px] text-gray-400 mb-2">
                  {r.is_subrecipe ? 'Subreceta' : 'Receta'} · rinde {r.yield_qty} {r.yield_unit || 'porción'}
                </p>
                {/* Aviso de unidades: es lo que separa un costo real de un
                    número inventado, así que va arriba y en rojo. */}
                {unitsOn && (r.warnings?.length ?? 0) > 0 && (
                  <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1 mb-2">
                    ⚠️ {r.warnings!.length} ingrediente(s) sin unidad convertible — el costo puede estar mal
                  </p>
                )}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Costo/porción</p>
                    <p className="text-lg font-black text-gray-900">{fmt(r.perYield)}</p>
                  </div>
                  {margin != null && (
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Margen</p>
                      <p className={`text-sm font-black ${margin >= 60 ? 'text-emerald-600' : margin >= 30 ? 'text-amber-600' : 'text-red-600'}`}>{margin.toFixed(0)}%</p>
                    </div>
                  )}
                </div>
                {/* Producir: solo tiene sentido en subrecetas con un producto
                    donde acumular el rendimiento. */}
                {productionOn && r.is_subrecipe && (r.output_product_id || r.product_id) && (
                  <button
                    onClick={e => { e.stopPropagation(); setProducing(r); }}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-black text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg py-1.5 transition"
                  >
                    <Factory size={13} /> Producir lote
                  </button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? null : editing}
          products={products}
          subrecipes={subrecipes}
          productCost={productCost}
          recipeById={recipeById}
          units={units}
          unitByCode={unitByCode}
          unitsOn={unitsOn}
          productionOn={productionOn}
          inventoryOn={inventoryOn}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {producing && (
        <ProduceModal
          recipe={producing}
          onClose={() => setProducing(null)}
          onDone={() => { setProducing(null); load(); }}
        />
      )}
    </div>
  );
};

// ── Producción de un lote ────────────────────────────────────────────────────
/**
 * Producir N veces una subreceta: consume los ingredientes y deja el rendimiento
 * en el producto resultante, con el costo REAL del lote.
 *
 * Los faltantes se avisan pero no bloquean. En cocina el inventario teórico casi
 * nunca cuadra al gramo, y trabar la producción por eso deja al negocio sin
 * poder registrar lo que ya cocinó.
 */
function ProduceModal({ recipe, onClose, onDone }: {
  recipe: Recipe; onClose: () => void; onDone: () => void;
}) {
  const [batches, setBatches] = useState('1');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any | null>(null);

  const n = Number(batches) || 0;
  const totalYield = (Number(recipe.yield_qty) || 1) * n;

  const run = async () => {
    if (n <= 0) { setErr('Indicá cuántos lotes vas a producir.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await apiFetch<any>('/recipes/productions', {
        method: 'POST',
        body: JSON.stringify({ recipe_id: recipe.id, batches: n, notes: notes.trim() || null }),
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo producir');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <Factory size={18} className="text-amber-600" />
          <h2 className="text-base font-black text-gray-900 flex-1">Producir · {recipe.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {result ? (
          <div className="p-5 space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
              <p className="font-black">Lote producido ✓</p>
              <p>Rendimiento: <b>{result.yield_qty}</b> {recipe.yield_unit || 'porción'}</p>
              <p>Costo del lote: <b>{fmt(result.total_cost)}</b> · por unidad <b>{fmt(result.unit_cost)}</b></p>
            </div>
            {(result.shortages ?? []).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs space-y-1">
                <p className="font-black flex items-center gap-1"><AlertTriangle size={13} /> Quedó stock en negativo</p>
                {result.shortages.map((s: string, i: number) => <p key={i}>· {s}</p>)}
                <p className="text-[11px] pt-1">
                  Se registró igual: lo que ya se cocinó, se cocinó. Revisá el inventario de esos ingredientes.
                </p>
              </div>
            )}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <p className="px-3 py-2 bg-gray-50 text-xs font-black text-gray-700">Ingredientes consumidos</p>
              <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {(result.consumed ?? []).map((l: any, i: number) => (
                  <div key={i} className="px-3 py-1.5 flex justify-between text-xs">
                    <span className="text-gray-700">{l.product_name}</span>
                    <span className="text-gray-500 tabular-nums">
                      {Number(l.quantity).toFixed(2)} {l.unit_code ?? ''} · {fmt(l.total_cost)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={onDone} className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm">
              Listo
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">¿Cuántos lotes?</label>
              <input type="number" min="0" step="any" value={batches} onChange={e => setBatches(e.target.value)}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-500 mt-1.5">
                Rinde <b>{totalYield}</b> {recipe.yield_unit || 'porción'} en total
                ({recipe.yield_qty} por lote).
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nota <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Turno de la mañana…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Al producir se <b>descuentan los ingredientes</b> del inventario y se suma el rendimiento
              al producto resultante, con el costo real de este lote.
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={run} disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-black text-sm flex items-center justify-center gap-2">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Produciendo…</> : <>Producir</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────
function RecipeEditor({
  recipe, products, subrecipes, productCost, recipeById,
  units, unitByCode, unitsOn, productionOn, inventoryOn, onClose, onSaved,
}: {
  recipe: Recipe | null;
  products: Product[];
  subrecipes: Recipe[];
  productCost: Map<string, number>;
  recipeById: Map<string, Recipe>;
  units: MeasureUnit[];
  unitByCode: Map<string, MeasureUnit>;
  unitsOn: boolean;
  productionOn: boolean;
  inventoryOn: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [isSub, setIsSub] = useState(recipe?.is_subrecipe ?? false);
  const [productId, setProductId] = useState(recipe?.product_id ?? '');
  const [yieldQty, setYieldQty] = useState(String(recipe?.yield_qty ?? 1));
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit ?? 'porción');
  const [yieldUnitCode, setYieldUnitCode] = useState(recipe?.yield_unit_code ?? '');
  const [outputProductId, setOutputProductId] = useState(recipe?.output_product_id ?? '');
  // ── El plato en el menú ──────────────────────────────────────────────────
  // Una receta nueva se asume vendible: es lo que un restaurante quiere el 95 %
  // de las veces, y lo contrario (la receta que existe pero no se puede vender)
  // era la fuente principal de platos huérfanos.
  const [sells, setSells] = useState(recipe ? !!recipe.product_id : true);
  const [salePrice, setSalePrice] = useState('');
  /** Producto cuyo set de extras se está editando (null = ninguno). */
  const [editingMods, setEditingMods] = useState<string | null>(null);
  const [noInventory, setNoInventory] = useState(false);
  const [prep, setPrep] = useState(String(recipe?.prep_minutes ?? ''));
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const { tenantId } = useTenantId();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(!recipe);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setUploading(true); setErr('');
    try {
      const url = await storageService.uploadImage('products', tenantId, file, `recipe_${Date.now()}`);
      setX(p => ({ ...p, photo_url: url }));
    } catch (er) { setErr(er instanceof Error ? er.message : 'No se pudo subir la imagen'); }
    finally { setUploading(false); }
  };
  // Extras (costeo/precio · cocina · menú/salud · gestión).
  const [x, setX] = useState({
    target_margin_pct: recipe?.target_margin_pct != null ? String(recipe.target_margin_pct) : '',
    station: recipe?.station ?? '', allergens: recipe?.allergens ?? '', diet_tags: recipe?.diet_tags ?? '',
    calories: recipe?.calories != null ? String(recipe.calories) : '',
    protein_g: recipe?.protein_g != null ? String(recipe.protein_g) : '',
    carbs_g: recipe?.carbs_g != null ? String(recipe.carbs_g) : '',
    fat_g: recipe?.fat_g != null ? String(recipe.fat_g) : '',
    photo_url: recipe?.photo_url ?? '',
    available_from: recipe?.available_from?.slice(0, 10) ?? '',
    available_to: recipe?.available_to?.slice(0, 10) ?? '',
  });
  const setXf = (k: string, v: string) => setX(p => ({ ...p, [k]: v }));
  const [scaleTo, setScaleTo] = useState('');   // escalar a N porciones (preview)

  useEffect(() => {
    if (!recipe) return;
    apiFetch<Recipe>(`/recipes/${recipe.id}`).then(full => {
      setIngs((full.ingredients ?? []).map(i => ({ ...i, quantity: Number(i.quantity), waste_pct: Number(i.waste_pct) })));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [recipe]);

  /**
   * Cantidad del ingrediente pasada a la unidad en que está costeado el producto.
   *
   * Sin las dos unidades devuelve la cantidad tal cual: es la puerta de
   * compatibilidad. Las recetas viejas no tienen unidad y su costo tiene que dar
   * lo mismo que siempre, aunque esté mal — cambiarlo en silencio sería peor,
   * porque el negocio ya puso precios con ese número.
   */
  const converted = (i: Ingredient): { qty: number; problem?: string } => {
    const q = Number(i.quantity) || 0;
    if (!unitsOn) return { qty: q };
    const target = i.product_id
      ? ((products.find(p => p.id === i.product_id) as any)?.recipe_unit_code ?? null)
      : null;
    if (!i.unit_code || !target) return { qty: q, problem: 'sin unidad' };
    if (i.unit_code === target) return { qty: q };
    const a = unitByCode.get(i.unit_code); const b = unitByCode.get(target);
    if (!a || !b) return { qty: q, problem: 'unidad desconocida' };
    if (a.dimension !== b.dimension) return { qty: q, problem: `${a.name} → ${b.name}` };
    return { qty: (q * a.to_base) / b.to_base };
  };

  // Costo de un ingrediente (producto = costo × qty convertida × merma;
  // subreceta = costo/rinde × qty).
  const ingCost = (i: Ingredient): number => {
    const f = 1 + (Number(i.waste_pct) || 0) / 100;
    if (i.type === 'subrecipe' && i.sub_recipe_id) {
      const sr = recipeById.get(i.sub_recipe_id);
      return sr ? sr.perYield * (Number(i.quantity) || 0) * f : 0;
    }
    return (i.product_id ? (productCost.get(i.product_id) ?? 0) : 0) * converted(i).qty * f;
  };
  const total = ings.reduce((s, i) => s + ingCost(i), 0);
  const perYield = total / (Number(yieldQty) || 1);
  // Precio sugerido por margen objetivo: precio = costo / (1 - margen).
  const tm = Number(x.target_margin_pct) || 0;
  const suggestedPrice = tm > 0 && tm < 100 ? perYield / (1 - tm / 100) : null;
  // Escalado a N porciones (preview de lista de ingredientes y costo).
  const scaleN = Number(scaleTo) || 0;
  const scaleFactor = scaleN > 0 ? scaleN / (Number(yieldQty) || 1) : 1;
  const num = (k: string) => { const v = Number((x as any)[k]); return isFinite(v) && (x as any)[k] !== '' ? v : null; };

  const addIng = (type: 'product' | 'subrecipe') =>
    setIngs(prev => [...prev, { type, product_id: null, sub_recipe_id: null, quantity: 1, unit: '', waste_pct: 0 }]);
  const setIng = (idx: number, patch: Partial<Ingredient>) =>
    setIngs(prev => prev.map((i, k) => k === idx ? { ...i, ...patch } : i));
  const rmIng = (idx: number) => setIngs(prev => prev.filter((_, k) => k !== idx));

  const save = async () => {
    if (!name.trim()) { setErr('Nombre requerido'); return; }
    setSaving(true); setErr('');
    const body = {
      name: name.trim(), is_subrecipe: isSub, product_id: productId || null,
      yield_qty: Number(yieldQty) || 1, yield_unit: yieldUnit || 'porción',
      yield_unit_code: yieldUnitCode || null,
      output_product_id: outputProductId || null,
      prep_minutes: prep ? Number(prep) : null, instructions: instructions.trim() || null,
      target_margin_pct: num('target_margin_pct'), station: x.station.trim() || null,
      allergens: x.allergens.trim() || null, diet_tags: x.diet_tags.trim() || null,
      photo_url: x.photo_url.trim() || null,
      available_from: x.available_from || null, available_to: x.available_to || null,
      ingredients: ings.filter(i => (i.type === 'product' ? i.product_id : i.sub_recipe_id)),
      // El plato del menú: el backend crea o actualiza el producto vendible.
      // Una subreceta nunca se vende, así que nunca manda `sells`.
      sells: !isSub && sells,
      sale_price: salePrice ? Number(salePrice) : null,
      no_inventory: noInventory,
    };
    try {
      if (recipe) await apiFetch(`/recipes/${recipe.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/recipes', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <ChefHat size={18} className="text-orange-500" />
          <h2 className="text-base font-black text-gray-900 flex-1">{recipe ? 'Editar receta' : 'Nueva receta'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {!loaded ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
        <div className="p-5 space-y-3 overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 pb-2">
                <input type="checkbox" checked={isSub} onChange={e => setIsSub(e.target.checked)} /> Es subreceta (preparación base)
              </label>
            </div>
            {!isSub && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Producto vendible <span className="text-gray-400 font-normal">(se crea solo)</span>
                </label>
                <select value={productId ?? ''} onChange={e => setProductId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— Crear uno nuevo —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Solo hace falta elegir uno si el plato ya existía en el catálogo.
                </p>
              </div>
            )}

            {/* ── El plato en el menú ─────────────────────────────────────
                Antes había que crear el producto aparte y acordarse de
                enlazarlo. Eso dejaba recetas que no se podían vender y
                productos que se vendían sin descontar nada. */}
            {!isSub && (
              <div className="sm:col-span-2 border border-emerald-200 bg-emerald-50/50 rounded-xl p-3 space-y-2.5">
                <label className="flex items-center gap-2 text-sm font-black text-emerald-900 cursor-pointer">
                  <input type="checkbox" checked={sells} onChange={e => setSells(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  Se vende en el menú
                </label>
                {sells && (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Precio de venta</label>
                        <div className="relative w-32">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">₡</span>
                          <input type="number" step="any" min="0" value={salePrice}
                            onChange={e => setSalePrice(e.target.value)}
                            placeholder={suggestedPrice != null ? String(Math.round(suggestedPrice)) : '0'}
                            className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                      </div>
                      {suggestedPrice != null && !salePrice && (
                        <p className="text-[11px] text-emerald-700 pb-2">
                          Vacío usa el sugerido por margen: <b>{fmt(suggestedPrice)}</b>
                        </p>
                      )}
                    </div>

                    {/* Con el plan sin inventario de recetas, la casilla se
                        muestra marcada y trabada: el servidor lo fuerza igual, y
                        dejarla clicable prometería algo que no va a pasar. */}
                    <label className={`flex items-start gap-2 text-sm ${inventoryOn ? 'cursor-pointer' : 'opacity-90'}`}>
                      <input type="checkbox"
                        checked={inventoryOn ? noInventory : true}
                        disabled={!inventoryOn}
                        onChange={e => setNoInventory(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-emerald-600" />
                      <span>
                        <b>Sin inventario</b>
                        <span className="block text-[11px] text-gray-500">
                          {inventoryOn
                            ? 'El plato no lleva existencias. Sirve para el que todavía no tiene '
                              + 'ingredientes cargados, o para lo que se compra y se revende tal cual '
                              + '(una cerveza). Se puede vender desde ya y costearlo después.'
                            : 'Tu plan crea los platos sin existencias: hay carta y cobro, pero no '
                              + 'control de insumos. Para descontar ingredientes hay que activar '
                              + '«Recetas con inventario».'}
                        </span>
                      </span>
                    </label>

                    {/* Los extras del plato se editan desde acá: es donde el
                        cocinero ya está. Necesita el producto creado, así que
                        aparece recién después de guardar la receta una vez. */}
                    {recipe?.product_id ? (
                      <button type="button" onClick={() => setEditingMods(recipe.product_id!)}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-violet-700 border border-violet-200 bg-violet-50 rounded-lg px-3 py-1.5 hover:bg-violet-100">
                        <Layers size={13} /> Extras y modificadores del plato
                      </button>
                    ) : (
                      <p className="text-[11px] text-gray-400">
                        Guardá la receta para poder configurarle extras (término, adicionales, sin…).
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {isSub && productionOn && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Producto resultante <span className="text-gray-400 font-normal">(para producir por lote)</span>
                </label>
                <select value={outputProductId ?? ''} onChange={e => setOutputProductId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— No se produce por lote —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Con esto, la salsa existe en inventario: se produce una vez y los platos la consumen
                  de ahí. Sin esto, cada plato explota los ingredientes de la subreceta al venderse.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Rinde</label>
                <input type="number" value={yieldQty} onChange={e => setYieldQty(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Unidad</label>
                {unitsOn && units.length > 0 ? (
                  <select value={yieldUnitCode ?? ''} onChange={e => setYieldUnitCode(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">porción</option>
                    {units.map(u => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
                  </select>
                ) : (
                  <input value={yieldUnit ?? ''} onChange={e => setYieldUnit(e.target.value)} placeholder="porción / L / kg" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Tiempo prep. (min)</label>
              <input type="number" value={prep} onChange={e => setPrep(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Ingredientes */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-black text-gray-700">Ingredientes</span>
              <div className="ml-auto flex gap-1">
                <button onClick={() => addIng('product')} className="text-[11px] font-bold text-orange-600 hover:text-orange-800">+ Producto</button>
                <button onClick={() => addIng('subrecipe')} className="text-[11px] font-bold text-amber-600 hover:text-amber-800">+ Subreceta</button>
              </div>
            </div>
            {ings.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-400">Agregá productos del inventario o subrecetas.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {ings.map((i, idx) => (
                  <div key={idx} className="p-2.5 flex flex-wrap items-center gap-2">
                    {i.type === 'subrecipe' ? (
                      <select value={i.sub_recipe_id ?? ''} onChange={e => setIng(idx, { sub_recipe_id: e.target.value })}
                        className="flex-1 min-w-32 border border-amber-200 bg-amber-50 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">— Subreceta —</option>
                        {subrecipes.filter(s => s.id !== recipe?.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <select value={i.product_id ?? ''} onChange={e => setIng(idx, { product_id: e.target.value })}
                        className="flex-1 min-w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">— Producto —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                    <input type="number" value={i.quantity} onChange={e => setIng(idx, { quantity: Number(e.target.value) })}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" title="Cantidad" />
                    {unitsOn && units.length > 0 ? (
                      // Con unidades activas, el selector del catálogo REEMPLAZA
                      // el texto libre: es lo único que el costeo puede convertir.
                      <select value={i.unit_code ?? ''} onChange={e => setIng(idx, { unit_code: e.target.value || null })}
                        title="Unidad (se convierte al costear)"
                        className={`w-20 border rounded-lg px-1.5 py-1.5 text-sm bg-white ${
                          i.type === 'product' && converted(i).problem ? 'border-red-300 bg-red-50' : 'border-gray-200'
                        }`}>
                        <option value="">— unid —</option>
                        {units.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                      </select>
                    ) : (
                      <input value={i.unit ?? ''} onChange={e => setIng(idx, { unit: e.target.value })} placeholder="unid"
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" title="Unidad" />
                    )}
                    <div className="flex items-center gap-0.5" title="Merma %">
                      <input type="number" value={i.waste_pct} onChange={e => setIng(idx, { waste_pct: Number(e.target.value) })}
                        className="w-12 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      <span className="text-[11px] text-gray-400">%merma</span>
                    </div>
                    <span className="ml-auto text-sm font-bold text-gray-700 tabular-nums">{fmt(ingCost(i))}</span>
                    <button onClick={() => rmIng(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    {/* El costo de esta línea NO es confiable: hay que decirlo
                        acá, no dejar que se descubra revisando la cuenta. */}
                    {unitsOn && i.type === 'product' && i.product_id && converted(i).problem && (
                      <p className="w-full text-[10px] text-red-600 font-bold">
                        ⚠️ {converted(i).problem === 'sin unidad'
                          ? 'Falta la unidad acá o en el producto: el costo se calcula sin convertir.'
                          : `No se puede convertir ${converted(i).problem}.`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Escalar porciones (preview de lista de ingredientes) */}
          {ings.length > 0 && (
            <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <span className="font-bold text-amber-700">Escalar a</span>
              <input type="number" value={scaleTo} onChange={e => setScaleTo(e.target.value)} placeholder={yieldQty}
                className="w-20 border border-amber-200 rounded-lg px-2 py-1 text-sm" />
              <span className="text-amber-700">{yieldUnit || 'porción'}(s)</span>
              {scaleN > 0 && (
                <span className="ml-auto text-xs text-amber-800">
                  ×{scaleFactor.toFixed(2)} · costo {fmt(total * scaleFactor)} · {ings.map(i => `${(Number(i.quantity) * scaleFactor).toFixed(2)}${i.unit || ''}`).join(' · ').slice(0, 60)}
                </span>
              )}
            </div>
          )}

          {/* Cocina · Menú/Salud · Gestión */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
            <div><label className="block text-xs font-bold text-gray-600 mb-1">Estación (cocina)</label>
              <input value={x.station} onChange={e => setXf('station', e.target.value)} placeholder="Cocina / Barra" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold text-gray-600 mb-1">Alérgenos</label>
              <input value={x.allergens} onChange={e => setXf('allergens', e.target.value)} placeholder="gluten, lácteos…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold text-gray-600 mb-1">Dieta</label>
              <input value={x.diet_tags} onChange={e => setXf('diet_tags', e.target.value)} placeholder="vegano, sin gluten" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="col-span-2 sm:col-span-1"><label className="block text-xs font-bold text-gray-600 mb-1">Foto del plato</label>
              <div className="flex items-center gap-2">
                {x.photo_url && <img src={x.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />}
                <label className="flex-1 cursor-pointer text-center text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 rounded-lg px-2 py-2 hover:bg-orange-100">
                  {uploading ? 'Subiendo…' : x.photo_url ? 'Cambiar' : 'Subir imagen'}
                  <input type="file" accept="image/*" onChange={handlePhoto} disabled={uploading} className="hidden" />
                </label>
                {x.photo_url && <button type="button" onClick={() => setXf('photo_url', '')} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
            </div>
            <div><label className="block text-xs font-bold text-gray-600 mb-1">Disponible desde</label>
              <input type="date" value={x.available_from} onChange={e => setXf('available_from', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold text-gray-600 mb-1">Disponible hasta</label>
              <input type="date" value={x.available_to} onChange={e => setXf('available_to', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" /></div>
          </div>

          {/* Instrucciones */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Preparación <span className="text-gray-400 font-normal">(pasos, opcional)</span></label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Costo + Precio sugerido */}
          <div className="flex flex-wrap items-center gap-5 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <div><p className="text-[10px] text-orange-400 uppercase font-bold">Costo total</p><p className="text-lg font-black text-gray-900">{fmt(total)}</p></div>
            <div><p className="text-[10px] text-orange-400 uppercase font-bold">Costo / {yieldUnit || 'porción'}</p><p className="text-lg font-black text-orange-700">{fmt(perYield)}</p></div>
            <div className="flex items-center gap-1.5">
              <div><label className="block text-[10px] text-orange-400 uppercase font-bold mb-0.5">Margen objetivo %</label>
                <input type="number" value={x.target_margin_pct} onChange={e => setXf('target_margin_pct', e.target.value)}
                  className="w-20 border border-orange-200 rounded-lg px-2 py-1 text-sm" /></div>
            </div>
            {suggestedPrice != null && (
              <div><p className="text-[10px] text-emerald-500 uppercase font-bold">Precio sugerido</p><p className="text-lg font-black text-emerald-700">{fmt(suggestedPrice)}</p></div>
            )}
          </div>
        </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
          </button>
        </div>
      </div>

      {editingMods && (
        <ModifierGroupsModal
          product={{ id: editingMods, name: name.trim() || 'Plato' }}
          onClose={() => setEditingMods(null)}
        />
      )}
    </div>
  );
}

export default Recipes;
