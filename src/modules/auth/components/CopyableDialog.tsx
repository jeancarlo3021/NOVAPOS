import React, { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

/**
 * Aviso con texto COPIABLE.
 *
 * Los errores de Alanube y Hacienda vienen con datos que hay que pasarle a
 * soporte o pegar en otro lado (claves, ids, respuestas crudas). Con
 * `window.alert` el texto no se puede seleccionar ni copiar en el navegador,
 * así que había que transcribirlo a mano desde una captura de pantalla.
 */
export const CopyableDialog: React.FC<{
  title?: string;
  text: string;
  onClose: () => void;
}> = ({ title = 'Detalle', text, onClose }) => {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sin permiso de portapapeles (http, WebView vieja): se copia con un
      // textarea temporal, que funciona en todos lados.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nada más que hacer */ }
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* `select-all` + textarea de solo lectura: se puede seleccionar a mano
            además del botón, que es lo que la gente intenta primero. */}
        <textarea
          readOnly
          value={text}
          onFocus={e => e.currentTarget.select()}
          className="flex-1 m-4 p-3 text-xs font-mono leading-relaxed rounded-lg resize-none
                     bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200
                     border border-slate-200 dark:border-slate-700 min-h-[240px]"
        />

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cerrar
          </button>
          <button
            onClick={copiar}
            className={`px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 ${
              copiado ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {copiado ? <Check size={15} /> : <Copy size={15} />}
            {copiado ? 'Copiado' : 'Copiar todo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CopyableDialog;
