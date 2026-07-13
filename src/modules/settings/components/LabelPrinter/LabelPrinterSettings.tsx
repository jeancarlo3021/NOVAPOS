'use client';

import React, { useEffect, useState } from 'react';
import { Printer, RefreshCw, Loader, Check, Tag, Crosshair, ExternalLink, AlertTriangle, Ruler } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTenantId } from '@/hooks/useTenant';
import { labelPrinterConfig } from '@/services/labels/labelPrinterConfig';
import {
  labelTemplatesService, DESIGN_SCALE, type LabelTemplate,
} from '@/services/labels/labelTemplatesService';
import { qzIsConnected, qzConnect, qzGetPrinters, qzPrintImage, qzCalibrateGap } from '@/services/pos/qzTrayService';
import { printLabelTSPL, renderLabelPngBase64 } from '@/services/labels/labelTsplService';

const TEST_PRODUCT = { name: 'Producto de prueba', price: 1990, sku: '1001', sku2: '7501234567890' };

// Plantilla de prueba FIJA de 35×25 mm (siempre el mismo tamaño para calibrar).
const testTemplate = (): LabelTemplate => ({
  id: 'test', name: 'Prueba 35×25', widthMm: 35, heightMm: 25, updatedAt: '',
  border: true,
  elements: [
    { id: 'n', type: 'product_name', x: 5, y: 5, fontSize: 11, bold: true, align: 'left' },
    { id: 'p', type: 'price', x: 5, y: Math.round(25 * DESIGN_SCALE * 0.5), fontSize: 16, bold: true, align: 'left' },
    { id: 'b', type: 'barcode', x: 5, y: Math.round(25 * DESIGN_SCALE * 0.3), width: Math.round(35 * DESIGN_SCALE * 0.7), height: 22 },
  ],
});

export const LabelPrinterSettings: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState(labelPrinterConfig.getPrinter());
  const [offset, setOffset] = useState(labelPrinterConfig.getOffset());
  const [mode, setMode] = useState(labelPrinterConfig.getMode());
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  // Calibración de gap (detección del espacio entre etiquetas — TSPL/Xprinter).
  const [gapW, setGapW] = useState(75);
  const [gapH, setGapH] = useState(98);
  const [gapMm, setGapMm] = useState(2);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState(false);

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

  // Guardado automático: cualquier cambio se persiste al instante (localStorage),
  // sin depender de un botón. Evita que "no se guarden los datos".
  useEffect(() => { if (printer) labelPrinterConfig.setPrinter(printer); }, [printer]);
  useEffect(() => { labelPrinterConfig.setOffset(offset); }, [offset]);
  useEffect(() => { labelPrinterConfig.setMode(mode); }, [mode]);
  useEffect(() => { labelPrinterConfig.setGapMm(gapMm); }, [gapMm]);

  const saveConfig = () => {
    labelPrinterConfig.setPrinter(printer);
    labelPrinterConfig.setOffset(offset);
    labelPrinterConfig.setMode(mode);
    labelPrinterConfig.setGapMm(gapMm);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  const calibrateGap = async () => {
    if (!printer) { setError('Elegí una impresora'); return; }
    setError(''); setCalibrating(true);
    try {
      if (!qzIsConnected()) await qzConnect();
      await qzCalibrateGap(printer, { widthMm: gapW, heightMm: gapH, gapMm });
      setCalibrated(true); setTimeout(() => setCalibrated(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al calibrar el gap');
    } finally { setCalibrating(false); }
  };

  const printTest = async () => {
    if (!printer) { setError('Elegí una impresora'); return; }
    setError(''); setTesting(true);
    try {
      labelPrinterConfig.setPrinter(printer);
      labelPrinterConfig.setOffset(offset);
      const tpl = testTemplate();   // prueba SIEMPRE a 35×25
      if (mode === 'tspl') {
        await printLabelTSPL(printer, tpl, TEST_PRODUCT, { gapMm, copies: 1, offset });
      } else {
        // Modo HTML/driver: mandamos un PNG ya renderizado (no HTML) para que QZ
        // no rasterice y no salga "solo bordes".
        const png = await renderLabelPngBase64(tpl, TEST_PRODUCT, offset);
        await qzPrintImage(printer, png, { widthMm: tpl.widthMm, heightMm: tpl.heightMm, copies: 1 });
      }
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

      {/* Modo de impresión */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><Printer size={15} className="text-fuchsia-600" /> Modo de impresión</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => setMode('tspl')}
            className={`text-left p-3 rounded-xl border-2 transition ${mode === 'tspl' ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className={`font-black text-sm ${mode === 'tspl' ? 'text-fuchsia-700' : 'text-gray-700'}`}>TSPL directo (Xprinter) ★</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Tamaño exacto en mm y detección de gap. Recomendado para etiquetadoras térmicas.</p>
          </button>
          <button onClick={() => setMode('html')}
            className={`text-left p-3 rounded-xl border-2 transition ${mode === 'html' ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className={`font-black text-sm ${mode === 'html' ? 'text-fuchsia-700' : 'text-gray-700'}`}>HTML por driver</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Usa el driver de Windows. Para impresoras que no son TSPL.</p>
          </button>
        </div>
        {mode === 'tspl' && (
          <div className="flex items-end gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-600">Gap entre etiquetas (mm)</label>
              <input type="number" step="0.5" min={0} value={gapMm}
                onChange={e => setGapMm(Number(e.target.value) || 0)}
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <p className="text-[11px] text-gray-400 pb-2">Espacio blanco entre una etiqueta y la siguiente (típico 2-3mm).</p>
          </div>
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

      {/* Calibración de gap (detección de saltos entre etiquetas) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><Ruler size={15} className="text-fuchsia-600" /> Detección de gap (saltos entre etiquetas)</h3>
        <p className="text-xs text-gray-400">
          Para etiquetadoras <b>Xprinter / TSC / Gprinter</b>. Enseña a la impresora el tamaño de la etiqueta y el espacio entre ellas para que se detenga justo en el corte y no imprima a media etiqueta. Poné las etiquetas cargadas y presioná <b>Calibrar</b> — la impresora avanzará 1-2 etiquetas midiendo.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-gray-600">Ancho (mm)</label>
            <input type="number" step="0.5" min={5} value={gapW}
              onChange={e => setGapW(Number(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-600">Alto (mm)</label>
            <input type="number" step="0.5" min={5} value={gapH}
              onChange={e => setGapH(Number(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-600">Gap (mm)</label>
            <input type="number" step="0.5" min={0} value={gapMm}
              onChange={e => setGapMm(Number(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" title="Alto del espacio entre una etiqueta y la siguiente (típico 2-3mm)" />
          </div>
        </div>
        <button onClick={calibrateGap} disabled={calibrating || !printer}
          className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50">
          {calibrating ? <Loader size={15} className="animate-spin" /> : calibrated ? <Check size={15} /> : <Ruler size={15} />}
          {calibrating ? 'Calibrando…' : calibrated ? 'Calibrada ✓' : 'Calibrar gap'}
        </button>
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
