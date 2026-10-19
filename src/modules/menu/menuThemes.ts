/**
 * Diseños del menú digital.
 *
 * Cada tema es una decisión completa —fondo, tipografía, cómo se separan los
 * platos— y no una paleta suelta. Un menú de una marisquería y uno de una
 * cafetería de especialidad no se distinguen por el color del botón: se
 * distinguen por el aire entre las líneas y por si el precio va pegado al plato
 * o al final de una guía de puntos.
 *
 * El color de acento SÍ lo elige el negocio (es su marca), así que va aparte y
 * cada tema lo aplica donde tiene sentido.
 */

export type ThemeId = string;

/** Familias tipográficas disponibles sin cargar fuentes externas.
 *
 *  La página del menú la abre un desconocido desde su teléfono, muchas veces con
 *  mala señal: una tipografía descargada agrega medio segundo de texto invisible
 *  o, peor, cae en una fuente distinta y descuadra el diseño. Estas pilas usan lo
 *  que ya está en el aparato, así que la carta se ve igual siempre. */
const SERIF_CLASICA = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SERIF_LIBRO   = 'Georgia, "Times New Roman", serif';
const SERIF_TITULAR = '"Baskerville", "Hoefler Text", Garamond, Georgia, serif';
const SANS_NEUTRA   = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SANS_ANCHA    = '"Avenir Next", "Segoe UI", "Trebuchet MS", system-ui, sans-serif';
const SANS_CONDENSA = '"Helvetica Neue", "Arial Narrow", Helvetica, sans-serif';
const MONO          = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface MenuTheme {
  id: ThemeId;
  label: string;
  /** Familia de local, para agrupar la elección. */
  group: ThemeGroup;
  /** Qué tipo de local le queda, para que la elección no sea a ciegas. */
  hint: string;
  page: string;        // fondo de la página
  surface: string;     // tarjetas / bloques
  ink: string;         // texto principal
  muted: string;       // texto secundario
  rule: string;        // líneas divisorias
  titleFont: string;
  bodyFont: string;
  /** Precio pegado al plato, o al final de una guía de puntos (carta clásica). */
  priceStyle: 'inline' | 'leader';
  /** Cómo se presenta el plato con foto. */
  layout: 'list' | 'cards';
  /** Títulos de sección en mayúsculas (marca la personalidad más que el color). */
  titleTransform?: 'uppercase' | 'none';
  /** Espaciado entre letras del título de sección. */
  titleSpacing?: string;
  /** Línea bajo el título de sección, estilo carta impresa. */
  sectionRule?: boolean;
}

/**
 * Catálogo de diseños.
 *
 * Agrupados por el tipo de local, no por color, porque así es como el negocio
 * elige: primero «soy una soda» y después «esta me gusta más». Ordenar 24 temas
 * por tono dejaría al dueño de la marisquería revisando paletas de cafetería.
 */
export type ThemeGroup = 'formal' | 'casual' | 'noche' | 'cafe' | 'audaz';

export const GROUP_LABELS: Record<ThemeGroup, string> = {
  formal: 'Restaurante formal',
  casual: 'Casual y familiar',
  noche:  'Bar y noche',
  cafe:   'Café y repostería',
  audaz:  'Con personalidad',
};

const T = (
  id: string, label: string, group: ThemeGroup, hint: string,
  page: string, surface: string, ink: string, muted: string, rule: string,
  titleFont: string, bodyFont: string,
  priceStyle: 'inline' | 'leader', layout: 'list' | 'cards',
  extra: Partial<MenuTheme> = {},
): MenuTheme => ({
  id, label, group, hint, page, surface, ink, muted, rule,
  titleFont, bodyFont, priceStyle, layout, ...extra,
});

