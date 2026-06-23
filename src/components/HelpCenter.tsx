import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { HELP_CATEGORIES, type HelpItem } from '@/data/helpTopics';
import { useAuth } from '@/context/AuthContext';
import { useRolePermissions } from '@/hooks/useRolePermissions';

/**
 * Centro de Ayuda flotante: un botón "?" que abre un panel con guías paso a paso,
 * buscables, para usar las funciones del sistema. Se monta una vez (en App).
 */
export function HelpCenter() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { planFeatures } = useAuth();
  const { canAccess } = useRolePermissions();
  const location = useLocation();

  // Categorías visibles según el PLAN y el ROL.
  const visibleCategories = useMemo(() => {
    const cats = HELP_CATEGORIES.filter(cat => {
      if (cat.feature && !(planFeatures as any)?.[cat.feature]) return false;
      if (cat.module && !canAccess(cat.module)) return false;
      return true;
    });
    // Ordenar: la categoría relevante a la pantalla actual va primero.
    const path = location.pathname;
    return [...cats].sort((a, b) => {
      const am = a.paths?.some(p => path.startsWith(p)) ? 1 : 0;
      const bm = b.paths?.some(p => path.startsWith(p)) ? 1 : 0;
      return bm - am;
    });
  }, [planFeatures, canAccess, location.pathname]);

  const q = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return visibleCategories;
    return visibleCategories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(it =>
          it.q.toLowerCase().includes(q) ||
          (it.keywords ?? '').toLowerCase().includes(q) ||
          it.steps.some(s => s.toLowerCase().includes(q)),
        ),
      }))
      .filter(cat => cat.items.length > 0);
  }, [q, visibleCategories]);

  const key = (catId: string, i: number) => `${catId}-${i}`;

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Ayuda y guías"
          className="fixed bottom-5 right-5 z-80 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center">
          <HelpCircle size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-90 flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full sm:max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-linear-to-r from-blue-600 to-indigo-600 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-black text-lg flex items-center gap-2"><HelpCircle size={20} /> Centro de Ayuda</h2>
                <p className="text-blue-100 text-xs">Guías paso a paso para usar el sistema</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/15 rounded-lg"><X size={20} /></button>
            </div>

            {/* Búsqueda */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscá: vender, crédito, cargar, zona…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
              </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {results.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-10">No encontramos ayuda para "{search}".</p>
              )}
              {results.map(cat => (
                <div key={cat.id}>
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span>{cat.emoji}</span> {cat.title}
                  </h3>
                  <div className="space-y-2">
                    {cat.items.map((it: HelpItem, i) => {
                      const id = key(cat.id, i);
                      const isOpen = expanded === id;
                      return (
                        <div key={id} className="border border-gray-100 rounded-xl overflow-hidden">
                          <button onClick={() => setExpanded(isOpen ? null : id)}
                            className={`w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left text-sm font-bold ${isOpen ? 'bg-blue-50 text-blue-800' : 'text-gray-800 hover:bg-gray-50'}`}>
                            <span>{it.q}</span>
                            {isOpen ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0 text-gray-400" />}
                          </button>
                          {isOpen && (
                            <ol className="px-4 py-3 space-y-2 bg-white">
                              {it.steps.map((s, si) => (
                                <li key={si} className="flex gap-2.5 text-sm text-gray-700">
                                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">{si + 1}</span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 text-center text-[11px] text-gray-400">
              ¿No encontrás algo? Escribilo en la búsqueda con otras palabras.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default HelpCenter;
