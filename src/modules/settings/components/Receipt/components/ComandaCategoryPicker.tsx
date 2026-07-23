import { useEffect, useState } from 'react';
import { useTenantId } from '@/hooks/useTenant';
import type { PrinterEntry } from '@/services/pos/qzTrayService';

// Cache a nivel de módulo: las categorías se piden una sola vez por tenant.
let _catsCache: { tenantId: string; cats: { id: string; name: string }[] } | null = null;

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

  const sel = new Set((printer.categories ?? []).map(String));
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ categories: [...next] });
  };

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
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
  );
}

export default ComandaCategoryPicker;
