'use client';

import React, { useMemo, useState } from 'react';
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
                  <article key={it.id} style={{
                    display: 'flex', gap: s(12), alignItems: 'flex-start',
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
    </div>
  );
};

export default MenuRender;
