'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { themeOf, money, rangoPromo, type MenuSection, type MenuHeader, type MenuConfig, type MenuPromo } from './menuThemes';
import { MenuLienzo } from './MenuLienzo';

/**
 * El menú pintado.
 *
 * Lo comparten la vista previa del editor y la página pública, a propósito: si
 * fueran dos componentes, el negocio armaría su carta viendo una cosa y el
 * cliente vería otra, y ese desfase solo se descubre cuando ya está el QR
 * pegado en las mesas.
 */
interface Props {
  theme?: string | null;
  header: MenuHeader;
  config: MenuConfig;
  sections: MenuSection[];
  /** Promos vigentes, resueltas por el servidor. Vacío = no se muestra la barra. */
  promos?: MenuPromo[];
  /** En la vista previa el tipo se achica para que quepa en el teléfono simulado. */
  compact?: boolean;
}

/**
 * Texto comparable: sin tildes, sin mayúsculas.
 *
 * Nadie escribe tildes en el teléfono. Sin esto, buscar «chevre» en una
 * quesería no encontraba el «Queso Chèvre» —probado en un navegador de
 * verdad—, y el cliente concluye que no lo venden. Vale para la ñ y la ü por
 * el mismo motivo: «pina» tiene que encontrar la piña.
 */
