/**
 * Las tres llamadas que hace la página pública. Sin sesión, sin Supabase.
 *
 * No reusa `@/lib/api` a propósito: ese módulo arrastra el manejo de sesión,
 * el cache global y el modo sin conexión de la aplicación. Acá alcanza con
 * `fetch`, y mantenerlo así es lo que evita que la página engorde sola.
 */
/**
 * La dirección del servidor.
 *
 * Tiene que coincidir EXACTAMENTE con lo que hace `src/lib/api.ts`, porque el
 * servidor monta todo bajo `/api` (`basePath('/api')` en app.ts). Acá faltaba
 * ese pedazo y el resultado era un «NetworkError when attempting to fetch
 * resource» en el navegador: la página pedía a una dirección que no existe.
 *
 * El valor de respaldo también es el mismo que el de la app. Dejarlo en '/api'
 * relativo parecía más prolijo, pero apuntaba al dominio de la página —donde
 * no hay servidor— en vez de al backend.
 */
const API_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';
const BASE = `${API_URL}/api`;

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...(opciones.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
  return (j?.data ?? j) as T;
}

export const traerContenido = () => pedir<any>('/landing');

export const enviarInteresado = (datos: Record<string, unknown>) =>
  pedir<any>('/landing/interesado', { method: 'POST', body: JSON.stringify(datos) });

/**
 * El contador. Nunca debe hacer fallar nada ni demorar la página: si no sale,
 * no salió, y lo único que se pierde es un número en un informe.
 */
export const contar = (evento: string) => {
  try {
    void fetch(`${BASE}/landing/visita`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evento, origen: document.referrer || '' }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* nada */ }
};
