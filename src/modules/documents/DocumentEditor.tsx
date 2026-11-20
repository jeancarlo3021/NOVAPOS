import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Save, Trash2, Type, Hash, Image as ImageIcon, Minus, Square, QrCode,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Eye, Copy, Star, Plus, Columns3,
  ChevronUp, ChevronDown, Loader2, Settings2, X, Maximize2,
} from 'lucide-react';
import {
  documentTemplatesService, CAMPOS, COLUMNAS_DETALLE, DESIGN_PX_POR_MM, ANCHOS_PRESET,
  type DocTemplate, type DocElement, type DocElementType, type DocColumna,
} from '@/services/documents/documentTemplatesService';
import { renderDocumento, datosDeMuestra, resolverCampo } from '@/services/documents/documentRenderService';

type Banda = 'encabezado' | 'pie';

const uid = () => Math.random().toString(36).slice(2, 10);
const r2 = (n: number) => Math.round(n * 10) / 10;

interface Props {
  tenantId: string;
  template: DocTemplate;
  onBack: () => void;
  onSaved: (t: DocTemplate) => void;
}

const NUEVO: Record<DocElementType, (util: number) => Omit<DocElement, 'id'>> = {
  texto:  (u) => ({ type: 'texto', x: 0, y: 1, w: u, h: 5, fontPt: 10, align: 'left', value: 'Texto' }),
  campo:  (u) => ({ type: 'campo', x: 0, y: 1, w: u, h: 5, fontPt: 10, align: 'left', campo: 'doc.numero', etiqueta: '' }),
  imagen: (u) => ({ type: 'imagen', x: 0, y: 1, w: Math.min(40, u), h: 16, align: 'center', campo: 'negocio.logo' }),
  linea:  (u) => ({ type: 'linea', x: 0, y: 1, w: u, h: 0.4 }),
  caja:   (u) => ({ type: 'caja', x: 0, y: 1, w: Math.min(50, u), h: 10, borde: true }),
  qr:     () => ({ type: 'qr', x: 0, y: 1, w: 22, h: 22, align: 'center' }),
};

