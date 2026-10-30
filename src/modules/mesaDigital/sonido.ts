/**
 * EL SONIDO DEL AVISO, generado con Web Audio (sin archivos).
 *
 * Un aviso silencioso no sirve: el mesero está en el salón, no mirando la
 * pantalla. Cada tipo tiene su melodía para que el personal sepa QUÉ pasó sin
 * acercarse —el «listo para ordenar» suena distinto del «pide la cuenta»—.
 *
 * El navegador no deja sonar nada antes del primer toque del usuario, así que
 * `desbloquear()` se llama con el primer clic y el panel avisa si todavía no
 * está permitido.
 */

export type TipoLlamada = 'ordenar' | 'mesero' | 'cuenta';

const CLAVE_VOLUMEN = 'novapos_mesa_volumen';
const CLAVE_REPETIR = 'novapos_mesa_repetir';

let ctx: AudioContext | null = null;

const audio = (): AudioContext | null => {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
};

export const sonidoListo = (): boolean => audio()?.state === 'running';

export const desbloquear = async (): Promise<boolean> => {
  const c = audio();
  if (!c) return false;
  if (c.state !== 'running') await c.resume().catch(() => undefined);
  return c.state === 'running';
};

if (typeof window !== 'undefined') {
  const unaVez = () => { void desbloquear(); };
  window.addEventListener('pointerdown', unaVez, { once: true });
  window.addEventListener('keydown', unaVez, { once: true });
}

/** Melodías: frecuencias en Hz y separación entre notas en segundos. */
const MELODIAS: Record<TipoLlamada, { notas: number[]; hueco: number }> = {
  // Listo para ordenar: arpegio alegre que sube, Do-Mi-Sol-Do
  ordenar: { notas: [523.25, 659.25, 783.99, 1046.5], hueco: 0.13 },
  // Llamar al mesero: el «din-don» de siempre
  mesero:  { notas: [659.25, 523.25], hueco: 0.38 },
  // Pedir la cuenta: tres notas, La-Do#-Mi
  cuenta:  { notas: [880, 1108.73, 1318.51], hueco: 0.16 },
};

/** Toca el aviso. `volumen` va de 0 a 1. */
export function sonar(tipo: TipoLlamada, volumen: number): void {
  const c = audio();
  if (!c || volumen <= 0) return;
  if (c.state !== 'running') void c.resume();

  const t0 = c.currentTime + 0.03;

  /* Volumen → compresor → parlantes. El compresor sube lo bajo sin que
     distorsione: en una tablet de mostrador, sin él, el aviso no se oye. */
  const maestro = c.createGain();
  maestro.gain.value = Math.min(1, volumen) * 1.6;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  maestro.connect(comp).connect(c.destination);

  const { notas, hueco } = MELODIAS[tipo];
  notas.forEach((hz, i) => {
    const t = t0 + i * hueco;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const g = c.createGain();
    // Campana: sube de golpe y cae; sin esta envolvente suena a chicharra.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
    osc.connect(g).connect(maestro);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}

export const leerVolumen = (): number => {
  try {
    /* Sin nada guardado el panel arranca AL 70%, no en silencio: `Number(null)`
       da 0, y con eso la primera vez que alguien abría el panel no sonaba nada
       —justo el día que se prueba el módulo y parece que no funciona—. */
    const guardado = localStorage.getItem(CLAVE_VOLUMEN);
    if (guardado == null) return 0.7;
    const v = Number(guardado);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.7;
  } catch { return 0.7; }
};
export const guardarVolumen = (v: number): void => {
  try { localStorage.setItem(CLAVE_VOLUMEN, String(v)); } catch { /* sin permiso */ }
};
export const leerRepetir = (): boolean => {
  try { return localStorage.getItem(CLAVE_REPETIR) !== 'no'; } catch { return true; }
};
export const guardarRepetir = (v: boolean): void => {
  try { localStorage.setItem(CLAVE_REPETIR, v ? 'si' : 'no'); } catch { /* sin permiso */ }
};
