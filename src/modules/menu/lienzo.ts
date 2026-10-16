/**
 * EL LIENZO: la portada del menú o del catálogo, diseñada a mano.
 *
 * Los temas (clásico, esmeralda, rústico) resuelven el caso común, pero no
 * dejan poner la marca del negocio donde el dueño la quiere. Esto sí: se
 * arrastran textos, el logo, imágenes y bandas de color sobre una portada, y
 * eso es lo que ve el cliente al escanear el QR.
 *
 * ── La decisión que lo hace funcionar ─────────────────────────────────────
 * Se diseña sobre un ANCHO FIJO de teléfono (390 px) y al mostrarlo se escala
 * al ancho real de la pantalla. Así el diseño se ve IDÉNTICO en cualquier
 * teléfono: lo que se acomodó en el editor es exactamente lo que llega. Si
 * las posiciones fueran relativas al ancho real, un teléfono angosto
 * amontonaría los textos y uno ancho los dejaría flotando, y el dueño
 * descubriría el desastre con el QR ya pegado en las mesas.
 *
 * Y el lienzo es SOLO la portada: la lista de platos fluye debajo, como
 * siempre. Un menú de cuarenta platos no se puede acomodar a mano, y meterlo
 * en posiciones fijas significaría recortarlo o montar los textos unos sobre
 * otros en cuanto alguien agregue un plato.
 */

/** Ancho de diseño, en píxeles. Un teléfono típico. */
export const ANCHO_LIENZO = 390;

export type TipoElemento = 'texto' | 'logo' | 'imagen' | 'banda';

export interface ElementoLienzo {
  id: string;
  tipo: TipoElemento;
  /** Posición y tamaño, en unidades de diseño (390 de ancho). */
  x: number;
  y: number;
  w: number;
  h?: number;
  // ── texto ──
  texto?: string;
  tam?: number;                 // tamaño de letra
  color?: string;
  fuente?: 'titulo' | 'cuerpo';  // las del tema elegido
  negrita?: boolean;
  alineacion?: 'left' | 'center' | 'right';
  interlineado?: number;
  // ── logo / imagen ──
  url?: string;
  redondo?: boolean;
  ajuste?: 'cover' | 'contain';
  // ── banda ──
  radio?: number;
  opacidad?: number;
}

export interface Lienzo {
  /** Alto de la portada, en unidades de diseño. */
  alto: number;
  /** Color de fondo de la portada (vacío = el del tema). */
  fondo?: string;
  /** Imagen de fondo, a pantalla completa de la portada. */
  fondoUrl?: string;
  /** Oscurecido sobre la imagen, para que el texto se lea (0 a 1). */
  velo?: number;
  elementos: ElementoLienzo[];
}

export const nuevoId = () => `e${Math.random().toString(36).slice(2, 9)}`;

/**
 * Portada de arranque: la misma información que muestra el tema, pero ya
 * puesta en el lienzo para poder moverla.
 *
 * Arrancar de un lienzo vacío es la forma más segura de que nadie lo termine:
 * el dueño abre, ve una hoja en blanco y se va.
 */
export function lienzoInicial(nombre: string, lema: string, acento: string, hayLogo: boolean): Lienzo {
  const elementos: ElementoLienzo[] = [];
  let y = hayLogo ? 28 : 46;
  if (hayLogo) {
    elementos.push({ id: nuevoId(), tipo: 'logo', x: 155, y: 24, w: 80, h: 80, redondo: true, ajuste: 'cover' });
    y = 120;
  }
  elementos.push({
    id: nuevoId(), tipo: 'texto', x: 20, y, w: 350,
    texto: nombre || 'Nuestro menú', tam: 30, fuente: 'titulo',
    color: '#111827', alineacion: 'center', negrita: true, interlineado: 1.15,
  });
  elementos.push({
    id: nuevoId(), tipo: 'banda', x: 171, y: y + 44, w: 48, h: 3,
    color: acento || '#0F766E', radio: 2,
  });
  if (lema) {
    elementos.push({
      id: nuevoId(), tipo: 'texto', x: 30, y: y + 58, w: 330,
      texto: lema, tam: 13, fuente: 'cuerpo', color: '#6b7280',
      alineacion: 'center', interlineado: 1.4,
    });
  }
  return { alto: hayLogo ? 230 : 180, elementos };
}
