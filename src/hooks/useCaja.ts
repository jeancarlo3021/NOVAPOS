import { useCallback, useEffect, useState } from 'react';
import { writeTerminal } from './useTerminal';
import { useSettings } from './useSettings';

/**
 * QUÉ CAJA ES ESTA MÁQUINA.
 *
 * Una caja es una gaveta con plata, no una persona. En un local con dos cajas
 * lo que distingue una de la otra es el equipo que la opera, así que la
 * apertura y el cierre tienen que colgar de la MÁQUINA: el que entra a relevar
 * el turno sigue la caja que está abierta en ese equipo en vez de abrir otra
 * sobre la misma gaveta, y la caja de la barra no se le aparece al de la
 * entrada.
 *
 * Es una preferencia POR EQUIPO (localStorage), como el layout del POS y el
 * número de terminal —de hecho ES el número de terminal: el mismo que viaja en
 * el consecutivo de Hacienda, para no tener dos números que digan lo mismo—.
 *
 * Mientras no se elija ninguna, todo se comporta como antes: la caja es del
 * usuario. Elegir una es lo que cambia el modo, y por eso no hay una por
 * omisión: prenderle la caja por máquina a un negocio que trabaja con una sola
 * computadora y dos cajeros con gaveta propia le juntaría los dos arqueos.
 */
export interface CajaElegida {
  /** El número de terminal: 1, 2, 3… */
  terminal: number;
  /** Cómo le dicen en el local: «Caja 1», «Barra», «Terraza». */
  nombre: string;
}

const LLAVE = 'novapos_caja';
const EVENTO = 'caja-changed';

export function readCaja(): CajaElegida | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LLAVE);
    if (!raw) return null;
    const v = JSON.parse(raw);
    const terminal = Math.floor(Number(v?.terminal) || 0);
    if (!(terminal >= 1 && terminal <= 99999)) return null;
    return { terminal, nombre: String(v?.nombre ?? `Caja ${terminal}`) };
  } catch { return null; }
}

export function writeCaja(caja: CajaElegida | null): void {
  try {
    if (caja) {
      localStorage.setItem(LLAVE, JSON.stringify(caja));
      /* La terminal se mueve con la caja: si este equipo es la caja 2, su
         consecutivo de Hacienda también tiene que ser el de la terminal 2.
         Dejarlos distintos era pedir dos configuraciones para una sola cosa. */
      writeTerminal(caja.terminal);
    } else {
      localStorage.removeItem(LLAVE);
    }
    window.dispatchEvent(new CustomEvent(EVENTO));
  } catch { /* localStorage bloqueado */ }
}

/**
 * La ruta para preguntar «¿cuál es la caja abierta acá?».
 *
 * Está en un solo lugar porque esa pregunta se hace desde cinco pantallas, y
 * una que se olvide del parámetro contesta la caja de otra máquina —o la de
 * otro turno— y el POS cobra sobre una gaveta que no es la que tiene enfrente.
 */
export function rutaCajaActiva(): string {
  const caja = readCaja();
  return caja
    ? `/cash-sessions/active?terminal=${caja.terminal}`
    : '/cash-sessions/active';
}

export function useCaja() {
  const [caja, setState] = useState<CajaElegida | null>(() => readCaja());

  useEffect(() => {
    const aca = () => setState(readCaja());
    const otraPestana = (e: StorageEvent) => { if (e.key === LLAVE) setState(readCaja()); };
    window.addEventListener(EVENTO, aca);
    window.addEventListener('storage', otraPestana);
    return () => {
      window.removeEventListener(EVENTO, aca);
      window.removeEventListener('storage', otraPestana);
    };
  }, []);

  const setCaja = useCallback((c: CajaElegida | null) => { writeCaja(c); }, []);
  return { caja, setCaja };
}

/**
 * LAS CAJAS DEL NEGOCIO (la lista, compartida por todos los equipos).
 *
 * Vive en la configuración del negocio y no en cada equipo: el nombre de la
 * caja 2 tiene que ser el mismo en la caja 2 y en el reporte que lo lee desde
 * la oficina.
 */
export interface CajaDelNegocio { terminal: number; nombre: string }

export function useCajasDelNegocio() {
  const { settings, updateSettings, loading } = useSettings('cajas');
  const lista: CajaDelNegocio[] = Array.isArray((settings as any)?.lista)
    ? ((settings as any).lista as any[])
        .map(c => ({ terminal: Math.floor(Number(c?.terminal) || 0), nombre: String(c?.nombre ?? '') }))
        .filter(c => c.terminal >= 1 && c.nombre.trim() !== '')
        .sort((a, b) => a.terminal - b.terminal)
    : [];
  const guardar = useCallback(
    (nueva: CajaDelNegocio[]) => updateSettings({ lista: nueva } as any),
    [updateSettings]);
  return { lista, guardar, loading };
}

export default useCaja;
