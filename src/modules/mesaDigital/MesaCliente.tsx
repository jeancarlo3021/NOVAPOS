import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Utensils, Hand, Receipt, Wifi, MessageCircle, Star, MapPin, Lightbulb,
  Gamepad2, X, Copy, Check, Loader2, Camera, Music2,
} from 'lucide-react';
import {
  mesaPublica, type MesaPublica, type MedioPago, type OrigenVisita,
} from '@/services/mesaDigital/mesaDigitalService';

/**
 * LA PANTALLA DE LA MESA — lo que ve el cliente al escanear el QR.
 *
 * Se abre sin sesión, desde el teléfono de un desconocido, en la mesa de un
 * restaurante con mala señal. De ahí tres decisiones:
 *
 *  · Un solo viaje al servidor para todo (`mesaPublica.abrir`).
 *  · Botones grandes: se toca de pie, con una mano, a veces con el celular en
 *    la otra. Nada por debajo de 56 px de alto.
 *  · Nada que requiera instalar ni registrarse: el comensal no va a crear una
 *    cuenta para avisar que ya quiere ordenar.
 *
 * La CARTA no se reimplementa: se enlaza al menú digital que el negocio ya
 * tiene (`/m/<slug>` o `/c/<slug>`).
 */

const PAGOS: Array<{ id: MedioPago; label: string; emoji: string }> = [
  { id: 'tarjeta',  label: 'Tarjeta',     emoji: '💳' },
  { id: 'efectivo', label: 'Efectivo',    emoji: '💵' },
  { id: 'sinpe',    label: 'SINPE Móvil', emoji: '📲' },
];

/** 88888888 → 8888-8888, como se lee un teléfono acá. */
const telefono = (p: string) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};

type Hoja = null | 'mesero' | 'cuenta' | 'wifi' | 'redes' | 'lugar' | 'sugerir' | 'personas';

