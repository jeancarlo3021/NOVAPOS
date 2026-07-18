import React, { useState, useEffect } from 'react';
import { BellRing, X } from 'lucide-react';

interface Props {
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
  saveLabel?: string;
}

/** Modal simple para asignar un BIPPER (localizador): número o nombre que sale en
 *  el ticket para llamar al cliente cuando su pedido está listo. */
export const BipperModal: React.FC<Props> = ({ value, onSave, onClose, saveLabel = 'Guardar' }) => {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);

  const save = () => { onSave(v.trim()); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <BellRing size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-gray-900">Bipper / localizador</h3>
            <p className="text-xs text-gray-500">Número o nombre para el ticket</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <input
          autoFocus value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="Ej. 12  ·  Mesa 3  ·  Juan"
          className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2.5 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="flex items-center gap-2 mt-4">
          {value && (
            <button onClick={() => { onSave(''); onClose(); }}
              className="px-3 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50">
              Quitar
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={save}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-amber-600 hover:bg-amber-700">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BipperModal;
