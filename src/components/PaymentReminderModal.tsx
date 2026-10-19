import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Lock, LogOut, MessageCircle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * EL RECORDATORIO DE PAGO AL ENTRAR.
 *
 * Hasta ahora el negocio moroso se enteraba de dos formas: una franja roja
 * arriba cuando ya era tarde (`ReadOnlyBanner`), o botones que dejaban de
 * funcionar sin explicar por qué. Entre medio —los días en que todavía se
 * puede pagar sin que pase nada— no había aviso en el sistema: solo el
 * WhatsApp, que se lee tarde o no se lee.
 *
 * Esto aparece al entrar, que es el único momento en que se tiene la atención
 * del dueño, y dice las tres cosas que necesita: cuánto, para cuándo, y cómo
 * pagar sin tener que buscar el número.
 *
 * NO es un cobro agresivo: hasta que se agota la gracia se puede cerrar y
 * seguir trabajando, y no vuelve a salir hasta el día siguiente. Un modal que
 * reaparece a cada rato se cierra sin leer y deja de avisar nada.
 */

/** Los días de gracia del backend (`utils/gracia.ts`). Si cambia allá, cambia acá. */
const DIAS_DE_GRACIA = 6;

/** La dirección del API, igual que en `lib/api.ts`. */
const API_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';

/**
 * El día de hoy en Costa Rica, como YYYY-MM-DD.
 *
 * Con `toISOString()` de noche ya es el día siguiente en UTC y el aviso que se
 * cerró a las 7 p.m. volvería a salir a las 7:01.
 */
const hoyCR = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

/**
 * Días calendario que faltan para una fecha: 0 = vence hoy, negativo = venció.
 *
 * Se cuenta por DÍA, no por horas: para el dueño «vence mañana» no cambia
 * porque sean las 11 p.m. Restar milisegundos y redondear daba «quedan 0 días»
 * a una fecha que todavía es mañana.
 */
const diasHasta = (fecha?: string | null): number | null => {
  if (!fecha) return null;
  const soloDia = String(fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloDia)) return null;
  const [a, m, d] = soloDia.split('-').map(Number);
  const [ha, hm, hd] = hoyCR().split('-').map(Number);
  const vence = Date.UTC(a, m - 1, d);
  const hoy = Date.UTC(ha, hm - 1, hd);
  return Math.round((vence - hoy) / 86_400_000);
};

