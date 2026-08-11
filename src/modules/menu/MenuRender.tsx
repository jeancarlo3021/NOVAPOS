'use client';

import React from 'react';
import { themeOf, money, type MenuSection, type MenuHeader, type MenuConfig } from './menuThemes';

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
  const s = (n: number) => (compact ? n * 0.82 : n);

  return (
    <div style={{ background: t.page, color: t.ink, fontFamily: t.bodyFont, minHeight: '100%' }}>

      {/* Portada */}
      {header.cover_url ? (
        <div style={{ height: s(150), overflow: 'hidden', position: 'relative' }}>
          <img src={header.cover_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.55), transparent 60%)' }} />
        </div>
      ) : null}

      <div style={{ padding: `${s(24)}px ${s(20)}px ${s(40)}px`, maxWidth: 680, margin: '0 auto' }}>

        {/* Identidad */}
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

        {/* Secciones */}
        {sections.length === 0 ? (
          <p style={{ textAlign: 'center', color: t.muted, fontSize: s(13), padding: `${s(40)}px 0` }}>
            Todavía no hay platos en el menú.
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
        {(config.note || header.phone || header.address || header.hours) ? (
          <footer style={{
            marginTop: s(32), paddingTop: s(20), borderTop: `1px solid ${t.rule}`,
            textAlign: 'center', color: t.muted, fontSize: s(12), lineHeight: 1.6,
          }}>
            {config.note ? <p style={{ margin: `0 0 ${s(8)}px` }}>{config.note}</p> : null}
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
