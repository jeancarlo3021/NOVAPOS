import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

/**
 * Iconos de Leaflet con Vite.
 *
 * Leaflet arma la ruta de sus imágenes por CSS, y el empaquetador no la
 * resuelve: los pines quedaban INVISIBLES —el mapa se veía bien, pero sin
 * marcadores— y parecía que no había datos. Acá se le pasan las imágenes ya
 * empaquetadas. Se importa una vez desde cada mapa.
 */
let listo = false;

export function ensureLeafletIcons() {
  if (listo) return;
  listo = true;
  L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
}

export default ensureLeafletIcons;
