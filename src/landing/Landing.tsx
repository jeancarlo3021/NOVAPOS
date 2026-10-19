import React, { useEffect, useState } from 'react';
import { traerContenido, enviarInteresado, contar } from './api';
import { C, T, E, R, S, FUENTE, FUENTE_TITULO, ANCHO, ANCHO_TEXTO } from './estilos';

/**
 * LA PÁGINA PÚBLICA.
 *
 * Sin librerías de iconos, sin Tailwind, sin router: estilos en línea sobre
 * los valores de `estilos.ts`. El visitante típico llega desde un celular con
 * datos, por una recomendación; cada décima de segundo acá se paga en gente
 * que no espera.
 *
 * El contenido lo manda el servidor (editable desde el panel admin). Si la
 * consulta falla se muestran los textos de fábrica: una página de
 * presentación que da error es un cliente que no vuelve.
 */

/** ¿Hay una sesión guardada de la aplicación? */
function haySesion(): boolean {
  try {
    return Object.keys(localStorage).some(k => /novapos_auth|sb-.*-auth-token/.test(k));
  } catch { return false; }
}

const Seccion: React.FC<{ children: React.ReactNode; fondo?: string; id?: string }> =
  ({ children, fondo, id }) => (
  <section id={id} style={{ background: fondo ?? 'transparent', padding: `${E.xxl}px ${E.lg}px` }}>
    <div style={{ maxWidth: ANCHO, margin: '0 auto' }}>{children}</div>
  </section>
);

/**
 * EL LOGO DE LA MARCA.
 *
 * El archivo real es `/favicon.svg`. Se usa como imagen y no incrustado para
 * no repetir el dibujo en el bundle: ya está en el sitio, pesa 2 kB y el
 * navegador lo tiene en caché desde el ícono de la pestaña.
 */
const Logo: React.FC<{ alto?: number }> = ({ alto = 30 }) => (
  <img src="/favicon.svg" alt="" width={alto} height={alto}
    style={{ display: 'block', borderRadius: 7 }} />
);

/**
 * LA MAQUETA DEL PRODUCTO, dibujada acá.
 *
 * Es lo que se muestra cuando el negocio todavía no subió una imagen de
 * portada —que va a ser casi siempre—. Sin esto, la mitad derecha del
 * encabezado queda vacía y la página se ve como un documento, no como el
 * sitio de un producto: el visitante llega sin saber qué es esto y lo
 * primero que necesita es VER algo.
 *
 * Va en HTML y CSS, no en una imagen: pesa cero bytes de descarga, se ve
 * nítida en cualquier pantalla y se adapta al ancho sin recortarse.
 */
