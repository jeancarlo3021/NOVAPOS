import React, { useState } from 'react';
import {
  Receipt, Utensils, Settings, Trash2, Printer,
  RefreshCw, Usb, Network, ChevronDown,
} from 'lucide-react';
import type { PrinterEntry } from '@/services/pos/qzTrayService';

interface PrinterRowProps {
  printer: PrinterEntry;
  qzPrinters: string[];
  onChange: (patch: Partial<PrinterEntry>) => void;
  onRemove: () => void;
  onTest: () => void;
  testLoading: boolean;
}

export function PrinterRow({ printer, qzPrinters, onChange, onRemove, onTest, testLoading }: PrinterRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isReceipt = printer.type === 'receipt';

  return (
    <div className="hover:bg-slate-50 transition-colors">
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Icon + info */}
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl shrink-0 ${isReceipt ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
            {isReceipt ? <Receipt size={22} /> : <Utensils size={22} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={printer.label}
                onChange={e => onChange({ label: e.target.value })}
                placeholder={isReceipt ? 'Ej: Caja Principal' : 'Ej: Cocina / Barra'}
                className="font-bold text-slate-900 text-sm bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-400 focus:outline-none px-0.5 w-44"
              />
              <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={printer.is_active}
                  onChange={e => onChange({ is_active: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 w-3.5 h-3.5"
                />
                Activa
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${isReceipt ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                {isReceipt ? 'Ticket' : 'Comanda'}
              </span>
              {printer.connection === 'network'
                ? <span className="flex items-center gap-0.5"><Network size={10} />{printer.ip || 'Sin IP'}</span>
                : <span className="flex items-center gap-0.5"><Usb size={10} />{printer.printer_name || 'Sin impresora'}</span>
              }
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition flex items-center gap-1"
          >
            <Settings size={12} /> Config.
          </button>
          <button
            onClick={onTest}
            disabled={testLoading}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition flex items-center gap-1 disabled:opacity-40"
          >
            {testLoading ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
            Probar
          </button>
          <button
            onClick={onRemove}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-50 border border-red-200 text-red-500 rounded-lg hover:bg-red-100 hover:text-red-700 transition"
          >
            <Trash2 size={12} /> Eliminar
          </button>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 bg-slate-50/50">
          {/* Connection toggle */}
          <div className="flex gap-2 pt-3">
            <button onClick={() => onChange({ connection: 'usb' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                printer.connection === 'usb'
                  ? 'bg-slate-800 border-slate-800 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
              }`}
            >
              <Usb size={12} /> USB
            </button>
            <button onClick={() => onChange({ connection: 'network' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                printer.connection === 'network'
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
              }`}
            >
              <Network size={12} /> Red / IP
            </button>
          </div>

          {printer.connection === 'usb' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre de impresora en el SO</label>
              {qzPrinters.length > 0 ? (
                <div className="relative">
                  <select value={printer.printer_name ?? ''} onChange={e => onChange({ printer_name: e.target.value })}
                    className="w-full px-3 py-1.5 pr-8 border border-slate-200 rounded-lg text-xs bg-white appearance-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— Seleccionar —</option>
                    {qzPrinters.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <input type="text" value={printer.printer_name ?? ''}
                  onChange={e => onChange({ printer_name: e.target.value })}
                  placeholder="Nombre exacto en el sistema operativo"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-300"
                />
              )}
            </div>
          )}

          {printer.connection === 'network' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Dirección IP</label>
                <input type="text" value={printer.ip ?? ''} onChange={e => onChange({ ip: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Puerto</label>
                <input type="number" value={printer.port ?? 9100} onChange={e => onChange({ port: parseInt(e.target.value) || 9100 })}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
