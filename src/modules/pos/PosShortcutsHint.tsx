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
 * Chip fijo arriba a la derecha, algo separado del borde para no chocar con los
 * controles de la ventana ni quedar bajo el pulgar en tablet. Ocupa casi nada y al tocarlo
 * despliega la lista completa de comandos. Reemplaza los recordatorios sueltos
 * repartidos por la pantalla.
 */
interface Props {
  /** Lista propia de atajos. Sin esto usa la del POS. */
  shortcuts?: { keys: string; label: string }[];
  /** 'floating' = flotante sobre la pantalla · 'inline' = un botón más dentro de
   *  la barra donde se lo ponga (ej. el pie del pedido, junto a la nota). */
  variant?: 'floating' | 'inline';
}

export const PosShortcutsHint: React.FC<Props> = ({ shortcuts, variant = 'floating' }) => {
  const [open, setOpen] = useState(false);
  const list = shortcuts ?? SHORTCUTS;

  // Inline: el panel se abre HACIA ARRIBA, porque el botón vive en un pie.
  if (variant === 'inline') {
    return (
      <div className="relative shrink-0 print:hidden">
        {open && (
          <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-[11px] font-black text-white uppercase tracking-wider">Comandos</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
            <ul className="py-1">
              {list.map(s => (
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
        <button
          onClick={() => setOpen(o => !o)}
          title="Atajos de teclado"
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-black transition ${
            open
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
        >
          <Keyboard size={15} /> Comandos
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-40 right-5 z-40 print:hidden flex flex-col items-end">
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
            {list.map(s => (
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
