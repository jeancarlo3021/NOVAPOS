/**
 * PANTALLA DEL CLIENTE: el segundo monitor de la caja.
 *
 * Es otra ventana del mismo navegador, abierta en la pantalla que mira el
 * cliente. La caja le manda lo que va pasando y ella solo muestra: productos,
 * total, descuentos y el vuelto.
 *
 * Se comunica por BroadcastChannel, que es LOCAL al navegador: no pasa por
 * internet, así que sigue funcionando con la red caída —justo cuando el POS
 * trabaja sin conexión— y no hay datos del negocio viajando a ningún servidor.
 */

export interface LineaPantalla {
  nombre: string;
  cantidad: number;
  /** Precio unitario tal como se le cobra (con impuesto si así está configurado). */
  precio: number;
  total: number;
}

export type MensajePantalla =
  | { tipo: 'espera' }
  | {
      tipo: 'venta';
      lineas: LineaPantalla[];
      subtotal: number;
      descuento: number;
      impuesto: number;
      total: number;
      cliente?: string | null;
    }
  | {
      tipo: 'cobrado';
      total: number;
      recibido?: number | null;
      vuelto?: number | null;
      metodo?: string | null;
      numero?: string | null;
    }
  /** La caja avisa que sigue viva; si deja de llegar, la pantalla vuelve a espera. */
  | { tipo: 'latido' };

const CANAL = 'novapos_pantalla_cliente';
/** Última foto de la venta, para que la pantalla recién abierta no arranque vacía. */
const ULTIMO = 'novapos_pantalla_cliente_ultimo';

let canal: BroadcastChannel | null = null;
function elCanal(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!canal) canal = new BroadcastChannel(CANAL);
  return canal;
}

/** La caja publica un cambio. Si el navegador no soporta el canal, no pasa nada. */
export function publicarEnPantalla(msg: MensajePantalla): void {
  try {
    elCanal()?.postMessage(msg);
    if (msg.tipo !== 'latido') sessionStorage.setItem(ULTIMO, JSON.stringify(msg));
  } catch { /* sin canal: la pantalla del cliente simplemente no se actualiza */ }
}

/** La pantalla del cliente escucha. Devuelve la función para dejar de escuchar. */
export function escucharPantalla(onMensaje: (m: MensajePantalla) => void): () => void {
  const c = elCanal();
  if (!c) return () => {};
  const h = (e: MessageEvent) => { if (e.data?.tipo) onMensaje(e.data as MensajePantalla); };
  c.addEventListener('message', h);
  return () => c.removeEventListener('message', h);
}

/** Lo último que mostró la caja, para abrir la pantalla ya con la venta en curso. */
export function ultimoMensaje(): MensajePantalla | null {
  try {
    const raw = sessionStorage.getItem(ULTIMO);
    return raw ? JSON.parse(raw) as MensajePantalla : null;
  } catch { return null; }
}

/** ¿Ya hay una ventana de pantalla del cliente abierta desde esta caja? */
let ventana: Window | null = null;
export function pantallaAbierta(): boolean {
  return !!ventana && !ventana.closed;
}

export interface ResultadoApertura {
  ok: boolean;
  /** Quedó en el segundo monitor por sí sola. */
  automatico: boolean;
  /** Qué contar al cajero cuando no se pudo hacer sola. */
  motivo?: string;
}

/**
 * Abre la pantalla del cliente, de ser posible EN EL SEGUNDO MONITOR.
 *
 * El navegador no elige monitor por su cuenta: hay que pedirle permiso para
 * administrar ventanas en todas las pantallas (Chrome y Edge lo tienen; se
 * acepta una sola vez). Con ese permiso la ventana se abre directo en la
 * pantalla del cliente y en pantalla completa.
 *
 * Si no hay permiso, o hay un solo monitor, o el navegador no lo soporta, se
 * abre igual como ventana normal y se dice qué hacer: arrastrarla al otro
 * monitor y poner F11. Nunca se queda sin abrir por no poder hacerlo solo.
 */
export async function abrirPantallaCliente(): Promise<ResultadoApertura> {
  if (pantallaAbierta()) { ventana?.focus(); return { ok: true, automatico: true }; }

  const url = `${window.location.origin}/pantalla-cliente`;
  const api: any = window as any;

  // ── Camino automático: API de administración de ventanas ──
  if (typeof api.getScreenDetails === 'function') {
    try {
      const detalles = await api.getScreenDetails();
      const otras = (detalles.screens ?? []).filter((s: any) => s !== detalles.currentScreen);
      const destino = otras[0];
      if (destino) {
        const w = window.open(
          url, 'novapos_pantalla_cliente',
          `left=${destino.availLeft},top=${destino.availTop},`
          + `width=${destino.availWidth},height=${destino.availHeight}`,
        );
        if (w) {
          ventana = w;
          // La pantalla completa la pide la propia ventana al cargar (un gesto
          // del usuario en la caja habilita el permiso para las dos).
          return { ok: true, automatico: true };
        }
      } else {
        const w = window.open(url, 'novapos_pantalla_cliente', 'width=1024,height=700');
        if (w) ventana = w;
        return {
          ok: !!w, automatico: false,
          motivo: 'Solo se detectó un monitor. Revisá que Windows esté en modo «Extender» (Win+P).',
        };
      }
    } catch {
      // Permiso denegado o no concedido todavía: se sigue por el camino manual.
    }
  }

  const w = window.open(url, 'novapos_pantalla_cliente', 'width=1024,height=700');
  if (!w) {
    return {
      ok: false, automatico: false,
      motivo: 'El navegador bloqueó la ventana. Permitile las ventanas emergentes a este sitio.',
    };
  }
  ventana = w;
  return {
    ok: true, automatico: false,
    motivo: 'Arrastrá la ventana al monitor del cliente y tocá F11 para pantalla completa. '
      + 'Windows recuerda dónde quedó.',
  };
}

/** Cierra la pantalla del cliente (al cerrar el turno o apagar la caja). */
export function cerrarPantallaCliente(): void {
  try { if (ventana && !ventana.closed) ventana.close(); } catch { /* ya no está */ }
  ventana = null;
}
