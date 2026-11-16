import React, { useState } from 'react';
import { C, T, E, R, S, ANCHO, ANCHO_TEXTO } from './estilos';

/**
 * «CÓMO FUNCIONA»: tres demostraciones que el visitante puede tocar.
 *
 * Un párrafo que dice «imprimí etiquetas con código de barras» convence menos
 * que ver la etiqueta cambiar cuando uno marca la casilla. Por eso cada módulo
 * es un juguete chico con datos de ejemplo, no una captura de pantalla.
 *
 * Todo es simulado y lo dice: nada de acá llama al servidor ni a Hacienda. Va
 * dibujado en HTML y CSS —como la maqueta del encabezado— para no sumarle
 * imágenes a una página que se abre desde un celular con datos.
 *
 * Solo están los módulos que ya se venden. Restaurante, reloj marcador y
 * tarjeta de puntos se agregan cuando salgan.
 */

const colones = (n: number) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const boton = (primario = true): React.CSSProperties => ({
  border: primario ? 'none' : `1px solid ${C.linea}`,
  background: primario ? C.marca : C.fondo,
  color: primario ? C.blanco : C.tinta,
  fontWeight: 700, fontSize: T.chico, padding: '11px 18px',
  borderRadius: R.md, cursor: 'pointer', minHeight: 44,
});

const Tarjeta: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: C.fondo, border: `1px solid ${C.linea}`, borderRadius: R.xl,
    boxShadow: S.tarjeta, padding: E.lg, ...style,
  }}>{children}</div>
);

const Explicacion: React.FC<{ titulo: string; texto: string; pasos: string[]; precio: React.ReactNode }> =
  ({ titulo, texto, pasos, precio }) => (
  <Tarjeta>
    <h3 className="display" style={{ fontSize: '1.4rem', margin: `0 0 ${E.xs}px`, color: C.tinta }}>{titulo}</h3>
    <p style={{ color: C.texto, fontSize: T.cuerpo, lineHeight: 1.6, margin: `0 0 ${E.md}px` }}>{texto}</p>
    <ol style={{ margin: 0, paddingLeft: 20, color: C.texto, fontSize: T.cuerpo, lineHeight: 1.7 }}>
      {pasos.map((p, i) => <li key={i}>{p}</li>)}
    </ol>
    <div style={{
      marginTop: E.md, padding: E.md, borderRadius: R.md,
      background: C.marcaSuave, color: C.tinta, fontSize: T.chico, lineHeight: 1.6,
    }}>{precio}</div>
  </Tarjeta>
);

/* ── ETIQUETADORA ─────────────────────────────────────────────────────── */

const PRODUCTOS = [
  { nombre: 'Martillo 16 oz', precio: 6500, codigo: '7441234500012' },
  { nombre: 'Café molido 500 g', precio: 3950, codigo: '7449876500034' },
  { nombre: 'Blusa floral talla M', precio: 12900, codigo: '7445555500056' },
];

/** Barras de mentira pero con cara de código: el ancho sale de los dígitos. */
const Barras: React.FC<{ codigo: string; ancho: number; alto: number }> = ({ codigo, ancho, alto }) => {
  const digitos = codigo.split('').map(Number);
  const barras: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < digitos.length * 4; i++) {
    const w = 1 + ((digitos[i % digitos.length] + i) % 3);
    if (i % 2 === 0) barras.push({ x, w });
    x += w;
  }
  return (
    <svg viewBox={`0 0 ${x} ${alto}`} width={ancho} height={alto} preserveAspectRatio="none" aria-hidden>
      {barras.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={alto} fill="#111" />)}
    </svg>
  );
};