export const MENU_THEMES: Record<ThemeId, MenuTheme> = Object.fromEntries([
  // ── Restaurante formal ──────────────────────────────────────────────────
  T('clasico', 'Clásico', 'formal', 'Carta impresa de toda la vida',
    '#FBF9F4', '#FFFFFF', '#1F1A14', '#7A6E5F', '#E4DCCC', SERIF_CLASICA, SERIF_LIBRO, 'leader', 'list'),
  T('marfil', 'Marfil', 'formal', 'Cocina de autor, mantel largo',
    '#F7F4EE', '#FFFFFF', '#2A2620', '#857C6E', '#E2DBCC', SERIF_TITULAR, SERIF_LIBRO, 'leader', 'list',
    { titleTransform: 'uppercase', titleSpacing: '.12em' }),
  T('linea', 'Línea', 'formal', 'Minimalista, todo el peso en el texto',
    '#FFFFFF', '#FFFFFF', '#16161A', '#77777E', '#E6E6EA', SERIF_TITULAR, SANS_NEUTRA, 'leader', 'list',
    { sectionRule: true }),
  T('verde-salvia', 'Salvia', 'formal', 'Cocina de mercado, producto fresco',
    '#F2F5F0', '#FFFFFF', '#1E2A20', '#6E7D70', '#D8E2D6', SERIF_CLASICA, SANS_NEUTRA, 'leader', 'list'),
  T('borgona', 'Borgoña', 'formal', 'Parrilla fina, carta de vinos',
    '#FAF6F4', '#FFFFFF', '#2B1416', '#8A6A6C', '#E7D8D6', SERIF_TITULAR, SERIF_LIBRO, 'leader', 'list'),

  // ── Casual y familiar ───────────────────────────────────────────────────
  T('moderno', 'Moderno', 'casual', 'Comida rápida de marca, brunch',
    '#F5F6F8', '#FFFFFF', '#111827', '#6B7280', '#E5E7EB', SANS_NEUTRA, SANS_NEUTRA, 'inline', 'cards'),
  T('rustico', 'Rústico', 'casual', 'Soda, parrilla, cocina casera',
    '#F6F1E7', '#FFFDF8', '#2C231A', '#8A7660', '#DCCDB4', SERIF_CLASICA, SANS_NEUTRA, 'leader', 'list'),
  T('tropical', 'Tropical', 'casual', 'Marisquería, playa, comida costera',
    '#F0F8F9', '#FFFFFF', '#0C2F35', '#5C8189', '#CFE6E9', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),
  T('mercado', 'Mercado', 'casual', 'Comida al paso, feria, food truck',
    '#FFF9EC', '#FFFFFF', '#2E2312', '#8B7645', '#EFE0BE', SANS_CONDENSA, SANS_NEUTRA, 'inline', 'cards',
    { titleTransform: 'uppercase', titleSpacing: '.06em' }),
  T('ladrillo', 'Ladrillo', 'casual', 'Pizzería, cantina de barrio',
    '#FBF3EE', '#FFFFFF', '#33201A', '#8E6B5C', '#E9D5CA', SERIF_CLASICA, SANS_NEUTRA, 'leader', 'list'),
  T('huerta', 'Huerta', 'casual', 'Vegetariano, ensaladas, saludable',
    '#F4F8EF', '#FFFFFF', '#1F2A16', '#6F8060', '#DCE7CF', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),
  T('cielo', 'Cielo', 'casual', 'Comida ligera, jugos, desayunos',
    '#F2F7FC', '#FFFFFF', '#132434', '#607A90', '#D5E4F0', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),

  // ── Bar y noche ─────────────────────────────────────────────────────────
  T('oscuro', 'Oscuro', 'noche', 'Bar, cocktelería, cena de noche',
    '#12100E', '#1C1917', '#F5F1EB', '#A8A29E', '#2E2A26', SERIF_CLASICA, SANS_NEUTRA, 'inline', 'list'),
  T('medianoche', 'Medianoche', 'noche', 'Coctelería de autor',
    '#0B1017', '#141B25', '#E8EEF6', '#8C9AAC', '#212C3A', SERIF_TITULAR, SANS_NEUTRA, 'leader', 'list',
    { titleTransform: 'uppercase', titleSpacing: '.14em' }),
  T('carbon', 'Carbón', 'noche', 'Grill nocturno, ahumados',
    '#141414', '#1E1E1E', '#EFEFEF', '#9A9A9A', '#2C2C2C', SANS_CONDENSA, SANS_NEUTRA, 'inline', 'list',
    { titleTransform: 'uppercase', titleSpacing: '.08em' }),
  T('vino-noche', 'Vino', 'noche', 'Wine bar, tapas',
    '#170D10', '#201418', '#F3E8EC', '#A98894', '#33202A', SERIF_TITULAR, SERIF_LIBRO, 'leader', 'list'),
  T('esmeralda', 'Esmeralda', 'noche', 'Lounge, terraza de noche',
    '#0C1714', '#122019', '#E6F1EB', '#7E9C90', '#1E3029', SERIF_CLASICA, SANS_NEUTRA, 'leader', 'list'),
  T('neon', 'Neón', 'noche', 'Bar juvenil, karaoke, after office',
    '#0F0B1A', '#171128', '#F0EBFF', '#9C8FC4', '#251C3D', SANS_CONDENSA, SANS_NEUTRA, 'inline', 'cards',
    { titleTransform: 'uppercase', titleSpacing: '.1em' }),

  // ── Café y repostería ───────────────────────────────────────────────────
  T('cafe-tostado', 'Tostado', 'cafe', 'Cafetería de especialidad',
    '#F8F3EC', '#FFFFFF', '#2B1F17', '#8A7360', '#E5D8C8', SERIF_CLASICA, SANS_NEUTRA, 'leader', 'list'),
  T('pastel', 'Pastel', 'cafe', 'Repostería, heladería',
    '#FDF4F6', '#FFFFFF', '#33222A', '#967984', '#F0DCE4', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),
  T('matcha', 'Matcha', 'cafe', 'Té, bubble tea, postres asiáticos',
    '#F3F7EF', '#FFFFFF', '#20291B', '#728069', '#DCE6D2', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),
  T('panaderia', 'Panadería', 'cafe', 'Pan artesanal, bollería',
    '#FCF6E9', '#FFFFFF', '#3A2A14', '#947C51', '#EDDCBC', SERIF_CLASICA, SERIF_LIBRO, 'leader', 'list'),

  // ── Con personalidad ────────────────────────────────────────────────────
  T('pizarra', 'Pizarra', 'audaz', 'Menú del día escrito a mano',
    '#22262A', '#2A2F34', '#F2F4F5', '#9BA6AE', '#383E45', SERIF_TITULAR, MONO, 'leader', 'list',
    { titleTransform: 'uppercase', titleSpacing: '.1em' }),
  T('ticket', 'Ticket', 'audaz', 'Estética de comanda, comida callejera',
    '#FAFAF7', '#FFFFFF', '#1A1A1A', '#767672', '#DEDEDA', MONO, MONO, 'leader', 'list',
    { titleTransform: 'uppercase', titleSpacing: '.08em', sectionRule: true }),
  T('prensa', 'Prensa', 'audaz', 'Aire de periódico, carta larga',
    '#F7F5F0', '#FFFFFF', '#181818', '#6E6C66', '#DAD7CE', SERIF_TITULAR, SERIF_LIBRO, 'leader', 'list',
    { sectionRule: true, titleTransform: 'uppercase', titleSpacing: '.16em' }),
  T('cobre', 'Cobre', 'audaz', 'Ahumados, whisky, carnes maduradas',
    '#1A1512', '#241D18', '#F4EBE2', '#A99483', '#372C24', SERIF_TITULAR, SANS_NEUTRA, 'leader', 'list'),
  T('arena', 'Arena', 'audaz', 'Cocina árabe, mediterránea',
    '#FAF5EA', '#FFFFFF', '#2E2617', '#8D8064', '#E6DBC2', SERIF_CLASICA, SANS_ANCHA, 'leader', 'list'),
  T('indigo', 'Índigo', 'audaz', 'Cocina asiática, ramen, sushi',
    '#F4F5FA', '#FFFFFF', '#161A2E', '#6B7192', '#DCDFEC', SANS_ANCHA, SANS_NEUTRA, 'inline', 'cards'),
].map(t => [t.id, t])) as Record<ThemeId, MenuTheme>;