export const DocumentEditor: React.FC<Props> = ({ tenantId, template, onBack, onSaved }) => {
  const [t, setT] = useState<DocTemplate>(() => JSON.parse(JSON.stringify(template)));
  const [sel, setSel] = useState<{ banda: Banda; id: string } | null>(null);
  const [zoom, setZoom] = useState(() => (template.widthMm <= 90 ? 2.4 : 1));
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [err, setErr] = useState('');
  const imgInput = useRef<HTMLInputElement>(null);

  /**
   * EN PANTALLA CHICA LOS PANELES SON CAJONES, NO COLUMNAS.
   *
   * Con tres columnas apiladas, en un celular la paleta quedaba arriba, el
   * lienzo en el medio y las propiedades debajo de TODO el lienzo: para cambiar
   * el tamaño de letra de un texto había que bajar media pantalla, tocar, y
   * subir de vuelta para ver el resultado. Acá se abren encima del lienzo y se
   * cierran.
   */
  const [cajon, setCajon] = useState<'ninguno' | 'paleta' | 'props'>('ninguno');
  const [angosto, setAngosto] = useState(false);
  const zonaLienzo = useRef<HTMLDivElement>(null);

  /* `lg` de Tailwind es 1024: abajo de eso van los cajones, que es laptop
     chica, tablet y celular. Se mira el ancho real y no el agente de usuario:
     una tablet en horizontal tiene el espacio de una laptop y merece las
     columnas. */
  useEffect(() => {
    const mirar = () => setAngosto(window.innerWidth < 1024);
    mirar();
    window.addEventListener('resize', mirar);
    return () => window.removeEventListener('resize', mirar);
  }, []);

  /**
   * ZOOM QUE CABE.
   *
   * El valor de arranque era fijo (1 en hoja), y una hoja carta a 1× mide 816
   * px: en un celular de 390 px se veía un tercio del papel y había que
   * arrastrar la vista para encontrar el logo. Ahora arranca en lo que cabe, y
   * el botón «Ajustar» vuelve a eso cuando uno se pierde.
   */
  const ajustarZoom = React.useCallback(() => {
    const caja = zonaLienzo.current;
    if (!caja) return;
    const disponible = caja.clientWidth - 32;        // el aire de los lados
    if (disponible <= 0) return;
    const z = disponible / (t.widthMm * DESIGN_PX_POR_MM);
    setZoom(Math.max(0.3, Math.min(4, Math.round(z * 100) / 100)));
  }, [t.widthMm]);

  /* Al abrir y al cambiar de papel: nadie quiere empezar mirando un cuarto de
     hoja. Después manda lo que el usuario elija. */
  const papelAnterior = useRef<number | null>(null);
  useEffect(() => {
    if (papelAnterior.current !== t.widthMm) {
      papelAnterior.current = t.widthMm;
      /* En el siguiente cuadro: antes de pintar, `clientWidth` es 0 y el
         cálculo daría un zoom absurdo. */
      requestAnimationFrame(ajustarZoom);
    }
  }, [t.widthMm, ajustarZoom]);
  const muestra = useMemo(() => datosDeMuestra(t.kind), [t.kind]);

  const m = t.design.margenes;
  const util = t.widthMm - m.left - m.right;
  const PX = DESIGN_PX_POR_MM * zoom;

  const drag = useRef<{ banda: Banda; id: string; dx: number; dy: number } | null>(null);
  const resize = useRef<{ banda: Banda; id: string; sx: number; sy: number; w: number; h: number } | null>(null);

  /** El elemento seleccionado, para el panel de propiedades. */
  const elSel = sel ? t.design[sel.banda].elementos.find(e => e.id === sel.id) ?? null : null;

  const setDesign = (f: (d: DocTemplate['design']) => DocTemplate['design']) =>
    setT(prev => ({ ...prev, design: f(prev.design) }));

  const patchEl = (banda: Banda, id: string, patch: Partial<DocElement>) =>
    setDesign(d => ({
      ...d,
      [banda]: {
        ...d[banda],
        elementos: d[banda].elementos.map(e => (e.id === id ? { ...e, ...patch } : e)),
      },
    }) as any);

  const addEl = (tipo: DocElementType, banda: Banda = sel?.banda ?? 'encabezado') => {
    const el: DocElement = { id: uid(), ...NUEVO[tipo](util) } as DocElement;
    /* Se agrega ABAJO de lo que ya hay en esa banda, no encima: apareciendo en
       y=1 el elemento nuevo se montaba sobre el logo y parecía que no se había
       agregado nada. */
    const bajo = Math.max(0, ...t.design[banda].elementos.map(e => e.y + e.h));
    el.y = r2(bajo + 1);
    setDesign(d => ({
      ...d,
      [banda]: {
        ...d[banda],
        hMm: Math.max(d[banda].hMm, el.y + el.h + 1),
        elementos: [...d[banda].elementos, el],
      },
    }) as any);
    setSel({ banda, id: el.id });
    /* El cajón se cierra: con el panel abierto tapando media pantalla, uno
       agregaba tres elementos sin ver que todos habían caído uno debajo del
       otro. */
    setCajon('ninguno');
  };

  const delEl = () => {
    if (!sel) return;
    setDesign(d => ({
      ...d,
      [sel.banda]: { ...d[sel.banda], elementos: d[sel.banda].elementos.filter(e => e.id !== sel.id) },
    }) as any);
    setSel(null);
  };

  const duplicarEl = () => {
    if (!sel || !elSel) return;
    const copia: DocElement = { ...elSel, id: uid(), y: r2(elSel.y + elSel.h + 1) };
    setDesign(d => ({
      ...d,
      [sel.banda]: { ...d[sel.banda], elementos: [...d[sel.banda].elementos, copia] },
    }) as any);
    setSel({ banda: sel.banda, id: copia.id });
  };

  const moverDeBanda = () => {
    if (!sel || !elSel) return;
    const destino: Banda = sel.banda === 'encabezado' ? 'pie' : 'encabezado';
    const copia = { ...elSel, y: 1 };
    setDesign(d => ({
      ...d,
      [sel.banda]: { ...d[sel.banda], elementos: d[sel.banda].elementos.filter(e => e.id !== sel.id) },
      [destino]: { ...d[destino], elementos: [...d[destino].elementos, copia] },
    }) as any);
    setSel({ banda: destino, id: copia.id });
  };

  // ── Arrastrar y redimensionar ──────────────────────────────────────────
  useEffect(() => {
    const mover = (ev: PointerEvent) => {
      if (drag.current) {
        const { banda, id, dx, dy } = drag.current;
        const el = t.design[banda].elementos.find(e => e.id === id);
        if (!el) return;
        const x = Math.max(0, Math.min(util - el.w, (ev.clientX - dx) / PX));
        const y = Math.max(0, (ev.clientY - dy) / PX);
        patchEl(banda, id, { x: r2(x), y: r2(y) });
      } else if (resize.current) {
        const { banda, id, sx, sy, w, h } = resize.current;
        const el = t.design[banda].elementos.find(e => e.id === id);
        if (!el) return;
        const nw = Math.max(3, Math.min(util - el.x, w + (ev.clientX - sx) / PX));
        const nh = Math.max(el.type === 'linea' ? 0.2 : 2, h + (ev.clientY - sy) / PX);
        patchEl(banda, id, { w: r2(nw), h: r2(nh) });
      }
    };
    const soltar = () => { drag.current = null; resize.current = null; };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
  }, [t, PX, util]);

  /**
   * LAS FLECHAS MUEVEN EL ELEMENTO SELECCIONADO.
   *
   * Arrastrando no se alinean dos elementos al milímetro —y con el dedo, menos
   * todavía—. Con flechas se mueve 0,5 mm, y con Shift 5 mm. Es lo que hace que
   * el editor sirva de verdad en una laptop con trackpad.
   */
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (!sel) return;
      const el = t.design[sel.banda].elementos.find(e => e.id === sel.id);
      if (!el) return;
      /* Si se está escribiendo en un campo, las flechas son del campo. */
      const foco = document.activeElement?.tagName ?? '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(foco)) return;

      const paso = ev.shiftKey ? 5 : 0.5;
      const mapa: Record<string, [number, number]> = {
        ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
      };
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); delEl(); return; }
      const d = mapa[ev.key];
      if (!d) return;
      ev.preventDefault();
      patchEl(sel.banda, sel.id, {
        x: r2(Math.max(0, Math.min(util - el.w, el.x + d[0]))),
        y: r2(Math.max(0, el.y + d[1])),
      });
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [sel, t, util]);

  const guardar = async () => {
    setGuardando(true); setErr('');
    try {
      const g = await documentTemplatesService.save(tenantId, t);
      /* Que la próxima impresión use ESTO y no lo que se cargó al abrir la
         caja: sin esto, se guardaba el diseño, se imprimía, y salía el
         anterior —imposible de entender y fácil de leer como «no guardó»—. */
      try {
        const { posPrinterService } = await import('@/services/pos/posPrinterService');
        posPrinterService.olvidarPlantillas();
      } catch { /* no afecta al guardado */ }
      setT(g); onSaved(g);
      setGuardado(true); setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setGuardando(false); }
  };

  const verPrevia = () => {
    const w = window.open('', '_blank', 'width=900,height=950');
    if (!w) { setErr('Habilitá las ventanas emergentes para ver la previa.'); return; }
    w.document.write(renderDocumento(t, muestra, { paraPantalla: true }));
    w.document.close();
  };

  const subirImagen = (f: File) => {
    const lector = new FileReader();
    lector.onload = () => {
      if (!sel) return;
      patchEl(sel.banda, sel.id, { src: String(lector.result ?? ''), campo: '' });
    };
    lector.readAsDataURL(f);
  };

  // ── Lienzo ────────────────────────────────────────────────────────────
  const pintarEl = (banda: Banda, el: DocElement) => {
    const activo = sel?.id === el.id;
    const base: React.CSSProperties = {
      position: 'absolute',
      left: el.x * PX, top: el.y * PX, width: el.w * PX, height: Math.max(el.h, 0.4) * PX,
      outline: activo ? '2px solid #2563eb' : '1px dashed rgba(0,0,0,.18)',
      cursor: 'move', overflow: 'hidden', background: el.fondo || 'transparent',
      boxSizing: 'border-box',
      /* SIN ESTO NO SE PUEDE DISEÑAR CON EL DEDO: el navegador se queda el
         gesto para hacer scroll y el elemento no se mueve. En tablet era
         imposible mover nada; parecía que el editor estaba trabado. */
      touchAction: 'none',
      /* Y que el dedo no seleccione el texto del elemento al arrastrarlo. */
      userSelect: 'none', WebkitUserSelect: 'none',
    };
    let dentro: React.ReactNode = null;
    if (el.type === 'linea') {
      dentro = <div style={{ borderTop: `${Math.max(el.h, 0.25) * PX}px solid #000` }} />;
    } else if (el.type === 'caja') {
      dentro = <div style={{ width: '100%', height: '100%', border: el.borde !== false ? '1px solid #000' : undefined }} />;
    } else if (el.type === 'imagen') {
      const src = el.src || resolverCampo(String(el.campo ?? ''), muestra);
      dentro = src
        ? <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        : <div className="text-[10px] text-gray-400 w-full h-full flex items-center justify-center">Logo</div>;
    } else if (el.type === 'qr') {
      dentro = <div className="text-[10px] text-gray-500 w-full h-full flex items-center justify-center border border-gray-300">QR</div>;
    } else {
      const texto = el.type === 'texto'
        ? String(el.value ?? '')
        : `${el.etiqueta ?? ''}${resolverCampo(String(el.campo ?? ''), muestra) || `«${el.campo}»`}`;
      dentro = (
        <div style={{
          fontSize: (el.fontPt ?? 10) * 1.333 * zoom, fontFamily: el.fontFamily || t.design.fontFamily,
          fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal',
          textAlign: el.align ?? 'left', lineHeight: 1.15, width: '100%',
          overflowWrap: 'anywhere',
        }}>{texto}</div>
      );
    }
    return (
      <div key={el.id} style={base}
        onPointerDown={(ev) => {
          ev.stopPropagation();
          setSel({ banda, id: el.id });
          drag.current = { banda, id: el.id, dx: ev.clientX - el.x * PX, dy: ev.clientY - el.y * PX };
        }}>
        {dentro}
        {activo && (
          <div
            onPointerDown={(ev) => {
              ev.stopPropagation();
              resize.current = { banda, id: el.id, sx: ev.clientX, sy: ev.clientY, w: el.w, h: el.h };
            }}
            /* La manija es chica a propósito en el dibujo, pero su ZONA DE
               TOQUE es de 22 px: con 10 px el dedo no la agarraba nunca y
               terminaba moviendo el elemento en vez de redimensionarlo. */
            style={{
              position: 'absolute', right: -11, bottom: -11, width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'nwse-resize', touchAction: 'none',
            }}>
            <span style={{ width: 11, height: 11, background: '#2563eb', borderRadius: 2, boxShadow: '0 0 0 2px #fff' }} />
          </div>
        )}
      </div>
    );
  };

  const bandaUI = (banda: Banda, titulo: string) => (
    <div>
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[11px] font-black text-gray-500 uppercase tracking-wide">{titulo}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">alto</span>
          <input type="number" step="1" value={t.design[banda].hMm}
            onChange={e => setDesign(d => ({ ...d, [banda]: { ...d[banda], hMm: Number(e.target.value) || 0 } }) as any)}
            className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[11px]" />
          <span className="text-[10px] text-gray-400">mm</span>
        </div>
      </div>
      <div
        onPointerDown={() => setSel(null)}
        style={{
          position: 'relative', width: util * PX, height: Math.max(t.design[banda].hMm, 4) * PX,
          background: '#fff', outline: '1px solid #cbd5e1',
        }}>
        {t.design[banda].elementos.map(el => pintarEl(banda, el))}
      </div>
    </div>
  );

  // ── Columnas del detalle ──────────────────────────────────────────────
  const setCol = (i: number, patch: Partial<DocColumna>) =>
    setDesign(d => ({
      ...d,
      detalle: { ...d.detalle, columnas: d.detalle.columnas.map((c, j) => (j === i ? { ...c, ...patch } : c)) },
    }));
  const moverCol = (i: number, dir: -1 | 1) =>
    setDesign(d => {
      const cols = [...d.detalle.columnas];
      const j = i + dir;
      if (j < 0 || j >= cols.length) return d;
      [cols[i], cols[j]] = [cols[j], cols[i]];
      return { ...d, detalle: { ...d.detalle, columnas: cols } };
    });
  const sumaCols = t.design.detalle.columnas.reduce((s, c) => s + Number(c.wMm || 0), 0);

  /* Los paneles son VARIABLES y no bloques repetidos: en ancho van de columna
     y en angosto de cajón, con el mismo contenido. Duplicar el JSX era la
     manera segura de que uno de los dos se quedara viejo. */
  const paletaUI = (
    <>
      <p className="text-[11px] font-black text-gray-400 uppercase">Agregar</p>
      {([
        ['campo', Hash, 'Dato'],
        ['texto', Type, 'Texto'],
        ['imagen', ImageIcon, 'Imagen / logo'],
        ['linea', Minus, 'Línea'],
        ['caja', Square, 'Caja'],
        ['qr', QrCode, 'QR'],
      ] as const).map(([tipo, Icon, label]) => (
        <button key={tipo} onClick={() => addEl(tipo)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-gray-200 hover:border-blue-300 text-xs font-bold text-gray-700">
          <Icon size={14} className="text-blue-600" /> {label}
        </button>
      ))}
      <p className="text-[10px] text-gray-400 pt-1">
        Se agrega a la banda seleccionada. Arrastrá para moverlo; el cuadrito azul lo redimensiona.
      </p>
    </>
  );

  const propiedadesUI = (
    <>
      {!elSel ? (
        <>
          <p className="text-[11px] font-black text-gray-400 uppercase">Documento</p>
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'right', 'bottom', 'left'] as const).map(k => (
              <label key={k} className="text-[11px] text-gray-600">
                Margen {k === 'top' ? 'arriba' : k === 'right' ? 'der.' : k === 'bottom' ? 'abajo' : 'izq.'}
                <input type="number" step="1" value={m[k]}
                  onChange={e => setDesign(d => ({ ...d, margenes: { ...d.margenes, [k]: Number(e.target.value) || 0 } }))}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
              </label>
            ))}
          </div>
          <label className="block text-[11px] text-gray-600">
            Fuente base
            <select value={t.design.fontFamily}
              onChange={e => setDesign(d => ({ ...d, fontFamily: e.target.value }))}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs">
              <option value="system-ui, Arial, sans-serif">Sans (Arial)</option>
              <option value="monospace">Monoespaciada (térmica)</option>
              <option value="Georgia, serif">Serif (Georgia)</option>
            </select>
          </label>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-black text-gray-400 uppercase mb-2">Columnas del detalle</p>
            {t.design.detalle.columnas.map((c, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-2 mb-2 space-y-1">
                <div className="flex items-center gap-1">
                  <select value={c.campo} onChange={e => setCol(i, { campo: e.target.value })}
                    className="flex-1 border border-gray-200 rounded px-1 py-1 text-[11px]">
                    {COLUMNAS_DETALLE.map(o => <option key={o.campo} value={o.campo}>{o.label}</option>)}
                  </select>
                  <button onClick={() => moverCol(i, -1)} className="p-1 text-gray-400 hover:text-gray-700"><ChevronUp size={13} /></button>
                  <button onClick={() => moverCol(i, 1)} className="p-1 text-gray-400 hover:text-gray-700"><ChevronDown size={13} /></button>
                  <button onClick={() => setDesign(d => ({ ...d, detalle: { ...d.detalle, columnas: d.detalle.columnas.filter((_, j) => j !== i) } }))}
                    className="p-1 text-red-400 hover:text-red-700"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center gap-1">
                  <input value={c.titulo} onChange={e => setCol(i, { titulo: e.target.value })}
                    placeholder="Título" className="flex-1 border border-gray-200 rounded px-1 py-1 text-[11px]" />
                  <input type="number" step="1" value={c.wMm} onChange={e => setCol(i, { wMm: Number(e.target.value) || 0 })}
                    className="w-14 border border-gray-200 rounded px-1 py-1 text-[11px]" />
                  <span className="text-[10px] text-gray-400">mm</span>
                  <select value={c.align ?? 'left'} onChange={e => setCol(i, { align: e.target.value as any })}
                    className="border border-gray-200 rounded px-1 py-1 text-[11px]">
                    <option value="left">Izq</option><option value="center">Centro</option><option value="right">Der</option>
                  </select>
                </div>
              </div>
            ))}
            <button onClick={() => setDesign(d => ({
              ...d,
              detalle: { ...d.detalle, columnas: [...d.detalle.columnas, { campo: 'linea.total', titulo: 'Total', wMm: 20, align: 'right' }] },
            }))} className="w-full flex items-center justify-center gap-1 text-[11px] font-bold text-blue-700 border border-dashed border-blue-300 rounded-lg py-1.5">
              <Plus size={12} /> Columna
            </button>
            {/* La suma importa: pasada del ancho útil, el navegador recorta
                la última columna y el total se imprime cortado. */}
            <p className={`text-[10px] mt-1.5 ${sumaCols > util + 0.5 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
              Suma {r2(sumaCols)} mm de {r2(util)} mm útiles
              {sumaCols > util + 0.5 && ' — se va a recortar la última columna'}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                <input type="checkbox" checked={t.design.detalle.encabezados}
                  onChange={e => setDesign(d => ({ ...d, detalle: { ...d.detalle, encabezados: e.target.checked } }))} /> Encabezados
              </label>
              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                <input type="checkbox" checked={t.design.detalle.lineas}
                  onChange={e => setDesign(d => ({ ...d, detalle: { ...d.detalle, lineas: e.target.checked } }))} /> Líneas
              </label>
              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                pt
                <input type="number" step="0.5" value={t.design.detalle.fontPt}
                  onChange={e => setDesign(d => ({ ...d, detalle: { ...d.detalle, fontPt: Number(e.target.value) || 9 } }))}
                  className="w-12 border border-gray-200 rounded px-1 py-0.5 text-[11px]" />
              </label>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-gray-400 uppercase">
              {elSel.type === 'campo' ? 'Dato' : elSel.type === 'texto' ? 'Texto' : elSel.type}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={duplicarEl} title="Duplicar" className="p-1.5 text-gray-400 hover:text-gray-700"><Copy size={14} /></button>
              <button onClick={delEl} title="Quitar" className="p-1.5 text-red-400 hover:text-red-700"><Trash2 size={14} /></button>
            </div>
          </div>

          {elSel.type === 'campo' && (
            <>
              <label className="block text-[11px] text-gray-600">
                Qué dato
                <select value={elSel.campo ?? ''} onChange={e => patchEl(sel!.banda, sel!.id, { campo: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs">
                  {Object.entries(
                    CAMPOS.filter(f => !f.kinds || f.kinds.includes(t.kind))
                      .reduce<Record<string, typeof CAMPOS>>((acc, f) => {
                        (acc[f.grupo] ??= []).push(f); return acc;
                      }, {}),
                  ).map(([grupo, campos]) => (
                    <optgroup key={grupo} label={grupo}>
                      {campos.map(f => <option key={f.campo} value={f.campo}>{f.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-gray-600">
                Etiqueta antepuesta
                <input value={elSel.etiqueta ?? ''} onChange={e => patchEl(sel!.banda, sel!.id, { etiqueta: e.target.value })}
                  placeholder="Ej.: Cliente: " className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
              </label>
              <p className="text-[10px] text-gray-400">
                Si el dato viene vacío, esta línea no se imprime y lo que está debajo en la misma columna sube.
              </p>
            </>
          )}

          {elSel.type === 'texto' && (
            <label className="block text-[11px] text-gray-600">
              Texto
              <textarea value={elSel.value ?? ''} onChange={e => patchEl(sel!.banda, sel!.id, { value: e.target.value })}
                rows={3} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
              <span className="text-[10px] text-gray-400">
                Podés meter datos entre llaves: «Gracias, {'{cliente.nombre}'}»
              </span>
            </label>
          )}

          {elSel.type === 'imagen' && (
            <>
              <label className="block text-[11px] text-gray-600">
                Imagen
                <select value={elSel.src ? 'propia' : 'logo'}
                  onChange={e => patchEl(sel!.banda, sel!.id, e.target.value === 'logo' ? { src: '', campo: 'negocio.logo' } : { campo: '' })}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs">
                  <option value="logo">El logo del negocio</option>
                  <option value="propia">Una imagen que suba</option>
                </select>
              </label>
              <button onClick={() => imgInput.current?.click()}
                className="w-full text-xs font-bold border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">
                Subir imagen…
              </button>
              <input ref={imgInput} type="file" accept="image/*" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) subirImagen(f); e.target.value = ''; }} />
            </>
          )}

          {/* Posición y tamaño: a mano, porque arrastrando no se alinean
              dos elementos al milímetro y en un comprobante se nota. */}
          <div className="grid grid-cols-4 gap-1.5">
            {(['x', 'y', 'w', 'h'] as const).map(k => (
              <label key={k} className="text-[10px] text-gray-500">
                {k.toUpperCase()}
                <input type="number" step="0.5" value={(elSel as any)[k]}
                  onChange={e => patchEl(sel!.banda, sel!.id, { [k]: Number(e.target.value) || 0 } as any)}
                  className="w-full border border-gray-200 rounded px-1 py-1 text-[11px]" />
              </label>
            ))}
          </div>

          {(elSel.type === 'texto' || elSel.type === 'campo') && (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-500 flex-1">
                  Tamaño (pt)
                  <input type="number" step="0.5" value={elSel.fontPt ?? 10}
                    onChange={e => patchEl(sel!.banda, sel!.id, { fontPt: Number(e.target.value) || 10 })}
                    className="w-full border border-gray-200 rounded px-1 py-1 text-[11px]" />
                </label>
                <label className="text-[10px] text-gray-500 flex-1">
                  Máx. líneas
                  <input type="number" step="1" value={elSel.maxLines ?? 0}
                    onChange={e => patchEl(sel!.banda, sel!.id, { maxLines: Number(e.target.value) || undefined })}
                    className="w-full border border-gray-200 rounded px-1 py-1 text-[11px]" />
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => patchEl(sel!.banda, sel!.id, { bold: !elSel.bold })}
                  className={`p-1.5 rounded ${elSel.bold ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Bold size={13} /></button>
                <button onClick={() => patchEl(sel!.banda, sel!.id, { italic: !elSel.italic })}
                  className={`p-1.5 rounded ${elSel.italic ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Italic size={13} /></button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                  <button key={a} onClick={() => patchEl(sel!.banda, sel!.id, { align: a })}
                    className={`p-1.5 rounded ${(elSel.align ?? 'left') === a ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <input type="checkbox" checked={!!elSel.borde}
              onChange={e => patchEl(sel!.banda, sel!.id, { borde: e.target.checked })} /> Marco alrededor
          </label>

          <button onClick={moverDeBanda}
            className="w-full text-[11px] font-bold border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">
            Mover al {sel!.banda === 'encabezado' ? 'pie' : 'encabezado'}
          </button>
        </>
      )}
    </>
  );

  return (
    /* `min-h` además de `h-full`: el editor vive dentro del contenedor de
       Configuración, que no siempre tiene alto propio. Sin el mínimo, en
       celular el lienzo se aplastaba a unos pocos píxeles de alto. */
    <div className="flex flex-col h-full min-h-[82vh]">
      {/* ── Barra de arriba ──
          En celular son dos filas: arriba el nombre y los botones que uno
          busca (volver, previa, guardar), abajo los ajustes del papel. Todo en
          una sola fila dejaba el botón de guardar fuera de la pantalla, que es
          el único que no puede faltar. */}
      <div className="border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2">
          <button onClick={onBack} aria-label="Volver"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"><ArrowLeft size={18} /></button>
          <input value={t.name} onChange={e => setT(p => ({ ...p, name: e.target.value }))}
            aria-label="Nombre de la plantilla"
            className="flex-1 min-w-0 font-black text-gray-900 border-b border-transparent focus:border-blue-400 outline-none px-1" />
          <button onClick={verPrevia} title="Vista previa"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 border-2 border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 shrink-0">
            <Eye size={15} /> <span className="hidden sm:inline">Vista previa</span>
          </button>
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-black shrink-0">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span className="hidden sm:inline">{guardado ? 'Guardado ✓' : 'Guardar'}</span>
          </button>
        </div>

        {/* Segunda fila: el papel, el zoom y la estrella. Se desplaza de lado
            en celular en vez de apretarse hasta ser ilegible. */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-2 overflow-x-auto">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase shrink-0">
            {t.kind === 'ticket' ? 'Tiquete' : t.kind === 'hoja' ? 'Hoja / PDF' : 'Proforma'}
          </span>
          <select
            value={`${t.widthMm}x${t.heightMm ?? 0}`}
            onChange={e => {
              const [w, h] = e.target.value.split('x').map(Number);
              setT(p => ({ ...p, widthMm: w, heightMm: h || null }));
            }}
            aria-label="Tamaño del papel"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 shrink-0">
            {ANCHOS_PRESET.filter(p => p.kind.includes(t.kind)).map(p => (
              <option key={p.label} value={`${p.w}x${p.h ?? 0}`}>{p.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setZoom(z => Math.max(0.3, Math.round((z - 0.2) * 100) / 100))}
              aria-label="Alejar" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-black">−</button>
            <span className="text-[11px] font-bold text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.2) * 100) / 100))}
              aria-label="Acercar" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-black">+</button>
            <button onClick={ajustarZoom} title="Que el papel entero quepa en la pantalla"
              className="flex items-center gap-1 px-2 h-8 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold">
              <Maximize2 size={13} /> Ajustar
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer shrink-0 pl-1">
            <input type="checkbox" checked={t.isDefault} onChange={e => setT(p => ({ ...p, isDefault: e.target.checked }))} />
            <Star size={14} className={t.isDefault ? 'text-amber-500' : 'text-gray-300'} />
            <span className="whitespace-nowrap">Usar al imprimir</span>
          </label>
        </div>
      </div>

      {err && <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2">{err}</div>}

      {/* ── El armazón ───────────────────────────────────────────────────
          En pantalla ancha, tres columnas. En tablet y celular, el lienzo se
          queda con TODA la pantalla y los paneles se abren como cajones desde
          abajo: es la única forma de ver lo que se está cambiando mientras se
          cambia. */}
      <div className="flex-1 min-h-0 flex flex-row">
        {/* Paleta — columna solo en pantalla ancha */}
        {!angosto && (
          <div className="w-48 shrink-0 border-r border-gray-200 bg-gray-50 p-3 space-y-2 overflow-y-auto">
            {paletaUI}
          </div>
        )}

        {/* Lienzo */}
        <div ref={zonaLienzo} className="flex-1 min-w-0 overflow-auto bg-gray-200 p-3 sm:p-6">
          <div className="mx-auto bg-white shadow-lg" style={{ width: t.widthMm * PX, padding: `${m.top * PX}px ${m.right * PX}px ${m.bottom * PX}px ${m.left * PX}px` }}>
            <div className="space-y-3">
              {bandaUI('encabezado', 'Encabezado')}

              {/* Detalle: se ve como la tabla que es, no como un hueco. */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Columns3 size={12} /> Detalle (crece con el documento)
                  </span>
                </div>
                <div style={{ width: util * PX, outline: '1px dashed #94a3b8', background: '#fff' }}>
                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: (t.design.detalle.fontPt ?? 9) * 1.333 * zoom }}>
                    <colgroup>{t.design.detalle.columnas.map((c, i) => <col key={i} style={{ width: c.wMm * PX }} />)}</colgroup>
                    {t.design.detalle.encabezados && (
                      <thead><tr>{t.design.detalle.columnas.map((c, i) => (
                        <th key={i} style={{ textAlign: c.align ?? 'left', borderBottom: '1px solid #000', fontWeight: 700, padding: 1 }}>{c.titulo}</th>
                      ))}</tr></thead>
                    )}
                    <tbody>{muestra.lineas.slice(0, 3).map((l, i) => (
                      <tr key={i}>{t.design.detalle.columnas.map((c, j) => (
                        <td key={j} style={{ textAlign: c.align ?? 'left', padding: 1, borderBottom: t.design.detalle.lineas ? '1px solid #eee' : undefined, overflowWrap: 'anywhere' }}>
                          {c.campo === 'linea.nombre' ? l.nombre
                            : c.campo === 'linea.cantidad' ? l.cantidad
                            : c.campo === 'linea.codigo' ? (l.codigo ?? '')
                            : c.campo === 'linea.unidad' ? (l.unidad ?? '')
                            : c.campo === 'linea.precio' ? `₡${l.precio.toLocaleString('es-CR')}`
                            : c.campo === 'linea.total' ? `₡${l.total.toLocaleString('es-CR')}`
                            : ''}
                        </td>
                      ))}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

              {bandaUI('pie', 'Pie')}
            </div>
          </div>
          {/* Aire al final: en celular el último elemento del pie quedaba
              tapado por la barra de abajo. */}
          {angosto && <div className="h-24" />}
        </div>

        {/* Propiedades — columna solo en pantalla ancha */}
        {!angosto && (
          <div className="w-72 shrink-0 border-l border-gray-200 bg-white p-3 space-y-3 overflow-y-auto">
            {propiedadesUI}
          </div>
        )}
      </div>

      {/* ── Barra de abajo (tablet y celular) ── */}
      {angosto && (
        <div className="shrink-0 border-t border-gray-200 bg-white flex items-stretch">
          <button onClick={() => setCajon(c => (c === 'paleta' ? 'ninguno' : 'paleta'))}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${cajon === 'paleta' ? 'text-blue-700 bg-blue-50' : 'text-gray-600'}`}>
            <Plus size={17} /> Agregar
          </button>
          <button onClick={() => setCajon(c => (c === 'props' ? 'ninguno' : 'props'))}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${cajon === 'props' ? 'text-blue-700 bg-blue-50' : 'text-gray-600'}`}>
            <Settings2 size={17} /> {elSel ? 'Elemento' : 'Documento'}
          </button>
          {/* Mover con botones: con el dedo no se acierta medio milímetro, y
              un comprobante desalineado se nota. */}
          <div className="flex-1 flex items-center justify-center gap-0.5 border-l border-gray-100">
            {([['←', -0.5, 0], ['↑', 0, -0.5], ['↓', 0, 0.5], ['→', 0.5, 0]] as const).map(([txt, dx, dy]) => (
              <button key={txt} disabled={!elSel}
                onClick={() => {
                  if (!sel || !elSel) return;
                  patchEl(sel.banda, sel.id, {
                    x: r2(Math.max(0, Math.min(util - elSel.w, elSel.x + dx))),
                    y: r2(Math.max(0, elSel.y + dy)),
                  });
                }}
                className="w-9 h-9 rounded-lg text-gray-600 disabled:text-gray-300 bg-gray-50 font-bold">
                {txt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cajones ── */}
      {angosto && cajon !== 'ninguno' && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setCajon('ninguno')} />
          <div className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[72vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <p className="font-black text-gray-900 text-sm">
                {cajon === 'paleta' ? 'Agregar al documento' : elSel ? 'Elemento seleccionado' : 'Documento y columnas'}
              </p>
              <button onClick={() => setCajon('ninguno')} className="p-1.5 text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {cajon === 'paleta' ? paletaUI : propiedadesUI}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DocumentEditor;
