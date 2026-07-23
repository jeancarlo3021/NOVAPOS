import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, X, Loader2, ChefHat, Utensils, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { getAllProducts } from '@/services/Inventory/InventoryProductsService';
import { storageService } from '@/services/storage/storageService';
import type { Product } from '@/types/Types_POS';

interface Ingredient {
  type: 'product' | 'subrecipe';
  product_id?: string | null;
  sub_recipe_id?: string | null;
  quantity: number;
  unit?: string | null;
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
  total: number;       // costo total (calculado)
  perYield: number;    // costo por porción
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

  const productCost = useMemo(() => new Map(products.map(p => [p.id, Number(p.cost_price) || 0])), [products]);
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, ps] = await Promise.all([
        apiFetch<Recipe[]>('/recipes'),
        getAllProducts(tenantId).catch(() => [] as Product[]),
      ]);
      setRecipes(rs ?? []); setProducts(ps ?? []);
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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
};

// ── Editor ───────────────────────────────────────────────────────────────────
function RecipeEditor({ recipe, products, subrecipes, productCost, recipeById, onClose, onSaved }: {
  recipe: Recipe | null;
  products: Product[];
  subrecipes: Recipe[];
  productCost: Map<string, number>;
  recipeById: Map<string, Recipe>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [isSub, setIsSub] = useState(recipe?.is_subrecipe ?? false);
  const [productId, setProductId] = useState(recipe?.product_id ?? '');
  const [yieldQty, setYieldQty] = useState(String(recipe?.yield_qty ?? 1));
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit ?? 'porción');
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

  // Costo de un ingrediente (producto = costo × qty × merma; subreceta = costo/rinde × qty).
  const ingCost = (i: Ingredient): number => {
    const f = 1 + (Number(i.waste_pct) || 0) / 100;
    const q = Number(i.quantity) || 0;
    if (i.type === 'subrecipe' && i.sub_recipe_id) {
      const sr = recipeById.get(i.sub_recipe_id);
      return sr ? sr.perYield * q * f : 0;
    }
    return (i.product_id ? (productCost.get(i.product_id) ?? 0) : 0) * q * f;
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
      prep_minutes: prep ? Number(prep) : null, instructions: instructions.trim() || null,
      target_margin_pct: num('target_margin_pct'), station: x.station.trim() || null,
      allergens: x.allergens.trim() || null, diet_tags: x.diet_tags.trim() || null,
      photo_url: x.photo_url.trim() || null,
      available_from: x.available_from || null, available_to: x.available_to || null,
      ingredients: ings.filter(i => (i.type === 'product' ? i.product_id : i.sub_recipe_id)),
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
                <label className="block text-xs font-bold text-gray-600 mb-1">Producto que produce <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select value={productId ?? ''} onChange={e => setProductId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— Ninguno —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Rinde</label>
                <input type="number" value={yieldQty} onChange={e => setYieldQty(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Unidad</label>
                <input value={yieldUnit ?? ''} onChange={e => setYieldUnit(e.target.value)} placeholder="porción / L / kg" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
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
                    <input value={i.unit ?? ''} onChange={e => setIng(idx, { unit: e.target.value })} placeholder="unid"
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" title="Unidad" />
                    <div className="flex items-center gap-0.5" title="Merma %">
                      <input type="number" value={i.waste_pct} onChange={e => setIng(idx, { waste_pct: Number(e.target.value) })}
                        className="w-12 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      <span className="text-[11px] text-gray-400">%merma</span>
                    </div>
                    <span className="ml-auto text-sm font-bold text-gray-700 tabular-nums">{fmt(ingCost(i))}</span>
                    <button onClick={() => rmIng(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
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
    </div>
  );
}

export default Recipes;
