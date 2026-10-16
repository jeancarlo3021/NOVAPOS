'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { ANCHO_LIENZO, type ElementoLienzo, type Lienzo } from './lienzo';

/**
 * PINTA EL LIENZO, escalado al ancho real de la pantalla.
 *
 * El diseño se hizo sobre 390 px de ancho; acá se mide cuánto mide de verdad
 * el contenedor y se escala todo por igual. Es el mismo componente que usan el
 * editor y la página pública —a propósito: si fueran dos, el dueño acomodaría
 * su portada viendo una cosa y el cliente vería otra, y eso se descubre con el
 * QR ya pegado en las mesas.
 */
export const MenuLienzo: React.FC<{
  lienzo: Lienzo;
  logoUrl?: string | null;
  fuenteTitulo: string;
  fuenteCuerpo: string;
  /** Lo que se dibuja encima de cada elemento en el editor (tiradores). */
  encima?: (el: ElementoLienzo) => React.ReactNode;
  onFondo?: () => void;
}> = ({ lienzo, logoUrl, fuenteTitulo, fuenteCuerpo, encima, onFondo }) => {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  /**
   * Se mide ANTES de pintar (`useLayoutEffect`, no `useEffect`).
   *
   * Con el efecto normal, el primer cuadro sale a escala 1 —el lienzo diseñado
   * a 390 px— y recién después se acomoda: en un teléfono angosto se ve un
   * salto y un pedazo de portada cortado. Midiendo antes del pintado, la
   * portada sale ya en su tamaño.
   */
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setEscala((el.clientWidth || ANCHO_LIENZO) / ANCHO_LIENZO);
    medir();
    // El ancho cambia al girar el teléfono y al abrir/cerrar paneles del editor.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const alto = Math.max(60, Number(lienzo.alto) || 180);

  return (
    <div ref={caja} onClick={onFondo}
      style={{ width: '100%', height: alto * escala, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        width: ANCHO_LIENZO, height: alto, position: 'relative',
        transform: `scale(${escala})`, transformOrigin: 'top left',
        background: lienzo.fondo || 'transparent',
      }}>
        {lienzo.fondoUrl ? (
          <>
            <img src={lienzo.fondoUrl} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* Velo: sin él, un texto oscuro sobre una foto clara no se lee. */}
            {Number(lienzo.velo) > 0 ? (
              <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${lienzo.velo})` }} />
            ) : null}
          </>
        ) : null}

        {(lienzo.elementos ?? []).map(el => {
          const base: React.CSSProperties = {
            position: 'absolute', left: el.x, top: el.y, width: el.w,
          };
          let cuerpo: React.ReactNode = null;

          if (el.tipo === 'texto') {
            cuerpo = (
              <div style={{
                ...base,
                fontFamily: el.fuente === 'cuerpo' ? fuenteCuerpo : fuenteTitulo,
                fontSize: el.tam ?? 16,
                color: el.color ?? '#111827',
                fontWeight: el.negrita ? 700 : 400,
                textAlign: el.alineacion ?? 'left',
                lineHeight: el.interlineado ?? 1.3,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>{el.texto}</div>
            );
          } else if (el.tipo === 'logo' || el.tipo === 'imagen') {
            const src = el.tipo === 'logo' ? (logoUrl ?? el.url) : el.url;
            cuerpo = src ? (
              <img src={src} alt="" style={{
                ...base, height: el.h ?? el.w,
                objectFit: el.ajuste ?? 'cover',
                borderRadius: el.redondo ? '50%' : (el.radio ?? 0),
                display: 'block',
              }} />
            ) : (
              // Hueco visible: un logo que no cargó tiene que notarse en el
              // editor, no desaparecer y dejar un espacio inexplicable.
              <div style={{
                ...base, height: el.h ?? el.w,
                border: '1px dashed #cbd5e1', borderRadius: el.redondo ? '50%' : 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8', fontSize: 10, fontFamily: 'system-ui',
              }}>sin imagen</div>
            );
          } else if (el.tipo === 'banda') {
            cuerpo = (
              <div style={{
                ...base, height: el.h ?? 3,
                background: el.color ?? '#0F766E',
                borderRadius: el.radio ?? 0,
                opacity: el.opacidad ?? 1,
              }} />
            );
          }

          return (
            <React.Fragment key={el.id}>
              {cuerpo}
              {encima?.(el)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default MenuLienzo;
