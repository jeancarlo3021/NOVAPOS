'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Printer, Loader, RefreshCw, Check, AlertTriangle, Pencil } from 'lucide-react';
import { labelTemplatesService, type LabelTemplate } from '@/services/labels/labelTemplatesService';
import { labelPrinterConfig } from '@/services/labels/labelPrinterConfig';
import { renderLabelHTML, type LabelProduct } from '@/services/labels/labelRenderService';
import {
  qzIsConnected, qzConnect, qzGetPrinters, qzPrintHTML,
} from '@/services/pos/qzTrayService';
import { LabelEditor } from './LabelEditor';

interface Props {
  tenantId: string;
  product: LabelProduct;
  onClose: () => void;
}

export const PrintLabelModal: React.FC<Props> = ({ tenantId, product, onClose }) => {
  const [templates, setTemplates] = useState<LabelTemplate[]>(() => labelTemplatesService.list(tenantId));
  const [tplId, setTplId] = useState<string>(() =>
    labelPrinterConfig.getDefaultTemplate(tenantId) || labelTemplatesService.list(tenantId)[0]?.id || '');
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState<string>(() => labelPrinterConfig.getPrinter());
  const [qty, setQty] = useState(1);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState(false);

  const offset = labelPrinterConfig.getOffset();
  const tpl = useMemo(() => templates.find(t => t.id === tplId) ?? null, [templates, tplId]);
  const previewHTML = useMemo(() => (tpl ? renderLabelHTML(tpl, product, offset) : ''), [tpl, product, offset.x, offset.y]);

  const loadPrinters = async () => {
    setError(''); setLoadingPrinters(true);
    try {
      if (!qzIsConnected()) await qzConnect();
      const list = await qzGetPrinters();
      setPrinters(list);
      if (!printer && list.length) setPrinter(list[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con QZ Tray');
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => { loadPrinters(); /* eslint-disable-next-line */ }, []);

  const print = async () => {
    if (!tpl) { setError('Elegí una plantilla'); return; }
    if (!printer) { setError('Elegí una impresora'); return; }
    setError(''); setPrinting(true);
    try {
      labelPrinterConfig.setPrinter(printer);
      labelPrinterConfig.setDefaultTemplate(tenantId, tpl.id);
      const html = renderLabelHTML(tpl, product, labelPrinterConfig.getOffset());
      await qzPrintHTML(printer, html, { widthMm: tpl.widthMm, heightMm: tpl.heightMm, copies: qty });
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al imprimir');
    } finally {
      setPrinting(false);
    }
  };

  // Ajustar la plantilla (posiciones/tamaños) antes de imprimir, con este producto de muestra.
  if (editing && tpl) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <LabelEditor
          tenantId={tenantId}
          template={tpl}
          sample={{ name: product.name, price: product.price, sku: product.code }}
          onBack={() => setEditing(false)}
          onSaved={() => setTemplates(labelTemplatesService.list(tenantId))}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900 flex items-center gap-2"><Printer size={18} className="text-blue-600" /> Imprimir etiqueta</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500 truncate"><span className="font-bold text-gray-700">{product.name}</span> · {product.code}</p>

          {templates.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} /> No hay plantillas. Creá una en el módulo <b>Etiquetas</b>.
            </div>
          ) : (
            <>
              {/* Preview */}
              <div className="bg-gray-100 rounded-xl p-4 flex items-center justify-center min-h-32">
                {previewHTML
                  ? <div style={{ transform: 'scale(1.6)', transformOrigin: 'center' }} dangerouslySetInnerHTML={{ __html: previewHTML }} />
                  : <span className="text-gray-400 text-sm">Sin vista previa</span>}
              </div>
              <button onClick={() => setEditing(true)} disabled={!tpl}
                className="w-full flex items-center justify-center gap-2 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 font-bold py-2 rounded-xl text-sm disabled:opacity-50">
                <Pencil size={14} /> Ajustar posiciones
              </button>

              {/* Plantilla */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Plantilla</label>
                <select value={tplId} onChange={e => setTplId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} · {t.widthMm}×{t.heightMm}mm</option>)}
                </select>
              </div>

              {/* Impresora */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 flex items-center justify-between">
                  Impresora
                  <button onClick={loadPrinters} disabled={loadingPrinters}
                    className="text-blue-600 hover:underline flex items-center gap-1 text-[11px] font-bold">
                    <RefreshCw size={11} className={loadingPrinters ? 'animate-spin' : ''} /> Actualizar
                  </button>
                </label>
                {loadingPrinters ? (
                  <div className="text-sm text-gray-400 flex items-center gap-2 py-2"><Loader size={14} className="animate-spin" /> Buscando impresoras…</div>
                ) : printers.length ? (
                  <select value={printer} onChange={e => setPrinter(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <div className="text-sm text-gray-400 py-2">No se encontraron impresoras. Verificá QZ Tray.</div>
                )}
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Cantidad de etiquetas</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-black">−</button>
                  <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 text-center border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold" />
                  <button onClick={() => setQty(q => q + 1)} className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-black">+</button>
                </div>
              </div>
            </>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cerrar</button>
          <button onClick={print} disabled={printing || !tpl || !printer}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            {printing ? <Loader size={15} className="animate-spin" /> : done ? <Check size={15} /> : <Printer size={15} />}
            {printing ? 'Imprimiendo…' : done ? 'Enviado ✓' : `Imprimir ${qty > 1 ? `(${qty})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintLabelModal;
