import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mesaAdmin, type Llamada, type TipoLlamada } from '@/services/mesaDigital/mesaDigitalService';
import { sonar, leerVolumen, leerRepetir } from '@/modules/mesaDigital/sonido';
import type { MapItem } from '@/modules/tables/types';

/** Cada cuánto vuelve a sonar mientras una mesa sigue esperando. */
const REPETIR_CADA_MS = 45_000;
/** Repaso por si el canal en vivo se cae (el wifi de un restaurante se cae). */
const REPASO_MS = 15_000;

export const TIPO_LLAMADA: Record<TipoLlamada, { emoji: string; texto: string; corto: string; color: string }> = {
  ordenar: { emoji: '🙋',  texto: 'Listo para ordenar', corto: 'Ordenar', color: 'emerald' },
  mesero:  { emoji: '🛎️', texto: 'Llama al mesero',    corto: 'Mesero',  color: 'blue' },
  cuenta:  { emoji: '🧾',  texto: 'Pide la cuenta',     corto: 'Cuenta',  color: 'amber' },
};

/** «hace 3 min» — en el salón lo que importa es cuánto lleva esperando. */
export function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/**
 * El número de mesa que el cliente ve en su teléfono, contra la mesa del mapa.
 *
 * ColónTab numera las mesas 1, 2, 3…; el mapa las llama «Mesa 3», «Terraza 2»,
 * «Barra». Se enlazan por el número que trae la etiqueta, que es como las
 * nombra todo el mundo en el salón. Si una mesa del mapa no tiene número en su
 * nombre, el aviso igual se ve en la barra de arriba: no se pierde, solo que no
 * se puede pintar sobre el mapa.
 */
export function numeroDeEtiqueta(label: string | undefined): number | null {
  const m = String(label ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface AvisosMesa {
  /** Llamadas pendientes, la más vieja primero. */
  llamadas: Llamada[];
  /** id del MapItem → la llamada pendiente más vieja de esa mesa. */
  porSpot: Map<string, Llamada>;
  /** Marca una llamada como atendida (se quita de la lista al instante). */
  atender: (id: string) => Promise<void>;
  /** El módulo está encendido y respondiendo. */
  activo: boolean;
}

/**
 * Los avisos de ColónTab (mesa digital) dentro de la pantalla del salón.
 *
 * El mesero no puede estar cambiando de pantalla para ver si alguien llamó:
 * trabaja en el mapa de mesas. Esto trae los avisos acá, suena cuando entra uno
 * nuevo y los deja resolver de un toque.
 */
export function useLlamadasMesa(tenantId: string | undefined, encendido: boolean, mapItems: MapItem[]): AvisosMesa {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [activo, setActivo] = useState(false);
  const conocidas = useRef<Set<string> | null>(null);
  const [, refrescar] = useState(0);
  /**
   * Si el módulo no está, se deja de preguntar.
   *
   * Un negocio sin ColónTab contratado responde error en cada consulta: seguir
   * preguntando cada 15 segundos toda la jornada es ruido en el servidor y
   * batería de la tablet por nada.
   */
  const fallas = useRef(0);
  const [roto, setRoto] = useState(false);

  const cargar = useCallback(async () => {
    if (!encendido || roto) return;
    try {
      const l = await mesaAdmin.llamadas('pendiente');
      /* La primera carga NO suena: al abrir en la mañana sonaría por avisos de
         ayer que nadie cerró. Solo suenan los que llegan estando la pantalla
         abierta. */
      const antes = conocidas.current;
      const nuevas = antes ? l.filter(r => !antes.has(r.id)) : [];
      if (nuevas.length) sonar(nuevas[nuevas.length - 1].tipo, leerVolumen());
      conocidas.current = new Set(l.map(r => r.id));
      setLlamadas(l);
      setActivo(true);
      fallas.current = 0;
    } catch {
      /* Sin el módulo contratado o sin la tabla, esto responde error: la
         pantalla del salón sigue funcionando igual, solo sin los avisos. */
      setActivo(false);
      if (++fallas.current >= 3) setRoto(true);
    }
  }, [encendido, roto]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    if (!tenantId || !encendido || roto) return;
    const canal = supabase
      .channel(`mesa_llamadas_salon_${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mesa_llamadas', filter: `tenant_id=eq.${tenantId}` },
        () => void cargar())
      .subscribe();
    const reloj = setInterval(() => void cargar(), REPASO_MS);
    return () => {
      clearInterval(reloj);
      try { supabase.removeChannel(canal); } catch { /* ya cerrado */ }
    };
  }, [tenantId, encendido, roto, cargar]);

  // Repite el aviso mientras alguien siga esperando, y refresca el «hace X min».
  const masVieja = llamadas[0]?.tipo;   // ascendente: la primera es la que más espera
  useEffect(() => {
    if (!encendido || roto) return;
    const t = setInterval(() => {
      refrescar(n => n + 1);
      if (masVieja && leerRepetir()) sonar(masVieja, leerVolumen());
    }, REPETIR_CADA_MS);
    return () => clearInterval(t);
  }, [masVieja, encendido, roto]);

  const atender = useCallback(async (id: string) => {
    setLlamadas(l => l.filter(r => r.id !== id));
    conocidas.current?.delete(id);
    try { await mesaAdmin.atender(id); } catch { void cargar(); }
  }, [cargar]);

  // Enlace mesa-del-mapa → aviso. Si una mesa llamó dos veces, manda la más vieja.
  const porSpot = new Map<string, Llamada>();
  for (const it of mapItems) {
    const label = (it as any).label as string | undefined;
    const n = numeroDeEtiqueta(label);
    if (n == null) continue;
    const suya = llamadas.filter(l => l.numero === n);
    if (suya.length) porSpot.set(it.id, suya[0]);   // la que más lleva esperando
  }

  return { llamadas, porSpot, atender, activo };
}