export const MesaCliente: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const origen = (params.get('origen') ?? 'qr') as OrigenVisita;

  const [data, setData] = useState<MesaPublica | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-existe' | 'error'>('cargando');
  const [hoja, setHoja] = useState<Hoja>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Cuántos son: se manda con el aviso para que el mesero lleve los cubiertos. */
  const [personas, setPersonas] = useState<number | null>(null);
  const [pidiendo, setPidiendo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    mesaPublica.abrir(token, origen)
      .then(d => { if (vivo) { setData(d); setEstado('ok'); } })
      .catch(e => {
        if (!vivo) return;
        setEstado(/no encontrada|404/i.test(String(e?.message)) ? 'no-existe' : 'error');
      });
    return () => { vivo = false; };
  }, [token, origen]);

  const cerrar = useCallback(() => setHoja(null), []);

  // El aviso de «listo» se va solo: es una confirmación, no algo que leer dos veces.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const cfg = data?.config;
  const color = data?.negocio.color || '#0F766E';

  const waUrl = useMemo(() => {
    const n = String(cfg?.whatsapp ?? '').replace(/\D/g, '');
    if (!n) return null;
    const texto = `Hola, estoy en la mesa ${data?.mesa.numero ?? ''}.`;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
  }, [cfg?.whatsapp, data?.mesa.numero]);

  const menuUrl = data?.menu
    ? `/${data.menu.kind === 'catalogo' ? 'c' : 'm'}/${data.menu.slug}`
    : null;

  const llamar = async (tipo: 'ordenar' | 'mesero' | 'cuenta', medio?: MedioPago) => {
    setPidiendo(tipo);
    try {
      const r = await mesaPublica.llamar(token, { tipo, personas, medio_pago: medio ?? null });
      setAviso(r.repetido
        ? 'Ya avisamos — el personal viene en camino 🙌'
        : tipo === 'cuenta' ? 'Tu cuenta está en camino 🧾'
        : tipo === 'mesero' ? '¡Listo! Un mesero viene en camino 🙌'
        : '¡Listo! Vienen a tomar tu orden 📝');
      cerrar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo avisar, intentá de nuevo.');
    } finally { setPidiendo(null); }
  };

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (estado !== 'ok' || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">🍽️</p>
          <h1 className="text-lg font-black text-gray-900">
            {estado === 'no-existe' ? 'Este código no corresponde a una mesa' : 'No pudimos cargar la mesa'}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {estado === 'no-existe'
              ? 'Puede que el código se haya cambiado. Escaneá otra vez el QR de tu mesa o pedile ayuda al personal.'
              : 'Revisá tu conexión y volvé a intentar.'}
          </p>
        </div>
      </div>
    );
  }

  if (!data.atiende) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">🕰️</p>
          <h1 className="text-lg font-black text-gray-900">{data.negocio.nombre}</h1>
          <p className="text-sm text-gray-500 mt-2">
            El servicio desde la mesa está desactivado por ahora. Llamá al personal y te atienden con gusto.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Encabezado: el nombre del local y, grande, en qué mesa está. Lo
          segundo importa más de lo que parece: el cliente que escaneó el QR de
          la mesa de al lado manda su aviso a la mesa equivocada. */}
      <header className="px-6 pt-10 pb-8 text-center text-white" style={{ background: color }}>
        {data.negocio.logo_url
          ? <img src={data.negocio.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3 bg-white/20" />
          : <div className="w-20 h-20 rounded-2xl bg-white/20 mx-auto mb-3 flex items-center justify-center text-3xl">🍽️</div>}
        <p className="text-sm opacity-90">Te damos la bienvenida a</p>
        <h1 className="text-2xl font-black leading-tight">{data.negocio.nombre}</h1>
        <span className="inline-flex items-center gap-1.5 mt-3 px-4 h-9 rounded-full bg-white/20 text-sm font-black">
          🍴 {data.mesa.nombre || `Mesa ${data.mesa.numero}`}
        </span>
        <p className="text-[11px] opacity-80 mt-2">¿No es tu mesa? Escaneá el QR de tu mesa</p>
        {cfg?.mensaje && <p className="text-sm mt-4 bg-white/15 rounded-xl px-4 py-2">{cfg.mensaje}</p>}
      </header>

      <main className="max-w-md mx-auto px-4 -mt-5">
        {/* Cuántos son: opcional, de un toque. Con esto el mesero llega con los
            cubiertos y no tiene que preguntar desde la puerta. */}
        <section className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs font-bold text-gray-500 mb-2">👥 ¿Cuántos son? · opcional</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button key={n} type="button" onClick={() => setPersonas(personas === n ? null : n)}
                aria-pressed={personas === n}
                className={`w-11 h-11 rounded-xl font-black text-sm border-2 transition ${
                  personas === n ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'}`}
                style={personas === n ? { background: color } : undefined}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => setHoja('personas')} aria-label="Más de 6"
              className={`w-11 h-11 rounded-xl font-black text-sm border-2 transition ${
                personas && personas > 6 ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'}`}
              style={personas && personas > 6 ? { background: color } : undefined}>
              {personas && personas > 6 ? personas : '+'}
            </button>
          </div>
        </section>

        {/* EL BOTÓN PRINCIPAL. Es el que resuelve la espera más larga del
            servicio: el cliente ya decidió y nadie viene a tomarle la orden. */}
        {cfg?.ver_ordenar && (
          <button type="button" onClick={() => void llamar('ordenar')} disabled={pidiendo === 'ordenar'}
            className="w-full mt-4 h-16 rounded-2xl text-white font-black text-base shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: color }}>
            {pidiendo === 'ordenar' ? <Loader2 size={20} className="animate-spin" /> : <Hand size={20} />}
            Estoy listo para ordenar
          </button>
        )}

        {menuUrl && (
          <a href={menuUrl} target="_blank" rel="noreferrer"
            className="w-full mt-3 h-14 rounded-2xl bg-white border-2 border-gray-200 font-black text-gray-800 flex items-center justify-center gap-2">
            <Utensils size={18} /> Ver el menú
          </a>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          {cfg?.ver_mesero && (
            <Ficha icono={<Hand size={22} />} label="Llamar al mesero" onClick={() => setHoja('mesero')} />
          )}
          {cfg?.ver_cuenta && (
            <Ficha icono={<Receipt size={22} />} label="Pedir la cuenta" onClick={() => setHoja('cuenta')} />
          )}
          {cfg?.ver_juegos && (
            <Ficha icono={<Gamepad2 size={22} />} label="Juegos mientras esperás" to={`/mesa/${token}/juegos`} />
          )}
          {cfg?.wifi_ssid && (
            <Ficha icono={<Wifi size={22} />} label="Wi-Fi" onClick={() => setHoja('wifi')} />
          )}
          {waUrl && (
            <Ficha icono={<MessageCircle size={22} />} label="Escribinos por WhatsApp" href={waUrl} />
          )}
          {(cfg?.instagram || cfg?.tiktok) && (
            <Ficha icono={<Camera size={22} />} label="Redes sociales" onClick={() => setHoja('redes')} />
          )}
          {cfg?.google_review && (
            <Ficha icono={<Star size={22} />} label="Calificanos en Google" href={cfg.google_review} />
          )}
          {(cfg?.direccion || cfg?.horario || cfg?.maps_url) && (
            <Ficha icono={<MapPin size={22} />} label="Cómo llegar y horario" onClick={() => setHoja('lugar')} />
          )}
          {cfg?.ver_sugerencias && (
            <Ficha icono={<Lightbulb size={22} />} label="Sugerencias" onClick={() => setHoja('sugerir')} ancha />
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-8">
          Hecho con <b className="text-gray-500">ColónClick</b>
        </p>
      </main>

      {hoja === 'mesero' && (
        <Hojita titulo="Llamar al mesero" onClose={cerrar}>
          <p className="text-sm text-gray-600">
            Le avisamos al personal que la {data.mesa.nombre || `mesa ${data.mesa.numero}`} necesita atención.
          </p>
          <BotonHoja color={color} cargando={pidiendo === 'mesero'} onClick={() => void llamar('mesero')}>
            Confirmar
          </BotonHoja>
        </Hojita>
      )}

      {hoja === 'cuenta' && (
        <HojaCuenta
          color={color} cfg={cfg!} cargando={pidiendo === 'cuenta'}
          onClose={cerrar} onConfirmar={medio => void llamar('cuenta', medio)}
        />
      )}

      {hoja === 'wifi' && (
        <Hojita titulo="Wi-Fi" onClose={cerrar}>
          <Dato label="Red" valor={cfg?.wifi_ssid ?? ''} />
          {cfg?.wifi_password && <Dato label="Contraseña" valor={cfg.wifi_password} />}
        </Hojita>
      )}

      {hoja === 'redes' && (
        <Hojita titulo="Seguinos" onClose={cerrar}>
          <div className="space-y-2">
            {cfg?.instagram && (
              <a className="flex items-center gap-2 h-12 px-4 rounded-xl border-2 border-gray-200 font-bold text-gray-700"
                href={cfg.instagram} target="_blank" rel="noreferrer"><Camera size={18} /> Instagram</a>
            )}
            {cfg?.tiktok && (
              <a className="flex items-center gap-2 h-12 px-4 rounded-xl border-2 border-gray-200 font-bold text-gray-700"
                href={cfg.tiktok} target="_blank" rel="noreferrer"><Music2 size={18} /> TikTok</a>
            )}
          </div>
        </Hojita>
      )}

      {hoja === 'lugar' && (
        <Hojita titulo="Cómo llegar y horario" onClose={cerrar}>
          {cfg?.direccion && <p className="text-sm text-gray-700">📍 {cfg.direccion}</p>}
          {cfg?.horario && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{cfg.horario}</p>}
          {cfg?.maps_url && (
            <a className="mt-3 flex items-center justify-center h-12 rounded-xl text-white font-black"
              style={{ background: color }} href={cfg.maps_url} target="_blank" rel="noreferrer">
              Abrir en Maps
            </a>
          )}
        </Hojita>
      )}

      {hoja === 'sugerir' && (
        <HojaSugerencia
          color={color} onClose={cerrar}
          onEnviar={async (estrellas, mensaje) => {
            await mesaPublica.sugerir(token, { estrellas, mensaje });
            setAviso('¡Gracias por tu sugerencia! 💛');
          }}
        />
      )}

      {hoja === 'personas' && (
        <HojaPersonas inicial={personas && personas > 6 ? personas : 7} color={color}
          onClose={cerrar} onGuardar={n => { setPersonas(n); cerrar(); }} />
      )}

      {aviso && (
        <div role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl max-w-[92vw] text-center">
          {aviso}
        </div>
      )}
    </div>
  );
};

/* ── Piezas ──────────────────────────────────────────────────────────────── */

const Ficha: React.FC<{
  icono: React.ReactNode; label: string;
  onClick?: () => void; to?: string; href?: string; ancha?: boolean;
}> = ({ icono, label, onClick, to, href, ancha }) => {
  const clase = `bg-white border border-gray-100 rounded-2xl p-4 min-h-[88px] flex flex-col items-center justify-center gap-2 text-center text-[13px] font-bold text-gray-700 shadow-sm active:scale-[0.98] transition ${ancha ? 'col-span-2' : ''}`;
  const dentro = <>{icono}<span>{label}</span></>;
  if (to)   return <Link className={clase} to={to}>{dentro}</Link>;
  if (href) return <a className={clase} href={href} target="_blank" rel="noreferrer">{dentro}</a>;
  return <button type="button" className={clase} onClick={onClick}>{dentro}</button>;
};

/** Hoja que sube desde abajo: en un teléfono es más cómodo que un modal al centro. */
const Hojita: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode }> = ({ titulo, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7" onClick={e => e.stopPropagation()}
      role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-black text-gray-900">{titulo}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const BotonHoja: React.FC<{ color: string; cargando?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> =
({ color, cargando, disabled, onClick, children }) => (
  <button type="button" onClick={onClick} disabled={cargando || disabled}
    className="w-full mt-4 h-14 rounded-2xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"
    style={{ background: color }}>
    {cargando && <Loader2 size={18} className="animate-spin" />}
    {children}
  </button>
);

const Dato: React.FC<{ label: string; valor: string }> = ({ label, valor }) => {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3 mb-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase">{label}</p>
        <p className="text-sm font-black text-gray-900 break-all">{valor}</p>
      </div>
      <button type="button" aria-label={`Copiar ${label}`}
        onClick={() => navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true); setTimeout(() => setCopiado(false), 1500);
        })}
        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500">
        {copiado ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
      </button>
    </div>
  );
};

