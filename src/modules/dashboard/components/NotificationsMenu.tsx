import React, { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, ChevronRight, BellOff, CheckCircle2, RefreshCw,
  CalendarClock, CloudUpload, FileWarning, HandCoins, PackageCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';

export type NivelAviso = 'urgente' | 'aviso' | 'info';

export interface Aviso {
  /** Identidad estable del aviso: con ella se recuerda si se silenció hoy. */
  id: string;
  nivel: NivelAviso;
  icono: ComponentType<{ size?: number; className?: string }>;
  texto: string;
  detalle?: string;
  /** A dónde lleva al tocarlo. Sin ruta, el aviso solo informa. */
  path?: string;
}

const ESTILO: Record<NivelAviso, { chip: string; punto: string; borde: string }> = {
  urgente: { chip: 'bg-red-50 text-red-800', punto: 'bg-red-500', borde: 'border-red-100' },
  aviso:   { chip: 'bg-amber-50 text-amber-800', punto: 'bg-amber-500', borde: 'border-amber-100' },
  info:    { chip: 'bg-slate-50 text-slate-700', punto: 'bg-slate-400', borde: 'border-slate-100' },
};

const ORDEN: NivelAviso[] = ['urgente', 'aviso', 'info'];

/** Día de hoy en Costa Rica: el silencio dura hasta mañana, no 24 horas. */
const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const LLAVE = (tenantId?: string | null) => `novapos_avisos_silenciados_${tenantId ?? 'local'}`;

/**
 * MENÚ DE NOTIFICACIONES del tablero (botón flotante).
 *
 * Los avisos estaban repartidos: unos como chips en el tablero, otros como
 * banners que aparecían arriba, otros como ventanas que saltaban en el punto de
 * venta, y varios en ninguna parte —las ventas sin subir, los apartados por
 * vencer, la suscripción en tiempo de gracia—. El dueño tenía que acordarse de
 * mirar cada módulo para saber si algo andaba mal.
 *
 * Acá están todos juntos, ordenados por urgencia y con el camino para
 * resolverlos. Flotante porque sigue a la vista mientras se baja por el tablero,
 * y con el número de pendientes encima: si no hay nada, no estorba.
 *
 * Solo se muestra lo que el plan del negocio incluye: avisar de cuentas por
 * cobrar vencidas a quien no tiene el módulo sería mandarlo a una pantalla que
 * no puede abrir.
 */
export const NotificationsMenu: React.FC<{
  /** Avisos que el tablero ya calculó con datos que tenía cargados. */
  base: Aviso[];
}> = ({ base }) => {
  const navigate = useNavigate();
  const { planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const pf = planFeatures as any;

  const [abierto, setAbierto] = useState(false);
  const [extra, setExtra] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(false);
  const [silenciados, setSilenciados] = useState<string[]>([]);

  // ── Silenciados de HOY ──
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LLAVE(tenantId)) || '{}');
      setSilenciados(raw?.dia === hoyCR() && Array.isArray(raw.ids) ? raw.ids : []);
    } catch { setSilenciados([]); }
  }, [tenantId]);

  const silenciar = (id: string) => {
    const ids = [...new Set([...silenciados, id])];
    setSilenciados(ids);
    try { localStorage.setItem(LLAVE(tenantId), JSON.stringify({ dia: hoyCR(), ids })); } catch { /* sin espacio */ }
  };

  const reactivarTodos = () => {
    setSilenciados([]);
    try { localStorage.removeItem(LLAVE(tenantId)); } catch { /* ya está */ }
  };

  /**
   * Los avisos que necesitan consultar algo.
   *
   * Se piden una vez al entrar al tablero, en paralelo y sin que ninguno pueda
   * frenar a los demás: son avisos, no el contenido de la pantalla. El que falle
   * simplemente no aparece.
   */
  const cargarExtra = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const encontrados: Aviso[] = [];

    const pendientesOffline = (async () => {
      try {
        const { posOfflineService } = await import('@/services/pos/posOfflineService');
        const n = await posOfflineService.getPendingCount();
        if (n > 0) {
          encontrados.push({
            id: 'offline',
            nivel: 'urgente',
            icono: CloudUpload,
            texto: `${n} venta${n !== 1 ? 's' : ''} sin subir al servidor`,
            detalle: 'Se hicieron sin conexión. Suben solas cuando vuelva el internet; '
              + 'mientras no suban, el cierre y los reportes del servidor no las tienen.',
            path: '/pos',
          });
        }
      } catch { /* sin cola accesible */ }
    })();

    const cuotaFe = (async () => {
      if (!pf?.electronic_invoice || !navigator.onLine) return;
      try {
        const { haciendaService } = await import('@/services/hacienda/haciendaService');
        const q = await haciendaService.quota();
        if (!q || q.included <= 0 || q.available == null) return;   // ilimitado o sin FE
        if (q.available <= 0) {
          encontrados.push({
            id: 'fe-cuota-0',
            nivel: 'urgente',
            icono: FileWarning,
            texto: 'Se acabaron los comprobantes electrónicos del plan',
            detalle: q.extra_fee > 0
              ? `Lo que emitás de más se cobra aparte (₡${q.extra_fee} cada uno).`
              : 'No vas a poder emitir facturas ni tiquetes electrónicos.',
            path: '/fe-facturas',
          });
        } else if (q.available <= 20) {
          encontrados.push({
            id: 'fe-cuota-bajo',
            nivel: 'aviso',
            icono: FileWarning,
            texto: `Quedan ${q.available} comprobantes electrónicos`,
            detalle: `De los ${q.included} de tu plan. Conviene ampliarlo antes de que se acaben.`,
            path: '/fe-facturas',
          });
        }
      } catch { /* la cuota no se pudo consultar */ }
    })();

    const apartados = (async () => {
      if (!pf?.reservations || !navigator.onLine) return;
      try {
        const { reservationsService } = await import('@/services/reservations/reservationsService');
        const abiertos = await reservationsService.list('open');
        const hoy = hoyCR();
        const en7 = new Date(Date.now() + 7 * 86_400_000 - 6 * 3600 * 1000).toISOString().slice(0, 10);
        const vencidos = (abiertos ?? []).filter(r => r.expires_on && r.expires_on < hoy);
        const porVencer = (abiertos ?? []).filter(r => r.expires_on && r.expires_on >= hoy && r.expires_on <= en7);
        if (vencidos.length > 0) {
          encontrados.push({
            id: 'apartados-vencidos',
            nivel: 'aviso',
            icono: PackageCheck,
            texto: `${vencidos.length} apartado${vencidos.length !== 1 ? 's' : ''} vencido${vencidos.length !== 1 ? 's' : ''}`,
            detalle: 'La mercadería sigue separada y sin cobrar. Hay que llamar al cliente o liberarla.',
            path: '/apartados',
          });
        }
        if (porVencer.length > 0) {
          encontrados.push({
            id: 'apartados-por-vencer',
            nivel: 'info',
            icono: PackageCheck,
            texto: `${porVencer.length} apartado${porVencer.length !== 1 ? 's' : ''} vence${porVencer.length === 1 ? '' : 'n'} esta semana`,
            path: '/apartados',
          });
        }
      } catch { /* sin apartados */ }
    })();

    const porCobrar = (async () => {
      if (!pf?.accounts_receivable || !navigator.onLine) return;
      try {
        const { accountsReceivableService } = await import('@/services/accountsReceivable/accountsReceivableService');
        const s = await accountsReceivableService.summary();
        if ((s?.overdue_count ?? 0) > 0) {
          encontrados.push({
            id: 'cxc-vencidas',
            nivel: 'urgente',
            icono: HandCoins,
            texto: `${s.overdue_count} cuenta${s.overdue_count !== 1 ? 's' : ''} por cobrar vencida${s.overdue_count !== 1 ? 's' : ''}`,
            detalle: `₡${Math.round(s.overdue_amount ?? 0).toLocaleString('es-CR')} que ya pasaron de la fecha de pago.`,
            path: '/accounts-receivable',
          });
        }
      } catch { /* sin crédito */ }
    })();

    await Promise.allSettled([pendientesOffline, cuotaFe, apartados, porCobrar]);
    setExtra(encontrados);
    setCargando(false);
  }, [tenantId, pf?.electronic_invoice, pf?.reservations, pf?.accounts_receivable]);

  useEffect(() => { void cargarExtra(); }, [cargarExtra]);

  const todos = useMemo(() => {
    const juntos = [...base, ...extra];
    return juntos.sort((a, b) => ORDEN.indexOf(a.nivel) - ORDEN.indexOf(b.nivel));
  }, [base, extra]);

  const visibles = useMemo(() => todos.filter(a => !silenciados.includes(a.id)), [todos, silenciados]);
  const urgentes = visibles.filter(a => a.nivel === 'urgente').length;
  const ocultos = todos.length - visibles.length;

  // Cerrar con Esc: el panel tapa parte del tablero.
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierto]);

  return (
    <>
      {/* Fondo: un toque fuera cierra el panel. */}
      {abierto && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setAbierto(false)} aria-hidden />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {abierto && (
          <div className="w-[min(92vw,22rem)] max-h-[70vh] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Bell size={16} className="text-gray-700" />
              <p className="font-black text-gray-900 text-sm flex-1">
                Notificaciones
                {visibles.length > 0 && <span className="text-gray-400 font-bold"> · {visibles.length}</span>}
              </p>
              <button onClick={() => void cargarExtra()} title="Actualizar"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setAbierto(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {visibles.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-gray-700">Todo en orden</p>
                  <p className="text-xs text-gray-400">
                    {ocultos > 0
                      ? `${ocultos} aviso(s) silenciado(s) hasta mañana.`
                      : 'No hay nada pendiente de atender.'}
                  </p>
                </div>
              ) : visibles.map(a => {
                const Icono = a.icono;
                const est = ESTILO[a.nivel];
                return (
                  <div key={a.id} className={`px-3 py-3 ${est.borde}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 p-1.5 rounded-lg ${est.chip}`}><Icono size={14} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{a.texto}</p>
                        {a.detalle && <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{a.detalle}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          {a.path && (
                            <button
                              onClick={() => { setAbierto(false); navigate(a.path!); }}
                              className="text-[11px] font-black text-emerald-700 hover:underline inline-flex items-center gap-0.5">
                              Ir a resolverlo <ChevronRight size={12} />
                            </button>
                          )}
                          <button onClick={() => silenciar(a.id)}
                            title="No volver a mostrarlo hoy"
                            className="text-[11px] font-bold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1">
                            <BellOff size={11} /> Silenciar hoy
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {ocultos > 0 && visibles.length > 0 && (
              <button onClick={reactivarTodos}
                className="px-4 py-2.5 border-t border-gray-100 text-[11px] font-bold text-gray-500 hover:bg-gray-50 text-left">
                Mostrar los {ocultos} aviso(s) silenciado(s)
              </button>
            )}
            <p className="px-4 py-2 bg-gray-50 text-[10px] text-gray-400 border-t border-gray-100">
              Silenciar un aviso lo esconde solo hoy: si el pendiente sigue, mañana vuelve a aparecer.
            </p>
          </div>
        )}

        <button
          onClick={() => setAbierto(v => !v)}
          title={visibles.length === 0 ? 'Notificaciones — todo en orden' : `${visibles.length} aviso(s)`}
          className={`relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition ${
            urgentes > 0 ? 'bg-red-600 hover:bg-red-700'
              : visibles.length > 0 ? 'bg-amber-500 hover:bg-amber-600'
              : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
        >
          <Bell size={22} className={visibles.length > 0 ? 'text-white' : 'text-gray-500'} />
          {visibles.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-black flex items-center justify-center">
              {visibles.length > 9 ? '9+' : visibles.length}
            </span>
          )}
        </button>
      </div>
    </>
  );
};

/**
 * Aviso de la SUSCRIPCIÓN, con el mismo calendario que usa el bloqueo.
 *
 * Al vencer, el sistema sigue trabajando unos días de gracia y después queda en
 * solo lectura. Ese es justo el momento en que nadie se enteraba: el aviso
 * desaparecía el día del vencimiento y el negocio se daba cuenta cuando no pudo
 * facturar.
 */
export function avisoDeSuscripcion(endsAt: string | null | undefined, diasDeGracia = 6): Aviso | null {
  if (!endsAt) return null;
  const dia = (v: string | number | Date) =>
    new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const hoy = new Date(`${dia(new Date())}T00:00:00Z`).getTime();
  const fin = new Date(`${dia(endsAt)}T00:00:00Z`).getTime();
  const dias = Math.round((fin - hoy) / 86_400_000);

  if (dias > 7) return null;

  if (dias > 0) {
    return {
      id: 'suscripcion-por-vencer',
      nivel: dias <= 2 ? 'urgente' : 'aviso',
      icono: CalendarClock,
      texto: dias === 1 ? 'Tu suscripción vence mañana' : `Tu suscripción vence en ${dias} días`,
      detalle: 'Renovala a tiempo para no quedarte sin poder facturar.',
    };
  }

  const gracia = diasDeGracia + dias;
  if (gracia < 0) {
    return {
      id: 'suscripcion-vencida',
      nivel: 'urgente',
      icono: CalendarClock,
      texto: 'Suscripción vencida — sistema en solo lectura',
      detalle: 'Podés consultar la información, pero no vender ni facturar hasta regularizar el pago.',
    };
  }
  return {
    id: 'suscripcion-gracia',
    nivel: 'urgente',
    icono: CalendarClock,
    texto: gracia === 0
      ? 'Hoy el sistema deja de funcionar'
      : `Tiempo de gracia: ${gracia} día${gracia !== 1 ? 's' : ''} para que el sistema deje de funcionar`,
    detalle: 'Ya pasó el tiempo de aviso. Cuando se acabe la gracia vas a poder ver la información, '
      + 'pero no vender ni facturar.',
  };
}

export default NotificationsMenu;
