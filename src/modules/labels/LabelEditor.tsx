'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Save, Trash2, Type, DollarSign, Barcode, QrCode, Tag, Bold, AlignLeft, AlignCenter, AlignRight,
  Square, Minus, Plus as PlusIcon, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Image as ImageIcon,
} from 'lucide-react';
import {
  labelTemplatesService, DESIGN_SCALE,
  type LabelTemplate, type LabelElement, type LabelElementType,
} from '@/services/labels/labelTemplatesService';
import { SYSTEM_FONTS, GOOGLE_FONTS, ensureFontLoaded } from '@/services/labels/fontsService';
import { codeOf, qrSvg, type LabelProduct } from '@/services/labels/labelRenderService';

// Producto de muestra por defecto para previsualizar la plantilla.
const DEFAULT_SAMPLE: LabelProduct = { name: 'Café Americano 8oz', price: 1500, sku: '7501055309948', sku2: '1042' };

const crc = (n: number) => `₡${n.toLocaleString('es-CR')}`;
const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  tenantId: string;
  template: LabelTemplate;
  onBack: () => void;
  onSaved: (t: LabelTemplate) => void;
  /** Producto real para previsualizar (si no, se usa uno de ejemplo). */
  sample?: LabelProduct;
}

const NEW_ELEMENT: Record<Exclude<LabelElementType, 'image'>, () => LabelElement> = {
  product_name: () => ({ id: uid(), type: 'product_name', x: 6, y: 6, fontSize: 13, bold: true, align: 'left' }),
  price:        () => ({ id: uid(), type: 'price', x: 6, y: 40, fontSize: 20, bold: true, align: 'left' }),
  sku:          () => ({ id: uid(), type: 'sku', x: 6, y: 70, fontSize: 10, align: 'left' }),
  barcode:      () => ({ id: uid(), type: 'barcode', x: 6, y: 50, width: 140, height: 30, fontSize: 20, codeSource: 'sku' }),
  qr:           () => ({ id: uid(), type: 'qr', x: 6, y: 6, width: 90, height: 90, codeSource: 'sku' }),
  text:         () => ({ id: uid(), type: 'text', x: 6, y: 20, fontSize: 11, value: 'Texto', align: 'left' }),
};

