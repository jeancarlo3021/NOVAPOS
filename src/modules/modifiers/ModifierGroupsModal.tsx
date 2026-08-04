import React, { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, Save, Loader2, AlertCircle, Layers } from 'lucide-react';
import {
  modifiersService, type ModifierGroup, type Modifier,
} from '@/services/modifiers/modifiersService';

interface Props {
  product: { id: string; name: string; unit_price?: number };
  onClose: () => void;
  /** Se llama al guardar, con los grupos resultantes (para refrescar la lista). */
  onSaved?: (groups: ModifierGroup[]) => void;
}

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/**
 * Editor de extras y modificadores de UN producto, en modal.
 *
 * Se usa desde el módulo de modificadores y desde el propio producto, para
 * configurarlos sin salir de donde uno está.
 */
export const ModifierGroupsModal: React.FC<Props> = ({ product, onClose, onSaved }) => {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      setGroups(await modifiersService.list(product.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron cargar los extras');
    } finally { setLoading(false); }
  }, [product.id]);
  useEffect(() => { void load(); }, [load]);

  /**
   * Grupos listos para usar. Configurar «Término» opción por opción es lo que más
   * se repite en un restaurante, así que se arma de un toque.
   */
  const PRESETS: { label: string; group: Omit<ModifierGroup, 'product_id'> }[] = [
    {
      label: '🥩 Término de cocción',
      group: {
        name: 'Término', min_select: 1, max_select: 1, modifiers: [
          { name: 'Poco cocido', price_delta: 0, sort_order: 0 },
          { name: 'Término medio', price_delta: 0, sort_order: 1 },
          { name: 'Tres cuartos', price_delta: 0, sort_order: 2 },
          { name: 'Bien cocido', price_delta: 0, sort_order: 3 },
        ],
      },
    },
    {
      label: '🍳 Punto del huevo',
      group: {
        name: 'Huevo', min_select: 1, max_select: 1, modifiers: [
          { name: 'Frito', price_delta: 0, sort_order: 0 },
          { name: 'Revuelto', price_delta: 0, sort_order: 1 },
          { name: 'Estrellado', price_delta: 0, sort_order: 2 },
        ],
      },
    },
    {
      label: '➕ Extras',
      group: {
        name: 'Extras', min_select: 0, max_select: 3, modifiers: [
          { name: 'Queso', price_delta: 0, sort_order: 0 },
          { name: 'Aguacate', price_delta: 0, sort_order: 1 },
          { name: 'Tocineta', price_delta: 0, sort_order: 2 },
        ],
      },
    },
    {
      label: '🚫 Sin…',
      group: {
        name: 'Sin', min_select: 0, max_select: 4, modifiers: [
          { name: 'Sin cebolla', price_delta: 0, sort_order: 0 },
          { name: 'Sin sal', price_delta: 0, sort_order: 1 },
          { name: 'Sin picante', price_delta: 0, sort_order: 2 },
          { name: 'Sin salsa', price_delta: 0, sort_order: 3 },
        ],
      },
    },
  ];

  const addPreset = (preset: typeof PRESETS[number]) => {
    setGroups(g => [...g, {
      ...JSON.parse(JSON.stringify(preset.group)),
      product_id: product.id,
      sort_order: g.length,
    }]);
    setDirty(true);
  };

  const addGroup = () => {
    setGroups(g => [...g, {
      product_id: product.id, name: '', min_select: 0, max_select: 1,
      sort_order: g.length, modifiers: [],
    }]);
    setDirty(true);
  };
  const patchGroup = (i: number, patch: Partial<ModifierGroup>) => {
    setGroups(g => g.map((x, j) => j === i ? { ...x, ...patch } : x)); setDirty(true);
  };
  const removeGroup = (i: number) => { setGroups(g => g.filter((_, j) => j !== i)); setDirty(true); };
  const addOption = (gi: number) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: [...x.modifiers, { name: '', price_delta: 0, sort_order: x.modifiers.length }] } : x));
    setDirty(true);
  };
  const patchOption = (gi: number, oi: number, patch: Partial<Modifier>) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: x.modifiers.map((m, k) => k === oi ? { ...m, ...patch } : m) } : x));
    setDirty(true);
  };
  const removeOption = (gi: number, oi: number) => {
    setGroups(g => g.map((x, j) => j === gi
      ? { ...x, modifiers: x.modifiers.filter((_, k) => k !== oi) } : x));
    setDirty(true);
  };

  const save = async () => {
    // Se valida acá porque un grupo mal armado BLOQUEA la venta en el POS: pedir
    // 2 opciones de un grupo que tiene 1 deja el botón "Agregar" inservible.
    for (const g of groups) {
      if (!g.name.trim()) { setErr('Hay un grupo sin nombre.'); return; }
      if (g.max_select < 1) { setErr(`"${g.name}": el máximo debe ser al menos 1.`); return; }
      if (g.min_select > g.max_select) {
        setErr(`"${g.name}": el mínimo (${g.min_select}) no puede superar al máximo (${g.max_select}).`); return;
      }
      if (g.min_select > g.modifiers.length) {
        setErr(`"${g.name}": pide elegir ${g.min_select} pero solo tiene ${g.modifiers.length} opción(es).`); return;
      }
      if (g.modifiers.some(m => !m.name.trim())) { setErr(`"${g.name}": hay una opción sin nombre.`); return; }
    }
    setSaving(true); setErr('');
    try {
      const clean = groups.map((g, i) => ({ ...g, sort_order: i }));
      await modifiersService.saveForProduct(product.id, clean);
      onSaved?.(clean);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 truncate">
              <Layers size={18} className="text-violet-600" /> Extras y modificadores
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {product.name}{product.unit_price != null && <> · base {money(product.unit_price)}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {err && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg px-3 py-2">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              {groups.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400">Este producto no pregunta nada al venderse.</p>
                  <p className="text-xs text-gray-400 mt-1">Empezá con uno listo o creá el tuyo.</p>
                </div>
              )}

              {/* Grupos listos: el término de cocción es el que más se repite. */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] font-black text-gray-400 uppercase self-center mr-1">Agregar listo:</span>
                {PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => addPreset(p)}
                    className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-bold hover:bg-violet-100">
                    {p.label}
                  </button>
                ))}
              </div>

              {groups.map((g, gi) => (
                <div key={gi} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={g.name} onChange={e => patchGroup(gi, { name: e.target.value })}
                      placeholder="Nombre del grupo (ej. Término)"
                      className="flex-1 min-w-0 px-2 py-1.5 text-sm font-bold border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
                    <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 shrink-0">
                      mín
                      <input type="number" min={0} value={g.min_select}
                        onChange={e => patchGroup(gi, { min_select: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded" />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 shrink-0">
                      máx
                      <input type="number" min={1} value={g.max_select}
                        onChange={e => patchGroup(gi, { max_select: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded" />
                    </label>
                    <button onClick={() => removeGroup(gi)} className="shrink-0 text-gray-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">
                    {g.min_select > 0 ? <b className="text-gray-600">Obligatorio</b> : 'Opcional'} ·{' '}
                    {g.max_select > 1 ? `hasta ${g.max_select} opciones` : 'una sola opción'}
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
                            title="Cuánto suma al precio. En negativo, resta."
                            className="w-28 pl-5 pr-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg outline-none focus:border-violet-400" />
                        </div>
                        <button onClick={() => removeOption(gi, oi)} className="shrink-0 text-gray-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addOption(gi)}
                      className="flex items-center gap-1 text-[11px] font-black text-violet-700 hover:text-violet-900">
                      <Plus size={12} /> Agregar opción
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 shrink-0 flex items-center gap-2">
          <button onClick={addGroup} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-black hover:bg-violet-100 disabled:opacity-40">
            <Plus size={15} /> Grupo
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={save} disabled={!dirty || saving || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModifierGroupsModal;
