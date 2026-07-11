'use client';

import React, { useEffect, useState } from 'react';
import { Printer, RefreshCw, Loader, Check, Tag, Crosshair, ExternalLink, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTenantId } from '@/hooks/useTenant';
import { labelPrinterConfig } from '@/services/labels/labelPrinterConfig';
import {
  labelTemplatesService, DESIGN_SCALE, type LabelTemplate,
} from '@/services/labels/labelTemplatesService';
import { renderLabelPrintHTML } from '@/services/labels/labelRenderService';
import { qzIsConnected, qzConnect, qzGetPrinters, qzPrintHTML } from '@/services/pos/qzTrayService';

const TEST_PRODUCT = { name: 'Producto de prueba', price: 1990, sku: '1001', sku2: '7501234567890' };

// Plantilla mínima de prueba si el tenant aún no creó ninguna.
const fallbackTemplate = (): LabelTemplate => ({
  id: 'test', name: 'Prueba', widthMm: 40, heightMm: 30, updatedAt: '',
  border: true,
  elements: [
    { id: 'n', type: 'product_name', x: 6, y: 6, fontSize: 12, bold: true, align: 'left' },
    { id: 'p', type: 'price', x: 6, y: Math.round(30 * DESIGN_SCALE * 0.55), fontSize: 18, bold: true, align: 'left' },
    { id: 'b', type: 'barcode', x: 6, y: Math.round(30 * DESIGN_SCALE * 0.32), width: Math.round(40 * DESIGN_SCALE * 0.7), height: 24 },
  ],
});

export const LabelPrinterSettings: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState(labelPrinterConfig.getPrinter());
  const [offset, setOffset] = useState(labelPrinterConfig.getOffset());
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const templates = tenantId ? labelTemplatesService.list(tenantId) : [];

  const loadPrinters = async () => {
    setError(''); setLoading(true);
    try {
      if (!qzIsConnected()) await qzConnect();
      const list = await qzGetPrinters();
      setPrinters(list);
      if (!printer && list.length) setPrinter(list[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con QZ Tray');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPrinters(); /* eslint-disable-next-line */ }, []);

  const saveConfig = () => {
    labelPrinterConfig.setPrinter(printer);
    labelPrinterConfig.setOffset(offset);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  const printTest = async () => {
    if (!printer) { setError('Elegí una impresora'); return; }
    setError(''); setTesting(true);
    try {
      labelPrinterConfig.setPrinter(printer);
      labelPrinterConfig.setOffset(offset);
      const tpl = (tenantId && templates[0]) || fallbackTemplate();
      const html = await renderLabelPrintHTML(tpl, TEST_PRODUCT, offset);
      await qzPrintHTML(printer, html, { widthMm: tpl.widthMm, heightMm: tpl.heightMm, copies: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al imprimir la prueba');
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Printer size={24} className="text-fuchsia-600" /> Etiquetadora</h2>
        <p className="text-gray-500 text-sm">Impresora de etiquetas de producto y calibración fina</p>
      </div>

      {/* Impresora */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-800 text-sm">Impresora (etiquetadora)</h3>
          <button onClick={loadPrinters} disabled={loading}
            className="text-blue-600 hover:underline flex items-center gap-1 text-xs font-bold">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Buscar
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-gray-400 flex items-center gap-2 py-2"><Loader size={14} className="animate-spin" /> Buscando impresoras…</div>
        ) : printers.length ? (
          <select value={printer} onChange={e => setPrinter(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="">— Elegir impresora —</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <div className="text-sm text-gray-400 py-2 flex items-center gap-2"><AlertTriangle size={14} /> No se encontraron impresoras. Verificá que QZ Tray esté corriendo.</div>
        )}
      </div>

      {/* Calibración fina */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><Crosshair size={15} className="text-fuchsia-600" /> Ajuste fino (calibración)</h3>
        <p className="text-xs text-gray-400">Si la etiqueta sale corrida, desplazá todo el contenido en milímetros. Valores negativos mueven hacia la izquierda/arriba.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-gray-600">Horizontal (mm)</label>
            <input type="number" step="0.5" value={offset.x}
              onChange={e => setOffset(o => ({ ...o, x: Number(e.target.value) || 0 }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-600">Vertical (mm)</label>
            <input type="number" step="0.5" value={offset.y}
              onChange={e => setOffset(o => ({ ...o, y: Number(e.target.value) || 0 }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={saveConfig}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-sm">
            {saved ? <Check size={15} /> : null} {saved ? 'Guardado ✓' : 'Guardar'}
          </button>
          <button onClick={printTest} disabled={testing || !printer}
            className="flex items-center gap-1.5 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50">
            {testing ? <Loader size={15} className="animate-spin" /> : <Printer size={15} />} Imprimir prueba
          </button>
        </div>
      </div>

      {/* Plantillas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><Tag size={15} className="text-fuchsia-600" /> Plantillas de etiquetas</h3>
          <p className="text-xs text-gray-400">{templates.length} plantilla(s) · diseño de tamaño, textos, código de barras e imágenes</p>
        </div>
        <button onClick={() => navigate('/labels')}
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white font-bold px-4 py-2 rounded-xl text-sm shrink-0">
          <ExternalLink size={14} /> Gestionar plantillas
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
};

export default LabelPrinterSettings;
