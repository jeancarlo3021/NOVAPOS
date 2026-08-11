import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers, Plus, Trash2, Save, Search, Loader2, ChevronRight, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { fuzzyMatch } from '@/utils/fuzzySearch';
import {
  modifiersService, indexByProduct, type ModifierGroup, type Modifier,
} from '@/services/modifiers/modifiersService';
import { ModifierGroupsModal } from './ModifierGroupsModal';

interface ProductLite { id: string; name: string; sku?: string | null; unit_price: number; }

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/**
 * Extras y modificadores por producto.
 *
 * Un plato tiene GRUPOS ("Término", "Extras", "Sin…") y cada grupo sus OPCIONES.
 * El grupo define cuántas se eligen: mínimo (0 = opcional) y máximo (1 = una sola).
 * Cada opción puede sumar o restar al precio.
 */
export const ModifiersManager: React.FC = () => {
  const [products, setProducts] = useState<ProductLite[]>([]);
  // Costo del extra: solo con la función activa. Sin ella, un extra sigue siendo
  // solo precio, como siempre.
  const { planFeatures } = useAuth();
  const costOn = !!(planFeatures as any).recipe_modifier_cost;
  /** El menú lo arman las recetas: los extras se configuran sobre esos platos. */
  const menuOn = !!(planFeatures as any).restaurant_menu_recipes;
  const [measureUnits, setMeasureUnits] = useState<Array<{ code: string; name: string }>>([]);
  /**
   * Insumos para el ingrediente del extra.
   *
   * Va SEPARADO de la lista de platos: el extra se configura sobre un plato del
   * menú, pero lo que consume es un producto de INVENTARIO. Con una sola lista,
   * «+ queso» habría terminado descontando el plato «Queso a la plancha».
   */
  const [ingredientProducts, setIngredientProducts] = useState<ProductLite[]>([]);
  useEffect(() => {
    if (!costOn) return;
    let alive = true;
    void Promise.all([
      apiFetch<any[]>('/recipes/units').catch(() => []),
      apiFetch<ProductLite[]>('/products').catch(() => [] as ProductLite[]),
    ]).then(([us, ps]) => {
      if (!alive) return;
      setMeasureUnits(us ?? []);
      setIngredientProducts(ps ?? []);
    });
    return () => { alive = false; };
  }, [costOn]);
  const [byProduct, setByProduct] = useState<Map<string, ModifierGroup[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Los extras se configuran sobre los PLATOS del menú, no sobre el catálogo
      // de inventario: nadie le pone «término medio» al aceite. En un restaurante
      // los platos son las recetas, así que la lista sale del menú.
      //
      // Sin recetas cargadas se cae al catálogo completo: dejar esta pantalla
      // vacía haría imposible configurar el primer extra.
      const menuFirst = menuOn
        ? await apiFetch<ProductLite[]>('/recipes/menu').catch(() => [] as ProductLite[])
        : [];
      const [prods, mods] = await Promise.all([
        menuFirst.length > 0 ? Promise.resolve(menuFirst) : apiFetch<ProductLite[]>('/products'),
        modifiersService.list(),
      ]);
      setProducts(prods ?? []);
      setByProduct(indexByProduct(mods ?? []));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar' });
    } finally { setLoading(false); }
  }, [menuOn]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim();
    const list = t ? products.filter(p => fuzzyMatch(t, p.name, p.sku ?? '')) : products;
    // Los que YA tienen modificadores primero: es lo que uno viene a revisar.
    return [...list].sort((a, b) => {
      const ha = (byProduct.get(a.id)?.length ?? 0) > 0 ? 0 : 1;
      const hb = (byProduct.get(b.id)?.length ?? 0) > 0 ? 0 : 1;
      return ha - hb || a.name.localeCompare(b.name);
    }).slice(0, 200);
  }, [products, q, byProduct]);

  // El editor va en MODAL: en tablet el panel lateral quedaba angosto y había que
  // hacer scroll horizontal para llegar a los precios.
  const [editing, setEditing] = useState<ProductLite | null>(null);

  const pick = (p: ProductLite) => {
    setEditing(p);
    setSelected(p);
    // Copia profunda: se edita sin tocar lo cargado hasta guardar.
    setGroups(JSON.parse(JSON.stringify(byProduct.get(p.id) ?? [])));
    setDirty(false);
    setMsg(null);
  };

  const addGroup = () => {
    if (!selected) return;
    setGroups(g => [...g, {
      product_id: selected.id, name: 'Nuevo grupo',
      min_select: 0, max_select: 1, sort_order: g.length, modifiers: [],
    }]);
    setDirty(true);
  };

  const patchGroup = (i: number, patch: Partial<ModifierGroup>) => {
    setGroups(g => g.map((x, j) => j === i ? { ...x, ...patch } : x));
    setDirty(true);
  };

  const removeGroup = (i: number) => { setGroups(g => g.filter((_, j) => j !== i)); setDirty(true); };

  const addOption = (gi: number) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: [...x.modifiers, { name: 'Nueva opción', price_delta: 0, sort_order: x.modifiers.length }] }
      : x));
    setDirty(true);
  };

  const patchOption = (gi: number, oi: number, patch: Partial<Modifier>) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: x.modifiers.map((m, k) => k === oi ? { ...m, ...patch } : m) }
      : x));
    setDirty(true);
  };

  const removeOption = (gi: number, oi: number) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: x.modifiers.filter((_, k) => k !== oi) } : x));
    setDirty(true);
  };

  const save = async () => {
    if (!selected) return;
    // Validación previa: el backend no puede adivinar la intención y un grupo mal
    // configurado (mínimo mayor al máximo) bloquearía la venta en el POS.
    for (const g of groups) {
      if (!g.name.trim()) { setMsg({ kind: 'err', text: 'Hay un grupo sin nombre.' }); return; }
      if (g.max_select < 1) { setMsg({ kind: 'err', text: `"${g.name}": el máximo debe ser al menos 1.` }); return; }
      if (g.min_select > g.max_select) {
        setMsg({ kind: 'err', text: `"${g.name}": el mínimo (${g.min_select}) no puede superar al máximo (${g.max_select}).` });
        return;
      }
      if (g.min_select > g.modifiers.length) {
        setMsg({ kind: 'err', text: `"${g.name}": pide elegir ${g.min_select} pero solo tiene ${g.modifiers.length} opción(es).` });
        return;
      }
      if (g.modifiers.some(m => !m.name.trim())) {
        setMsg({ kind: 'err', text: `"${g.name}": hay una opción sin nombre.` }); return;
      }
    }
    setSaving(true); setMsg(null);
    try {
      await modifiersService.saveForProduct(selected.id, groups.map((g, i) => ({ ...g, sort_order: i })));
      setByProduct(prev => new Map(prev).set(selected.id, JSON.parse(JSON.stringify(groups))));
      setDirty(false);
      setMsg({ kind: 'ok', text: 'Guardado. Ya aparece al vender este producto en el POS.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Layers size={26} className="text-violet-600" /> Extras y modificadores</h1>
        <p className="text-gray-600 text-sm">
          Opciones que se preguntan al vender un plato: término de la carne, extras, quitar ingredientes.
          Cada opción puede sumar o restar al precio.
        </p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Productos */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
            ) : filtered.map(p => {
              const n = byProduct.get(p.id)?.length ?? 0;
              return (
                <button key={p.id} onClick={() => pick(p)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-violet-50 ${
                    selected?.id === p.id ? 'bg-violet-50' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-800 truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-400">{money(p.unit_price)}</span>
                  </span>
                  {n > 0 && (
                    <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                      {n} grupo{n === 1 ? '' : 's'}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              );
            })}
            {!loading && filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-10">Sin resultados</p>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
              <Layers size={40} className="text-gray-200" />
              <p className="text-sm">Elegí un producto para configurar sus extras</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="min-w-0">
                  <p className="font-black text-gray-900 truncate">{selected.name}</p>
                  <p className="text-xs text-gray-400">{groups.length} grupo(s) · precio base {money(selected.unit_price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={addGroup}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-black hover:bg-violet-100">
                    <Plus size={13} /> Grupo
                  </button>
                  <button onClick={save} disabled={!dirty || saving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black ${
                      dirty && !saving ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {groups.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-10">
                    Sin grupos. Tocá <b>Grupo</b> para agregar el primero (ej. «Término», «Extras»).
                  </p>
                )}
                {groups.map((g, gi) => (
                  <div key={gi} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input value={g.name} onChange={e => patchGroup(gi, { name: e.target.value })}
                        placeholder="Nombre del grupo"
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm font-bold border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
                        mín
                        <input type="number" min={0} value={g.min_select}
                          onChange={e => patchGroup(gi, { min_select: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded" />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
                        máx
                        <input type="number" min={1} value={g.max_select}
                          onChange={e => patchGroup(gi, { max_select: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded" />
                      </label>
                      <button onClick={() => removeGroup(gi)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2">
                      {g.min_select > 0 ? <b className="text-gray-600">Obligatorio</b> : 'Opcional'} ·{' '}
                      {g.max_select > 1 ? `se pueden elegir hasta ${g.max_select}` : 'una sola opción'}
                    </p>

                    <div className="space-y-1.5">
                      {g.modifiers.map((m, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input value={m.name} onChange={e => patchOption(gi, oi, { name: e.target.value })}
                            placeholder="Opción (ej. Término medio)"
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
                          <div className="relative shrink-0">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₡</span>
                            <input type="number" step="any" value={m.price_delta}
                              onChange={e => patchOption(gi, oi, { price_delta: Number(e.target.value) || 0 })}
                              title="Cuánto suma (o resta, en negativo) al precio del plato"
                              className="w-28 pl-5 pr-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
                          </div>
                          <button onClick={() => removeOption(gi, oi)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                      ))}
                      {/* Ingrediente de cada opción: lo que el extra consume de
                          verdad. Va en su propia fila para no apretar la de
                          arriba, y solo con la función activa. */}
                      {costOn && g.modifiers.map((m, oi) => (
                        <div key={`ing-${oi}`} className="flex items-center gap-2 pl-3 border-l-2 border-violet-100">
                          <span className="text-[11px] font-bold text-gray-400 w-24 truncate shrink-0">{m.name || 'Opción'}</span>
                          <select
                            value={m.ingredient?.product_id ?? ''}
                            onChange={e => patchOption(gi, oi, {
                              ingredient: e.target.value
                                ? { type: 'product', product_id: e.target.value,
                                    quantity: m.ingredient?.quantity || 1,
                                    unit_code: m.ingredient?.unit_code ?? null,
                                    waste_pct: m.ingredient?.waste_pct ?? 0 }
                                : null,
                            })}
                            className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white">
                            <option value="">— No consume nada —</option>
                            {ingredientProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {m.ingredient?.product_id && (
                            <>
                              <input type="number" step="any" value={m.ingredient.quantity}
                                onChange={e => patchOption(gi, oi, {
                                  ingredient: { ...m.ingredient!, quantity: Number(e.target.value) || 0 },
                                })}
                                title="Cantidad que consume"
                                className="w-16 px-2 py-1 text-xs text-right border border-gray-200 rounded-lg" />
                              <select value={m.ingredient.unit_code ?? ''}
                                onChange={e => patchOption(gi, oi, {
                                  ingredient: { ...m.ingredient!, unit_code: e.target.value || null },
                                })}
                                className="w-16 px-1 py-1 text-xs border border-gray-200 rounded-lg bg-white">
                                <option value="">unid</option>
                                {measureUnits.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                              </select>
                            </>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addOption(gi)}
                        className="flex items-center gap-1 text-[11px] font-black text-violet-700 hover:text-violet-900">
                        <Plus size={12} /> Agregar opción
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {editing && (
        <ModifierGroupsModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={(gs) => {
            setByProduct(prev => new Map(prev).set(editing.id, gs));
            setGroups(gs);
            setDirty(false);
            setMsg({ kind: 'ok', text: 'Guardado. Ya aparece al vender este producto en el POS.' });
          }}
        />
      )}
    </div>
  );
};

export default ModifiersManager;
