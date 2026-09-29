import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import {
  escucharPantalla, ultimoMensaje, type MensajePantalla,
} from '@/services/pos/customerDisplayService';

/** Lo que se puede personalizar (Configuración → Pantalla del cliente). */
export interface ConfigPantallaCliente {
  enabled: boolean;
  /** Se abre sola al entrar al punto de venta. */
  autoOpen: boolean;
  tema: 'oscuro' | 'claro';
  color: string;
  bienvenida: string;
  gracias: string;
  mensajes: string[];
  mostrarLogo: boolean;
  logoUrl?: string | null;
  /** Tamaño de la letra: en un monitor lejos hace falta más grande. */
  escala: 'normal' | 'grande' | 'enorme';
  mostrarCliente: boolean;
}

export const CONFIG_PANTALLA_POR_DEFECTO: ConfigPantallaCliente = {
  enabled: false,
  autoOpen: true,
  tema: 'oscuro',
  color: '#10b981',
  bienvenida: '¡Bienvenido!',
  gracias: '¡Gracias por su compra!',
  mensajes: [],
  mostrarLogo: true,
  logoUrl: null,
  escala: 'grande',
  mostrarCliente: true,
};

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/**
 * PANTALLA DEL CLIENTE (segundo monitor).
 *
 * Se abre en la pantalla que mira el cliente y solo muestra: lo que se va
 * agregando, el total y, al cobrar, el vuelto. No tiene ningún botón que cambie
 * la venta —el monitor puede ser táctil y lo toca cualquiera—.
 *
 * Todo lo que ve viene de la caja por BroadcastChannel, que no sale del
 * navegador: funciona igual sin internet, que es cuando el POS más lo necesita.
 */
