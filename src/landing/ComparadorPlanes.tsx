import React, { useEffect, useMemo, useRef } from 'react';
import { C, T, E, R, S, FUENTE_TITULO, ANCHO } from './estilos';

/**
 * COMPARAR LOS PLANES, uno al lado del otro.
 *
 * En las tarjetas, lo que incluye cada plan es una lista suelta: para saber si
 * el Pro trae algo que el Básico no, hay que leer las dos columnas y acordarse.
 * Con quince funciones por plan, nadie lo hace —se va de la página o escribe
 * para preguntar—, y la pregunta que más llega es exactamente esa: «¿qué
 * diferencia hay entre uno y otro?».
 *
 * Acá está la respuesta en una sola pantalla: las funciones son las filas, los
 * planes las columnas, y el ✓ o el — se ve de un vistazo. Las filas donde
 * TODOS son iguales se pueden esconder, que es lo único que interesa cuando ya
 * se está decidiendo entre dos.
 *
 * Los datos son los mismos de las tarjetas: no hay una segunda lista que
 * mantener —y que se desincronice— en el panel.
 */

export interface PlanComparable {
  nombre: string;
  precio?: string;
  precio_anual?: string;
  destacado?: boolean;
  incluye?: string[];
}

/** Para comparar: sin mayúsculas, sin acentos y sin espacios de sobra. */
const llave = (s: string) =>
  String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

