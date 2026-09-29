import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { cacheGet, cacheSet, cacheKey } from '@/utils/offlineCache';
import {
  abrirPantallaCliente, pantallaAbierta, publicarEnPantalla,
  type LineaPantalla, type ResultadoApertura,
} from '@/services/pos/customerDisplayService';
import { CONFIG_PANTALLA_POR_DEFECTO, type ConfigPantallaCliente } from '@/modules/pos/CustomerDisplayScreen';

/**
 * Mantiene al día la PANTALLA DEL CLIENTE (el segundo monitor) desde la caja.
 *
 * Ojo con el nombre: `useCustomerDisplay` ya existe y es otra cosa —el visor
 * numérico de dos líneas que se conecta por USB/serie—. Esto es la segunda
 * pantalla completa.
 *
 * Hace tres cosas: lee si está activada, la abre sola al entrar al punto de
 * venta (si así se configuró) y le manda cada cambio del carrito. El aviso es
 * local al navegador: no cuesta red ni falla sin internet. Si está apagada en
 * Configuración, no se abre ni se publica nada.
 */
export function useSegundaPantalla(
  tenantId: string | null | undefined,
  venta: {
    lineas: LineaPantalla[];
    subtotal: number;
    descuento: number;
    impuesto: number;
    total: number;
    cliente?: string | null;
  },
  /**
   * ¿El plan del negocio incluye el segundo monitor?
   *
   * Manda por encima de la configuración guardada: si el plan no lo trae, no se
   * abre ni se publica nada aunque la configuración diga `enabled`. Así, al bajar
   * de plan, la función se apaga sola sin tener que ir a desactivarla a mano.
   */
  habilitadoPorPlan: boolean,
): { config: ConfigPantallaCliente; abrir: () => Promise<ResultadoApertura> } {
  /**
   * La configuración vive en estado Y en una referencia.
   *
   * En estado porque el botón «Pantalla del cliente» tiene que aparecer cuando
   * termina de cargar; en referencia porque los intervalos y los efectos que
   * publican el carrito necesitan el valor de ahora sin volver a suscribirse.
   */
  const [config, setConfig] = useState<ConfigPantallaCliente>(CONFIG_PANTALLA_POR_DEFECTO);
  const cfgRef = useRef<ConfigPantallaCliente>(CONFIG_PANTALLA_POR_DEFECTO);
  const aplicar = (c: ConfigPantallaCliente) => {
    const efectiva = { ...c, enabled: c.enabled && habilitadoPorPlan };
    cfgRef.current = efectiva;
    setConfig(efectiva);
  };
  const yaIntentoAbrir = useRef(false);

  // 1) Configuración (caché primero, para no demorar la apertura).
  useEffect(() => {
    if (!tenantId || !habilitadoPorPlan) return;
    const guardada = cacheGet<any>(cacheKey(tenantId, 'settings_customer-display'));
    if (guardada) aplicar({ ...CONFIG_PANTALLA_POR_DEFECTO, ...(guardada.config ?? guardada) });
    (async () => {
      try {
        const c = await apiFetch<any>('/settings/customer-display');
        if (c) {
          aplicar({ ...CONFIG_PANTALLA_POR_DEFECTO, ...(c.config ?? c) });
          cacheSet(cacheKey(tenantId, 'settings_customer-display'), c);
        }
      } catch { /* queda lo cacheado */ }

      // 2) Apertura automática: solo si está activada Y configurada para abrirse.
      const cfg = cfgRef.current;
      if (cfg.enabled && cfg.autoOpen && !yaIntentoAbrir.current && !pantallaAbierta()) {
        yaIntentoAbrir.current = true;
        /**
         * El navegador puede bloquear una ventana que no nace de un clic.
         *
         * Si la bloquea NO se insiste ni se muestra un error: el botón «Pantalla
         * del cliente» queda ahí para abrirla a mano. Un cartel de error cada vez
         * que abre la caja sería peor que no abrirse sola.
         */
        try { await abrirPantallaCliente(); } catch { /* se abre a mano */ }
      }
    })();
  }, [tenantId, habilitadoPorPlan]);

  // 3) Cada cambio del carrito viaja a la pantalla.
  const firma = JSON.stringify(venta);
  useEffect(() => {
    if (!cfgRef.current.enabled) return;
    if (venta.lineas.length === 0) publicarEnPantalla({ tipo: 'espera' });
    else publicarEnPantalla({ tipo: 'venta', ...venta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // 4) Latido: si la caja se cierra, la pantalla vuelve a la bienvenida sola.
  useEffect(() => {
    const t = setInterval(() => {
      if (cfgRef.current.enabled) publicarEnPantalla({ tipo: 'latido' });
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return { config, abrir: () => abrirPantallaCliente() };
}
