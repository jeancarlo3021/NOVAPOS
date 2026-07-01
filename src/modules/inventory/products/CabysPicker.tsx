import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { cabysService, type CabysItem } from '@/services/cabys/cabysService';

/**
 * Buscador del catálogo CABYS. Al seleccionar, devuelve el código y la tarifa IVA.
 * El valor mostrado es el código actual del producto.
 */
export function CabysPicker({ value, onSelect, disabled }: {
  value: string;
  onSelect: (code: string, ivaRate: number) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CabysItem[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar CABYS por descripción o código…"
          disabled={disabled}
          className="w-full pl-9 pr-8 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {results.map(r => (
            <button key={r.code} type="button"
              onClick={() => { onSelect(r.code, Number(r.iva_rate)); setQ(''); setOpen(false); }}
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
