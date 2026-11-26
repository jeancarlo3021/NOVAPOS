/**
 * EL EMBUDO DE LA PÁGINA PÚBLICA: de la visita al ingreso.
 *
 * ── Qué problema resuelve ────────────────────────────────────────────────
 * La página contaba tres cosas: visitas, formularios enviados y clics en
 * «Entrar». El clic en «Entrar» se estaba leyendo como si fuera un ingreso, y
 * no es lo mismo: entre tocar el botón y llegar adentro está la contraseña
 * olvidada, el usuario equivocado y cualquier error de la pantalla de login.
 * Con un solo contador, cien clics se veían igual de bien con cien ingresos
 * que con tres.
 *
 * ── Cómo se atan las dos puntas ──────────────────────────────────────────
 * La página pública y la aplicación son dos paquetes distintos, y el ingreso
 * ocurre en la segunda. Al tocar «Entrar» se deja una marca en
 * `localStorage`; cuando el ingreso sale bien, la aplicación la consume y
 * reporta el evento. La marca se BORRA al usarla: alguien que entra cinco
 * veces en el día es una sola persona que llegó desde la página, no cinco.
 *
 * Se usa `localStorage` y no `sessionStorage` porque mucha gente abre el
 * login en una pestaña nueva, y ahí `sessionStorage` nace vacío y el ingreso
 * no se contaría nunca.
 *
 * ── Lo que este número NO es ─────────────────────────────────────────────
 * Lo reporta el navegador, así que no es auditable: sirve para saber si la
 * puerta funciona, no para nada que dependa de exactitud. La medición sigue
 * siendo agregada: no guarda IP, ni sesión, ni recorrido.
 */

const CLAVE = 'cc.landing.entrar';

/** Cuánto vale la marca. Más allá de esto, el ingreso ya no viene de la página. */
const VENTANA_MS = 2 * 60 * 60 * 1000;   // 2 horas

const API_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';

/** Deja la marca de que esta persona venía de la página pública. */
export function marcarVinoDeLaPagina(origen = ''): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ts: Date.now(), origen }));
  } catch { /* en privado o con el almacenamiento bloqueado: se pierde el número, nada más */ }
}

/**
 * Reporta que la persona que venía de la página SÍ entró.
 *
 * No hace nada si no hay marca, si venció, o si el reporte falla. Nunca
 * lanza: se llama justo después de un inicio de sesión exitoso, y un
 * contador no puede estropear eso.
 */
export function reportarIngresoDesdeLaPagina(): void {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return;
    localStorage.removeItem(CLAVE);          // de un solo uso, incluso si vencida

    const m = JSON.parse(crudo) as { ts?: number; origen?: string };
    if (!m?.ts || Date.now() - m.ts > VENTANA_MS) return;

    void fetch(`${API_URL}/api/landing/visita`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evento: 'login', origen: m.origen ?? '' }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* nada: es un número en un informe */ }
}