export const THEME_LIST = Object.values(MENU_THEMES);

/** Temas por grupo, en el orden en que se declararon. */
export const THEMES_BY_GROUP = (Object.keys(GROUP_LABELS) as ThemeGroup[])
  .map(g => ({ group: g, label: GROUP_LABELS[g], themes: THEME_LIST.filter(t => t.group === g) }))
  .filter(x => x.themes.length > 0);

/** Tema por id, con el clásico como red de seguridad. */
export const themeOf = (id?: string | null): MenuTheme =>
  MENU_THEMES[(id as ThemeId)] ?? MENU_THEMES.clasico;

// ── Tipos compartidos entre el editor y la página pública ──────────────────

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  allergens?: string | null;
  diet_tags?: string | null;
  /** Código del producto (solo catálogo). Entra en la búsqueda. */
  sku?: string | null;
  /** Hay existencias (solo catálogo). */
  disponible?: boolean;
  /** Promo vigente que le toca a este ítem, resuelta por el servidor. */
  promo_id?: string | null;
  promo_etiqueta?: string | null;
  /** El precio de antes, solo si la promo lo bajó. Se muestra tachado. */
  precio_antes?: number | null;
}

/**
 * Una promoción como la ve el cliente.
 *
 * La arma el servidor a partir del módulo de promociones: acá no se calcula
 * nada. Si la vitrina dijera un descuento y la caja otro, la discusión es en el
 * mostrador y la pierde el negocio.
 */
