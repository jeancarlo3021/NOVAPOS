import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, X, Clock, Sparkles } from 'lucide-react';
import { cabysService, type CabysItem } from '@/services/cabys/cabysService';

const RECENT_KEY = 'cabys_recientes';

// Lee/guarda los últimos CABYS usados (por navegador). Máx. 8.
function readRecents(): CabysItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(item: CabysItem) {
  try {
    const list = readRecents().filter(r => r.code !== item.code);
    list.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* ignore */ }
}

/**
 * Buscador del catálogo CABYS. Al seleccionar, devuelve el código y la tarifa IVA.
 * El valor mostrado es el código actual del producto.
 * - `suggestName`: si se pasa (ej. el nombre del producto), muestra un botón para
 *   buscar automáticamente por ese texto.
 */
export function CabysPicker({ value, onSelect, disabled, suggestName }: {
  value: string;
  onSelect: (code: string, ivaRate: number) => void;
  disabled?: boolean;
  suggestName?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CabysItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<CabysItem[]>(() => readRecents());
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      cabysService.search(q.trim())
        .then(r => { setResults(r); setOpen(true); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const choose = (r: CabysItem) => {
    onSelect(r.code, Number(r.iva_rate));
    pushRecent(r);
    setRecents(readRecents());
    setQ('');
    setOpen(false);
  };

  const searchByName = () => {
    const name = (suggestName ?? '').trim();
    if (!name) return;
    setQ(name);
    setOpen(true);
    inputRef.current?.focus();
  };

  const showRecents = open && q.trim().length < 2 && recents.length > 0;

  return (
    <div className="relative" ref={boxRef}>
      {value && (
        <div className="flex items-center gap-2 mb-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <span className="text-xs font-mono font-bold text-blue-800">{value}</span>
          <button type="button" onClick={() => onSelect('', 13)} disabled={disabled}
            className="ml-auto text-blue-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Buscar CABYS por descripción o código…"
          disabled={disabled}
          className="w-full pl-9 pr-8 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
      </div>

      {/* Botón: buscar por el nombre del producto */}
      {suggestName && suggestName.trim().length >= 2 && !value && (
        <button type="button" onClick={searchByName} disabled={disabled}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50">
          <Sparkles size={13} /> Buscar por «{suggestName.trim().slice(0, 24)}»
        </button>
      )}

      {/* Recientes (cuando el campo está vacío) */}
      {showRecents && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400 flex items-center gap-1 border-b border-gray-50">
            <Clock size={12} /> Usados recientemente
          </p>
          {recents.map(r => (
            <button key={r.code} type="button" onClick={() => choose(r)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
              <p className="text-sm text-gray-800 leading-tight">{r.description}</p>
              <p className="text-[11px] text-gray-400 font-mono">{r.code} · IVA {r.iva_rate}%</p>
            </button>
          ))}
        </div>
      )}

      {/* Resultados de búsqueda */}
      {open && q.trim().length >= 2 && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {results.map(r => (
            <button key={r.code} type="button" onClick={() => choose(r)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
              <p className="text-sm text-gray-800 leading-tight">{r.description}</p>
              <p className="text-[11px] text-gray-400 font-mono">{r.code} · IVA {r.iva_rate}%</p>
            </button>
          ))}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2 text-sm text-gray-400">
          Sin resultados. ¿El catálogo está cargado? (Panel Admin → CABYS)
        </div>
      )}
    </div>
  );
}

export default CabysPicker;