const HojaCuenta: React.FC<{
  color: string; cargando: boolean;
  cfg: NonNullable<MesaPublica['config']>;
  onClose: () => void; onConfirmar: (m: MedioPago) => void;
}> = ({ color, cargando, cfg, onClose, onConfirmar }) => {
  const [medio, setMedio] = useState<MedioPago>('tarjeta');
  return (
    <Hojita titulo="Pedir la cuenta" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">¿Cómo querés pagar?</p>
      <div className="space-y-2">
        {PAGOS.map(p => (
          <button key={p.id} type="button" onClick={() => setMedio(p.id)}
            className={`w-full h-12 px-4 rounded-xl border-2 font-bold text-left transition ${
              medio === p.id ? 'border-transparent text-white' : 'border-gray-200 text-gray-700'}`}
            style={medio === p.id ? { background: color } : undefined}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      {/* Con el número a la vista el cliente hace el SINPE mientras el mesero
          camina: sin esto hay que esperar a que llegue para preguntárselo. */}
      {medio === 'sinpe' && cfg.sinpe_telefono && (
        <div className="mt-3">
          <Dato label="SINPE Móvil" valor={telefono(cfg.sinpe_telefono)} />
          {cfg.sinpe_nombre && <p className="text-xs text-gray-500">A nombre de <b>{cfg.sinpe_nombre}</b></p>}
          <p className="text-xs text-gray-500 mt-1">Cuando llegue el mesero, mostrale el comprobante.</p>
        </div>
      )}
      <BotonHoja color={color} cargando={cargando} onClick={() => onConfirmar(medio)}>
        Pedir la cuenta
      </BotonHoja>
    </Hojita>
  );
};

const HojaSugerencia: React.FC<{
  color: string; onClose: () => void;
  onEnviar: (estrellas: number | null, mensaje: string) => Promise<void>;
}> = ({ color, onClose, onEnviar }) => {
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  return (
    <Hojita titulo="Sugerencias" onClose={onClose}>
      <div className="flex justify-center gap-1 mb-3" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => setEstrellas(n)} aria-label={`${n} estrellas`}
            className={`w-11 h-11 text-2xl ${estrellas && n <= estrellas ? 'text-amber-400' : 'text-gray-300'}`}>
            ★
          </button>
        ))}
      </div>
      <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4} maxLength={1000}
        placeholder="Contanos cómo podemos mejorar…"
        className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-gray-400 resize-none" />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <BotonHoja color={color} cargando={enviando} disabled={!mensaje.trim()}
        onClick={() => {
          setEnviando(true); setError('');
          onEnviar(estrellas, mensaje.trim())
            .then(onClose)
            .catch(e => setError(e instanceof Error ? e.message : 'No se pudo enviar'))
            .finally(() => setEnviando(false));
        }}>
        Enviar
      </BotonHoja>
    </Hojita>
  );
};

const HojaPersonas: React.FC<{
  inicial: number; color: string; onClose: () => void; onGuardar: (n: number) => void;
}> = ({ inicial, color, onClose, onGuardar }) => {
  const [n, setN] = useState(inicial);
  return (
    <Hojita titulo="¿Cuántos son?" onClose={onClose}>
      <div className="flex items-center justify-center gap-5 py-2">
        <button type="button" onClick={() => setN(v => Math.max(1, v - 1))} aria-label="Menos"
          className="w-14 h-14 rounded-2xl border-2 border-gray-200 text-2xl font-black text-gray-600">−</button>
        <span className="text-4xl font-black text-gray-900 w-16 text-center">{n}</span>
        <button type="button" onClick={() => setN(v => Math.min(50, v + 1))} aria-label="Más"
          className="w-14 h-14 rounded-2xl border-2 border-gray-200 text-2xl font-black text-gray-600">+</button>
      </div>
      <BotonHoja color={color} onClick={() => onGuardar(n)}>Guardar</BotonHoja>
    </Hojita>
  );
};

export default MesaCliente;