export interface MenuPromo {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  /** «20% desc.», «2×1», «Combo ¢5.000»… el mismo texto que usa el POS. */
  etiqueta: string;
  /** Primer día (YYYY-MM-DD). */
  empieza?: string | null;
  /** Último día, o null si es permanente. */
  termina?: string | null;
  /** Los ítems publicados que alcanza. */
  item_ids: string[];
}

export interface MenuSection {
  id: string;
  title: string;
  note?: string | null;
  items: MenuItem[];
}

export interface MenuHeader {
  name?: string; tagline?: string; logo_url?: string; cover_url?: string;
  phone?: string; address?: string; hours?: string;
}

export interface MenuConfig {
  accent?: string;
  show_photos?: boolean;
  show_allergens?: boolean;
  show_prices?: boolean;
  /** Portada diseñada a mano (ver `lienzo.ts`). Sin ella, manda el tema. */
  lienzo?: import('./lienzo').Lienzo;
  /** Publicar el precio CON el impuesto incluido (por omisión, sí). */
  precios_con_iva?: boolean;
  /** Lo resuelve el servidor: true con IVA, false sin IVA, null si no cobra. */
  impuesto_incluido?: boolean | null;
  note?: string;
}

/**
 * «Del 10 al 16 de octubre» — el rango de una promoción, como se dice.
 *
 * Repetir el mes cuando es el mismo («del 10 de octubre al 16 de octubre»)
 * hace que nadie lo lea entero, y es justo el dato que decide si el cliente
 * viene hoy o la semana que viene. El año solo aparece si no es el actual: en
 * un cartel de oferta, «2026» es ruido.
 */
export const rangoPromo = (empieza?: string | null, termina?: string | null): string | null => {
  const dia = (iso: string) => new Date(iso + 'T12:00:00');
  const anioActual = new Date().getFullYear();
  const conAnio = (d: Date) => (d.getFullYear() !== anioActual ? ` de ${d.getFullYear()}` : '');
  const nombreMes = (d: Date) => d.toLocaleDateString('es-CR', { month: 'long' });

  // HOY en hora de Costa Rica: a las 7 de la noche de acá ya es el día
  // siguiente en UTC, y «último día» se adelantaría media tarde.
  const hoyCR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  if (empieza && termina) {
    const a = dia(empieza), b = dia(termina);
    // Un solo día: «Del 16 al 16 de octubre» se lee como un error.
    if (empieza === termina) {
      return empieza === hoyCR
        ? `Solo hoy, ${a.getDate()} de ${nombreMes(a)}${conAnio(a)}`
        : `Solo el ${a.getDate()} de ${nombreMes(a)}${conAnio(a)}`;
    }
    // Que hoy sea el último día es LA razón por la que alguien viene hoy y no
    // la semana que viene. Decirlo es más útil que la fecha sola.
    const cierre = termina === hoyCR ? ' · último día' : '';
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return `Del ${a.getDate()} al ${b.getDate()} de ${nombreMes(b)}${conAnio(b)}${cierre}`;
    }
    return `Del ${a.getDate()} de ${nombreMes(a)}${conAnio(a)} al ${b.getDate()} de ${nombreMes(b)}${conAnio(b)}${cierre}`;
  }
  // Sin fecha de fin es una promo permanente: decir «desde» y nada más deja
  // la duda de hasta cuándo, que es lo que el cliente quiere saber.
  if (empieza) {
    const a = dia(empieza);
    return `Desde el ${a.getDate()} de ${nombreMes(a)}${conAnio(a)}, sin fecha de fin`;
  }
  if (termina) {
    const b = dia(termina);
    return termina === hoyCR
      ? `Último día: hoy, ${b.getDate()} de ${nombreMes(b)}`
      : `Hasta el ${b.getDate()} de ${nombreMes(b)}${conAnio(b)}`;
  }
  return null;
};

/**
 * El precio, como se escribe un precio en Costa Rica.
 *
 * Los miles se separan a mano. `toLocaleString('es-CR')` devuelve un espacio
 * fino —«₡1 800»— según la tabla CLDR del navegador, y en el teléfono de un
 * cliente eso se lee como dos números pegados o como un precio mal pintado.
 * Con punto es como lo escribe el negocio en su rótulo y en la factura.
 */
export const money = (n: number) =>
  `₡${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