const DemoEtiquetas: React.FC = () => {
  const [prod, setProd] = useState(0);
  const [tam, setTam] = useState<'50x30' | '40x25' | '60x40'>('50x30');
  const [verPrecio, setVerPrecio] = useState(true);
  const [verBarras, setVerBarras] = useState(true);
  const [verNegocio, setVerNegocio] = useState(true);
  const [copias, setCopias] = useState(3);
  const [impresas, setImpresas] = useState(0);

  const p = PRODUCTOS[prod];
  const [w, h] = tam.split('x').map(Number);
  const escala = 4.2;

  const imprimir = () => {
    setImpresas(0);
    for (let i = 1; i <= copias; i++) setTimeout(() => setImpresas(i), i * 170);
  };

  const casilla = (txt: string, v: boolean, set: (b: boolean) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.chico, color: C.texto, cursor: 'pointer' }}>
      <input type="checkbox" checked={v} onChange={e => set(e.target.checked)} /> {txt}
    </label>
  );
  const select: React.CSSProperties = {
    padding: '9px 12px', borderRadius: R.sm, border: `1px solid ${C.linea}`,
    fontSize: T.chico, color: C.tinta, background: C.fondo, minHeight: 42,
  };

  return (
    <Tarjeta style={{ display: 'flex', flexDirection: 'column', gap: E.md }}>
      <div style={{ display: 'flex', gap: E.sm, flexWrap: 'wrap' }}>
        <select value={prod} onChange={e => setProd(+e.target.value)} style={select} aria-label="Producto">
          {PRODUCTOS.map((x, i) => <option key={i} value={i}>{x.nombre}</option>)}
        </select>
        <select value={tam} onChange={e => setTam(e.target.value as any)} style={select} aria-label="Tamaño del rollo">
          <option value="50x30">50 × 30 mm</option>
          <option value="40x25">40 × 25 mm</option>
          <option value="60x40">60 × 40 mm</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: E.md, flexWrap: 'wrap' }}>
        {casilla('Precio', verPrecio, setVerPrecio)}
        {casilla('Código de barras', verBarras, setVerBarras)}
        {casilla('Nombre del negocio', verNegocio, setVerNegocio)}
      </div>

      <div style={{
        width: w * escala, height: h * escala, maxWidth: '100%', margin: '4px auto',
        background: '#fff', color: '#111', borderRadius: 6,
        boxShadow: '0 6px 18px rgba(0,0,0,.18)', padding: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', transition: 'all .25s ease',
      }}>
        {verNegocio && <div style={{ fontSize: 10, fontWeight: 800, color: C.marca, letterSpacing: '.05em' }}>FERRETERÍA EL SOL</div>}
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.15 }}>{p.nombre}</div>
        {verPrecio && <div className="display" style={{ fontWeight: 700, fontSize: 26 }}>{colones(p.precio)}</div>}
        {verBarras && (
          <>
            <div style={{ marginTop: 4 }}>
              <Barras codigo={p.codigo} ancho={Math.min(w * escala * 0.8, 190)} alto={Math.max(22, h * escala * 0.2)} />
            </div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 1 }}>{p.codigo}</div>
          </>
        )}
      </div>

      <div style={{ background: C.fondoAlt, borderRadius: R.lg, padding: E.md }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: E.sm, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: T.chico, color: C.texto }}>
            Copias
            <input type="number" min={1} max={12} value={copias}
              onChange={e => setCopias(Math.max(1, Math.min(12, +e.target.value || 1)))}
              style={{ ...select, width: 76 }} />
          </label>
          <button type="button" onClick={imprimir} style={boton()}>Imprimir</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', minHeight: 30, marginTop: E.sm }}>
          {Array.from({ length: impresas }).map((_, i) => (
            <div key={i} style={{
              width: 70, height: 44, background: '#fff', borderRadius: 4,
              boxShadow: '0 2px 6px rgba(0,0,0,.2)', display: 'grid', placeItems: 'center',
              fontSize: 10, fontWeight: 700, color: '#111',
            }}>{colones(p.precio)}</div>
          ))}
        </div>
      </div>
    </Tarjeta>
  );
};

/* ── STAND DE RESEÑAS ─────────────────────────────────────────────────── */

const LETRAS_GOOGLE = [['G', '#4285F4'], ['o', '#EA4335'], ['o', '#FBBC05'], ['g', '#4285F4'], ['l', '#34A853'], ['e', '#EA4335']];

