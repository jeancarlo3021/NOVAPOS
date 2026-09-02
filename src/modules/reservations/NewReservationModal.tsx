import React, { useMemo, useState } from 'react';
import { X, Loader2, Search, Trash2, AlertCircle, Bookmark } from 'lucide-react';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { reservationsService } from '@/services/reservations/reservationsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

interface Linea { product_id: string | null; product_name: string; quantity: number; unit_price: number }

/**
 * Nuevo apartado.
 *
 * Pide lo mínimo para que valga: quién lo aparta, qué se lleva, hasta cuándo se
 * le guarda y cuánto abona ahora. El teléfono no es un adorno — es con lo que se
 * le avisa antes de que venza.
 */
export const NewReservationModal: React.FC<{
  onClose: () => void;
  onCreated: (msg: string) => void;
}> = ({ onClose, onCreated }) => {
  const { filteredProducts, searchTerm, setSearchTerm, loading: cargandoCatalogo } = usePOSProducts();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [vence, setVence] = useState(() => {
    // Un mes por defecto: es el plazo habitual de un apartado, y una fecha
    // puesta evita que la mercadería quede separada para siempre.
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [abono, setAbono] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const sugerencias = useMemo(
    () => (searchTerm.trim() ? filteredProducts.slice(0, 8) : []),
    [filteredProducts, searchTerm],
  );

  const total = round2(lineas.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  const abonoNum = round2(Number(String(abono).replace(/[^\d.]/g, '')) || 0);

  const agregar = (p: any) => {
    setLineas(prev => {
      const i = prev.findIndex(x => x.product_id && x.product_id === p.id);
      if (i >= 0) return prev.map((x, j) => j === i ? { ...x, quantity: x.quantity + 1 } : x);
      return [...prev, {
        product_id: p.id, product_name: p.name,
        quantity: 1, unit_price: round2(Number(p.unit_price ?? 0)),
      }];
    });
    setSearchTerm('');
  };

  const guardar = async () => {
    if (lineas.length === 0) { setError('Agregá al menos un artículo.'); return; }
    if (!nombre.trim()) { setError('Poné el nombre de quien aparta: sin eso no se sabe de quién es la mercadería.'); return; }
    if (abonoNum > total) { setError('El abono no puede ser mayor que el total.'); return; }
    setGuardando(true); setError('');
    try {
      const r = await reservationsService.create({
        customer_name: nombre.trim(),
        customer_phone: telefono.trim() || null,
        expires_on: vence || null,
        notes: notas.trim() || null,
        items: lineas,
        deposit: abonoNum || undefined,
      });
      onCreated(`Apartado ${r.number} creado por ${money(total)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el apartado');
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-black text-gray-900 flex items-center gap-2">
            <Bookmark size={18} className="text-violet-600" /> Nuevo apartado
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del cliente *"
              className="col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-violet-400" />
            <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono" inputMode="tel"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-violet-400" />
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl">
              <span className="text-[11px] font-bold text-gray-400 shrink-0">Vence</span>
              <input type="date" value={vence} onChange={e => setVence(e.target.value)}
                className="flex-1 min-w-0 text-sm font-bold text-gray-800 outline-none" />
            </label>
          </div>

          {/* Buscador de artículos */}
          <div className="border-2 border-violet-200 rounded-xl p-2.5 space-y-2 bg-violet-50/40">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-violet-500 shrink-0" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar artículo por nombre o código"
                className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-violet-200 text-sm font-semibold outline-none" />
            </div>
            {cargandoCatalogo && (
              <p className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Cargando el catálogo…
              </p>
            )}
            {sugerencias.map(p => (
              <button key={p.id} onClick={() => agregar(p)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white border border-gray-200 hover:border-violet-400 text-left">
                <span className="text-sm font-black text-gray-800 min-w-0 truncate">{p.name}</span>
                <span className="text-sm font-black tabular-nums text-gray-600 shrink-0">
                  {money(Number((p as any).unit_price ?? 0))}
                </span>
              </button>
            ))}
          </div>

          {lineas.map((l, i) => (
            <div key={i} className="border-2 border-gray-200 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black text-gray-800 min-w-0 truncate">{l.product_name}</span>
                <button onClick={() => setLineas(prev => prev.filter((_, j) => j !== i))}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 shrink-0"><Trash2 size={14} /></button>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5">
                  <span className="text-[11px] font-bold text-gray-400">Cant.</span>
                  <input type="number" min={0} step="any" value={l.quantity}
                    onChange={e => setLineas(prev => prev.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))}
                    className="w-14 text-sm font-black text-gray-800 outline-none" />
                </label>
                <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5">
                  <span className="text-xs font-bold text-gray-400">₡</span>
                  <input type="number" min={0} step="any" value={l.unit_price}
                    onChange={e => setLineas(prev => prev.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x))}
                    className="w-24 text-sm font-black text-gray-800 outline-none" />
                </label>
                <span className="ml-auto text-sm font-black tabular-nums text-gray-800">
                  {money(l.quantity * l.unit_price)}
                </span>
              </div>
            </div>
          ))}

          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            placeholder="Notas (color, talla, dónde quedó guardado…)"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-violet-400" />
        </div>

        <div className="border-t border-gray-100 p-4 space-y-2">
          {error && (
            <p className="flex items-start gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <div className="flex items-center justify-between text-sm font-black text-gray-800">
            <span>Total</span><span className="tabular-nums">{money(total)}</span>
          </div>
          <label className="flex items-center gap-2 rounded-xl border-2 border-violet-200 px-3 py-2">
            <span className="text-xs font-black text-violet-700 shrink-0">Abona hoy</span>
            <span className="text-sm font-bold text-gray-400">₡</span>
            <input value={abono} onChange={e => setAbono(e.target.value)} inputMode="decimal" placeholder="0"
              className="flex-1 min-w-0 text-base font-black text-gray-900 outline-none" />
            {abonoNum > 0 && (
              <span className="text-xs font-bold text-gray-500 shrink-0">Falta {money(total - abonoNum)}</span>
            )}
          </label>
          <button onClick={() => void guardar()} disabled={guardando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700
                       disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />} Apartar
          </button>
          <p className="text-[11px] font-semibold text-gray-400 text-center">
            Los artículos salen del inventario disponible al apartarse. La factura se hace al entregarlos.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NewReservationModal;
