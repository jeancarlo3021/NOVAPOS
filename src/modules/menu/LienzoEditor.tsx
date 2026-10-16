'use client';

import React, { useRef, useState } from 'react';
import { Type, Image as ImageIcon, Minus, Trash2, CircleUser, ArrowUp, ArrowDown } from 'lucide-react';
import { MenuLienzo } from './MenuLienzo';
import { ANCHO_LIENZO, nuevoId, type ElementoLienzo, type Lienzo } from './lienzo';

/**
 * EDITOR DEL LIENZO: se arrastra sobre la portada.
 *
 * Se trabaja sobre el MISMO componente que pinta la página pública, con los
 * tiradores dibujados encima. Así lo que se acomoda acá es exactamente lo que
 * ve el cliente — no una aproximación que después hay que ir a comparar.
 *
 * Las coordenadas se guardan en unidades de diseño (390 de ancho), así que al
 * arrastrar hay que dividir el movimiento del dedo por la escala: en una
 * pantalla donde el lienzo se ve al 80%, mover 10 píxeles reales son 12,5 de
 * diseño. Sin esa división, el elemento se queda atrás del cursor.
 */

const F: React.FC<{ etiqueta: string; children: React.ReactNode }> = ({ etiqueta, children }) => (
  <label className="block">
    <span className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-0.5">{etiqueta}</span>
    {children}
  </label>
);

const entrada = 'w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-teal-400';

