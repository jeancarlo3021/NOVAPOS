import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resalta la pantalla a la que llevó una guía.
 *
 * La guía guarda a dónde mandó al usuario; al llegar, el contenido parpadea un
 * par de veces. Sin esto uno aterriza en la pantalla correcta y sigue sin saber
 * dónde tenía que mirar — sobre todo en Configuración, que tiene diez pestañas.
 */
export function GuideHighlight() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    let destino: string | null = null;
    try { destino = sessionStorage.getItem('guide_highlight'); } catch { return; }
    if (!destino) return;

    // Solo si de verdad llegamos a donde la guía mandaba.
    const [ruta] = destino.split('?');
    if (!pathname.startsWith(ruta)) return;
    try { sessionStorage.removeItem('guide_highlight'); } catch { /* ignore */ }

    // Se espera un tick a que la pantalla monte su contenido.
    const t = setTimeout(() => {
      const el = document.querySelector('main') ?? document.getElementById('root');
      if (!el) return;
      el.classList.add('guide-target');
      setTimeout(() => el.classList.remove('guide-target'), 2600);
    }, 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return null;
}

export default GuideHighlight;