const DemoResenas: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  const [acercando, setAcercando] = useState(false);
  const [estrellas, setEstrellas] = useState(0);

  const acercar = () => {
    setAcercando(true);
    setTimeout(() => { setAcercando(false); setAbierto(true); setEstrellas(0); }, 550);
  };

  return (
    <Tarjeta style={{ display: 'flex', flexDirection: 'column', gap: E.md }}>
      <div style={{ display: 'flex', gap: E.lg, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* El stand, dibujado. */}
        <div aria-hidden style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: 140, height: 190, background: '#fbfbf9', borderRadius: '14px 14px 4px 4px',
            boxShadow: S.elevada, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6, padding: 10, border: '1px solid #ecebe7',
          }}>
            <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-1px', color: '#4A90E2' }}>Google</div>
            <div style={{ color: '#E8A93B', fontSize: 16, letterSpacing: 2 }}>★★★★★</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#222', textAlign: 'center', lineHeight: 1.2 }}>
              DÉJANOS TU RESEÑA<br />EN GOOGLE
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#222', marginTop: 4 }}>((·)) NFC</div>
          </div>
          <div style={{ width: 160, height: 18, background: '#f1f0ec', borderRadius: 4, border: '1px solid #e4e2dc' }} />
        </div>

        {/* El celular. */}
        <div style={{
          width: 200, height: 360, borderRadius: 32, background: C.tinta, padding: 11,
          boxShadow: S.elevada, transition: 'transform .5s ease',
          transform: acercando ? 'translateX(-28px) rotate(-6deg)' : 'none',
        }}>
          <div style={{
            background: '#fff', borderRadius: 22, height: '100%', padding: 14,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, textAlign: 'center', color: '#111',
          }}>
            {!abierto ? (
              <>
                <div style={{ fontSize: 36 }} aria-hidden>📲</div>
                <strong style={{ fontSize: T.chico }}>Acercá el celular al stand</strong>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-1px' }}>
                  {LETRAS_GOOGLE.map(([l, c], i) => <span key={i} style={{ color: c }}>{l}</span>)}
                </div>
                <strong style={{ fontSize: T.chico }}>Café La Esquina</strong>
                <span style={{ fontSize: T.mini, color: '#777' }}>Calificá tu experiencia</span>
                <div style={{ display: 'flex' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" aria-label={`${n} estrellas`} onClick={() => setEstrellas(n)}
                      style={{
                        background: 'none', border: 0, cursor: 'pointer', fontSize: 28, padding: '0 2px',
                        color: n <= estrellas ? '#F5B301' : '#ccc',
                      }}>★</button>
                  ))}
                </div>
                <span style={{ fontSize: T.chico, fontWeight: 700, color: C.marca, minHeight: 20 }}>
                  {estrellas >= 4 ? '¡Gracias por tu reseña!' : estrellas > 0 ? 'Gracias, lo vamos a mejorar.' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: E.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={acercar} style={boton()}>Acercar el celular</button>
        <button type="button" onClick={() => { setAbierto(false); setEstrellas(0); }} style={boton(false)}>Reiniciar</button>
      </div>
    </Tarjeta>
  );
};

/* ── PUNTO DE VENTA + FACTURA ELECTRÓNICA ─────────────────────────────── */

const MENU = [
  { nombre: 'Café', precio: 1200 }, { nombre: 'Empanada', precio: 1500 },
  { nombre: 'Gallo pinto', precio: 3200 }, { nombre: 'Jugo natural', precio: 1800 },
  { nombre: 'Queque', precio: 1400 }, { nombre: 'Casado', precio: 4500 },
];

