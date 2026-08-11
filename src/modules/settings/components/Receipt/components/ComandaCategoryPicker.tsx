import { useEffect, useState } from 'react';
import { useTenantId } from '@/hooks/useTenant';
import type { PrinterEntry } from '@/services/pos/qzTrayService';

// Cache a nivel de módulo: las categorías se piden una sola vez por tenant.
let _catsCache: { tenantId: string; cats: { id: string; name: string }[] } | null = null;
/** Estaciones que las recetas del negocio usan de verdad. */
let _stationsCache: { tenantId: string; stations: string[] } | null = null;

/**
 * Selector de categorías para una impresora de COMANDA: define qué platos/bebidas
 * se imprimen en esa estación. Vacío = imprime todo lo que no esté asignado a otra.
 */
export function ComandaCategoryPicker({ printer, onChange }: {
  printer: PrinterEntry;
  onChange: (patch: Partial<PrinterEntry>) => void;
}) {
  const { tenantId } = useTenantId();
  const [cats, setCats] = useState<{ id: string; name: string }[]>(
    _catsCache && tenantId && _catsCache.tenantId === tenantId ? _catsCache.cats : [],
  );
  const [stations, setStations] = useState<string[]>(
    _stationsCache && tenantId && _stationsCache.tenantId === tenantId ? _stationsCache.stations : [],
  );

  useEffect(() => {
    if (!tenantId) return;
    if (_catsCache?.tenantId === tenantId) { setCats(_catsCache.cats); return; }
    import('@/services/Inventory/categoriesService').then(({ categoriesService }) =>
      categoriesService.getAllCategories(tenantId).then((cs: any[]) => {
        const list = (cs ?? []).map(c => ({ id: String(c.id), name: c.name }));
        _catsCache = { tenantId, cats: list };
        setCats(list);
      }).catch(() => {}),
    );
  }, [tenantId]);

  // Estaciones existentes, sacadas de las recetas. Si el negocio no usa recetas
  // o ninguna tiene estación, la sección no aparece en vez de mostrarse vacía.
  useEffect(() => {
    if (!tenantId) return;
    if (_stationsCache?.tenantId === tenantId) { setStations(_stationsCache.stations); return; }
    import('@/lib/api').then(({ apiFetch }) => apiFetch<any[]>('/recipes'))
      .then(rs => {
        const list = [...new Set((rs ?? [])
          .map(r => String(r?.station ?? '').trim())
          .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        _stationsCache = { tenantId, stations: list };
        setStations(list);
      })
      .catch(() => { /* sin recetas: solo se rutea por categoría */ });
  }, [tenantId]);

  const sel = new Set((printer.categories ?? []).map(String));
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ categories: [...next] });
  };

  const selSt = new Set((printer.stations ?? []).map(s => String(s).trim().toLowerCase()));
  const toggleStation = (name: string) => {
    const key = name.trim().toLowerCase();
    const next = (printer.stations ?? []).filter(s => String(s).trim().toLowerCase() !== key);
    if (!selSt.has(key)) next.push(name);
    onChange({ stations: next });
  };

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 space-y-2.5">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
          Categorías que imprime <span className="normal-case font-normal">(vacío = todo lo no asignado a otra)</span>
        </p>
        {cats.length === 0 ? (
          <span className="text-[11px] text-slate-400">Sin categorías creadas</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {cats.map(c => (
              <button key={c.id} type="button" onClick={() => toggle(c.id)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  sel.has(c.id) ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Estaciones de las RECETAS. Es un criterio distinto del de categorías:
          la categoría es de venta (Bebidas, Postres) y la estación es de
          producción (Barra) — un postre y un café son categorías distintas que
          salen del mismo lugar, y eso con categorías solas no se expresa.
          Solo se ofrecen las que alguna receta usa: inventar una lista fija
          llenaría esto de estaciones que el negocio no tiene. */}
      {stations.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
            Estaciones de cocina <span className="normal-case font-normal">(de las recetas)</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {stations.map(st => (
              <button key={st} type="button" onClick={() => toggleStation(st)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  selSt.has(st.trim().toLowerCase())
                    ? 'bg-orange-100 border-orange-300 text-orange-700 font-bold'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {st}
              </button>
            ))}
          </div>
          {selSt.size === 0 && (
            <p className="text-[10px] text-slate-400 mt-1">
              Sin estaciones marcadas se usa el nombre de la impresora ({printer.label || 'sin nombre'}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ComandaCategoryPicker;
