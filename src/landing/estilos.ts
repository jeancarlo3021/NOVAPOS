/**
 * EL SISTEMA VISUAL DE LA PÁGINA PÚBLICA.
 *
 * Vive aparte de la página por un motivo práctico: la página se edita desde
 * el panel —textos, precios, imágenes— y la apariencia no. Mezclarlos hacía
 * que cada ajuste de color fuera buscarlo entre doscientas líneas de JSX.
 *
 * Nada de Tailwind ni librerías de componentes: son estilos en línea sobre
 * estos valores. La página pesa 238 kB y la mitad de eso es React; sumarle un
 * framework de estilos para quince pantallas de contenido sería pagarlo con
 * el tiempo de carga del visitante, que es a quien hay que convencer.
 */

/**
 * LA PALETA SALE DEL LOGO, no de un gusto.
 *
 * `public/favicon.svg` es un cuadrado azul oscuro (#111926) con una marca
 * verde menta (#50b589). La página venía con un verde azulado genérico que no
 * era de nadie: puesta al lado del logo, se veían como dos marcas distintas.
 *
 * El menta se usa de ACENTO, no para botones con texto encima: #50b589 con
 * blanco da un contraste de 2,3:1 y no se lee. Para lo que lleva texto va una
 * versión oscurecida del mismo verde (4,9:1, cumple AA), que es el mismo tono
 * pero legible.
 */
export const C = {
  /** Acciones y texto sobre claro. Verde de marca, oscurecido para que se lea. */
  marca: '#1A7F5A',
  marcaOscuro: '#13603F',
  /** El menta del logo. Acentos, no fondos con texto encima. */
  marcaViva: '#50B589',
  marcaSuave: '#E8F5EE',
  /** El azul oscuro del logo. Titulares y pie. */
  tinta: '#111926',
  texto: '#44505F',
  suave: '#78848F',
  linea: '#E4E9ED',
  fondo: '#FFFFFF',
  fondoAlt: '#F6F9F8',
  blanco: '#FFFFFF',
} as const;

/**
 * ESCALA TIPOGRÁFICA fluida.
 *
 * Con `clamp` el texto se adapta al ancho sin saltos: un titular que en el
 * teléfono se ve enorme y en el monitor se ve chico es el error más común de
 * una página hecha con tamaños fijos.
 */
export const T = {
  h1: 'clamp(2rem, 1.3rem + 3.2vw, 3.4rem)',
  h2: 'clamp(1.45rem, 1.1rem + 1.6vw, 2.1rem)',
  h3: '1.0625rem',
  cuerpoGrande: 'clamp(1rem, 0.95rem + 0.4vw, 1.18rem)',
  cuerpo: '0.9375rem',
  chico: '0.8125rem',
  mini: '0.6875rem',
} as const;

/**
 * RITMO VERTICAL.
 *
 * Todos los espacios salen de esta escala. Cuando cada sección elige su
 * propio margen «a ojo», el conjunto se ve desordenado aunque cada pieza por
 * separado se vea bien.
 */
export const E = {
  xs: 6, sm: 10, md: 16, lg: 24, xl: 36, xxl: 56, xxxl: 84,
} as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Sombras suaves. Una sola dirección de luz, desde arriba. */
export const S = {
  tarjeta: '0 1px 2px rgba(16,33,29,.04), 0 8px 24px -12px rgba(16,33,29,.10)',
  elevada: '0 2px 4px rgba(16,33,29,.05), 0 18px 40px -16px rgba(16,33,29,.18)',
} as const;

/**
 * DOS FUENTES: una para titulares, otra para leer.
 *
 * Los titulares llevan una fuente con carácter —Fraunces, con serifas
 * suaves— y el resto queda en la del sistema. Un titular en la misma fuente
 * que el cuerpo se ve prolijo y no se ve de nadie: en una página que compite
 * con otras cinco pestañas, parecerse a todas es el peor resultado.
 *
 * Solo se descarga la fuente de TITULARES, y con `display=swap`: el texto se
 * ve al instante con la del sistema y se reemplaza cuando llega. Si no llega
 * —conexión mala, Google bloqueado— la página se lee igual. Cargar también la
 * del cuerpo serían 80 kB más por una diferencia que casi nadie nota.
 */
export const FUENTE =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const FUENTE_TITULO =
  "'Fraunces', Georgia, 'Times New Roman', serif";

/** El <link> va en el HTML; esto es para inyectarlo desde el componente. */
export const FUENTE_URL =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap';

/** El ancho de lectura. Más de ~68 caracteres por línea cansa. */
export const ANCHO = 1120;
export const ANCHO_TEXTO = 620;
