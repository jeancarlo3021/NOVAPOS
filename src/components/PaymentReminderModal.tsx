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

/**
 * Desde cuántos días antes se avisa.
 *
 * Es el PRIMER umbral de los avisos de WhatsApp (`services/paymentReminders.ts`,
 * UMBRALES = [7, 4, 2, 1]). Tenerlos distintos era peor que no avisar: al
 * cliente le llegaba el mensaje al teléfono siete días antes y el sistema
 * recién se lo decía dos días después, como si fueran dos cuentas distintas.
 */
const DIAS_AVISO = 7;

/** Dónde pagar. Es lo primero que pregunta quien quiere ponerse al día. */
const SINPE = '7161-7910';
/** El mismo número, en el formato que necesita un enlace de WhatsApp. */
const SINPE_WA = '50671617910';

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
  const [copiado, setCopiado] = useState(false);
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

  /** Cuándo aparece: desde los mismos días que el aviso de WhatsApp. */
  const correspondeAvisar = aplica && (bloqueante || (dias as number) <= DIAS_AVISO);

  const claveVisto = `novapos_aviso_pago_${tenant?.id ?? 'sin-negocio'}`;

  /**
   * SALE EN CADA INICIO DE SESIÓN.
   *
   * Antes se guardaba el día: cerrado una vez, no volvía hasta el día
   * siguiente. Con la caja abierta de la mañana a la noche eso es un solo
   * aviso por jornada, y el que lo cierra a las 7 a.m. ya no se acuerda a las
   * 6 p.m. Ahora se marca contra la MARCA DE TIEMPO DEL LOGIN: se cierra y no
   * vuelve a molestar mientras dure esa sesión, pero el próximo ingreso lo
   * muestra otra vez, todos los días que falten hasta que se pague.
   *
   * Es también lo que hace el aviso de WhatsApp: insiste una vez por día.
   * El bloqueante ignora todo esto: ahí no hay nada que posponer.
   */
  const inicioSesion = (() => {
    try { return localStorage.getItem('novapos_session_login_ts') ?? ''; } catch { return ''; }
  })();

  const [vistoEnEstaSesion, setVistoEnEstaSesion] = useState<boolean>(() => {
    try { return !!inicioSesion && localStorage.getItem(claveVisto) === inicioSesion; }
    catch { return false; }
  });

  useEffect(() => {
    try {
      setVistoEnEstaSesion(!!inicioSesion && localStorage.getItem(claveVisto) === inicioSesion);
    } catch { /* privacidad */ }
    setCerrado(false);
  }, [claveVisto, inicioSesion]);

  const visible = correspondeAvisar && !cerrado && (bloqueante || !vistoEnEstaSesion);

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
    // Se marca la SESIÓN, no el día: al volver a entrar, vuelve a salir.
    try { localStorage.setItem(claveVisto, inicioSesion || hoyCR()); } catch { /* privacidad */ }
    setCerrado(true);
  };

  /**
   * EL MONTO ES EL DE ESTE CLIENTE, NO EL DEL PLAN.
   *
   * Acá se mostraba el precio de lista del plan, y a casi nadie se le cobra
   * eso: el monto pactado va en `custom_price` de la suscripción. El dueño al
   * que se le rebajó —o al que se le cobra algo aparte— leía una cifra que no
   * era la suya, hacía el SINPE por ese monto y había que devolverle o
   * cobrarle la diferencia. El portal de dueños, la factura y el aviso de
   * WhatsApp ya resolvían así: `custom_price` y, si no hay, el precio del plan.
   */
  const monto = Number(sub?.custom_price ?? sub?.plan?.price ?? 0);
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
    + (monto > 0 ? ` (${colones(monto)})` : '') + '. Ya hice el SINPE / ¿me confirman?',
  );
  /*
   * Si la página pública no tiene WhatsApp configurado, se usa el número del
   * SINPE: es el mismo contacto, y dejar el aviso sin botón era mandar al
   * dueño a buscar el número por su cuenta justo cuando se le pide que pague.
   */
  const numeroWa = whatsapp || SINPE_WA;

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

          {/* CÓMO PAGAR. Es la pregunta que venía justo después de leer el
              aviso, y la respuesta estaba en otro lado. */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">Pagar por SINPE Móvil</p>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-xl font-black text-gray-900 tracking-wide">{SINPE}</span>
              <button
                onClick={() => {
                  // Copiar evita tipear mal el número al que se le manda plata.
                  try { void navigator.clipboard?.writeText(SINPE.replace(/\D/g, '')); setCopiado(true); }
                  catch { /* sin permiso para copiar: el número queda a la vista */ }
                  setTimeout(() => setCopiado(false), 1800);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-600 hover:bg-gray-100">
                {copiado ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="text-[11px] font-semibold text-gray-500 mt-1">
              Mandá el comprobante al mismo número por WhatsApp.
            </p>
          </div>

          {/* Si ya pagó, que no sienta que el sistema lo ignora: el cobro se
              registra a mano de nuestro lado y puede tardar. */}
          <p className="text-xs text-gray-500 pt-1 leading-relaxed">
            ¿Ya pagaste? Puede que todavía no lo hayamos registrado. Mandanos el comprobante y lo
            actualizamos.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          {numeroWa && (
            <a
              href={`https://wa.me/${numeroWa}?text=${mensaje}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white"
              style={{ background: estado.color }}
            >
              <MessageCircle size={18} /> Enviar comprobante por WhatsApp
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