const DemoVenta: React.FC = () => {
  const [carrito, setCarrito] = useState<typeof MENU>([]);
  const [estado, setEstado] = useState<'' | 'enviando' | string>('');
  const total = carrito.reduce((s, x) => s + x.precio, 0);

  const cobrar = (medio: string) => {
    if (!carrito.length) { setEstado('Agregá productos primero'); return; }
    setEstado('enviando');
    setTimeout(() => {
      setEstado(`Tiquete electrónico aceptado · ${medio}`);
      setCarrito([]);
    }, 900);
  };

  return (
    <Tarjeta style={{ display: 'flex', flexDirection: 'column', gap: E.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {MENU.map((m, i) => (
          <button key={i} type="button"
            onClick={() => { setCarrito(c => [...c, m]); setEstado(''); }}
            style={{
              border: `1px solid ${C.linea}`, background: C.fondo, color: C.tinta, borderRadius: R.md,
              padding: '12px 6px', fontWeight: 700, fontSize: T.chico, cursor: 'pointer', minHeight: 64,
            }}>
            {m.nombre}
            <span style={{ display: 'block', color: C.suave, fontWeight: 500 }}>{colones(m.precio)}</span>
          </button>
        ))}
      </div>
      <div style={{
        background: '#fff', color: '#111', borderRadius: R.md, padding: E.md,
        fontFamily: 'ui-monospace, monospace', fontSize: 13, boxShadow: S.tarjeta, border: `1px solid ${C.linea}`,
      }}>
        {carrito.length === 0 ? <span style={{ color: '#888' }}>Tocá productos para agregarlos</span> : (
          <>
            {carrito.map((x, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{x.nombre}</span><span>{colones(x.precio)}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15,
              borderTop: '1px dashed #999', marginTop: 8, paddingTop: 8,
            }}>
              <span>TOTAL</span><span>{colones(total)}</span>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: E.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
        {['Efectivo', 'Tarjeta', 'SINPE'].map(m => (
          <button key={m} type="button" onClick={() => cobrar(m)} style={boton()}>{m}</button>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 700, color: C.marca, minHeight: 22, fontSize: T.chico }}>
        {estado === 'enviando' ? 'Enviando a Hacienda…' : estado}
      </div>
    </Tarjeta>
  );
};

/* ── LA SECCIÓN ───────────────────────────────────────────────────────── */

const MODULOS = [
  {
    id: 'etiquetas', nombre: 'Etiquetadora', Demo: DemoEtiquetas,
    titulo: 'Etiquetadora',
    texto: 'Diseñás tu etiqueta una vez y la imprimís para uno o cientos de productos, con los datos del inventario.',
    pasos: ['Elegí el tamaño de tu rollo de etiquetas.', 'Poné lo que necesitás: nombre, precio, código de barras o tu negocio.', 'Seleccioná los productos y tocá Imprimir.'],
    precio: <>Incluida en el plan <b>Pro</b>. En el Básico: <b>+₡2.900/mes</b>. Funciona en computadora con impresora térmica.</>,
  },
  {
    id: 'resenas', nombre: 'Stand de reseñas', Demo: DemoResenas,
    titulo: 'Stand de reseñas NFC',
    texto: 'Tus clientes te dejan reseña en Google en segundos. Más reseñas te ponen más arriba en Google Maps.',
    pasos: ['El cliente acerca el celular al stand (iPhone: arriba · Android: atrás).', 'Se abre tu página de Google.', 'Elige las estrellas y listo.'],
    precio: <>Pago único. Escribinos y te lo enviamos personalizado.</>,
  },
  {
    id: 'venta', nombre: 'Punto de venta + FE', Demo: DemoVenta,
    titulo: 'Punto de venta y factura electrónica',
    texto: 'Cobrás en segundos y el comprobante sale aceptado por Hacienda, sin pasos extra.',
    pasos: ['Tocá los productos o escaneá el código de barras.', 'Elegí cómo paga: efectivo, tarjeta o SINPE.', 'El comprobante se envía a Hacienda y al correo del cliente.'],
    precio: <>Incluido desde el plan <b>Básico</b>.</>,
  },
] as const;

export const Demos: React.FC = () => {
  const [activo, setActivo] = useState<string>(MODULOS[0].id);
  const m = MODULOS.find(x => x.id === activo) ?? MODULOS[0];
  const Demo = m.Demo;

  return (
    <section id="como-funciona" style={{ padding: `${E.xxl}px ${E.lg}px` }}>
      <div style={{ maxWidth: ANCHO, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: ANCHO_TEXTO, margin: `0 auto ${E.lg}px` }}>
          <h2 style={{ fontSize: T.h2, margin: `0 0 ${E.xs}px`, color: C.tinta }}>Probalo vos mismo</h2>
          <p style={{ color: C.texto, fontSize: T.cuerpo, margin: 0 }}>
            Tocá un módulo y usalo. Son demostraciones con datos de ejemplo.
          </p>
        </div>

        <div role="tablist" aria-label="Módulos" style={{
          display: 'flex', gap: E.sm, flexWrap: 'wrap', justifyContent: 'center', marginBottom: E.lg,
        }}>
          {MODULOS.map(x => {
            const on = x.id === activo;
            return (
              <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => setActivo(x.id)}
                style={{
                  border: `1px solid ${on ? C.tinta : C.linea}`, background: on ? C.tinta : C.fondo,
                  color: on ? C.blanco : C.tinta, fontWeight: 700, fontSize: T.chico,
                  padding: '10px 16px', borderRadius: R.pill, cursor: 'pointer', minHeight: 44,
                }}>
                {x.nombre}
              </button>
            );
          })}
        </div>

        <div style={{
          display: 'grid', gap: E.lg, alignItems: 'start',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        }}>
          <Demo key={m.id} />
          <Explicacion titulo={m.titulo} texto={m.texto} pasos={[...m.pasos]} precio={m.precio} />
        </div>
      </div>
    </section>
  );
};