const colones = (n: number): string =>
  `₡${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const fechaLarga = (f?: string | null): string => {
  const s = String(f ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CR', { dateStyle: 'long' });
};

export const PaymentReminderModal: React.FC = () => {
  const { user, tenant, isReadOnly, logout } = useAuth();
  const [cerrado, setCerrado] = useState(false);
  const [whatsapp, setWhatsapp] = useState<string>('');

  const sub = tenant?.subscription ?? null;
  const vence = sub?.ends_at ?? null;
  const dias = useMemo(() => diasHasta(vence), [vence]);

  /**
   * A QUIÉN NO SE LE MUESTRA.
   *
   * - Demos: tienen su propio camino (al vencer se cortan, no se cobran).
   * - Planes vitalicios y suscripciones sin fecha: no vencen, no hay qué cobrar.
   * - La cuenta del administrador: es la nuestra.
   */
  const vitalicio = String(sub?.plan?.billing_cycle ?? '').toLowerCase() === 'lifetime';
  const esAdmin = (sub?.plan?.features as any)?.admin_dashboard === true;
  const aplica = !!user && !!tenant && !tenant.is_demo && !vitalicio && !esAdmin && dias !== null;

  /** Cuántos días de gracia quedan. El día del vencimiento son los 6 completos. */
  const gracia = dias === null ? 0 : DIAS_DE_GRACIA + dias;
  const bloqueante = aplica && (isReadOnly || tenant?.status === 'suspended');

  /**
   * Cuándo aparece: desde cinco días antes.
   *
   * Antes no: un aviso de pago tres semanas temprano es ruido, y el dueño
   * aprende a cerrarlo sin leerlo justo a tiempo para el que sí importaba.
   */
  const correspondeAvisar = aplica && (bloqueante || (dias as number) <= 5);

  const claveDelDia = `novapos_aviso_pago_${tenant?.id ?? 'sin-negocio'}`;

  /**
   * ¿Ya se cerró hoy?
   *
   * Se guarda el día, no un «visto» permanente: el aviso tiene que volver cada
   * día que siga sin pagarse, pero no cada vez que se cambia de pantalla.
   * El bloqueante ignora esto: ahí no hay nada que posponer.
   */
  const [vistoHoy, setVistoHoy] = useState<boolean>(() => {
    try { return localStorage.getItem(claveDelDia) === hoyCR(); } catch { return false; }
  });

  useEffect(() => {
    try { setVistoHoy(localStorage.getItem(claveDelDia) === hoyCR()); } catch { /* privacidad */ }
    setCerrado(false);
  }, [claveDelDia]);

  const visible = correspondeAvisar && !cerrado && (bloqueante || !vistoHoy);

  /**
   * El número al que se paga.
   *
   * Sale del contacto de la página pública, que ya se edita en el panel: así
   * no hay un segundo lugar donde configurar el mismo teléfono y que un día
   * queden diciendo cosas distintas. Si no hay número, no se muestra el botón
   * en vez de mandar al dueño a un enlace roto.
   */
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    fetch(`${API_URL}/api/landing`)
      .then(r => r.json())
      .then(j => {
        if (!vivo) return;
        const c = (j?.data ?? j)?.contenido?.contacto ?? {};
        setWhatsapp(String(c.whatsapp ?? '').replace(/\D/g, ''));
      })
      .catch(() => { /* sin número: queda el aviso sin botón */ });
    return () => { vivo = false; };
  }, [visible]);

  /** Mientras está abierto, la página de atrás no rueda. */
  useEffect(() => {
    if (!visible) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [visible]);

  if (!visible) return null;

  const posponer = () => {
    try { localStorage.setItem(claveDelDia, hoyCR()); } catch { /* privacidad */ }
    setCerrado(true);
  };

  const monto = Number(sub?.plan?.price ?? 0);
  const plan = sub?.plan?.name ?? 'tu plan';

  /**
   * Los tres estados, con el texto que corresponde a cada uno. El tono sube
   * con la urgencia: recordar, advertir, y recién al final decir que el
   * sistema está detenido.
   */
  const estado = bloqueante
    ? {
        why: 'bloqueado' as const,
        color: '#B91C1C', fondo: '#FEF2F2',
        icono: <Lock size={22} />,
        titulo: 'El sistema está en solo lectura',
        texto: `El pago de ${plan} quedó pendiente y se terminaron los ${DIAS_DE_GRACIA} días de gracia. `
          + 'Podés seguir consultando tu información, pero no vender ni facturar hasta regularizar.',
      }
    : (dias as number) < 0
      ? {
          why: 'vencido' as const,
          color: '#C2410C', fondo: '#FFF7ED',
          icono: <AlertTriangle size={22} />,
          titulo: `Tu pago venció hace ${Math.abs(dias as number)} ${Math.abs(dias as number) === 1 ? 'día' : 'días'}`,
          texto: `Te ${gracia === 1 ? 'queda' : 'quedan'} ${gracia} ${gracia === 1 ? 'día' : 'días'} para ponerte al día. `
            + 'Después de eso el sistema queda en solo lectura: vas a poder ver todo, pero no vender ni facturar.',
        }
      : {
          why: 'porvencer' as const,
          color: '#0F766E', fondo: '#F0FDFA',
          icono: <CalendarClock size={22} />,
          titulo: (dias as number) === 0 ? 'Tu pago vence hoy'
            : `Tu pago vence ${(dias as number) === 1 ? 'mañana' : `en ${dias} días`}`,
          texto: 'Te avisamos con tiempo para que no se te pase y no tengas que interrumpir las ventas.',
        };

  const mensaje = encodeURIComponent(
    `Hola, soy ${tenant?.name ?? ''}. Quiero ponerme al día con el pago de ${plan}`
    + (monto > 0 ? ` (${colones(monto)})` : '') + '. ¿Me indican cómo?',
  );

  return (
    <div
      className="fixed inset-0 z-[1000] bg-gray-900/60 flex items-center justify-center p-4"
      onClick={estado.why === 'bloqueado' ? undefined : posponer}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="titulo-aviso-pago"
        onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-6 pb-5" style={{ background: estado.fondo }}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5" style={{ color: estado.color }}>{estado.icono}</span>
            <div className="min-w-0">
              <h2 id="titulo-aviso-pago" className="text-lg font-black leading-tight" style={{ color: estado.color }}>
                {estado.titulo}
              </h2>
              <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{estado.texto}</p>
            </div>
            {/* Sin X cuando está bloqueado: cerrarlo no cambiaría nada y hace
                creer que el sistema ya volvió a funcionar. */}
            {estado.why !== 'bloqueado' && (
              <button onClick={posponer} aria-label="Cerrar"
                className="ml-auto shrink-0 text-gray-400 hover:text-gray-700 p-1 -m-1">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Plan</span>
            <span className="text-sm font-bold text-gray-900 text-right">{plan}</span>
          </div>
          {monto > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Monto</span>
              <span className="text-xl font-black text-gray-900">{colones(monto)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Vencimiento</span>
            <span className="text-sm font-bold text-gray-900">{fechaLarga(vence)}</span>
          </div>

          {/* Si ya pagó, que no sienta que el sistema lo ignora: el cobro se
              registra a mano de nuestro lado y puede tardar. */}
          <p className="text-xs text-gray-500 pt-1 leading-relaxed">
            ¿Ya pagaste? Puede que todavía no lo hayamos registrado. Mandanos el comprobante y lo
            actualizamos.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${mensaje}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white"
              style={{ background: estado.color }}
            >
              <MessageCircle size={18} /> Pagar por WhatsApp
            </a>
          )}
          {estado.why === 'bloqueado' ? (
            <button onClick={logout}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100">
              <LogOut size={16} /> Cerrar sesión
            </button>
          ) : (
            <button onClick={posponer}
              className="w-full py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100">
              Seguir trabajando
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentReminderModal;