const Maqueta: React.FC = () => {
  // `string` y no el literal del token: TypeScript infiere el tipo del valor
  // por omisión y después rechaza cualquier otro color.
  const linea = (ancho: string, tono: string = C.linea) => (
    <div style={{ height: 7, width: ancho, background: tono, borderRadius: 4 }} />
  );
  const fila = (nombre: string, monto: string) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${C.linea}`, fontSize: 11,
    }}>
      <span style={{ color: C.texto }}>{nombre}</span>
      <span style={{ color: C.tinta, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{monto}</span>
    </div>
  );
  return (
    // El relleno de abajo y de la derecha es el lugar donde se apoya el
    // tiquete. Sin él, el tiquete se montaba encima del botón «Cobrar y
    // facturar» y le cortaba el texto: la pieza que cuenta qué hace el
    // sistema tapaba justo la que lo dice con palabras.
    <div aria-hidden style={{ position: 'relative', paddingBottom: 46, paddingLeft: 22 }}>
      {/* Resplandor detrás: separa la maqueta del fondo sin una caja dura. */}
      <div style={{
        position: 'absolute', inset: '8% 4% 14% 8%', borderRadius: '50%',
        background: C.marcaViva, opacity: .18, filter: 'blur(46px)',
      }} />

      {/* La pantalla del sistema */}
      <div style={{
        position: 'relative', background: C.blanco, borderRadius: R.lg,
        border: `1px solid ${C.linea}`, boxShadow: S.elevada, padding: E.md,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: E.md }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#FF5F57' }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#FEBC2E' }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#28C840' }} />
          <div style={{ marginLeft: 'auto' }}>{linea('74px')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: E.md }}>
          <div style={{ display: 'grid', gap: 9, alignContent: 'start' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                background: C.fondoAlt, borderRadius: R.sm, padding: 9,
                display: 'grid', gap: 6, border: `1px solid ${C.linea}`,
              }}>
                {linea('100%')}
                {linea('58%', C.marcaSuave)}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 2, alignContent: 'start' }}>
            {fila('Café americano', '₡1.200')}
            {fila('Gallo pinto', '₡2.500')}
            {fila('Jugo natural', '₡1.100')}
            <div style={{
              display: 'flex', justifyContent: 'space-between', paddingTop: 10,
              fontSize: 13, fontWeight: 800, color: C.tinta,
            }}>
              <span>Total</span><span>₡4.800</span>
            </div>
            <div style={{
              marginTop: 10, background: C.marca, color: C.blanco, textAlign: 'center',
              padding: '9px 0', borderRadius: R.sm, fontSize: 11, fontWeight: 800,
            }}>
              Cobrar y facturar
            </div>
          </div>
        </div>
      </div>

      {/* El tiquete saliendo, apoyado sobre la pantalla. Es el gesto que
          cuenta, en una imagen, qué hace el sistema. */}
      {/* El tiquete va a la IZQUIERDA, debajo de la lista de productos.
          A la derecha se montaba encima del botón «Cobrar y facturar» y le
          cortaba el texto: la pieza que muestra qué hace el sistema tapaba
          justo a la que lo dice con palabras. Acá abajo solo hay barras
          grises, así que no esconde nada. */}
      <div style={{
        position: 'absolute', left: 0, bottom: 0, width: 138,
        background: C.blanco, borderRadius: R.sm, border: `1px solid ${C.linea}`,
        boxShadow: S.elevada, padding: 11, transform: 'rotate(-3.5deg)',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 800, color: C.marca, textAlign: 'center',
          letterSpacing: '.06em', marginBottom: 7,
        }}>
          FACTURA ELECTRÓNICA
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          {linea('100%')}{linea('82%')}{linea('66%')}
          <div style={{ height: 1, background: C.linea, margin: '3px 0' }} />
          {linea('48%', C.marcaViva)}
        </div>
        <div style={{
          marginTop: 8, fontSize: 8, color: C.suave, textAlign: 'center',
        }}>
          Aceptada por Hacienda ✓
        </div>
      </div>
    </div>
  );
};

/**
 * EL PRIMER NÚMERO DE UN TEXTO.
 *
 * Los precios y las cantidades se guardan como texto libre —«₡5.000/mes»,
 * «2 000 comprobantes»— porque así se escriben y así se muestran. Para poder
 * ordenarlos hay que sacar el número, y hay que hacerlo bien: en español el
 * punto separa los miles, así que «2.000» son dos mil y no dos. Leerlo con
 * `parseFloat` directo daría 2 y el orden saldría al revés.
 */
const numeroDe = (texto: any): number => {
  const m = String(texto ?? '').match(/[\d.,\s]+/);
  if (!m) return 0;
  const limpio = m[0].replace(/[\s.]/g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cuántos comprobantes ofrece un paquete, y cada cuánto.
 *
 * La cantidad NO se calcula: es la que está escrita, y el período es el que
 * tiene ese paquete. Un paquete de 100 al año son 100 al año, se pague por
 * mes o por año; el conmutador de arriba cambia el PRECIO, no lo que se
 * entrega. Multiplicar por doce al pasar a anual —como hacía antes— le
 * prometía al visitante doce veces los comprobantes que realmente se ofrecen.
 *
 * Por eso el período es de cada paquete y se elige en el panel: en la misma
 * lista conviven bolsas anuales y una mensual.
 */
function cantidadDePaquete(p: any): { cantidad: string; periodo: string } {
  const porMes = String(p.periodo_cantidad ?? 'anio') === 'mes';
  return {
    cantidad: String(p.cantidad ?? ''),
    periodo: porMes ? 'comprobantes al mes' : 'comprobantes al año',
  };
}

/**
 * Ordena una lista por un número, respetando «manual».
 *
 * `manual` devuelve la lista tal cual: es el orden que alguien acomodó a
 * mano en el panel, y pisarlo con un criterio automático sería deshacerle
 * el trabajo sin avisar.
 */
function ordenarPor<T>(items: T[], modo: string | undefined, valor: (x: T) => number): T[] {
  if (modo !== 'menor' && modo !== 'mayor') return items;
  const copia = [...items];
  copia.sort((a, b) => (modo === 'menor' ? valor(a) - valor(b) : valor(b) - valor(a)));
  return copia;
}

/**
 * EL ENLACE DE «LO QUIERO».
 *
 * Si el negocio puso su WhatsApp, el botón abre una conversación con el
 * mensaje YA ESCRITO, nombrando el plan o el paquete que se tocó. Eso resuelve
 * el problema real del otro lado: hasta ahora todos los botones llevaban al
 * mismo formulario y el interesado llegaba sin decir qué le interesó, así que
 * la primera respuesta siempre era «¿cuál de los planes?».
 *
 * Sin WhatsApp configurado cae al formulario de contacto, que es lo que
 * había. Nunca se queda sin destino.
 */
function enlaceQuiero(
  contacto: any, que: string, detalle?: string,
): { href: string; externo: boolean } {
  const wa = String(contacto?.whatsapp ?? '').replace(/\D/g, '');
  if (!wa) return { href: '#contacto', externo: false };
  const texto = `Hola, me interesa ${que}`
    + (detalle ? ` (${detalle})` : '')
    + '. ¿Me cuentan más?';
  return {
    href: `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`,
    externo: true,
  };
}

/** Un tilde dibujado, no una fuente de iconos: pesa 200 bytes. */
const Tilde: React.FC<{ color?: string }> = ({ color = C.marca }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden
    style={{ flexShrink: 0, marginTop: 2 }}>
    <circle cx="8" cy="8" r="8" fill={color} opacity=".12" />
    <path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={color} strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Landing: React.FC = () => {
  const [c, setC] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  /**
   * Mensual o anual.
   *
   * Arranca en MENSUAL a propósito, aunque el anual deje más plata: el
   * visitante que recién llega compara contra «cuánto me sale por mes», y
   * mostrarle primero una cifra anual de seis dígitos lo asusta antes de que
   * entienda qué incluye.
   */
  const [anual, setAnual] = useState(false);
  const [form, setForm] = useState({
    contact_name: '', business_name: '', phone: '', email: '', business_type: '', notes: '',
    // El campo trampa: una persona no lo ve, un robot lo llena. Ver routes/landing.ts.
    empresa_web: '',
  });

  useEffect(() => {
    void (async () => {
      try { setC((await traerContenido())?.contenido ?? null); } catch { setC(null); }
    })();
    contar('visita');
  }, []);

  /**
   * Quien ya es cliente no viene a leer la presentación.
   *
   * Hasta hace poco colonclick.com abría el login, y toda la clientela tiene
   * esa costumbre. Cambiar la raíz sin esto sería mandarlos a leer un folleto
   * cada mañana. Se avisa y se entra solo, con forma de quedarse.
   */
  const [redirigiendo, setRedirigiendo] = useState(false);
  useEffect(() => {
    const quiereVerla = new URLSearchParams(location.search).has('ver');
    if (!quiereVerla && haySesion()) {
      setRedirigiendo(true);
      const t = setTimeout(() => { location.href = '/app'; }, 1800);
      return () => clearTimeout(t);
    }
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      await enviarInteresado({ ...form, origen: document.referrer || '' });
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar. Probá de nuevo.');
    } finally { setEnviando(false); }
  };

  const txt = c ?? {};
  const beneficios: any[] = Array.isArray(txt.beneficios) ? txt.beneficios : [];
  const productos: any[] = ordenarPor(
    Array.isArray(txt.productos) ? txt.productos : [],
    txt.productos_orden,
    // Por PRECIO, y por el que se está mostrando: si el visitante está
    // mirando los anuales, ordenar por el mensual daría un orden que no se
    // corresponde con los números que tiene enfrente.
    (p: any) => numeroDe(anual && p.precio_anual ? p.precio_anual : p.precio),
  );
  const contacto = txt.contacto ?? {};
  const catalogo: any[] = Array.isArray(txt.catalogo) ? txt.catalogo : [];

  /**
   * EL DETALLE DE UN ARTÍCULO DEL CATÁLOGO.
   *
   * Las tarjetas son chicas (210px) y la foto va recortada a 4:3: alcanza
   * para reconocer una impresora, no para decidir comprarla. Quien toca una
   * tarjeta quiere la imagen completa, la descripción entera y poder
   * preguntar por ESE artículo sin volver a escribir cuál era.
   */
  const [verArticulo, setVerArticulo] = useState<any | null>(null);

  /** Escape cierra, y la página de atrás no rueda mientras está abierto. */
  useEffect(() => {
    if (!verArticulo) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setVerArticulo(null); };
    document.addEventListener('keydown', esc);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = previo;
    };
  }, [verArticulo]);
  const paquetes: any[] = ordenarPor(
    Array.isArray(txt.paquetes) ? txt.paquetes : [],
    txt.paquetes_orden,
    // Por CANTIDAD, que es por lo que se elige un paquete de comprobantes.
    (p: any) => numeroDe(p.cantidad),
  );
  /**
   * ¿Vale la pena mostrar el conmutador? Solo si hay algo que conmutar.
   *
   * Mira planes Y paquetes: un conmutador que no cambia nada es peor que no
   * tenerlo —el visitante lo toca, no pasa nada y deja de confiar en el resto
   * de la página—, y eso pasaría si solo mirara los planes mientras los
   * paquetes sí tienen precio anual.
   */
  const hayAnualPlanes = productos.some(p => String(p.precio_anual ?? '').trim());
  const hayAnualPaquetes = paquetes.some((p: any) => String(p.precio_anual ?? '').trim());
  const hayAnual = hayAnualPlanes || hayAnualPaquetes;

  const campo: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: T.cuerpo,
    border: `1px solid ${C.linea}`, borderRadius: R.md, outline: 'none', background: C.blanco,
    fontFamily: 'inherit', color: C.tinta,
  };

  return (
    <div style={{ fontFamily: FUENTE, color: C.texto, background: C.fondo, overflowX: 'hidden' }}>
      {/* Estilos que no se pueden escribir en línea: foco visible, placeholders,
          y que el desplazamiento a «contacto» no quede tapado por la barra. */}
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        h1, h2, .display { font-family: ${FUENTE_TITULO}; font-weight: 700;
          letter-spacing: -.02em; }
        html { scroll-behavior: smooth; }
        input:focus, textarea:focus { border-color: ${C.marca} !important;
          box-shadow: 0 0 0 3px ${C.marcaSuave}; }
        ::placeholder { color: ${C.suave}; opacity: 1; }
        .cta:hover { background: ${C.marcaOscuro} !important; transform: translateY(-1px); }
        .cta { transition: background .15s ease, transform .15s ease; }
        .tarjeta { transition: box-shadow .2s ease, transform .2s ease; }
        .tarjeta:hover { box-shadow: ${S.elevada}; transform: translateY(-2px); }
        #contacto { scroll-margin-top: 80px; }
      `}</style>

      {redirigiendo && (
        <div style={{
          background: C.marca, color: C.blanco, padding: '10px 20px',
          textAlign: 'center', fontSize: T.chico, fontWeight: 600,
        }}>
          Ya tenés sesión: te llevamos a tu sistema…{' '}
          <a href="?ver=1" style={{ color: C.blanco, textDecoration: 'underline' }}>quedarme acá</a>
        </div>
      )}

      {/* BARRA. Pegada arriba y traslúcida: el botón de entrar queda siempre
          a mano sin tapar el contenido. */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${C.linea}`,
      }}>
        <div style={{
          maxWidth: ANCHO, margin: '0 auto', padding: `${E.sm}px ${E.lg}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: E.md,
        }}>
          <a href="/" style={{
            display: 'flex', alignItems: 'center', gap: E.sm,
            textDecoration: 'none', color: C.tinta,
          }}>
            <Logo alto={30} />
            <strong className="display" style={{ fontSize: '1.2rem' }}>
              {txt.marca ?? 'ColónClick'}
            </strong>
          </a>
          <nav style={{ display: 'flex', alignItems: 'center', gap: E.sm }}>
            <a href="#contacto" style={{
              textDecoration: 'none', color: C.texto, fontWeight: 600,
              fontSize: T.chico, padding: '8px 10px',
            }}>Contacto</a>
            <a href="/login" onClick={() => contar('clic_entrar')}
              style={{
                textDecoration: 'none', color: C.marca, fontWeight: 700, fontSize: T.chico,
                border: `1.5px solid ${C.marca}`, padding: '8px 16px', borderRadius: R.md,
              }}>
              Entrar
            </a>
          </nav>
        </div>
      </header>

      {/* ── LO PRIMERO QUE SE LEE ──────────────────────────────────────────
          Un degradado muy suave en vez de un bloque plano: da profundidad sin
          competir con el texto, que es lo único que tiene que leerse acá. */}
      <div style={{ background: `linear-gradient(180deg, ${C.marcaSuave}55 0%, ${C.fondo} 72%)` }}>
        <Seccion>
          <div style={{
            display: 'grid', gap: E.xl, alignItems: 'center',
            // Siempre en dos columnas: si el negocio no subió imagen, la
            // derecha la ocupa la maqueta dibujada. Antes quedaba vacía.
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            /* Sin espacio de más abajo: el degradado ya separa esta zona de
               la siguiente. Con el relleno de la sección sumado al propio,
               quedaba un vacío de casi ciento cuarenta píxeles entre el
               titular y lo que sigue, y la página se leía como cortada. */
            paddingTop: E.sm, paddingBottom: 0,
          }}>
            <div>
              {/* Una sola línea de contexto antes del titular: ubica al
                  visitante en dos segundos. */}
              <span style={{
                display: 'inline-block', background: C.marcaSuave, color: C.marcaOscuro,
                fontSize: T.mini, fontWeight: 800, letterSpacing: '.07em',
                textTransform: 'uppercase', padding: '5px 11px', borderRadius: R.pill,
                marginBottom: E.md,
              }}>
                Hecho en Costa Rica
              </span>
              <h1 style={{
                fontSize: T.h1, lineHeight: 1.08, margin: `0 0 ${E.md}px`,
                letterSpacing: '-.03em', color: C.tinta, fontWeight: 800,
              }}>
                {txt.titulo ?? 'El punto de venta y la facturación electrónica de tu negocio'}
              </h1>
              <p style={{
                fontSize: T.cuerpoGrande, color: C.texto, lineHeight: 1.6,
                margin: `0 0 ${E.lg}px`, maxWidth: ANCHO_TEXTO,
              }}>
                {txt.bajada ?? ''}
              </p>
              <div style={{ display: 'flex', gap: E.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                <a href="#contacto" className="cta"
                  style={{
                    display: 'inline-block', background: C.marca, color: C.blanco,
                    textDecoration: 'none', fontWeight: 800, padding: '14px 28px',
                    borderRadius: R.md, fontSize: T.cuerpo, boxShadow: S.tarjeta,
                  }}>
                  {txt.cta_texto ?? 'Pedir una demostración'}
                </a>
                <a href="/login" style={{
                  color: C.texto, fontWeight: 700, fontSize: T.chico,
                  textDecoration: 'none', padding: '14px 10px',
                }}>
                  Ya soy cliente →
                </a>
              </div>
              {contacto.whatsapp && (
                <p style={{ margin: `${E.md}px 0 0`, fontSize: T.chico, color: C.suave }}>
                  O escribinos por{' '}
                  <a href={`https://wa.me/${String(contacto.whatsapp).replace(/\D/g, '')}`}
                    style={{ color: C.marca, fontWeight: 700 }}>WhatsApp</a>
                </p>
              )}
            </div>

            {/* La imagen de arriba. `aspectRatio` reserva el lugar ANTES de que
                llegue: sin eso el texto salta y el visitante pierde el renglón
                que estaba leyendo. */}
            {txt.imagen ? (
              <img src={txt.imagen} alt="" loading="eager" decoding="async"
                style={{
                  width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
                  borderRadius: R.xl, display: 'block', background: C.fondoAlt,
                  boxShadow: S.elevada,
                }} />
            ) : <Maqueta />}
          </div>
        </Seccion>
      </div>

      {/* ── QUIÉNES YA LO USAN ──────────────────────────────────────────
          Los logos salen de los que el administrador eligió en el panel, no
          de todos los clientes del sistema: publicar la marca de un negocio
          es decisión de ese negocio. Si no eligió ninguno, la franja no
          existe en vez de mostrar un hueco con un título solo. */}
      {Array.isArray(txt.clientes) && txt.clientes.length > 0 && (
        <section style={{
          padding: `${E.lg}px ${E.lg}px`, borderTop: `1px solid ${C.linea}`,
          borderBottom: `1px solid ${C.linea}`, background: C.fondoAlt,
        }}>
          <div style={{ maxWidth: ANCHO, margin: '0 auto' }}>
            <p style={{
              textAlign: 'center', fontSize: T.mini, fontWeight: 800, letterSpacing: '.08em',
              textTransform: 'uppercase', color: C.suave, margin: `0 0 ${E.md}px`,
            }}>
              {txt.clientes_titulo ?? 'Negocios que ya facturan con ColónClick'}
            </p>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: E.lg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {txt.clientes.map((cl: any, i: number) => (
                <img key={i} src={cl.logo} alt={cl.nombre} title={cl.nombre}
                  loading="lazy" decoding="async"
                  style={{
                    height: 38, width: 'auto', maxWidth: 130, objectFit: 'contain',
                    // En escala de grises y con opacidad: ocho logos de ocho
                    // marcas distintas, cada uno con sus colores, compiten
                    // entre sí y con el resto de la página. Al pasar el mouse
                    // recuperan su color.
                    filter: 'grayscale(1)', opacity: .55,
                    transition: 'filter .2s ease, opacity .2s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'grayscale(1)'; e.currentTarget.style.opacity = '.55'; }} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── POR QUÉ SIRVE ──
          Pegada al bloque de arriba: son la continuación de la promesa del
          titular, no una sección aparte. */}
      {beneficios.length > 0 && (
        <section style={{ padding: `${E.lg}px ${E.lg}px ${E.xxl}px` }}>
          <div style={{ maxWidth: ANCHO, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gap: E.lg,
            gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))',
          }}>
            {beneficios.map((b, i) => (
              <div key={i} style={{
                background: C.fondoAlt, borderRadius: R.lg, padding: E.lg,
                border: `1px solid ${C.linea}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: R.sm, background: C.marcaSuave,
                  display: 'grid', placeItems: 'center', marginBottom: E.md,
                }}>
                  <Tilde />
                </div>
                <h3 style={{ fontSize: T.h3, margin: `0 0 ${E.xs}px`, color: C.tinta, fontWeight: 700 }}>
                  {b.titulo}
                </h3>
                <p style={{ color: C.texto, fontSize: T.cuerpo, lineHeight: 1.6, margin: 0 }}>
                  {b.detalle}
                </p>
              </div>
            ))}
            </div>
          </div>
        </section>
      )}

      {/* ── LO QUE OFRECE. Se edita desde el panel admin. ── */}
      {productos.length > 0 && (
        <Seccion fondo={C.fondoAlt}>
          <div style={{ textAlign: 'center', maxWidth: ANCHO_TEXTO, margin: `0 auto ${E.lg}px` }}>
            <h2 style={{ fontSize: T.h2, margin: `0 0 ${E.xs}px`, color: C.tinta }}>
              {txt.productos_titulo ?? 'Planes'}
            </h2>
            {txt.productos_bajada && (
              <p style={{ color: C.texto, fontSize: T.cuerpo, margin: 0, lineHeight: 1.6 }}>
                {txt.productos_bajada}
              </p>
            )}
          </div>

          {/* MENSUAL / ANUAL.
              Solo aparece si ALGÚN plan tiene precio anual cargado. Un
              conmutador que no cambia nada es peor que no tenerlo: el
              visitante lo toca, no pasa nada y deja de confiar en el resto
              de la página. */}
          {hayAnual && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: E.lg }}>
              <div style={{
                display: 'inline-flex', background: C.blanco, padding: 4,
                borderRadius: R.pill, border: `1px solid ${C.linea}`, gap: 2,
              }}>
                {([[false, 'Mensual'], [true, 'Anual']] as const).map(([v, etiqueta]) => (
                  <button key={etiqueta} onClick={() => setAnual(v)}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      padding: '8px 20px', borderRadius: R.pill, fontSize: T.chico, fontWeight: 700,
                      background: anual === v ? C.marca : 'transparent',
                      color: anual === v ? C.blanco : C.texto,
                      transition: 'background .15s ease, color .15s ease',
                    }}>
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Con uno o dos planes se limita el ancho y se centra: estirada a
              todo el ancho, una sola tarjeta de precio se ve como un error de
              maquetación más que como una oferta. */}
          <div style={{
            display: 'grid', gap: E.md, alignItems: 'start',
            gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))',
            maxWidth: productos.length === 1 ? 400 : productos.length === 2 ? 760 : undefined,
            margin: '0 auto',
          }}>
            {productos.map((p, i) => (
              <div key={i} className="tarjeta" style={{
                background: C.blanco, borderRadius: R.xl, padding: E.lg,
                border: p.destacado ? `2px solid ${C.marca}` : `1px solid ${C.linea}`,
                boxShadow: p.destacado ? S.elevada : S.tarjeta,
                display: 'flex', flexDirection: 'column', position: 'relative',
              }}>
                {p.destacado && (
                  <span style={{
                    position: 'absolute', top: -11, left: E.lg,
                    background: C.marca, color: C.blanco, fontSize: T.mini,
                    fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
                    padding: '4px 11px', borderRadius: R.pill,
                  }}>Más pedido</span>
                )}
                {p.imagen ? (
                  <img src={p.imagen} alt="" loading="lazy" decoding="async"
                    style={{
                      width: '100%', aspectRatio: '16 / 10', objectFit: 'cover',
                      borderRadius: R.md, display: 'block', marginBottom: E.md,
                      background: C.fondoAlt,
                    }} />
                ) : null}
                <h3 style={{ fontSize: T.h3, margin: `0 0 ${E.xs}px`, color: C.tinta, fontWeight: 700 }}>
                  {p.nombre}
                </h3>
                {/* El precio según el conmutador. Un plan sin precio anual
                    lo dice en vez de repetir el mensual con otra etiqueta,
                    que sería hacerle creer al visitante que pagando por año
                    paga lo mismo. */}
                {(() => {
                  const mostrado = anual ? (p.precio_anual || '') : (p.precio || '');
                  if (!mostrado && anual && p.precio) {
                    return (
                      <p style={{ fontSize: T.cuerpo, color: C.suave, margin: `${E.xs}px 0 ${E.sm}px` }}>
                        Solo por mes · <b style={{ color: C.tinta }}>{p.precio}</b>
                      </p>
                    );
                  }
                  if (!mostrado) return null;
                  return (
                    <div style={{ margin: `${E.xs}px 0 ${E.sm}px` }}>
                      <p className="display" style={{
                        fontSize: '1.75rem', color: C.marca, margin: 0, letterSpacing: '-.02em',
                      }}>{mostrado}</p>
                      {anual && p.ahorro && (
                        <span style={{
                          display: 'inline-block', marginTop: 5, background: C.marcaSuave,
                          color: C.marcaOscuro, fontSize: T.mini, fontWeight: 800,
                          padding: '3px 9px', borderRadius: R.pill,
                        }}>{p.ahorro}</span>
                      )}
                    </div>
                  );
                })()}
                {p.descripcion && (
                  <p style={{ color: C.texto, fontSize: T.cuerpo, lineHeight: 1.55, margin: `0 0 ${E.md}px` }}>
                    {p.descripcion}
                  </p>
                )}
                {Array.isArray(p.incluye) && p.incluye.length > 0 && (
                  <ul style={{
                    margin: 0, padding: 0, listStyle: 'none', fontSize: T.chico,
                    color: C.texto, display: 'grid', gap: E.xs,
                    borderTop: `1px solid ${C.linea}`, paddingTop: E.md,
                  }}>
                    {p.incluye.map((x: string, j: number) => (
                      <li key={j} style={{ display: 'flex', gap: E.xs, alignItems: 'flex-start', lineHeight: 1.45 }}>
                        <Tilde /> <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(() => {
                  // El mensaje nombra el plan y el precio que el visitante
                  // está viendo: si está mirando los anuales, que diga el anual.
                  const mostrado = anual ? (p.precio_anual || p.precio) : p.precio;
                  const l = enlaceQuiero(contacto, `el plan ${p.nombre}`, mostrado);
                  return (
                    <a href={l.href} className="cta"
                      {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      style={{
                        marginTop: E.md, textAlign: 'center', textDecoration: 'none',
                        background: p.destacado ? C.marca : 'transparent',
                        color: p.destacado ? C.blanco : C.marca,
                        border: p.destacado ? 'none' : `1.5px solid ${C.marca}`,
                        fontWeight: 700, padding: '11px 16px', borderRadius: R.md, fontSize: T.chico,
                      }}>
                      Lo quiero
                    </a>
                  );
                })()}
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {/* ── PAQUETES DE FACTURAS ───────────────────────────────────────
          Sección propia y diseño distinto: estos se comparan por CANTIDAD,
          no por funciones. Por eso el número grande arriba y la lista de
          módulos ausente — meterlos entre los planes obligaría al visitante
          a comparar peras con manzanas justo cuando está decidiendo. */}
      {paquetes.length > 0 && (
        <Seccion>
          <div style={{ textAlign: 'center', maxWidth: ANCHO_TEXTO, margin: `0 auto ${E.xl}px` }}>
            <span style={{
              display: 'inline-block', fontSize: T.mini, fontWeight: 800,
              letterSpacing: '.08em', textTransform: 'uppercase', color: C.marca,
              marginBottom: E.xs,
            }}>
              Facturación electrónica
            </span>
            <h2 style={{ fontSize: T.h2, margin: `0 0 ${E.xs}px`, color: C.tinta }}>
              {txt.paquetes_titulo ?? 'Paquetes de facturas'}
            </h2>
            {txt.paquetes_bajada && (
              <p style={{ color: C.texto, fontSize: T.cuerpo, margin: 0, lineHeight: 1.6 }}>
                {txt.paquetes_bajada}
              </p>
            )}
          </div>
          {/* El conmutador, si no salió ya con los planes.
              Uno solo por página: dos controles que hacen lo mismo en
              pantallas distintas se desincronizan en la cabeza del visitante,
              que termina sin saber qué precio está mirando. */}
          {hayAnual && productos.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: E.lg }}>
              <div style={{
                display: 'inline-flex', background: C.blanco, padding: 4,
                borderRadius: R.pill, border: `1px solid ${C.linea}`, gap: 2,
              }}>
                {([[false, 'Mensual'], [true, 'Anual']] as const).map(([v, etiqueta]) => (
                  <button key={etiqueta} onClick={() => setAnual(v)}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      padding: '8px 20px', borderRadius: R.pill, fontSize: T.chico, fontWeight: 700,
                      background: anual === v ? C.marca : 'transparent',
                      color: anual === v ? C.blanco : C.texto,
                      transition: 'background .15s ease, color .15s ease',
                    }}>
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{
            display: 'grid', gap: E.md, alignItems: 'start',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          }}>
            {paquetes.map((p: any, i: number) => (
              <div key={i} className="tarjeta" style={{
                background: C.blanco, borderRadius: R.xl, padding: E.lg, textAlign: 'center',
                border: p.destacado ? `2px solid ${C.marca}` : `1px solid ${C.linea}`,
                boxShadow: p.destacado ? S.elevada : S.tarjeta,
                position: 'relative',
              }}>
                {p.destacado && (
                  <span style={{
                    position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                    background: C.marca, color: C.blanco, fontSize: T.mini, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.06em',
                    padding: '4px 11px', borderRadius: R.pill, whiteSpace: 'nowrap',
                  }}>El más pedido</span>
                )}
                {/* La CANTIDAD manda: es por lo que se elige un paquete, y
                    va con el período que corresponde al precio de al lado. */}
                {(() => {
                  const q = cantidadDePaquete(p);
                  return (
                    <>
                      <p className="display" style={{
                        fontSize: '1.9rem', color: C.tinta, margin: 0, letterSpacing: '-.02em',
                      }}>
                        {q.cantidad.replace(/\s*comprobantes?/i, '')}
                      </p>
                      <p style={{ fontSize: T.chico, color: C.suave, margin: `2px 0 ${E.md}px` }}>
                        {q.periodo}
                      </p>
                    </>
                  );
                })()}
                {/* El precio según el conmutador. Un paquete sin precio
                    anual lo dice, en vez de repetir el mensual con otra
                    etiqueta: eso sería hacerle creer al visitante que
                    pagando por año paga lo mismo. */}
                {(() => {
                  const mostrado = anual ? (p.precio_anual || '') : (p.precio || '');
                  if (!mostrado && anual && p.precio) {
                    return (
                      <p style={{ fontSize: T.chico, color: C.suave, margin: 0 }}>
                        Solo por mes · <b style={{ color: C.tinta }}>{p.precio}</b>
                      </p>
                    );
                  }
                  return (
                    <>
                      <p style={{ fontSize: T.h3, fontWeight: 800, color: C.marca, margin: 0 }}>
                        {mostrado}
                      </p>
                      {anual && p.ahorro && (
                        <span style={{
                          display: 'inline-block', marginTop: 4, background: C.marcaSuave,
                          color: C.marcaOscuro, fontSize: T.mini, fontWeight: 800,
                          padding: '3px 9px', borderRadius: R.pill,
                        }}>{p.ahorro}</span>
                      )}
                    </>
                  );
                })()}
                <p style={{ fontSize: T.chico, color: C.texto, margin: `${E.xs}px 0 0`, fontWeight: 600 }}>
                  {p.nombre}
                </p>
                {p.descripcion && (
                  <p style={{ fontSize: T.chico, color: C.suave, margin: `${E.xs}px 0 0`, lineHeight: 1.5 }}>
                    {p.descripcion}
                  </p>
                )}
                {(() => {
                  // El mensaje nombra el precio que el visitante tiene
                  // enfrente: escribir otro es la peor forma de empezar
                  // una conversación de venta.
                  const precioMostrado = anual ? (p.precio_anual || p.precio) : p.precio;
                  const q = cantidadDePaquete(p);
                  const cuanto = `${q.cantidad.replace(/\s*comprobantes?/i, '')} ${q.periodo}`;
                  const l = enlaceQuiero(contacto, `el paquete ${p.nombre}`,
                    `${cuanto}${precioMostrado ? ' · ' + precioMostrado : ''}`);
                  return (
                    <a href={l.href} className="cta"
                      {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      style={{
                        display: 'block', marginTop: E.md, textAlign: 'center', textDecoration: 'none',
                        background: p.destacado ? C.marca : 'transparent',
                        color: p.destacado ? C.blanco : C.marca,
                        border: p.destacado ? 'none' : `1.5px solid ${C.marca}`,
                        fontWeight: 700, padding: '10px 14px', borderRadius: R.md, fontSize: T.chico,
                      }}>
                      Lo quiero
                    </a>
                  );
                })()}
              </div>
            ))}
          </div>
          <p style={{
            textAlign: 'center', marginTop: E.lg, fontSize: T.chico, color: C.suave,
          }}>
            ¿No sabés cuántas necesitás?{' '}
            <a href="#contacto" style={{ color: C.marca, fontWeight: 700 }}>Contanos cuánto facturás</a>{' '}
            y te decimos cuál te sirve.
          </p>
        </Seccion>
      )}

      {/* ── CATÁLOGO ───────────────────────────────────────────────────
          Lo que se compra una vez: equipo, accesorios, servicios sueltos.
          Va DESPUÉS de los planes y en una cuadrícula distinta —más piezas,
          más chicas— para que se lea como otra cosa. Mezclado entre los
          planes, un accesorio de ₡30.000 compite con la decisión principal,
          que es elegir plan. */}
      {catalogo.length > 0 && (
        <Seccion fondo={C.fondoAlt}>
          <div style={{ textAlign: 'center', maxWidth: ANCHO_TEXTO, margin: `0 auto ${E.xl}px` }}>
            <span style={{
              display: 'inline-block', fontSize: T.mini, fontWeight: 800,
              letterSpacing: '.08em', textTransform: 'uppercase', color: C.marca,
              marginBottom: E.xs,
            }}>
              Pago único
            </span>
            <h2 style={{ fontSize: T.h2, margin: `0 0 ${E.xs}px`, color: C.tinta }}>
              {txt.catalogo_titulo ?? 'Catálogo'}
            </h2>
            {txt.catalogo_bajada && (
              <p style={{ color: C.texto, fontSize: T.cuerpo, margin: 0, lineHeight: 1.6 }}>
                {txt.catalogo_bajada}
              </p>
            )}
          </div>
          <div style={{
            display: 'grid', gap: E.md, alignItems: 'start',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          }}>
            {catalogo.map((a: any, i: number) => (
              <div key={i} className="tarjeta"
                role="button" tabIndex={0}
                aria-label={`Ver detalles de ${a.nombre}`}
                onClick={() => setVerArticulo(a)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVerArticulo(a); }
                }}
                style={{
                background: C.blanco, borderRadius: R.lg, overflow: 'hidden',
                border: `1px solid ${C.linea}`, boxShadow: S.tarjeta,
                display: 'flex', flexDirection: 'column', cursor: 'pointer',
              }}>
                {a.imagen ? (
                  <img src={a.imagen} alt="" loading="lazy" decoding="async"
                    style={{
                      width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
                      display: 'block', background: C.fondoAlt,
                    }} />
                ) : (
                  // Sin foto, un bloque con la inicial: una tarjeta vacía
                  // arriba se ve como una imagen que no cargó.
                  <div style={{
                    aspectRatio: '4 / 3', background: C.marcaSuave, display: 'grid',
                    placeItems: 'center', color: C.marca, fontSize: '1.8rem', fontWeight: 800,
                  }} className="display">
                    {String(a.nombre ?? '?').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ padding: E.md, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{ fontSize: T.cuerpo, margin: `0 0 ${E.xs}px`, color: C.tinta, fontWeight: 700 }}>
                    {a.nombre}
                  </h3>
                  {a.descripcion && (
                    <p style={{ color: C.texto, fontSize: T.chico, lineHeight: 1.5, margin: `0 0 ${E.sm}px` }}>
                      {a.descripcion}
                    </p>
                  )}
                  {a.precio && (
                    <p style={{
                      marginTop: 'auto', marginBottom: 0, fontSize: '1.15rem',
                      fontWeight: 800, color: C.marca,
                    }}>{a.precio}</p>
                  )}
                  {/* Que se pueda abrir tiene que VERSE. Una tarjeta que
                      reacciona al toque sin anunciarlo es una función que
                      nadie encuentra. */}
                  <span style={{
                    marginTop: E.sm, fontSize: T.mini, fontWeight: 700,
                    color: C.marca, letterSpacing: '.02em',
                  }}>Ver detalles →</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: E.lg }}>
            <a href="#contacto" style={{ color: C.marca, fontWeight: 700, fontSize: T.cuerpo }}>
              Consultar por cualquiera de estos →
            </a>
          </p>
        </Seccion>
      )}

      {/* ── DETALLE DE UN ARTÍCULO DEL CATÁLOGO ──────────────────────
          Sin portal: la página no tiene ancestros con `transform` ni
          `overflow` que recorten un `position: fixed`, así que no hace falta
          la complicación. */}
      {verArticulo && (
        <div
          onClick={() => setVerArticulo(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(17,25,38,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: E.md,
          }}>
          <div
            role="dialog" aria-modal="true" aria-label={verArticulo.nombre}
            onClick={e => e.stopPropagation()}
            style={{
              background: C.blanco, borderRadius: R.xl, overflow: 'hidden',
              width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
              boxShadow: S.elevada, position: 'relative',
            }}>
            <button
              onClick={() => setVerArticulo(null)}
              aria-label="Cerrar"
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 2,
                width: 34, height: 34, borderRadius: R.pill, border: 'none',
                background: 'rgba(17,25,38,.55)', color: C.blanco,
                fontSize: 19, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
              }}>×</button>

            {/* `contain`, no `cover`: en la tarjeta se recorta para que la
                cuadrícula quede pareja, pero acá el visitante vino a ver el
                artículo completo y cortarle los bordes a una impresora es
                esconder justo lo que está mirando. */}
            {verArticulo.imagen ? (
              <img src={verArticulo.imagen} alt=""
                style={{
                  width: '100%', maxHeight: '52vh', objectFit: 'contain',
                  display: 'block', background: C.fondoAlt,
                }} />
            ) : (
              <div style={{
                aspectRatio: '16 / 9', background: C.marcaSuave, display: 'grid',
                placeItems: 'center', color: C.marca, fontSize: '3rem', fontWeight: 800,
              }} className="display">
                {String(verArticulo.nombre ?? '?').trim().charAt(0).toUpperCase()}
              </div>
            )}

            <div style={{ padding: E.lg }}>
              <h3 className="display" style={{
                fontSize: T.h3, margin: 0, color: C.tinta, lineHeight: 1.2,
              }}>{verArticulo.nombre}</h3>

              {verArticulo.precio && (
                <p style={{
                  margin: `${E.xs}px 0 0`, fontSize: '1.5rem',
                  fontWeight: 800, color: C.marca,
                }}>{verArticulo.precio}</p>
              )}

              {/* Es la sección «Pago único»: decirlo acá evita la pregunta de
                  si se cobra todos los meses. */}
              <p style={{ margin: `2px 0 0`, fontSize: T.chico, color: C.suave }}>
                Pago único
              </p>

              {verArticulo.descripcion && (
                <p style={{
                  margin: `${E.md}px 0 0`, fontSize: T.cuerpo,
                  color: C.texto, lineHeight: 1.6,
                }}>{verArticulo.descripcion}</p>
              )}

              {/* El mensaje de WhatsApp nombra ESTE artículo con su precio:
                  el visitante no tiene que explicar cuál estaba viendo. */}
              {(() => {
                // «el artículo «X»» y no «el X»: los nombres tienen género
                // y el mensaje salía como «me interesa el Impresora».
                const l = enlaceQuiero(contacto, `el artículo «${verArticulo.nombre}»`,
                  verArticulo.precio ? String(verArticulo.precio) : undefined);
                return (
                  <a href={l.href} className="cta"
                    {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={() => setVerArticulo(null)}
                    style={{
                      display: 'block', marginTop: E.lg, textAlign: 'center',
                      textDecoration: 'none', background: C.marca, color: C.blanco,
                      fontWeight: 700, padding: '13px 18px', borderRadius: R.md,
                      fontSize: T.cuerpo,
                    }}>
                    Lo quiero
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTACTO ── */}
      <Seccion id="contacto">
        <div style={{
          display: 'grid', gap: E.xl,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          alignItems: 'start',
        }}>
          <div>
            <h2 style={{
              fontSize: T.h2, margin: `0 0 ${E.sm}px`, letterSpacing: '-.02em',
              color: C.tinta, fontWeight: 800,
            }}>
              {txt.contacto_titulo ?? 'Contanos de tu negocio'}
            </h2>
            <p style={{ color: C.texto, fontSize: T.cuerpo, lineHeight: 1.65, margin: `0 0 ${E.lg}px` }}>
              {txt.contacto_bajada
                ?? 'Dejanos tus datos y te escribimos para mostrarte cómo funciona con lo que vos vendés.'}
            </p>
            <div style={{ display: 'grid', gap: E.xs, fontSize: T.cuerpo }}>
              {contacto.telefono && (
                <p style={{ margin: 0 }}><b style={{ color: C.tinta }}>Teléfono:</b> {contacto.telefono}</p>
              )}
              {contacto.correo && (
                <p style={{ margin: 0 }}><b style={{ color: C.tinta }}>Correo:</b> {contacto.correo}</p>
              )}
              {contacto.whatsapp && (
                <p style={{ margin: `${E.sm}px 0 0` }}>
                  <a href={`https://wa.me/${String(contacto.whatsapp).replace(/\D/g, '')}`}
                    style={{ color: C.marca, fontWeight: 700 }}>Escribir por WhatsApp</a>
                </p>
              )}
            </div>
          </div>

          {enviado ? (
            <div style={{
              background: C.marcaSuave, border: `1px solid ${C.marca}33`, borderRadius: R.xl,
              padding: E.xl, display: 'grid', placeItems: 'center', textAlign: 'center',
            }}>
              <div>
                <div style={{
                  width: 46, height: 46, borderRadius: R.pill, background: C.marca,
                  display: 'grid', placeItems: 'center', margin: `0 auto ${E.md}px`,
                }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M4 8.3l2.6 2.6L12 5.4" stroke="#fff" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, margin: `0 0 ${E.xs}px`, color: C.tinta }}>
                  ¡Listo!
                </p>
                <p style={{ color: C.texto, fontSize: T.cuerpo, margin: 0, lineHeight: 1.55 }}>
                  Recibimos tus datos. Te escribimos pronto.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={enviar} style={{
              display: 'grid', gap: E.sm, background: C.blanco, padding: E.lg,
              borderRadius: R.xl, border: `1px solid ${C.linea}`, boxShadow: S.tarjeta,
            }}>
              <input required placeholder="Tu nombre *" value={form.contact_name} style={campo}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              <input placeholder="Nombre del negocio" value={form.business_name} style={campo}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} />
              <div style={{ display: 'grid', gap: E.sm, gridTemplateColumns: '1fr 1fr' }}>
                <input placeholder="Teléfono" value={form.phone} style={campo} inputMode="tel"
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                <input placeholder="Correo" value={form.email} style={campo} type="email"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <input placeholder="¿Qué vendés? (soda, ferretería, tienda…)" value={form.business_type}
                style={campo}
                onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))} />
              <textarea placeholder="¿Algo que querrías resolver?" value={form.notes} rows={3}
                style={{ ...campo, resize: 'vertical' }}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

              {/* CAMPO TRAMPA. Lo ve un robot, no una persona: fuera de la
                  pantalla y con tamaño cero, sin tabulador y oculto a los
                  lectores de pantalla. */}
              <div aria-hidden="true" style={{
                position: 'absolute', left: -9999, top: 'auto',
                width: 0, height: 0, overflow: 'hidden',
              }}>
                <input value={form.empresa_web} name="empresa_web" tabIndex={-1} autoComplete="off"
                  onChange={e => setForm(f => ({ ...f, empresa_web: e.target.value }))} />
              </div>

              {error && (
                <p style={{ color: '#B42318', fontSize: T.chico, margin: 0, fontWeight: 600 }}>{error}</p>
              )}
              <button type="submit" disabled={enviando} className="cta"
                style={{
                  background: enviando ? C.suave : C.marca, color: C.blanco, border: 'none',
                  padding: '14px 20px', borderRadius: R.md, fontSize: T.cuerpo, fontWeight: 800,
                  cursor: enviando ? 'default' : 'pointer', fontFamily: 'inherit',
                }}>
                {enviando ? 'Enviando…' : (txt.cta_texto ?? 'Pedir una demostración')}
              </button>
              <p style={{ fontSize: T.mini, color: C.suave, margin: 0, lineHeight: 1.5 }}>
                Usamos tus datos solo para contactarte. No los compartimos.
              </p>
            </form>
          )}
        </div>
      </Seccion>

      {/* Pie oscuro, del azul del logo. Cierra la página: un pie blanco
          sobre fondo blanco deja la sensación de que falta algo abajo. */}
      <footer style={{ background: C.tinta, padding: `${E.xl}px ${E.lg}px` }}>
        <div style={{
          maxWidth: ANCHO, margin: '0 auto', display: 'flex', flexWrap: 'wrap',
          gap: E.md, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: E.sm }}>
            <Logo alto={26} />
            <span style={{ color: '#fff', fontSize: T.chico, opacity: .75 }}>
              {txt.pie ?? 'ColónClick · Costa Rica'}
            </span>
          </span>
          <span style={{ display: 'flex', gap: E.md, alignItems: 'center' }}>
            {contacto.whatsapp && (
              <a href={`https://wa.me/${String(contacto.whatsapp).replace(/\D/g, '')}`}
                style={{ color: C.marcaViva, fontSize: T.chico, fontWeight: 700, textDecoration: 'none' }}>
                WhatsApp
              </a>
            )}
            <a href="/login" style={{ color: '#fff', opacity: .75, fontSize: T.chico, textDecoration: 'none' }}>
              Entrar al sistema
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