const sinTildes = (v: any): string =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const MenuRender: React.FC<Props> = ({ theme, header, config, sections, promos = [], compact = false }) => {
  const t = themeOf(theme);
  const accent = config.accent || '#0F766E';
  const showPrices = config.show_prices !== false;
  const showPhotos = config.show_photos !== false;
  const showAllergens = config.show_allergens !== false;
  /**
   * Lo propio del CATÁLOGO: el código con el que el cliente pide el producto y
   * si hay existencias. Un tornillo no tiene alérgenos, y «contiene gluten» en
   * una ferretería se ve como un error del sistema.
   */
  /**
   * Qué dice el pie sobre el impuesto.
   *
   * Un precio sin aclarar es una discusión en la caja. `null` = el negocio no
   * cobra impuesto (régimen simplificado): ahí no hay nada que aclarar.
   */
  const lienzo = (config as any).lienzo as import('./lienzo').Lienzo | undefined;
  const impuesto = (config as any).impuesto_incluido;
  const avisoImpuesto = impuesto === true ? 'Precios con impuesto incluido'
    : impuesto === false ? 'Los precios no incluyen impuestos'
    : null;
  const showSku = (config as any).show_sku === true;
  const showStock = (config as any).show_stock === true;
  const s = (n: number) => (compact ? n * 0.82 : n);

  /**
   * BUSCADOR Y FILTRO DE PROMOS.
   *
   * Viven acá, en el mismo componente que pinta la lista, para que la vista
   * previa del editor y la página pública se comporten igual. Que el negocio
   * pruebe el buscador antes de pegar el QR es parte del punto.
   */
  const [q, setQ] = useState('');
  const [promoSel, setPromoSel] = useState<string | null>(null);

  /**
   * EL DETALLE DE UN PRODUCTO.
   *
   * La lista tiene que ser legible de un barrido: nombre, precio y poco más.
   * Pero quien ya se detuvo en un producto quiere la foto en grande y lo que
   * no cabe en la fila —la descripción completa, hasta cuándo dura la promo,
   * el código con el que pedirlo—. Meter todo eso en cada fila convierte el
   * catálogo en un muro; esconderlo del todo obliga a preguntar por WhatsApp.
   *
   * Se guarda el producto, no su id: la lista se filtra mientras el modal
   * está abierto (el buscador sigue vivo detrás) y un id podría dejar de
   * existir en la lista visible con el modal todavía en pantalla.
   */
  const [detalle, setDetalle] = useState<any | null>(null);

  /**
   * Escape cierra, y mientras está abierto la página de atrás no rueda.
   *
   * Sin lo segundo, en el teléfono el dedo mueve la carta por debajo del
   * modal y al cerrarlo el cliente aparece en otra parte de la lista, sin
   * entender qué pasó.
   */
  useEffect(() => {
    if (!detalle) return;
    const cerrarConEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetalle(null); };
    document.addEventListener('keydown', cerrarConEsc);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', cerrarConEsc);
      document.body.style.overflow = previo;
    };
  }, [detalle]);

  const totalItems = useMemo(
    () => sections.reduce((n, sec) => n + sec.items.length, 0), [sections]);

  /**
   * El buscador aparece cuando hay suficiente para buscar.
   *
   * Con seis platos a la vista no ayuda: ocupa lugar y sugiere que la lista es
   * más larga de lo que es. Con cuarenta productos es la diferencia entre
   * encontrar algo y cerrar la página.
   */
  const hayBuscador = totalItems >= 7;
  const hayPromos = promos.length > 0;

  const promoActiva = useMemo(
    () => promos.find(p => p.id === promoSel) ?? null, [promos, promoSel]);

  /**
   * Cuál promo se DESCRIBE, que no es lo mismo que cuál FILTRA.
   *
   * Con una sola promoción no hay nada que elegir: obligar a tocar un chip
   * para enterarse de las fechas es esconder el dato detrás de un gesto que
   * nadie adivina. Se muestra sola, pero sin filtrar la lista —si filtrara,
   * el cliente vería tres platos y creería que eso es toda la carta—.
   */
  const promoDescrita = promoActiva ?? (promos.length === 1 ? promos[0] : null);

  const seccionesVistas = useMemo(() => {
    const texto = sinTildes(q);
    // Se busca por nombre, descripción y código: el cliente que llega con un
    // número de parte no sabe cómo se llama el producto en el sistema.
    const coincide = (it: any) => !texto || [it.name, it.description, it.sku]
      .some(v => sinTildes(v).includes(texto));
    const enPromo = (it: any) => !promoActiva || promoActiva.item_ids.includes(it.id);
    return sections
      .map(sec => ({ ...sec, items: sec.items.filter(it => coincide(it) && enPromo(it)) }))
      .filter(sec => sec.items.length > 0);
  }, [sections, q, promoActiva]);

  const nVistos = seccionesVistas.reduce((n, sec) => n + sec.items.length, 0);
  const filtrando = sinTildes(q) !== '' || promoActiva !== null;

  return (
    <div style={{ background: t.page, color: t.ink, fontFamily: t.bodyFont, minHeight: '100%' }}>

      {/* PORTADA DISEÑADA A MANO.
          Si el negocio armó su lienzo, manda sobre la portada del tema: para
          eso se tomó el trabajo. La lista de platos sigue igual debajo. */}
      {lienzo && (lienzo.elementos?.length ?? 0) > 0 ? (
        <MenuLienzo lienzo={lienzo} logoUrl={header.logo_url}
          fuenteTitulo={t.titleFont} fuenteCuerpo={t.bodyFont} />
      ) : header.cover_url ? (
        <div style={{ height: s(150), overflow: 'hidden', position: 'relative' }}>
          <img src={header.cover_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.55), transparent 60%)' }} />
        </div>
      ) : null}

      <div style={{ padding: `${s(24)}px ${s(20)}px ${s(40)}px`, maxWidth: 680, margin: '0 auto' }}>

        {/* Identidad — la pinta el tema solo si no hay lienzo propio. */}
        {lienzo && (lienzo.elementos?.length ?? 0) > 0 ? null : (
        <header style={{ textAlign: 'center', marginBottom: s(28) }}>
          {header.logo_url ? (
            <img src={header.logo_url} alt=""
              style={{
                width: s(64), height: s(64), objectFit: 'cover', borderRadius: '50%',
                margin: `0 auto ${s(12)}px`, display: 'block', border: `2px solid ${t.rule}`,
              }} />
          ) : null}
          <h1 style={{
            fontFamily: t.titleFont, fontSize: s(28), lineHeight: 1.15, margin: 0,
            fontWeight: 600, letterSpacing: '-.01em',
          }}>
            {header.name || 'Nuestro menú'}
          </h1>
          {header.tagline ? (
            <p style={{ color: t.muted, fontSize: s(13), margin: `${s(6)}px 0 0` }}>{header.tagline}</p>
          ) : null}
          <div style={{
            width: s(48), height: 2, background: accent,
            margin: `${s(16)}px auto 0`, borderRadius: 2,
          }} />
        </header>
        )}

        {/* ── BARRA INTERACTIVA: buscar y ver promociones ──────────────
            Va arriba de las secciones y pegada al borde superior al rodar:
            en una carta larga, el cliente que quiere buscar algo no debería
            tener que volver hasta el principio. */}
        {(hayBuscador || hayPromos) && sections.length > 0 ? (
          <div style={{
            position: 'sticky', top: 0, zIndex: 5,
            background: t.page, paddingTop: s(8), paddingBottom: s(10),
            marginBottom: s(18), borderBottom: '1px solid ' + t.rule,
          }}>
            {hayBuscador ? (
              <div style={{ position: 'relative', marginBottom: hayPromos ? s(10) : 0 }}>
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder={showSku || showStock ? 'Buscar producto o código…' : 'Buscar en la carta…'}
                  aria-label="Buscar"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: showSku ? '10px 34px 10px 12px' : '10px 34px 10px 12px',
                    fontSize: s(14), fontFamily: t.bodyFont, color: t.ink,
                    background: t.surface, border: '1px solid ' + t.rule,
                    borderRadius: 10, outline: 'none',
                  }} />
                {/* Limpiar: sin esto, en un teléfono hay que borrar letra por
                    letra para volver a ver la carta completa. */}
                {q ? (
                  <button onClick={() => setQ('')} aria-label="Limpiar búsqueda"
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      border: 'none', background: 'transparent', color: t.muted,
                      fontSize: s(18), lineHeight: 1, cursor: 'pointer', padding: '2px 6px',
                    }}>×</button>
                ) : (
                  <span aria-hidden style={{
                    position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                    color: t.muted, fontSize: s(13), pointerEvents: 'none',
                  }}>⌕</span>
                )}
              </div>
            ) : null}

            {/* Chips de promoción. Tocar una deja a la vista SOLO lo que
                alcanza: es la pregunta que hace el cliente —«¿qué está en
                oferta?»— convertida en un toque. */}
            {hayPromos ? (
              <div style={{
                display: 'flex', gap: s(6), overflowX: 'auto', paddingBottom: 2,
                scrollbarWidth: 'none',
              }}>
                <button onClick={() => setPromoSel(null)}
                  style={{
                    flexShrink: 0, cursor: 'pointer', fontFamily: t.bodyFont,
                    fontSize: s(11.5), fontWeight: 700, padding: '6px 11px', borderRadius: 99,
                    border: '1px solid ' + (promoSel === null ? accent : t.rule),
                    background: promoSel === null ? accent : 'transparent',
                    color: promoSel === null ? '#fff' : t.muted,
                  }}>
                  Todo
                </button>
                {promos.map(p => {
                  const sel = promoSel === p.id;
                  return (
                    <button key={p.id} onClick={() => setPromoSel(sel ? null : p.id)}
                      title={[p.nombre, p.descripcion, rangoPromo(p.empieza, p.termina)]
                        .filter(Boolean).join(' — ')}
                      style={{
                        flexShrink: 0, cursor: 'pointer', fontFamily: t.bodyFont,
                        fontSize: s(11.5), fontWeight: 700, padding: '6px 11px', borderRadius: 99,
                        border: '1px solid ' + (sel ? accent : t.rule),
                        background: sel ? accent : 'transparent',
                        color: sel ? '#fff' : t.ink,
                        display: 'flex', alignItems: 'center', gap: s(5),
                      }}>
                      <span>{p.etiqueta}</span>
                      <span style={{ opacity: .75, fontWeight: 600 }}>{p.nombre}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Detalle de la promo elegida: el nombre y la etiqueta caben en el
                chip, pero la condición («en compras de dos o más») no, y es
                justo lo que evita el reclamo en la caja. */}
            {promoDescrita ? (
              <div style={{
                marginTop: s(8), padding: s(9), borderRadius: 10,
                background: t.surface, border: '1px solid ' + t.rule,
              }}>
                <p style={{ margin: 0, fontSize: s(12.5), fontWeight: 700 }}>
                  {promoDescrita.nombre}
                </p>
                {promoDescrita.descripcion ? (
                  <p style={{ margin: s(3) + 'px 0 0', fontSize: s(11.5), color: t.muted, lineHeight: 1.45 }}>
                    {promoDescrita.descripcion}
                  </p>
                ) : null}
                {/* Desde cuándo y hasta cuándo. Con solo el «hasta», el
                    cliente no sabe si ya está corriendo o arranca mañana, y la
                    pregunta termina en el mostrador. */}
                {rangoPromo(promoDescrita.empieza, promoDescrita.termina) ? (
                  <p style={{ margin: s(5) + 'px 0 0', fontSize: s(11), color: t.ink, fontWeight: 600 }}>
                    {rangoPromo(promoDescrita.empieza, promoDescrita.termina)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Cuántos quedaron. Un conteo evita la duda de si la página se
                rompió o de verdad no hay nada con ese nombre. */}
            {filtrando ? (
              <p style={{ margin: s(8) + 'px 0 0', fontSize: s(11), color: t.muted }}>
                {nVistos === 0
                  ? 'Nada coincide con la búsqueda'
                  : nVistos + (nVistos === 1 ? ' resultado' : ' resultados')}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Secciones */}
        {sections.length === 0 ? (
          <p style={{ textAlign: 'center', color: t.muted, fontSize: s(13), padding: `${s(40)}px 0` }}>
            {showSku || showStock ? 'Todavía no hay productos en el catálogo.' : 'Todavía no hay platos en el menú.'}
          </p>
        ) : seccionesVistas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: s(36) + 'px 0' }}>
            <p style={{ color: t.muted, fontSize: s(13), margin: 0 }}>
              {promoActiva && !q.trim()
                ? 'No hay nada de esta promoción en esta página.'
                : 'No encontramos nada con eso.'}
            </p>
            <button onClick={() => { setQ(''); setPromoSel(null); }}
              style={{
                marginTop: s(12), cursor: 'pointer', fontFamily: t.bodyFont,
                fontSize: s(12), fontWeight: 700, padding: '8px 14px', borderRadius: 99,
                border: '1px solid ' + accent, background: 'transparent', color: accent,
              }}>
              Ver todo
            </button>
          </div>
        ) : seccionesVistas.map(sec => (
          <section key={sec.id} style={{ marginBottom: s(32) }}>
            <h2 style={{
              fontFamily: t.titleFont, fontSize: s(18), margin: `0 0 ${s(4)}px`,
              color: accent, fontWeight: 600,
              letterSpacing: t.titleSpacing ?? '.02em',
              textTransform: t.titleTransform ?? 'none',
              ...(t.sectionRule ? {
                borderBottom: `1px solid ${t.rule}`, paddingBottom: s(6),
              } : {}),
            }}>
              {sec.title}
            </h2>
            {sec.note ? (
              <p style={{ color: t.muted, fontSize: s(11.5), margin: `0 0 ${s(12)}px`, fontStyle: 'italic' }}>
                {sec.note}
              </p>
            ) : <div style={{ height: s(10) }} />}

            <div style={{
              display: 'flex', flexDirection: 'column',
              gap: t.layout === 'cards' ? s(10) : s(16),
            }}>
              {sec.items.map(it => {
                const withPhoto = showPhotos && !!it.image_url;
                return (
                  <article key={it.id}
                    /* Toda la fila abre el detalle, no un «ver más» chiquito:
                       en un teléfono el objetivo de toque es la tarjeta. */
                    role="button" tabIndex={0}
                    aria-label={`Ver detalles de ${it.name}`}
                    onClick={() => setDetalle(it)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalle(it); }
                    }}
                    style={{
                    display: 'flex', gap: s(12), alignItems: 'flex-start',
                    cursor: 'pointer',
                    ...(t.layout === 'cards' ? {
                      background: t.surface, borderRadius: s(12), padding: s(10),
                      border: `1px solid ${t.rule}`,
                    } : {}),
                  }}>
                    {withPhoto ? (
                      <img src={it.image_url!} alt=""
                        style={{
                          width: s(64), height: s(64), objectFit: 'cover',
                          borderRadius: s(8), flexShrink: 0, display: 'block',
                        }} />
                    ) : null}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Guía de puntos: el precio queda alineado al margen
                          derecho como en una carta impresa. Con `inline` va
                          pegado al nombre, que lee más moderno. */}
                      <div style={{
                        display: 'flex', alignItems: 'baseline',
                        gap: t.priceStyle === 'leader' ? s(6) : s(10),
                      }}>
                        <span style={{
                          fontFamily: t.titleFont, fontSize: s(15), fontWeight: 600, lineHeight: 1.3,
                        }}>
                          {it.name}
                        </span>
                        {t.priceStyle === 'leader' && showPrices ? (
                          <span style={{
                            flex: 1, borderBottom: `1px dotted ${t.rule}`,
                            transform: `translateY(-${s(3)}px)`,
                          }} />
                        ) : <span style={{ flex: 1 }} />}
                        {showPrices ? (
                          <span style={{
                            display: 'flex', alignItems: 'baseline', gap: s(5),
                            whiteSpace: 'nowrap',
                          }}>
                            {/* El precio de antes, tachado. Es lo que convierte
                                «¢4.000» en «está rebajado»: sin la referencia,
                                un descuento no se ve. Solo aparece cuando la
                                promo de verdad bajó el precio — un 2×1 no
                                cambia el unitario y tacharlo sería mentir. */}
                            {it.precio_antes ? (
                              <span style={{
                                fontSize: s(11.5), color: t.muted, textDecoration: 'line-through',
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {money(it.precio_antes)}
                              </span>
                            ) : null}
                            <span style={{
                              fontSize: s(14), fontWeight: 700,
                              fontVariantNumeric: 'tabular-nums', color: accent,
                            }}>
                              {money(it.price)}
                            </span>
                          </span>
                        ) : null}
                      </div>

                      {it.description ? (
                        <p style={{
                          color: t.muted, fontSize: s(12.5), lineHeight: 1.45,
                          margin: `${s(3)}px 0 0`,
                        }}>
                          {it.description}
                        </p>
                      ) : null}

                      {/* Código y disponibilidad: lo que necesita quien mira
                          una vitrina de productos para poder pedirlo. */}
                      {(showSku && (it as any).sku) || (showStock && (it as any).disponible !== undefined)
                        || it.promo_etiqueta ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: s(6), marginTop: s(6), alignItems: 'center' }}>
                          {/* La promo va PRIMERA de la fila: es lo que hace que
                              el ojo se detenga en este plato y no en el de al
                              lado. */}
                          {it.promo_etiqueta ? (
                            <span style={{
                              fontSize: s(9.5), padding: s(2) + 'px ' + s(7) + 'px', borderRadius: 99,
                              background: accent, color: '#fff', fontWeight: 800,
                              textTransform: 'uppercase', letterSpacing: '.04em',
                            }}>{it.promo_etiqueta}</span>
                          ) : null}
                          {showSku && (it as any).sku ? (
                            <span style={{
                              fontSize: s(9.5), padding: `${s(2)}px ${s(6)}px`, borderRadius: 4,
                              border: `1px solid ${t.rule}`, color: t.muted,
                              fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.02em',
                            }}>{(it as any).sku}</span>
                          ) : null}
                          {showStock && (it as any).disponible !== undefined ? (
                            <span style={{
                              fontSize: s(9.5), padding: `${s(2)}px ${s(6)}px`, borderRadius: 99,
                              background: (it as any).disponible ? accent : 'transparent',
                              color: (it as any).disponible ? '#fff' : t.muted,
                              border: (it as any).disponible ? 'none' : `1px solid ${t.rule}`,
                              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                            }}>{(it as any).disponible ? 'disponible' : 'sin existencias'}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Alérgenos y dietas: es lo que un cliente necesita
                          resolver sin tener que preguntarle al mesero. */}
                      {showAllergens && (it.allergens || it.diet_tags) ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: s(4), marginTop: s(6) }}>
                          {(it.diet_tags ?? '').split(',').map(x => x.trim()).filter(Boolean).map(tag => (
                            <span key={tag} style={{
                              fontSize: s(9.5), padding: `${s(2)}px ${s(6)}px`, borderRadius: 99,
                              background: accent, color: '#fff', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '.04em',
                            }}>{tag}</span>
                          ))}
                          {(it.allergens ?? '').split(',').map(x => x.trim()).filter(Boolean).map(a => (
                            <span key={a} style={{
                              fontSize: s(9.5), padding: `${s(2)}px ${s(6)}px`, borderRadius: 99,
                              border: `1px solid ${t.rule}`, color: t.muted, fontWeight: 600,
                            }}>contiene {a}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {/* Pie */}
        {(config.note || header.phone || header.address || header.hours || avisoImpuesto) ? (
          <footer style={{
            marginTop: s(32), paddingTop: s(20), borderTop: `1px solid ${t.rule}`,
            textAlign: 'center', color: t.muted, fontSize: s(12), lineHeight: 1.6,
          }}>
            {config.note ? <p style={{ margin: `0 0 ${s(8)}px` }}>{config.note}</p> : null}
            {/* Qué incluye el precio: un precio sin aclarar termina en
                discusión en la caja. */}
            {avisoImpuesto ? (
              <p style={{ margin: `0 0 ${s(8)}px`, fontSize: s(11) }}>{avisoImpuesto}</p>
            ) : null}
            {header.hours ? <p style={{ margin: 0 }}>{header.hours}</p> : null}
            {header.address ? <p style={{ margin: 0 }}>{header.address}</p> : null}
            {header.phone ? <p style={{ margin: 0 }}>{header.phone}</p> : null}
          </footer>
        ) : null}
      </div>

      {/* ── DETALLE DEL PRODUCTO ────────────────────────────────────────
          Va en un portal al body a propósito: en la vista previa del editor
          el menú vive dentro de un teléfono simulado con `overflow` y
          `transform`, y un modal pintado ahí dentro saldría recortado o
          anclado al marco en vez de a la pantalla. Así el negocio prueba el
          mismo modal que verá su cliente. */}
      {detalle ? createPortal(
        <div
          onClick={() => setDetalle(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 0,
          }}>
          {/* Hoja que sube desde abajo: es el gesto que ya conocen del
              teléfono, y deja el pulgar cerca del botón de cerrar. */}
          <div
            role="dialog" aria-modal="true" aria-label={detalle.name}
            onClick={e => e.stopPropagation()}
            style={{
              background: t.page, color: t.ink, fontFamily: t.bodyFont,
              width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto',
              borderRadius: '18px 18px 0 0', position: 'relative',
              boxShadow: '0 -8px 40px rgba(0,0,0,.3)',
            }}>
            <button
              onClick={() => setDetalle(null)}
              aria-label="Cerrar"
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 2,
                width: 34, height: 34, borderRadius: 99, border: 'none',
                background: 'rgba(15,23,42,.55)', color: '#fff',
                fontSize: 18, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
              }}>×</button>

            {/* La foto, en grande y completa. En la fila va recortada a un
                cuadrado de 64px; acá es lo primero que el cliente vino a ver. */}
            {showPhotos && detalle.image_url ? (
              <img src={detalle.image_url} alt=""
                style={{
                  width: '100%', maxHeight: '46vh', objectFit: 'cover',
                  display: 'block', background: t.surface,
                }} />
            ) : null}

            <div style={{ padding: 18 }}>
              <h3 style={{
                fontFamily: t.titleFont, fontSize: 21, fontWeight: 700,
                margin: 0, lineHeight: 1.25,
              }}>{detalle.name}</h3>

              {showPrices ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                  <span style={{
                    fontSize: 24, fontWeight: 800, color: accent,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{money(detalle.price)}</span>
                  {detalle.precio_antes ? (
                    <span style={{
                      fontSize: 15, color: t.muted, textDecoration: 'line-through',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{money(detalle.precio_antes)}</span>
                  ) : null}
                </div>
              ) : null}

              {/* LA PROMO, con sus fechas.
                  Es la razón principal para abrir el detalle: en la fila solo
                  cabe la etiqueta («-10%»), y «hasta cuándo» es justo lo que
                  decide si el cliente viene hoy o lo deja para otro día. */}
              {(() => {
                const pr = detalle.promo_id
                  ? promos.find(x => x.id === detalle.promo_id) ?? null : null;
                if (!detalle.promo_etiqueta && !pr) return null;
                const rango = pr ? rangoPromo(pr.empieza, pr.termina) : '';
                return (
                  <div style={{
                    marginTop: 12, padding: 12, borderRadius: 10,
                    background: t.surface, border: `1px solid ${t.rule}`,
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {detalle.promo_etiqueta ? (
                        <span style={{
                          fontSize: 11, padding: '3px 9px', borderRadius: 99,
                          background: accent, color: '#fff', fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '.04em',
                        }}>{detalle.promo_etiqueta}</span>
                      ) : null}
                      {pr?.nombre ? (
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{pr.nombre}</span>
                      ) : null}
                    </div>
                    {pr?.descripcion ? (
                      <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: t.muted }}>
                        {pr.descripcion}
                      </p>
                    ) : null}
                    {rango ? (
                      <p style={{ margin: '6px 0 0', fontSize: 12.5, fontWeight: 700, color: accent }}>
                        {rango}
                      </p>
                    ) : null}
                  </div>
                );
              })()}

              {detalle.description ? (
                <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.55, color: t.ink }}>
                  {detalle.description}
                </p>
              ) : null}

              {/* Código y existencias: con esto el cliente puede pedirlo por
                  teléfono sin describir el producto. */}
              {(showSku && detalle.sku) || (showStock && detalle.disponible !== undefined) ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
                  {showSku && detalle.sku ? (
                    <span style={{
                      fontSize: 12, padding: '4px 8px', borderRadius: 5,
                      border: `1px solid ${t.rule}`, color: t.muted,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                    }}>{detalle.sku}</span>
                  ) : null}
                  {showStock && detalle.disponible !== undefined ? (
                    <span style={{
                      fontSize: 11.5, padding: '4px 9px', borderRadius: 99,
                      background: detalle.disponible ? accent : 'transparent',
                      color: detalle.disponible ? '#fff' : t.muted,
                      border: detalle.disponible ? 'none' : `1px solid ${t.rule}`,
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                    }}>{detalle.disponible ? 'disponible' : 'sin existencias'}</span>
                  ) : null}
                </div>
              ) : null}

              {showAllergens && (detalle.allergens || detalle.diet_tags) ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {String(detalle.diet_tags ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).map((tag: string) => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 99,
                      background: accent, color: '#fff', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '.04em',
                    }}>{tag}</span>
                  ))}
                  {String(detalle.allergens ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).map((a: string) => (
                    <span key={a} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 99,
                      border: `1px solid ${t.rule}`, color: t.muted, fontWeight: 600,
                    }}>contiene {a}</span>
                  ))}
                </div>
              ) : null}

              {/* El teléfono del negocio, acá mismo. El cliente que abrió un
                  producto es el que está a un paso de preguntar por él, y
                  mandarlo a buscar el número al pie de la carta es perderlo. */}
              {header.phone ? (
                <a href={`tel:${String(header.phone).replace(/[^\d+]/g, '')}`}
                  style={{
                    display: 'block', marginTop: 18, textAlign: 'center',
                    background: accent, color: '#fff', textDecoration: 'none',
                    fontWeight: 700, fontSize: 15, padding: '12px 16px', borderRadius: 10,
                  }}>
                  Consultar por este producto
                </a>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default MenuRender;