export const LabelEditor: React.FC<Props> = ({ tenantId, template, onBack, onSaved, sample }) => {
  const SAMPLE = sample ?? DEFAULT_SAMPLE;
  // Cargar las Google Fonts ya usadas en la plantilla para que se vean en el canvas.
  useEffect(() => { template.elements.forEach(e => ensureFontLoaded(e.fontFamily)); }, []);
  const [name, setName] = useState(template.name);
  const [elements, setElements] = useState<LabelElement[]>(template.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(2);                 // la etiqueta se ve más grande al diseñar
  const [labelBorder, setLabelBorder] = useState(!!template.border);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resize = useRef<{ id: string; sx: number; sy: number; w: number; h: number; font: number; kind: 'wh' | 'font' } | null>(null);
  const replaceRef = useRef<string | null>(null);   // id de imagen a reemplazar (null = agregar nueva)

  // Dimensiones en px de DISEÑO (coordenadas guardadas); el zoom solo escala la vista.
  const W = template.widthMm * DESIGN_SCALE;
  const H = template.heightMm * DESIGN_SCALE;
  const selected = elements.find(e => e.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<LabelElement>) =>
    setElements(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));

  const addElement = (type: Exclude<LabelElementType, 'image'>) => {
    const el = NEW_ELEMENT[type]();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setElements(prev => prev.filter(e => e.id !== selectedId));
    setSelectedId(null);
  };

  // Tamaño aproximado del elemento (para alinear dentro de la etiqueta).
  const contentLen = (el: LabelElement) =>
    el.type === 'product_name' ? SAMPLE.name.length
      : el.type === 'price' ? crc(SAMPLE.price).length
      : el.type === 'sku' ? SAMPLE.sku.length
      : (el.value || 'Texto').length;
  const isBox = (el: LabelElement) => el.type === 'barcode' || el.type === 'image' || el.type === 'qr';
  const elW = (el: LabelElement) => isBox(el) ? (el.width ?? 140) : Math.round(contentLen(el) * (el.fontSize ?? 12) * 0.55);
  const elH = (el: LabelElement) => isBox(el) ? (el.height ?? 26) : Math.round((el.fontSize ?? 12) * 1.2);

  const alignInCanvas = (dir: 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom') => {
    if (!selected) return;
    const w = elW(selected), h = elH(selected);
    const p: Partial<LabelElement> =
      dir === 'left'    ? { x: 2 } :
      dir === 'hcenter' ? { x: Math.round((W - w) / 2) } :
      dir === 'right'   ? { x: Math.max(2, Math.round(W - w - 2)) } :
      dir === 'top'     ? { y: 2 } :
      dir === 'vmiddle' ? { y: Math.round((H - h) / 2) } :
                          { y: Math.max(2, Math.round(H - h - 2)) };
    update(selected.id, p);
  };

  // Achicar / agrandar el elemento seleccionado.
  const resizeSel = (delta: number) => {
    if (!selected) return;
    if (isBox(selected)) {
      update(selected.id, { width: Math.max(16, (selected.width ?? 140) + delta * 10), height: Math.max(10, (selected.height ?? 26) + delta * 4) });
    } else {
      update(selected.id, { fontSize: Math.max(6, Math.min(60, (selected.fontSize ?? 12) + delta)) });
    }
  };

  const onPointerDownEl = (e: React.PointerEvent, el: LabelElement) => {
    e.stopPropagation();
    setSelectedId(el.id);
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = { id: el.id, dx: (e.clientX - rect.left) / zoom - el.x, dy: (e.clientY - rect.top) / zoom - el.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  // Empezar a redimensionar arrastrando la esquina del objeto.
  const onPointerDownResize = (e: React.PointerEvent, el: LabelElement) => {
    e.stopPropagation();
    const kind: 'wh' | 'font' = isBox(el) ? 'wh' : 'font';
    resize.current = {
      id: el.id, sx: e.clientX, sy: e.clientY,
      w: el.width ?? 100, h: el.height ?? 26, font: el.fontSize ?? 12, kind,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (resize.current) {
      const r = resize.current;
      const ddx = (e.clientX - r.sx) / zoom;
      const ddy = (e.clientY - r.sy) / zoom;
      if (r.kind === 'wh') {
        update(r.id, { width: Math.max(16, Math.round(r.w + ddx)), height: Math.max(10, Math.round(r.h + ddy)) });
      } else {
        update(r.id, { fontSize: Math.max(6, Math.min(80, Math.round(r.font + ddy / 1.2))) });
      }
      return;
    }
    if (!drag.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(W - 4, (e.clientX - rect.left) / zoom - drag.current.dx));
    const y = Math.max(0, Math.min(H - 4, (e.clientY - rect.top) / zoom - drag.current.dy));
    update(drag.current.id, { x: Math.round(x), y: Math.round(y) });
  };
  const onPointerUp = () => { drag.current = null; resize.current = null; };

  // Subir una imagen (logo) como elemento (dataURL base64).
  const onPickImage = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      const target = replaceRef.current;
      replaceRef.current = null;
      if (target) { update(target, { src }); return; }   // reemplazar imagen existente
      const el: LabelElement = { id: uid(), type: 'image', x: 6, y: 6, width: 60, height: 60, src };
      setElements(prev => [...prev, el]);
      setSelectedId(el.id);
    };
    r.readAsDataURL(file);
  };

  const save = () => {
    const next = labelTemplatesService.save(tenantId, { ...template, name: name.trim() || 'Sin nombre', elements, border: labelBorder });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    onSaved(next);
  };

  const renderContent = (el: LabelElement, z = 1): React.ReactNode => {
    switch (el.type) {
      case 'product_name': return SAMPLE.name;
      case 'price':        return crc(SAMPLE.price);
      case 'sku':          return codeOf(el, SAMPLE);
      case 'text':         return el.value || 'Texto';
      case 'barcode':
        return (
          <div style={{ width: (el.width ?? 140) * z, height: (el.height ?? 30) * z }} className="flex flex-col items-center justify-center">
            <div className="w-full flex-1 bg-[repeating-linear-gradient(90deg,#000_0,#000_2px,#fff_2px,#fff_4px)]" />
            <span className="font-mono font-bold mt-0.5 tracking-wider leading-none" style={{ fontSize: (el.fontSize ?? 20) * 0.5 * z }}>{codeOf(el, SAMPLE)}</span>
          </div>
        );
      case 'qr': {
        const s = (el.width ?? el.height ?? 90) * z;
        return <div style={{ width: s, height: s }} dangerouslySetInnerHTML={{ __html: qrSvg(codeOf(el, SAMPLE)) }} />;
      }
      case 'image':
        return el.src
          ? <img src={el.src} alt="" draggable={false} style={{ width: (el.width ?? 60) * z, height: (el.height ?? 60) * z, objectFit: 'contain' }} />
          : <div style={{ width: (el.width ?? 60) * z, height: (el.height ?? 60) * z }} className="bg-gray-100 flex items-center justify-center text-gray-300"><ImageIcon size={16} /></div>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ArrowLeft size={18} /></button>
        <input value={name} onChange={e => setName(e.target.value)}
          className="font-black text-gray-900 text-lg border border-transparent hover:border-gray-200 focus:border-blue-400 rounded-lg px-2 py-1 focus:outline-none" />
        <span className="text-xs text-gray-400">{template.widthMm} × {template.heightMm} mm</span>
        <div className="flex-1" />
        {/* Zoom */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1">
          <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="w-7 h-7 rounded-md hover:bg-white text-gray-600 font-black">−</button>
          <span className="text-xs font-bold text-gray-600 w-10 text-center">{Math.round(zoom * 50)}%</span>
          <button onClick={() => setZoom(z => Math.min(6, z + 0.5))} className="w-7 h-7 rounded-md hover:bg-white text-gray-600 font-black">+</button>
        </div>
        {/* Borde de la etiqueta */}
        <button onClick={() => setLabelBorder(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border ${labelBorder ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
          <Square size={13} /> Borde
        </button>
        <button onClick={save}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-sm">
          <Save size={15} /> {saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Paleta */}
        <div className="w-44 border-r border-gray-200 bg-gray-50 p-3 space-y-2 shrink-0 overflow-y-auto">
          <p className="text-[11px] font-black text-gray-500 uppercase">Agregar</p>
          {([
            ['product_name', 'Nombre', Tag],
            ['price', 'Precio', DollarSign],
            ['barcode', 'Código de barras', Barcode],
            ['qr', 'Código QR', QrCode],
            ['sku', 'SKU (texto)', Type],
            ['text', 'Texto libre', Type],
          ] as [Exclude<LabelElementType, 'image'>, string, React.ElementType][]).map(([t, label, Icon]) => (
            <button key={t} onClick={() => addElement(t)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-blue-300 text-sm font-semibold text-gray-700">
              <Icon size={14} className="text-blue-500" /> {label}
            </button>
          ))}
          <button onClick={() => { replaceRef.current = null; imageInputRef.current?.click(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-blue-300 text-sm font-semibold text-gray-700">
            <ImageIcon size={14} className="text-blue-500" /> Imagen / logo
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ''; }} />
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-gray-100 overflow-auto p-6" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div className="flex flex-col items-center gap-3">
            <div
              ref={canvasRef}
              onPointerDown={() => setSelectedId(null)}
              className={`relative bg-white shadow-lg ${labelBorder ? 'border-2 border-black' : 'border border-dashed border-gray-300'}`}
              style={{ width: W * zoom, height: H * zoom }}
            >
              {elements.map(el => (
                <div
                  key={el.id}
                  onPointerDown={(e) => onPointerDownEl(e, el)}
                  className={`absolute cursor-move select-none whitespace-nowrap ${selectedId === el.id ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300'} ${el.border ? 'border border-black' : ''}`}
                  style={{
                    left: el.x * zoom, top: el.y * zoom,
                    fontSize: (el.fontSize ?? 12) * zoom, fontWeight: el.bold ? 800 : 400,
                    fontFamily: el.fontFamily, textAlign: el.align, lineHeight: 1.1,
                    padding: el.border ? 2 * zoom : 0,
                  }}
                >
                  {renderContent(el, zoom)}
                  {selectedId === el.id && (
                    <div
                      onPointerDown={(e) => onPointerDownResize(e, el)}
                      title="Arrastrá para cambiar el tamaño"
                      className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-blue-500 border-2 border-white rounded-sm cursor-se-resize shadow"
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">Arrastrá los elementos · muestra con producto de ejemplo · zoom {Math.round(zoom * 100 / 2)}%</p>
          </div>
        </div>

        {/* Propiedades */}
        <div className="w-56 border-l border-gray-200 bg-white p-3 space-y-3 shrink-0 overflow-y-auto">
          <p className="text-[11px] font-black text-gray-500 uppercase">Propiedades</p>
          {!selected ? (
            <p className="text-xs text-gray-400">Seleccioná un elemento del canvas.</p>
          ) : (
            <>
              {selected.type === 'text' && (
                <div>
                  <label className="text-[11px] font-bold text-gray-600">Texto</label>
                  <input value={selected.value ?? ''} onChange={e => update(selected.id, { value: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              )}
              {/* Selección de código: SKU 1 o SKU 2 (barcode / QR) */}
              {(selected.type === 'barcode' || selected.type === 'qr') && (
                <div>
                  <label className="text-[11px] font-bold text-gray-600">Código a usar</label>
                  <div className="flex gap-1 mt-0.5">
                    {([['sku', 'SKU 1'], ['sku2', 'SKU 2']] as const).map(([src, lbl]) => (
                      <button key={src} onClick={() => update(selected.id, { codeSource: src })}
                        className={`flex-1 py-1.5 rounded-lg border text-sm font-bold ${(selected.codeSource ?? 'sku') === src ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isBox(selected) ? (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600">Ancho: {selected.width}px</label>
                    <input type="range" min={16} max={W} value={selected.width ?? 140}
                      onChange={e => update(selected.id, { width: Number(e.target.value) })} className="w-full" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600">Alto: {selected.height}px</label>
                    <input type="range" min={10} max={H} value={selected.height ?? 26}
                      onChange={e => update(selected.id, { height: Number(e.target.value) })} className="w-full" />
                  </div>
                  {selected.type === 'barcode' && (
                    <div>
                      <label className="text-[11px] font-bold text-gray-600">Tamaño del número: {selected.fontSize ?? 20}px</label>
                      <input type="range" min={0} max={48} value={selected.fontSize ?? 20}
                        onChange={e => update(selected.id, { fontSize: Number(e.target.value) })} className="w-full" />
                    </div>
                  )}
                  {selected.type === 'image' && (
                    <button onClick={() => { replaceRef.current = selected.id; imageInputRef.current?.click(); }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50">
                      <ImageIcon size={14} /> Cambiar imagen
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-gray-600">Tamaño: {selected.fontSize}px</label>
                    <input type="range" min={7} max={40} value={selected.fontSize}
                      onChange={e => update(selected.id, { fontSize: Number(e.target.value) })} className="w-full" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => update(selected.id, { bold: !selected.bold })}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border ${selected.bold ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                      <Bold size={14} />
                    </button>
                    {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                      <button key={a} onClick={() => update(selected.id, { align: a })}
                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border ${selected.align === a ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                  {/* Fuente */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-600">Fuente</label>
                    <select
                      value={selected.fontFamily ?? SYSTEM_FONTS[0].css}
                      onChange={e => { ensureFontLoaded(e.target.value); update(selected.id, { fontFamily: e.target.value }); }}
                      style={{ fontFamily: selected.fontFamily }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5">
                      <optgroup label="Del sistema">
                        {SYSTEM_FONTS.map(f => <option key={f.name} value={f.css} style={{ fontFamily: f.css }}>{f.name}</option>)}
                      </optgroup>
                      <optgroup label="Google Fonts">
                        {GOOGLE_FONTS.map(f => <option key={f.name} value={f.css}>{f.name}</option>)}
                      </optgroup>
                    </select>
                    <p className="text-[10px] text-gray-400 mt-0.5">Las Google Fonts se incrustan al imprimir.</p>
                  </div>
                </>
              )}
              {/* Achicar / agrandar */}
              <div>
                <label className="text-[11px] font-bold text-gray-600">Tamaño</label>
                <div className="flex gap-1 mt-0.5">
                  <button onClick={() => resizeSel(-1)} className="flex-1 flex items-center justify-center py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Minus size={14} /></button>
                  <button onClick={() => resizeSel(1)} className="flex-1 flex items-center justify-center py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><PlusIcon size={14} /></button>
                </div>
              </div>
              {/* Alinear dentro de la etiqueta */}
              <div>
                <label className="text-[11px] font-bold text-gray-600">Alinear en la etiqueta</label>
                <div className="grid grid-cols-3 gap-1 mt-0.5">
                  {([
                    ['left', AlignHorizontalJustifyStart], ['hcenter', AlignHorizontalJustifyCenter], ['right', AlignHorizontalJustifyEnd],
                    ['top', AlignVerticalJustifyStart], ['vmiddle', AlignVerticalJustifyCenter], ['bottom', AlignVerticalJustifyEnd],
                  ] as const).map(([d, Icon]) => (
                    <button key={d} onClick={() => alignInCanvas(d)}
                      className="flex items-center justify-center py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600">
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
              {/* Borde del elemento */}
              <button onClick={() => update(selected.id, { border: !selected.border })}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-sm font-bold ${selected.border ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
                <Square size={13} /> Borde del elemento
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-600">X</label>
                  <input type="number" value={selected.x} onChange={e => update(selected.id, { x: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600">Y</label>
                  <input type="number" value={selected.y} onChange={e => update(selected.id, { y: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                </div>
              </div>
              <button onClick={removeSelected}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100">
                <Trash2 size={14} /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabelEditor;