export const LienzoEditor: React.FC<{
  lienzo: Lienzo;
  logoUrl?: string | null;
  fuenteTitulo: string;
  fuenteCuerpo: string;
  acento: string;
  onChange: (l: Lienzo) => void;
}> = ({ lienzo, logoUrl, fuenteTitulo, fuenteCuerpo, acento, onChange }) => {
  const [selId, setSelId] = useState<string | null>(null);
  const arrastre = useRef<{ id: string; dx: number; dy: number; escala: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const sel = (lienzo.elementos ?? []).find(e => e.id === selId) ?? null;

  const cambiar = (id: string, p: Partial<ElementoLienzo>) =>
    onChange({ ...lienzo, elementos: lienzo.elementos.map(e => (e.id === id ? { ...e, ...p } : e)) });

  const agregar = (tipo: ElementoLienzo['tipo']) => {
    const base: ElementoLienzo = tipo === 'texto'
      ? { id: nuevoId(), tipo, x: 40, y: 40, w: 310, texto: 'Texto nuevo', tam: 18, fuente: 'titulo', color: '#111827', alineacion: 'center' }
      : tipo === 'logo'
        ? { id: nuevoId(), tipo, x: 155, y: 24, w: 80, h: 80, redondo: true, ajuste: 'cover' }
        : tipo === 'imagen'
          ? { id: nuevoId(), tipo, x: 120, y: 30, w: 150, h: 100, ajuste: 'cover', radio: 8 }
          : { id: nuevoId(), tipo: 'banda', x: 145, y: 60, w: 100, h: 3, color: acento, radio: 2 };
    onChange({ ...lienzo, elementos: [...(lienzo.elementos ?? []), base] });
    setSelId(base.id);
  };

  const borrar = (id: string) => {
    onChange({ ...lienzo, elementos: lienzo.elementos.filter(e => e.id !== id) });
    setSelId(null);
  };

  /** Mueve un elemento en el arreglo: el último se dibuja encima. */
  const mover = (id: string, dir: -1 | 1) => {
    const arr = [...lienzo.elementos];
    const i = arr.findIndex(e => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange({ ...lienzo, elementos: arr });
  };

  const alEmpezar = (e: React.PointerEvent, el: ElementoLienzo) => {
    e.stopPropagation();
    e.preventDefault();
    setSelId(el.id);
    const ancho = caja.current?.clientWidth || ANCHO_LIENZO;
    const escala = ancho / ANCHO_LIENZO;
    arrastre.current = { id: el.id, dx: e.clientX - el.x * escala, dy: e.clientY - el.y * escala, escala };
    // Captura: sin esto, al salirse del elemento el arrastre se corta y la
    // pieza queda a mitad de camino.
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const x = Math.round((e.clientX - a.dx) / a.escala);
    const y = Math.round((e.clientY - a.dy) / a.escala);
    const el = lienzo.elementos.find(z => z.id === a.id);
    if (!el) return;
    // No se deja sacar del lienzo: un elemento perdido fuera del borde no se
    // puede volver a agarrar con el dedo.
    cambiar(a.id, {
      x: Math.max(-el.w + 20, Math.min(ANCHO_LIENZO - 20, x)),
      y: Math.max(0, Math.min(lienzo.alto - 10, y)),
    });
  };

  const alSoltar = () => { arrastre.current = null; };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_210px] gap-3">
      {/* Lienzo */}
      <div ref={caja}
        onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
        className="rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-white select-none"
        style={{ touchAction: 'none' }}>
        <MenuLienzo
          lienzo={lienzo} logoUrl={logoUrl}
          fuenteTitulo={fuenteTitulo} fuenteCuerpo={fuenteCuerpo}
          onFondo={() => setSelId(null)}
          encima={(el) => {
            const ancho = caja.current?.clientWidth || ANCHO_LIENZO;
            const escala = ancho / ANCHO_LIENZO;
            const alto = el.h ?? (el.tipo === 'texto' ? Math.max(20, (el.tam ?? 16) * 1.4) : el.w);
            return (
              <div
                onPointerDown={(e) => alEmpezar(e, el)}
                title="Arrastrá para mover"
                style={{
                  position: 'absolute', left: el.x, top: el.y, width: el.w, height: alto,
                  cursor: 'move',
                  outline: selId === el.id ? `${2 / escala}px solid #0d9488` : 'none',
                  outlineOffset: 2 / escala,
                  background: selId === el.id ? 'rgba(13,148,136,.06)' : 'transparent',
                }} />
            );
          }}
        />
      </div>

      {/* Propiedades */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {([
            ['texto', 'Texto', Type],
            ['logo', 'Logo', CircleUser],
            ['imagen', 'Imagen', ImageIcon],
            ['banda', 'Banda', Minus],
          ] as const).map(([t, etiqueta, Icono]) => (
            <button key={t} type="button" onClick={() => agregar(t)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-700 hover:bg-gray-50">
              <Icono size={11} /> {etiqueta}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 p-2 space-y-2 bg-white">
          <F etiqueta="Alto de la portada">
            <input type="number" min={60} max={700} value={lienzo.alto}
              onChange={e => onChange({ ...lienzo, alto: Math.max(60, Math.min(700, Number(e.target.value) || 180)) })}
              className={entrada} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F etiqueta="Fondo">
              <input type="color" value={lienzo.fondo || '#ffffff'}
                onChange={e => onChange({ ...lienzo, fondo: e.target.value })}
                className="w-full h-7 rounded border border-gray-200 cursor-pointer" />
            </F>
            <F etiqueta="Velo sobre la foto">
              <input type="range" min={0} max={0.8} step={0.05} value={lienzo.velo ?? 0}
                onChange={e => onChange({ ...lienzo, velo: Number(e.target.value) })}
                className="w-full" />
            </F>
          </div>
          <F etiqueta="Imagen de fondo (URL)">
            <input value={lienzo.fondoUrl ?? ''} placeholder="https://…"
              onChange={e => onChange({ ...lienzo, fondoUrl: e.target.value })} className={entrada} />
          </F>
        </div>

        {sel ? (
          <div className="rounded-xl border-2 border-teal-200 p-2 space-y-2 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-teal-700 uppercase">{sel.tipo}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => mover(sel.id, 1)} title="Traer al frente"
                  className="p-1 rounded text-gray-400 hover:text-gray-700"><ArrowUp size={12} /></button>
                <button type="button" onClick={() => mover(sel.id, -1)} title="Mandar atrás"
                  className="p-1 rounded text-gray-400 hover:text-gray-700"><ArrowDown size={12} /></button>
                <button type="button" onClick={() => borrar(sel.id)} title="Borrar"
                  className="p-1 rounded text-red-500 hover:bg-red-50"><Trash2 size={12} /></button>
              </div>
            </div>

            {sel.tipo === 'texto' ? (
              <>
                <F etiqueta="Texto">
                  <textarea value={sel.texto ?? ''} rows={2}
                    onChange={e => cambiar(sel.id, { texto: e.target.value })}
                    className={`${entrada} resize-none`} />
                </F>
                <div className="grid grid-cols-2 gap-2">
                  <F etiqueta="Tamaño">
                    <input type="number" min={8} max={64} value={sel.tam ?? 16}
                      onChange={e => cambiar(sel.id, { tam: Number(e.target.value) || 16 })} className={entrada} />
                  </F>
                  <F etiqueta="Color">
                    <input type="color" value={sel.color ?? '#111827'}
                      onChange={e => cambiar(sel.id, { color: e.target.value })}
                      className="w-full h-7 rounded border border-gray-200 cursor-pointer" />
                  </F>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <F etiqueta="Fuente">
                    <select value={sel.fuente ?? 'titulo'} onChange={e => cambiar(sel.id, { fuente: e.target.value as any })}
                      className={entrada}>
                      <option value="titulo">Título</option>
                      <option value="cuerpo">Cuerpo</option>
                    </select>
                  </F>
                  <F etiqueta="Alineación">
                    <select value={sel.alineacion ?? 'left'} onChange={e => cambiar(sel.id, { alineacion: e.target.value as any })}
                      className={entrada}>
                      <option value="left">Izquierda</option>
                      <option value="center">Centro</option>
                      <option value="right">Derecha</option>
                    </select>
                  </F>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <input type="checkbox" checked={!!sel.negrita}
                    onChange={e => cambiar(sel.id, { negrita: e.target.checked })}
                    className="w-4 h-4 accent-teal-600" /> Negrita
                </label>
              </>
            ) : null}

            {sel.tipo === 'imagen' ? (
              <F etiqueta="URL de la imagen">
                <input value={sel.url ?? ''} placeholder="https://…"
                  onChange={e => cambiar(sel.id, { url: e.target.value })} className={entrada} />
              </F>
            ) : null}

            {sel.tipo === 'banda' ? (
              <F etiqueta="Color">
                <input type="color" value={sel.color ?? acento}
                  onChange={e => cambiar(sel.id, { color: e.target.value })}
                  className="w-full h-7 rounded border border-gray-200 cursor-pointer" />
              </F>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <F etiqueta="Ancho">
                <input type="number" min={10} max={ANCHO_LIENZO} value={sel.w}
                  onChange={e => cambiar(sel.id, { w: Math.max(10, Number(e.target.value) || 10) })} className={entrada} />
              </F>
              {sel.tipo !== 'texto' ? (
                <F etiqueta="Alto">
                  <input type="number" min={2} max={700} value={sel.h ?? sel.w}
                    onChange={e => cambiar(sel.id, { h: Math.max(2, Number(e.target.value) || 2) })} className={entrada} />
                </F>
              ) : null}
            </div>
            {sel.tipo === 'logo' || sel.tipo === 'imagen' ? (
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <input type="checkbox" checked={!!sel.redondo}
                  onChange={e => cambiar(sel.id, { redondo: e.target.checked })}
                  className="w-4 h-4 accent-teal-600" /> Redondo
              </label>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 px-1">
            Tocá un elemento de la portada para editarlo, o agregá uno con los botones de arriba.
            Se arrastra con el dedo o el mouse.
          </p>
        )}
      </div>
    </div>
  );
};

export default LienzoEditor;