export const ComparadorPlanes: React.FC<{
  planes: PlanComparable[];
  /** Qué precio mostrar arriba de cada columna (el del conmutador). */
  anual: boolean;
  /** Para el botón de cada columna. */
  enlaceDe: (p: PlanComparable) => { href: string; externo: boolean };
  onCerrar: () => void;
}> = ({ planes, anual, enlaceDe, onCerrar }) => {
  const [soloDiferencias, setSoloDiferencias] = React.useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  /* Esc cierra y el foco entra al diálogo: se abre con el teclado tanto como
     con el mouse, y quedar atrapado sin saber cómo salir es peor que no
     poder abrirlo. */
  useEffect(() => {
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    /* El fondo no se desplaza mientras el comparador está abierto: en el
       teléfono, deslizar dentro de la tabla movía la página de atrás. */
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  /**
   * Las filas: la unión de todo lo que incluyen los planes, en el orden en que
   * aparecen. Se respeta el orden del que más trae —normalmente el plan grande
   * es el que tiene la lista completa— para que la tabla se lea como la lista
   * de siempre y no como un revoltijo alfabético.
   */
  const filas = useMemo(() => {
    const vistas = new Map<string, string>();
    const porLargo = [...planes].sort((a, b) => (b.incluye?.length ?? 0) - (a.incluye?.length ?? 0));
    for (const p of porLargo) {
      for (const f of p.incluye ?? []) {
        const k = llave(f);
        if (k && !vistas.has(k)) vistas.set(k, String(f).trim());
      }
    }
    const tiene = (p: PlanComparable, k: string) => (p.incluye ?? []).some(f => llave(f) === k);
    return [...vistas.entries()].map(([k, etiqueta]) => ({
      etiqueta,
      marcas: planes.map(p => tiene(p, k)),
    }));
  }, [planes]);

  const visibles = soloDiferencias
    ? filas.filter(f => f.marcas.some(Boolean) && f.marcas.some(x => !x))
    : filas;

  const precioDe = (p: PlanComparable) =>
    (anual ? (p.precio_anual || p.precio) : p.precio) || '';

  const Tilde = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke={C.marca} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Comparación de planes"
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(17,25,38,.55)',
        backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', padding: 0,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.blanco, width: '100%', maxWidth: ANCHO,
          borderRadius: `${R.xl}px ${R.xl}px 0 0`, boxShadow: S.elevada,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          animation: 'subeComparador .22s ease-out',
        }}
      >
        <style>{`
          @keyframes subeComparador { from { transform: translateY(28px); opacity: .4 } to { transform: none; opacity: 1 } }
          @media (min-width: 760px) { .comparador-caja { border-radius: ${R.xl}px !important; margin-bottom: 4vh } }
          .fila-comp:hover { background: ${C.fondoAlt}; }
        `}</style>

        {/* Encabezado */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: E.sm,
          padding: `${E.md}px ${E.lg}px`, borderBottom: `1px solid ${C.linea}`,
        }}>
          <h2 style={{
            fontFamily: FUENTE_TITULO, fontSize: '1.15rem', margin: 0, color: C.tinta, flex: 1,
          }}>
            Qué trae cada plan
          </h2>
          {/* Solo las diferencias: cuando ya se está eligiendo entre dos, las
              veinte filas iguales son ruido. */}
          <button
            type="button" onClick={() => setSoloDiferencias(v => !v)}
            style={{
              border: `1.5px solid ${soloDiferencias ? C.marca : C.linea}`,
              background: soloDiferencias ? C.marcaSuave : 'transparent',
              color: soloDiferencias ? C.marcaOscuro : C.texto,
              fontFamily: 'inherit', fontSize: T.chico, fontWeight: 700,
              padding: '7px 13px', borderRadius: R.pill, cursor: 'pointer',
            }}>
            Solo las diferencias
          </button>
          <button
            ref={cerrarRef} type="button" onClick={onCerrar} aria-label="Cerrar"
            style={{
              border: 'none', background: C.fondoAlt, color: C.texto, cursor: 'pointer',
              width: 36, height: 36, borderRadius: R.pill, fontSize: 18, lineHeight: 1,
              fontFamily: 'inherit',
            }}>
            ✕
          </button>
        </div>

        {/* La tabla. En el teléfono se desplaza de lado con la primera columna
            fija: partirla en tarjetas obligaría a recordar la fila, que es
            justo lo que se viene a evitar. */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{
            borderCollapse: 'collapse', width: '100%', minWidth: 120 + planes.length * 130,
            fontSize: T.chico,
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 3, background: C.blanco,
                  textAlign: 'left', padding: `${E.sm}px ${E.md}px`, minWidth: 180,
                  borderBottom: `1px solid ${C.linea}`,
                }} />
                {planes.map((p, i) => (
                  <th key={i} style={{
                    position: 'sticky', top: 0, zIndex: 2, background: C.blanco,
                    padding: `${E.sm}px ${E.sm}px`, textAlign: 'center', minWidth: 130,
                    borderBottom: `1px solid ${C.linea}`,
                    borderTop: p.destacado ? `3px solid ${C.marca}` : '3px solid transparent',
                  }}>
                    <span style={{
                      display: 'block', color: C.tinta, fontSize: T.cuerpo, fontWeight: 700,
                    }}>{p.nombre}</span>
                    {precioDe(p) && (
                      <span style={{ display: 'block', color: C.marca, fontWeight: 800, marginTop: 2 }}>
                        {precioDe(p)}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={planes.length + 1} style={{ padding: E.xl, textAlign: 'center', color: C.suave }}>
                    Estos planes traen exactamente lo mismo.
                  </td>
                </tr>
              ) : visibles.map((f, i) => (
                <tr key={i} className="fila-comp">
                  <td style={{
                    position: 'sticky', left: 0, background: C.blanco, color: C.texto,
                    padding: `${E.sm}px ${E.md}px`, borderBottom: `1px solid ${C.linea}`,
                    lineHeight: 1.4,
                  }}>{f.etiqueta}</td>
                  {f.marcas.map((tiene, j) => (
                    <td key={j} style={{
                      textAlign: 'center', padding: `${E.sm}px`, borderBottom: `1px solid ${C.linea}`,
                      background: planes[j].destacado ? C.marcaSuave + '55' : undefined,
                    }}>
                      {tiene ? <Tilde /> : (
                        /* Una raya, no una equis: lo que no trae este plan no
                           es un error, es otra categoría de producto. */
                        <span style={{ color: C.linea, fontSize: 18, fontWeight: 700 }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pie: un botón por plan, para no tener que cerrar y buscar la tarjeta. */}
        <div style={{
          borderTop: `1px solid ${C.linea}`, padding: `${E.sm}px ${E.md}px`,
          display: 'flex', gap: E.xs, flexWrap: 'wrap', justifyContent: 'flex-end',
        }}>
          {planes.map((p, i) => {
            const l = enlaceDe(p);
            return (
              <a key={i} href={l.href} className="cta"
                {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                style={{
                  textDecoration: 'none', fontWeight: 700, fontSize: T.chico,
                  padding: '10px 14px', borderRadius: R.md,
                  background: p.destacado ? C.marca : 'transparent',
                  color: p.destacado ? C.blanco : C.marca,
                  border: p.destacado ? 'none' : `1.5px solid ${C.marca}`,
                }}>
                Quiero {p.nombre}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ComparadorPlanes;
