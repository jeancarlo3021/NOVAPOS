'use client';

import React from 'react';
import { themeOf, money, type MenuSection, type MenuHeader, type MenuConfig } from './menuThemes';
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
  /** En la vista previa el tipo se achica para que quepa en el teléfono simulado. */
  compact?: boolean;
}

export const MenuRender: React.FC<Props> = ({ theme, header, config, sections, compact = false }) => {
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

        {/* Secciones */}
        {sections.length === 0 ? (
          <p style={{ textAlign: 'center', color: t.muted, fontSize: s(13), padding: `${s(40)}px 0` }}>
            {showSku || showStock ? 'Todavía no hay productos en el catálogo.' : 'Todavía no hay platos en el menú.'}
          </p>
        ) : sections.map(sec => (
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
                            fontSize: s(14), fontWeight: 700, whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums', color: accent,
                          }}>
                            {money(it.price)}
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
                      {(showSku && (it as any).sku) || (showStock && (it as any).disponible !== undefined) ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: s(6), marginTop: s(6), alignItems: 'center' }}>
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
