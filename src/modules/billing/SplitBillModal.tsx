import { useMemo, useState } from 'react';
import { X, Users, UtensilsCrossed, Equal, Check } from 'lucide-react';
import type { Bill, BillItem } from './types';
import { billSubtotal, billItemTotal } from './types';

const fmt = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

type Mode = 'equal' | 'by_item' | 'by_person';

interface Props {
  bill: Bill;
  taxEnabled: boolean;
  taxRate: number;
  onClose: () => void;
  /** Recibe las partes (cada una es una lista de items). El dashboard genera
   *  una factura/ticket por parte no vacía. */
  onConfirm: (parts: BillItem[][]) => void;
}

export function SplitBillModal({ bill, taxEnabled, taxRate, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<Mode>('equal');
  const [nPeople, setNPeople] = useState(2);

  // Mapa item.id → índice de persona (para by_item / by_person)
  const [assign, setAssign] = useState<Record<string, number>>({});

  const subtotal = billSubtotal(bill);
  const withTax = (n: number) => taxEnabled ? n + Math.round(n * taxRate) : n;

  // Expande items por cantidad para asignación granular (1 unidad = 1 fila)
  const units = useMemo(() => {
    const out: { key: string; item: BillItem }[] = [];
    bill.items.forEach(it => {
      for (let i = 0; i < it.quantity; i++) {
        out.push({ key: `${it.id}__${i}`, item: { ...it, quantity: 1 } });
      }
    });
    return out;
  }, [bill.items]);

  const buildParts = (): BillItem[][] => {
    if (mode === 'equal') {
      // División equitativa: no separa items, crea N "partes" con el mismo
      // contenido proporcional. Para tickets simples, ponemos todos los items
      // en la parte 1 pero el dashboard sabe el monto/persona. Mejor: una sola
      // factura con nota de cuántas personas. Para simplicidad: parte única
      // con todos los items (el cobro equitativo se muestra abajo).
      return [bill.items];
    }
    // by_item / by_person: agrupar unidades por persona asignada
    const groups: Record<number, BillItem[]> = {};
    units.forEach(u => {
      const p = assign[u.key] ?? 0;
      if (!groups[p]) groups[p] = [];
      // Consolidar mismas líneas dentro de la persona
      const existing = groups[p].find(x =>
        x.product_id === u.item.product_id &&
        x.name === u.item.name &&
        JSON.stringify(x.modifiers) === JSON.stringify(u.item.modifiers) &&
        x.notes === u.item.notes
      );
      if (existing) existing.quantity += 1;
      else groups[p].push({ ...u.item, id: `${u.item.id}_${p}`, quantity: 1 });
    });
    return Object.keys(groups).sort().map(k => groups[Number(k)]);
  };

  const equalPerPerson = withTax(subtotal) / Math.max(1, nPeople);

  const confirm = () => {
    if (mode === 'equal') {
      // Para equitativo generamos N partes idénticas en monto: el dashboard
      // imprime N tickets con el monto/persona. Replicamos el total dividido
      // como un único item "Parte X/N".
      const perPerson = subtotal / Math.max(1, nPeople);
      const parts: BillItem[][] = [];
      for (let i = 0; i < nPeople; i++) {
        parts.push([{
          id: `${bill.id}_eq_${i}`,
          name: `Parte ${i + 1}/${nPeople} (cuenta dividida)`,
          unit_price: Math.round(perPerson),
          quantity: 1,
        }]);
      }
      onConfirm(parts);
      return;
    }
    const parts = buildParts().filter(p => p.length > 0);
    if (parts.length === 0) return;
    onConfirm(parts);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-gray-900">Dividir cuenta · {fmt(withTax(subtotal))}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Selector de modo */}
        <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-3 gap-2 shrink-0">
          <ModeTab active={mode === 'equal'} onClick={() => setMode('equal')} icon={Equal} label="Equitativa" />
          <ModeTab active={mode === 'by_item'} onClick={() => setMode('by_item')} icon={UtensilsCrossed} label="Por plato" />
          <ModeTab active={mode === 'by_person'} onClick={() => setMode('by_person')} icon={Users} label="Por persona" />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'equal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-bold text-gray-600">¿Entre cuántas personas?</span>
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setNPeople(n => Math.max(2, n - 1))}
                    className="w-9 h-9 rounded-lg bg-white font-black text-lg">−</button>
                  <span className="w-10 text-center font-black text-xl">{nPeople}</span>
                  <button onClick={() => setNPeople(n => n + 1)}
                    className="w-9 h-9 rounded-lg bg-white font-black text-lg">+</button>
                </div>
              </div>
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Cada persona paga</p>
                <p className="text-4xl font-black text-emerald-600 mt-1 tabular-nums">{fmt(equalPerPerson)}</p>
                <p className="text-xs text-emerald-600 mt-1">{nPeople} pagos de {fmt(equalPerPerson)}</p>
              </div>
            </div>
          )}

          {(mode === 'by_item' || mode === 'by_person') && (
            <div className="space-y-4">
              {/* Selector de cantidad de personas */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-600">Personas:</span>
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setNPeople(n => Math.max(2, n - 1))}
                    className="w-8 h-8 rounded-lg bg-white font-black">−</button>
                  <span className="w-8 text-center font-black">{nPeople}</span>
                  <button onClick={() => setNPeople(n => n + 1)}
                    className="w-8 h-8 rounded-lg bg-white font-black">+</button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Asigná cada unidad a una persona tocando el número. Las no asignadas van a la Persona 1.
              </p>
              {/* Lista de unidades */}
              <div className="space-y-1.5">
                {units.map(u => (
                  <div key={u.key} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.item.name}</p>
                      <p className="text-[11px] text-gray-500 font-mono">{fmt(billItemTotal(u.item))}</p>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: nPeople }).map((_, pi) => (
                        <button key={pi} onClick={() => setAssign(a => ({ ...a, [u.key]: pi }))}
                          className={`w-7 h-7 rounded-lg text-xs font-black transition ${
                            (assign[u.key] ?? 0) === pi
                              ? 'bg-violet-600 text-white'
                              : 'bg-white border border-gray-200 text-gray-500 hover:border-violet-300'
                          }`}>
                          {pi + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Totales por persona */}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: nPeople }).map((_, pi) => {
                  const sum = units.reduce((s, u) => (assign[u.key] ?? 0) === pi ? s + billItemTotal(u.item) : s, 0);
                  return (
                    <div key={pi} className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 flex justify-between items-center">
                      <span className="text-xs font-bold text-violet-700">Persona {pi + 1}</span>
                      <span className="text-sm font-black text-violet-900 tabular-nums">{fmt(withTax(sum))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={confirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black flex items-center justify-center gap-2">
            <Check size={16} /> Cobrar dividido ({mode === 'equal' ? nPeople : Math.max(1, new Set(Object.values(assign)).size || 1)} tickets)
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: any; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition ${
        active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
      }`}>
      <Icon size={18} />
      <span className="text-xs font-bold">{label}</span>
    </button>
  );
}

export default SplitBillModal;
