'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Printer, Loader, RefreshCw, Check, AlertTriangle, Minus, Plus } from 'lucide-react';
import { labelTemplatesService, type LabelTemplate } from '@/services/labels/labelTemplatesService';
import { labelPrinterConfig } from '@/services/labels/labelPrinterConfig';
import { renderLabelHTML, type LabelProduct } from '@/services/labels/labelRenderService';
import { buildFontFaceCss } from '@/services/labels/fontsService';
import { qzIsConnected, qzConnect, qzGetPrinters, qzPrintHTMLMany } from '@/services/pos/qzTrayService';
import { printLabelsTSPL } from '@/services/labels/labelTsplService';

interface Props {
  tenantId: string;
  products: LabelProduct[];
  onClose: () => void;
}

export const BulkPrintLabelsModal: React.FC<Props> = ({ tenantId, products, onClose }) => {
  const [templates] = useState<LabelTemplate[]>(() => labelTemplatesService.list(tenantId));
  const [tplId, setTplId] = useState<string>(() =>
    labelPrinterConfig.getDefaultTemplate(tenantId) || labelTemplatesService.list(tenantId)[0]?.id || '');
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState<string>(() => labelPrinterConfig.getPrinter());
  // Cantidad por producto (index → copias).
  const [qtys, setQtys] = useState<number[]>(() => products.map(() => 1));
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const tpl = useMemo(() => templates.find(t => t.id === tplId) ?? null, [templates, tplId]);
  const totalLabels = qtys.reduce((a, b) => a + b, 0);

  const setQty = (i: number, v: number) =>
    setQtys(prev => prev.map((q, idx) => (idx === i ? Math.max(0, v) : q)));

  const loadPrinters = async () => {
    setError(''); setLoadingPrinters(true);
    try {
      if (!qzIsConnected()) await qzConnect();
      const list = await qzGetPrinters();
      setPrinters(list);
      if (!printer && list.length) setPrinter(list[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con QZ Tray');
    } finally { setLoadingPrinters(false); }
  };

  useEffect(() => { loadPrinters(); /* eslint-disable-next-line */ }, []);

  const print = async () => {
    if (!tpl) { setError('Elegí una plantilla'); return; }
    if (!printer) { setError('Elegí una impresora'); return; }
    if (totalLabels === 0) { setError('Poné al menos una etiqueta'); return; }
    setError(''); setPrinting(true);
    try {
      labelPrinterConfig.setPrinter(printer);
      labelPrinterConfig.setDefaultTemplate(tenantId, tpl.id);
      const offset = labelPrinterConfig.getOffset();
      if (labelPrinterConfig.getMode() === 'tspl') {
        const jobs = products
          .map((p, i) => ({ tpl, product: p, copies: qtys[i] }))
          .filter(j => j.copies > 0);
        await printLabelsTSPL(printer, jobs, { gapMm: labelPrinterConfig.getGapMm(), offset });
      } else {
        // Incrustar las Google Fonts usadas una sola vez (en la primera etiqueta del lote).
        const fontFaceCss = await buildFontFaceCss(tpl.elements.map(e => e.fontFamily));
        const htmls: string[] = [];
        products.forEach((p, i) => {
          const html = renderLabelHTML(tpl, p, offset, fontFaceCss);
          for (let c = 0; c < qtys[i]; c++) htmls.push(html);
        });
        await qzPrintHTMLMany(printer, htmls, { widthMm: tpl.widthMm, heightMm: tpl.heightMm });
      }
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al imprimir');
    } finally { setPrinting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-black text-gray-900 flex items-center gap-2"><Printer size={18} className="text-fuchsia-600" /> Imprimir etiquetas ({products.length})</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {templates.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} /> No hay plantillas. Creá una en el módulo <b>Etiquetas</b>.
            </div>
          ) : (
            <>
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

              {/* Cantidades por producto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-600">Cantidad por producto</label>
                  <div className="flex gap-2">
                    <button onClick={() => setQtys(products.map(() => 1))} className="text-[11px] text-blue-600 font-bold hover:underline">Todos ×1</button>
                    <button onClick={() => setQtys(prev => prev.map(q => q + 1))} className="text-[11px] text-blue-600 font-bold hover:underline">+1 a todos</button>
                  </div>
                </div>
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {products.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{p.sku}{p.sku2 ? ` / ${p.sku2}` : ''}</p>
                      </div>
                      <button onClick={() => setQty(i, qtys[i] - 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 font-black shrink-0"><Minus size={13} className="mx-auto" /></button>
                      <input type="number" min={0} value={qtys[i]} onChange={e => setQty(i, Number(e.target.value) || 0)}
                        className="w-12 text-center border border-gray-200 rounded-lg px-1 py-1 text-sm font-bold shrink-0" />
                      <button onClick={() => setQty(i, qtys[i] + 1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 font-black shrink-0"><Plus size={13} className="mx-auto" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cerrar</button>
          <button onClick={print} disabled={printing || !tpl || !printer || totalLabels === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            {printing ? <Loader size={15} className="animate-spin" /> : done ? <Check size={15} /> : <Printer size={15} />}
            {printing ? 'Imprimiendo…' : done ? 'Enviado ✓' : `Imprimir ${totalLabels} etiqueta${totalLabels === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkPrintLabelsModal;
