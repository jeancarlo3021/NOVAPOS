import type { jsPDF } from 'jspdf';
import { apiFetch } from '@/lib/api';

/**
 * Guardar un PDF, también dentro de la app de Android.
 *
 * `doc.save()` arma un `<a download>`. En el navegador de escritorio eso baja el
 * archivo; dentro del WebView de la app NO HACE NADA: ni descarga, ni error. El
 * usuario tocaba «Descargar» y se quedaba mirando la pantalla, convencido de que
 * el sistema estaba roto.
 *
 * Adentro de la app se sube el PDF y se abre el enlace https que devuelve el
 * servidor: al ser otro dominio, Android lo manda al navegador del teléfono, que
 * sí sabe descargar y compartir por WhatsApp. Si la subida falla (sin señal, por
 * ejemplo), queda el respaldo de abrirlo en una pestaña.
 */

/** ¿Estamos dentro de un navegador embebido (la app), y no en un navegador normal? */
export function esAppEmbebida(): boolean {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() === true
      || /\bwv\b|Capacitor|Median|Cordova/i.test(navigator.userAgent);
  } catch { return false; }
}

/** Respaldo: abrir el PDF en una pestaña para poder guardarlo o compartirlo. */
function abrirEnPestana(doc: jsPDF, fileName: string) {
  const url = doc.output('bloburl') as unknown as string;
  const w = window.open(url, '_blank');
  if (!w) window.location.href = url;   // bloqueador de emergentes
  return fileName;
}

export async function savePdf(doc: jsPDF, fileName: string): Promise<void> {
  if (!esAppEmbebida()) {
    doc.save(fileName);
    return;
  }

  try {
    // `datauristring` viene como "data:application/pdf;filename=...;base64,XXXX".
    const dataUri = doc.output('datauristring') as string;
    const b64 = dataUri.slice(dataUri.indexOf('base64,') + 7);
    const r = await apiFetch<{ url: string }>('/shared-docs', {
      method: 'POST',
      body: JSON.stringify({ filename: fileName, content_base64: b64 }),
    });
    if (!r?.url) throw new Error('El servidor no devolvió el enlace');
    window.open(r.url, '_blank') || (window.location.href = r.url);
  } catch (e) {
    console.warn('[pdf] no se pudo subir para descargar; se abre en pestaña', e);
    abrirEnPestana(doc, fileName);
  }
}

export default savePdf;
