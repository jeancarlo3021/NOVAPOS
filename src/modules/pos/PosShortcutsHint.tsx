import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';

/** Atajos del POS. Se listan en un solo lugar para no repetirlos por la UI. */
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'F2',     label: 'Abrir buscador' },
  { keys: 'F12',    label: 'Cobrar' },
  { keys: 'F4',     label: 'Anular venta' },
  { keys: 'F6',     label: 'Nueva venta en espera' },
  { keys: 'Ctrl+P', label: 'Producto rápido' },
  { keys: 'Enter',  label: 'Agregar al carrito' },
  { keys: '↑ ↓',    label: 'Elegir producto / línea' },
  { keys: 'Supr',   label: 'Borrar línea del carrito' },
  { keys: 'Esc',    label: 'Cerrar / limpiar' },
];

/**
 * Chip fijo en la esquina superior derecha: ocupa casi nada y al tocarlo
 * despliega la lista completa de comandos. Reemplaza los recordatorios sueltos
 * repartidos por la pantalla.
 */
export const PosShortcutsHint: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-3 right-3 z-40 print:hidden flex flex-col items-end">
      <button
        onClick={() => setOpen(o => !o)}
        title="Atajos de teclado"
        className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full border shadow-lg text-[11px] font-bold transition ${
          open
            ? 'bg-gray-900 border-white/20 text-white'
            : 'bg-white/90 backdrop-blur border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300'
        }`}
      >
        <Keyboard size={14} />
        <span>Comandos</span>
      </button>

      {open && (
        <div className="mt-2 w-56 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-[11px] font-black text-white uppercase tracking-wider">Comandos</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition">
              <X size={14} />
            </button>
          </div>
          <ul className="py-1">
            {SHORTCUTS.map(s => (
              <li key={s.keys} className="flex items-center justify-between gap-2 px-3 py-1">
                <span className="text-[11px] text-gray-300">{s.label}</span>
                <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-emerald-300 font-mono text-[10px] font-bold">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