export const CustomerDisplayScreen: React.FC = () => {
  const { tenantId } = useTenantId();
  const { planFeatures, loading: cargandoPlan } = useAuth();
  const enElPlan = !!(planFeatures as any)?.pos_customer_screen;
  const [cfg, setCfg] = useState<ConfigPantallaCliente>(CONFIG_PANTALLA_POR_DEFECTO);
  const [estado, setEstado] = useState<MensajePantalla>({ tipo: 'espera' });
  const [negocio, setNegocio] = useState('');
  const ultimoLatido = useRef(Date.now());

  // Config y nombre del negocio: del caché primero (para que no parpadee) y
  // después del servidor.
  useEffect(() => {
    if (!tenantId) return;
    const guardada = cacheGet<any>(cacheKey(tenantId, 'settings_customer-display'));
    if (guardada) setCfg({ ...CONFIG_PANTALLA_POR_DEFECTO, ...(guardada.config ?? guardada) });
    const gen = cacheGet<any>(cacheKey(tenantId, 'settings_general'));
    setNegocio(String((gen?.config ?? gen)?.businessName ?? ''));
    (async () => {
      try {
        // El ticket también trae logo: si la pantalla no tiene uno propio, se usa
        // ese. Es el mismo negocio, y así nadie tiene que subir dos veces la
        // misma imagen para que la pantalla no salga pelada.
        const [c, g, r] = await Promise.all([
          apiFetch<any>('/settings/customer-display').catch(() => null),
          apiFetch<any>('/settings/general').catch(() => null),
          apiFetch<any>('/settings/receipt').catch(() => null),
        ]);
        const delTicket = (r?.config ?? r)?.logoUrl ?? null;
        if (c) {
          const propia = { ...CONFIG_PANTALLA_POR_DEFECTO, ...(c.config ?? c) };
          setCfg({ ...propia, logoUrl: propia.logoUrl || delTicket });
        } else if (delTicket) {
          setCfg(prev => ({ ...prev, logoUrl: prev.logoUrl || delTicket }));
        }
        if (g) setNegocio(String((g.config ?? g)?.businessName ?? ''));
      } catch { /* queda lo cacheado */ }
    })();
  }, [tenantId]);

  // Lo que manda la caja.
  useEffect(() => {
    const previo = ultimoMensaje();
    if (previo) setEstado(previo);
    return escucharPantalla(m => {
      ultimoLatido.current = Date.now();
      if (m.tipo !== 'latido') setEstado(m);
    });
  }, []);

  /**
   * Si la caja se cierra o se recarga, la pantalla vuelve a la bienvenida.
   *
   * Sin esto se quedaba mostrando la venta del cliente anterior, que además de
   * confundir deja a la vista lo que compró alguien más.
   */
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - ultimoLatido.current > 90_000 && estado.tipo !== 'espera') {
        setEstado({ tipo: 'espera' });
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [estado.tipo]);

  // Pantalla completa: se pide al primer toque, que es lo que el navegador exige.
  useEffect(() => {
    const pedir = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
    window.addEventListener('click', pedir, { once: true });
    return () => window.removeEventListener('click', pedir);
  }, []);

  // Mensajes rotativos mientras no hay venta.
  const [iMensaje, setIMensaje] = useState(0);
  useEffect(() => {
    if (cfg.mensajes.length < 2) return;
    const t = setInterval(() => setIMensaje(i => (i + 1) % cfg.mensajes.length), 6000);
    return () => clearInterval(t);
  }, [cfg.mensajes.length]);

  /**
   * Sin la función en el plan, esta ventana no muestra nada del negocio.
   *
   * Es una dirección que se puede abrir a mano, y de lo que se dibuja acá el
   * cliente ve todo: si la función no está pagada, no hay ni ventas ni nombre en
   * pantalla. Mientras el plan carga tampoco se adelanta nada.
   */
  if (cargandoPlan) return <div style={{ background: '#0b1220', minHeight: '100vh' }} />;
  if (!enElPlan) {
    return (
      <div style={{ background: '#0b1220', color: '#93a4c4', minHeight: '100vh' }}
        className="flex items-center justify-center p-8 text-center">
        <p className="text-xl font-bold">
          La pantalla del cliente no está incluida en el plan de este negocio.
        </p>
      </div>
    );
  }

  const oscuro = cfg.tema === 'oscuro';
  const esc = cfg.escala === 'enorme' ? 1.35 : cfg.escala === 'grande' ? 1.15 : 1;
  const fondo = oscuro ? '#0b1220' : '#f8fafc';
  const texto = oscuro ? '#e5edff' : '#0f172a';
  const suave = oscuro ? '#93a4c4' : '#64748b';
  const tarjeta = oscuro ? '#131c2e' : '#ffffff';

  const lineas = estado.tipo === 'venta' ? estado.lineas : [];
  const visibles = useMemo(() => lineas.slice(-8), [lineas]);

  return (
    <div style={{ background: fondo, color: texto, minHeight: '100vh', fontSize: `${esc}rem` }}
      className="flex flex-col">

      {/* Encabezado: logo y nombre del negocio */}
      <div className="flex items-center gap-4 px-8 py-4" style={{ borderBottom: `2px solid ${cfg.color}` }}>
        {cfg.mostrarLogo && cfg.logoUrl && (
          <img src={cfg.logoUrl} alt="" style={{ maxHeight: 64 }} className="object-contain" />
        )}
        <p className="text-3xl font-black tracking-tight">{negocio || 'Bienvenido'}</p>
        {estado.tipo === 'venta' && cfg.mostrarCliente && estado.cliente && (
          <p className="ml-auto text-xl font-bold" style={{ color: suave }}>{estado.cliente}</p>
        )}
      </div>

      {/* ── Cobrado: el vuelto es lo único que importa en ese momento ── */}
      {estado.tipo === 'cobrado' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
          <p className="text-5xl font-black" style={{ color: cfg.color }}>{cfg.gracias}</p>
          <div className="rounded-3xl px-12 py-8" style={{ background: tarjeta }}>
            <p className="text-2xl font-bold" style={{ color: suave }}>Total pagado</p>
            <p className="text-6xl font-black">{money(estado.total)}</p>
            {estado.vuelto != null && estado.vuelto > 0 && (
              <>
                <p className="mt-6 text-2xl font-bold" style={{ color: suave }}>Su vuelto</p>
                <p className="text-7xl font-black" style={{ color: cfg.color }}>{money(estado.vuelto)}</p>
              </>
            )}
          </div>
          {estado.numero && (
            <p className="text-xl font-bold" style={{ color: suave }}>Comprobante {estado.numero}</p>
          )}
        </div>
      ) : estado.tipo === 'venta' && lineas.length > 0 ? (
        <>
          {/* ── Venta en curso ── */}
          <div className="flex-1 px-8 py-4 overflow-hidden">
            {lineas.length > visibles.length && (
              <p className="text-base font-bold mb-2" style={{ color: suave }}>
                … {lineas.length - visibles.length} artículo(s) más arriba
              </p>
            )}
            <table className="w-full">
              <tbody>
                {visibles.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${oscuro ? '#1e2a44' : '#e2e8f0'}` }}>
                    <td className="py-3 text-3xl font-bold">{l.nombre}</td>
                    <td className="py-3 text-2xl font-bold text-right whitespace-nowrap" style={{ color: suave }}>
                      {l.cantidad} × {money(l.precio)}
                    </td>
                    <td className="py-3 text-3xl font-black text-right whitespace-nowrap pl-6">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="px-8 py-5" style={{ background: tarjeta }}>
            {estado.descuento > 0 && (
              <div className="flex justify-between text-2xl font-bold" style={{ color: cfg.color }}>
                <span>Descuentos</span><span>−{money(estado.descuento)}</span>
              </div>
            )}
            {estado.impuesto > 0 && (
              <div className="flex justify-between text-xl font-semibold" style={{ color: suave }}>
                <span>IVA incluido</span><span>{money(estado.impuesto)}</span>
              </div>
            )}
            <div className="flex justify-between items-end mt-2">
              <span className="text-3xl font-black">TOTAL</span>
              <span className="text-7xl font-black" style={{ color: cfg.color }}>{money(estado.total)}</span>
            </div>
          </div>
        </>
      ) : (
        /* ── En espera ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">
          {cfg.mostrarLogo && cfg.logoUrl && (
            <img src={cfg.logoUrl} alt="" style={{ maxHeight: 220 }} className="object-contain" />
          )}
          <p className="text-6xl font-black" style={{ color: cfg.color }}>{cfg.bienvenida}</p>
          {cfg.mensajes.length > 0 && (
            <p className="text-3xl font-bold" style={{ color: suave }}>{cfg.mensajes[iMensaje]}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerDisplayScreen;
