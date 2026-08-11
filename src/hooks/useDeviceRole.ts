import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novapos_device_role';
const EVENT_NAME  = 'device-role-changed';

/**
 * Qué hace ESTE equipo dentro del local.
 *
 * En un restaurante hay varias tablets tomando pedidos y UNA computadora que
 * cobra. Todas entran con el mismo negocio y muchas veces con el mismo usuario,
 * así que el rol no puede venir del plan ni del permiso: dos aparatos con la
 * misma cuenta tienen que comportarse distinto.
 *
 * Por eso vive en el equipo (localStorage), igual que el número de terminal y el
 * layout del POS. Se configura una vez al instalar la tablet y no se vuelve a
 * tocar.
 *
 *  · `caja`     — cobra: caja, medios de pago, factura, cierre. Es UNA.
 *  · `comanda`  — toma pedidos y los manda a cocina, pero NO cobra.
 *
 * El valor por defecto es `caja` a propósito: un equipo recién instalado tiene
 * que poder vender. Si el defecto fuera «comanda», un negocio de una sola
 * computadora se quedaría sin poder cobrar hasta descubrir este ajuste.
 */
export type DeviceRole = 'caja' | 'comanda';

export function readDeviceRole(): DeviceRole {
  if (typeof window === 'undefined') return 'caja';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'comanda' ? 'comanda' : 'caja';
  } catch { return 'caja'; }
}

export function useDeviceRole() {
  const [role, setState] = useState<DeviceRole>(() => readDeviceRole());

  useEffect(() => {
    const onSame  = () => setState(readDeviceRole());
    const onCross = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setState(readDeviceRole()); };
    window.addEventListener(EVENT_NAME, onSame);
    window.addEventListener('storage', onCross);
    return () => {
      window.removeEventListener(EVENT_NAME, onSame);
      window.removeEventListener('storage', onCross);
    };
  }, []);

  const setRole = useCallback((r: DeviceRole) => {
    try {
      localStorage.setItem(STORAGE_KEY, r);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch { /* localStorage bloqueado */ }
  }, []);

  return { role, setRole, isCaja: role === 'caja' };
}

export default useDeviceRole;
