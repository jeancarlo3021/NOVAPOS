// Fuentes para las etiquetas.
//  · Fuentes del sistema: imprimen siempre, sin internet.
//  · Google Fonts: se cargan por CSS para la vista previa y se INCRUSTAN en
//    base64 al imprimir (así QZ/etiquetadora las renderiza aunque no tenga la
//    fuente instalada). El listado usa la API de Google Fonts (CSS), sin key.

export interface LabelFont {
  name: string;          // etiqueta visible
  css: string;           // valor CSS de font-family
  google?: boolean;      // true → cargar desde Google Fonts
}

export const SYSTEM_FONTS: LabelFont[] = [
  { name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { name: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { name: 'Courier (monoespaciada)', css: '"Courier New", Courier, monospace' },
  { name: 'Georgia', css: 'Georgia, serif' },
  { name: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { name: 'Tahoma', css: 'Tahoma, sans-serif' },
];

// Curadas de Google Fonts (nombres exactos de la familia).
export const GOOGLE_FONTS: LabelFont[] = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Oswald',
  'Raleway', 'Bebas Neue', 'Anton', 'Roboto Condensed', 'Roboto Mono',
  'Nunito', 'Inter', 'Barlow', 'Archivo', 'Fjalla One', 'Teko',
  'Pacifico', 'Lobster', 'Caveat', 'Permanent Marker', 'Righteous',
].map(name => ({ name, css: `'${name}', sans-serif`, google: true }));

export const ALL_FONTS: LabelFont[] = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

export const DEFAULT_FONT_CSS = SYSTEM_FONTS[0].css;

/** ¿La familia CSS corresponde a una Google Font? Devuelve el nombre si sí. */
export function googleFamilyOf(css?: string): string | null {
  if (!css) return null;
  const f = GOOGLE_FONTS.find(g => g.css === css);
  return f ? f.name : null;
}

// ── Vista previa: inyecta el <link> de Google Fonts una sola vez por familia ──
const loadedPreview = new Set<string>();
export function ensureFontLoaded(css?: string): void {
  const family = googleFamilyOf(css);
  if (!family || loadedPreview.has(family) || typeof document === 'undefined') return;
  loadedPreview.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ── Impresión: incrustar la fuente en base64 (cacheado en localStorage) ──────
function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(bin);
}

const FONT_CACHE = (family: string) => `label_font_face_${family}`;

/** Devuelve el CSS @font-face (con base64) de una Google Font. Cachea el resultado. */
async function fontFaceCssFor(family: string): Promise<string> {
  const cacheKey = FONT_CACHE(family);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  let css = await (await fetch(cssUrl)).text();

  // Reemplazar cada url(...) por su data URI base64.
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m => m[1]);
  for (const u of urls) {
    try {
      const buf = await (await fetch(u)).arrayBuffer();
      const fmt = u.endsWith('.woff2') ? 'woff2' : u.endsWith('.woff') ? 'woff' : u.endsWith('.ttf') ? 'truetype' : 'woff2';
      css = css.replace(u, `data:font/${fmt === 'truetype' ? 'ttf' : fmt};base64,${abToBase64(buf)}`);
    } catch { /* si una variante falla, seguimos con las demás */ }
  }
  try { localStorage.setItem(cacheKey, css); } catch { /* cuota llena: no cacheamos */ }
  return css;
}

/** CSS @font-face combinado para todas las Google Fonts usadas (para <style> al imprimir). */
export async function buildFontFaceCss(cssFamilies: (string | undefined)[]): Promise<string> {
  const families = Array.from(new Set(cssFamilies.map(googleFamilyOf).filter(Boolean) as string[]));
  if (!families.length) return '';
  const parts = await Promise.all(families.map(f => fontFaceCssFor(f).catch(() => '')));
  return parts.join('\n');
}
