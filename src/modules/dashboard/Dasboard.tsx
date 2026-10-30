import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, AlertTriangle, Package, BarChart2, Settings, Users, TrendingDown, Wallet, ClipboardList, Tag, CalendarClock, WifiOff, UserCircle, Truck, PackageCheck, HandCoins, Receipt, FileText, Inbox, Send, UserCheck, LayoutGrid, Layers, Undo2, Building2, Smartphone, UtensilsCrossed, Store, BookOpen, QrCode, CalendarDays, ShieldCheck, TrendingUp, MonitorPlay, Bookmark, User2, Sparkles , BookOpenCheck, Search, Star, Clock, UserCog} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AsistenteIA } from '@/modules/ia/AsistenteIA';
import { FichajeModal } from '@/modules/hr/fichaje/FichajeModal';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import type { PlanFeatures } from '@/context/AuthContext';
import { qzConnect, qzIsConnected } from '@/services/pos/qzTrayService';
import { GroupBranchesPanel } from './components/GroupBranchesPanel';
import { NotificationsMenu, avisoDeSuscripcion, type Aviso } from './components/NotificationsMenu';

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

function greeting(name?: string) {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return name ? `${saludo}, ${name.split(' ')[0]}` : saludo;
}

interface QuickStats {
  todayTotal: number;
  todayCount: number;
  lowStockCount: number;
  overdueAP: number;
  pendingPurchases: number;
}

// ── Tiles del menú principal — estilo Eleventa ─────────────────────────────
interface Tile {
  feature: keyof PlanFeatures | 'settings' | 'customers' | 'distribution';
  label: string;
  icon: React.ElementType;
  path: string;
  bg: string; // gradient classes
  /** Roles que NO ven este botón (separación de funciones, no permisos). */
  hideForRoles?: string[];
  /** Banderas alternativas: con cualquiera de ellas el botón también aparece. */
  alsoIf?: string[];
}

/**
 * ¿Está encendida esta bandera del plan?
 *
 * `customers` es opt-OUT: viene activa salvo que la apaguen a mano, y en los
 * planes viejos ni siquiera existe la llave. Leerla como opt-in dejaba el botón
 * escondido en los negocios que justamente debían verlo.
 */
function flagOn(pf: Partial<PlanFeatures>, f: string): boolean {
  if (f === 'customers') return (pf as any).customers !== false;
  return !!(pf as any)[f];
}

const ALL_TILES: Tile[] = [
  { feature: 'pos',              label: 'Vender',          icon: ShoppingCart,  path: '/pos',              bg: 'from-emerald-500 to-emerald-600', hideForRoles: ['cajero', 'agente'] },
  { feature: 'fe_pos',           label: 'POS Electrónico', icon: Receipt,     path: '/fe-pos',           bg: 'from-blue-600 to-indigo-600'      },
  { feature: 'proformas',        label: 'Proformas',       icon: FileText,      path: '/proformas',        bg: 'from-amber-500 to-orange-600'      },
  { feature: 'electronic_invoice', label: 'FE Facturas',   icon: FileText,     path: '/fe-facturas',      bg: 'from-cyan-500 to-sky-600'         },
  { feature: 'electronic_invoice', label: 'FE Recepción',     icon: Inbox,        path: '/fe-recepcion',   bg: 'from-violet-500 to-purple-600'      },
  { feature: 'inventory',        label: 'Inventario',      icon: Package,       path: '/inventory',        bg: 'from-lime-500 to-green-600'        },
  { feature: 'labels',           label: 'Etiquetas',       icon: Tag,           path: '/labels',           bg: 'from-fuchsia-500 to-purple-600'   },
  { feature: 'reports',          label: 'Reportes',        icon: BarChart2,     path: '/reports',          bg: 'from-indigo-500 to-indigo-600'    },
  { feature: 'expenses',         label: 'Gastos',          icon: TrendingDown,  path: '/expenses',         bg: 'from-rose-500 to-pink-600'        },
  { feature: 'accounts_payable', label: 'Cuentas',         icon: Wallet,        path: '/accounts-payable', bg: 'from-orange-500 to-amber-600'     },
  // Estaba en el menú lateral pero NO acá, así que desde el tablero no había
  // forma de llegar: para quien entra por el tablero, el módulo no existía.
  { feature: 'accounting',       label: 'Contabilidad',    icon: BookOpenCheck, path: '/accounting',       bg: 'from-slate-600 to-gray-800'       },
  /* Estaba solo en la barra lateral, igual que pasaba con Contabilidad: quien
     lleva la planilla entraba por el menú lateral porque en el tablero no
     existía. */
  { feature: 'hr',               label: 'Recursos Humanos', icon: UserCog,      path: '/hr',               bg: 'from-indigo-500 to-violet-700'    },
  { feature: 'accounts_receivable', label: 'Por Cobrar',   icon: HandCoins,     path: '/accounts-receivable', bg: 'from-teal-500 to-emerald-600'  },
  { feature: 'purchases',        label: 'Compras',         icon: ClipboardList, path: '/purchases',        bg: 'from-cyan-500 to-sky-600'         },
  { feature: 'promotions',       label: 'Promociones',     icon: Tag,           path: '/promotions',       bg: 'from-violet-500 to-purple-600'    },
  { feature: 'customers',        label: 'Clientes',        icon: UserCircle,    path: '/customers',        bg: 'from-teal-500 to-cyan-600'        },
  { feature: 'distribution',     label: 'Distribución',    icon: Truck,         path: '/distribution',     bg: 'from-cyan-500 to-blue-600'        },
  { feature: 'distribution',     label: 'Repartidor',      icon: PackageCheck,  path: '/driver',           bg: 'from-blue-500 to-indigo-600'      },
  // Flujo agente → caja. Cada rol ve solo el suyo (ver `hideForRoles` abajo).
  { feature: 'cashier_desk',     label: 'Caja',            icon: Inbox,         path: '/caja',             bg: 'from-emerald-600 to-teal-700',  hideForRoles: ['agente'] },
  { feature: 'agent_orders',     label: 'Nuevo pedido',    icon: Send,          path: '/agent-orders',     bg: 'from-sky-500 to-blue-600',      hideForRoles: ['cajero'] },
  // Bandera propia: hay negocios sin flota que igual quieren ver a sus agentes.
  // `tracking` sigue valiendo para no romper a quien ya lo tenía activo.
  { feature: 'live_team',        label: 'Equipo en vivo',  icon: Users,         path: '/equipo-en-vivo',   bg: 'from-blue-500 to-indigo-600', alsoIf: ['tracking'] },
  { feature: 'demo_requests',    label: 'Demos',           icon: MonitorPlay,   path: '/demos',            bg: 'from-indigo-500 to-blue-600' },
  { feature: 'crm_leads',        label: 'Leads',           icon: TrendingUp,    path: '/seguimiento',      bg: 'from-fuchsia-500 to-purple-600' },
  { feature: 'reservations',     label: 'Apartados',       icon: Bookmark,      path: '/apartados',        bg: 'from-violet-500 to-purple-600' },
  { feature: 'warranties',       label: 'Garantías',       icon: ShieldCheck,   path: '/garantias',        bg: 'from-cyan-500 to-teal-600' },
  { feature: 'agent_agenda',     label: 'Entregas del día', icon: Truck,        path: '/entregas',         bg: 'from-indigo-500 to-violet-600' },
  { feature: 'agent_agenda',     label: 'Agenda entregas', icon: CalendarDays,  path: '/agenda-entregas',  bg: 'from-amber-500 to-orange-600' },
  { feature: 'sales_agents',     label: 'Agentes',         icon: UserCheck,     path: '/sales-agents',     bg: 'from-sky-600 to-indigo-600',    hideForRoles: ['cajero', 'agente'] },
  { feature: 'returns',          label: 'Devoluciones',    icon: Undo2,         path: '/returns',          bg: 'from-rose-600 to-pink-700'        },
  { feature: 'supplier_returns', label: 'Devol. proveedor', icon: Truck,        path: '/supplier-returns', bg: 'from-amber-600 to-orange-700'     },
  // ── Restaurante ──────────────────────────────────────────────────────────
  // Cada uno con su propia bandera: un negocio puede tener ventanita sin salón,
  // o recetas sin ninguna de las dos.
  { feature: 'restaurant',       label: 'Restaurante',     icon: UtensilsCrossed, path: '/billing',        bg: 'from-orange-600 to-red-600'       },
  { feature: 'window_service',   label: 'Ventanita',       icon: Store,         path: '/ventanita',        bg: 'from-orange-500 to-amber-600'     },
  { feature: 'tables',           label: 'Mapa de Mesas',   icon: LayoutGrid,    path: '/tables',           bg: 'from-orange-500 to-red-500'       },
  { feature: 'modifiers',        label: 'Extras',          icon: Layers,        path: '/modifiers',        bg: 'from-violet-600 to-fuchsia-600'   },
  { feature: 'recipes',          label: 'Recetas',         icon: BookOpen,      path: '/recipes',          bg: 'from-lime-500 to-green-600'       },
  { feature: 'digital_menu',     label: 'Menú digital',    icon: QrCode,        path: '/menu-digital',     bg: 'from-teal-500 to-emerald-600'     },
  { feature: 'mesa_digital',     label: 'Mesa digital',    icon: QrCode,        path: '/mesa-digital',     bg: 'from-cyan-500 to-teal-600'        },
  { feature: 'digital_catalog',  label: 'Catálogo digital', icon: QrCode,       path: '/catalogo-digital', bg: 'from-blue-500 to-indigo-600'      },
  // Vista de cartera del contador: datos del negocio, plan y comprobantes.
  { feature: 'businesses_panel',  label: 'Negocios',        icon: Building2,     path: '/businesses',       bg: 'from-indigo-600 to-violet-700'    },
  { feature: 'android_app',      label: 'App Android',     icon: Smartphone,    path: '/android-app',      bg: 'from-emerald-600 to-green-700'    },
  { feature: 'users',            label: 'Usuarios',        icon: Users,         path: '/users',            bg: 'from-fuchsia-500 to-pink-500'     },
  { feature: 'settings',         label: 'Configuración',   icon: Settings,      path: '/settings',         bg: 'from-slate-600 to-slate-700'      },
];

export const Dashboard = () => {
  /** Asistente de preguntas sobre el negocio (hoy en modo demostración). */
  const [asistente, setAsistente] = useState(false);
  /** El modal de marcar hora. Vive en el tablero: lo usa todo el personal. */
  const [fichando, setFichando] = useState(false);
  const { user, planFeatures, tenant } = useAuth();
  const { tenantId } = useTenantId();
  const navigate = useNavigate();

  const pf = planFeatures as PlanFeatures & Record<string, boolean>;
  const hasFullInventory = pf.inventory && !pf.inventory_products_only;

  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [subEndsAt, setSubEndsAt] = useState<string | null>(null);
  const [qzConnected, setQzConnected] = useState(false);

  // Admin de SaaS no tiene tenant operativo → los endpoints tipo
  // /accounts-payable, /purchases, /reports devuelven 403 y tardan ~14 s en
  // resolver porque el middleware busca el tenant en Supabase. Detectamos
  // este caso y saltamos las llamadas de stats por completo.
  const isSaasAdmin = (planFeatures as any)?.admin_dashboard === true;

  const load = useCallback(async () => {
    if (!tenantId || isSaasAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Fecha LOCAL de la máquina (NO UTC). Con toISOString, después de las ~18:00
    // en CR (UTC-6) la fecha saltaba al día siguiente y las ventas del día se
    // veían en 0. issued_at se guarda en hora local, así que usamos fecha local.
    const _d = new Date();
    const _p = (x: number) => String(x).padStart(2, '0');
    const todayStr = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
    // issued_at es TIMESTAMPTZ: si mandamos solo YYYY-MM-DD el backend
    // interpreta el `to` como medianoche y deja afuera todas las facturas
    // del día. Mandamos timestamps explícitos para cubrir 00:00 → 23:59:59.
    const dayFrom = `${todayStr}T00:00:00`;
    const dayTo   = `${todayStr}T23:59:59.999`;

    // Timeout corto: estas llamadas son OPCIONALES, no deben bloquear el
    // dashboard 20 s si una está lenta o devuelve 403.
    const QUICK_TIMEOUT = 5000;

    // Paralelizamos TODO con Promise.allSettled — una llamada lenta o
    // fallida no atrasa al resto. Antes era secuencial (5×) y bastaba
    // que una se colgara para que el dashboard tardara minutos.
    const callOrSkip = <T,>(
      enabled: boolean,
      path: string,
    ): Promise<T | null> =>
      enabled
        ? apiFetch<T>(path, {}, QUICK_TIMEOUT).catch(() => null as any)
        : Promise.resolve(null);

    const [salesR, stockR, apR, purchR, subR] = await Promise.allSettled([
      callOrSkip<{ total_revenue: number; total_invoices: number; invoices: any[] } | any[]>(
        true,
        `/reports/sales?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}`,
      ),
      callOrSkip<{ low_stock_count: number }>(hasFullInventory, '/reports/stock'),
      callOrSkip<Array<{ status: string }>>(!!pf.accounts_payable, '/accounts-payable?status=pending'),
      callOrSkip<Array<{ id: string }>>(!!pf.purchases, '/purchases?status=pending'),
      callOrSkip<{ ends_at: string } | null>(true, '/plans/current'),
    ]);

    // Ventas — preferimos los totales pre-calculados del backend; si la
    // respuesta vino como array (formato viejo), caemos al cálculo manual.
    let todayTotal = 0, todayCount = 0;
    if (salesR.status === 'fulfilled' && salesR.value) {
      const v = salesR.value as any;
      if (!Array.isArray(v) && typeof v?.total_revenue === 'number') {
        todayTotal = Number(v.total_revenue) || 0;
        todayCount = Number(v.total_invoices ?? (Array.isArray(v.invoices) ? v.invoices.length : 0)) || 0;
      } else {
        const all = Array.isArray(v) ? v : (v?.invoices ?? []);
        todayCount = Array.isArray(all) ? all.length : 0;
        todayTotal = Array.isArray(all)
          ? all.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
          : 0;
      }
    }

    // Stock
    let lowStockCount = 0;
    if (stockR.status === 'fulfilled' && stockR.value) {
      lowStockCount = (stockR.value as any)?.low_stock_count ?? 0;
    }

    // Cuentas por pagar
    let overdueAP = 0;
    if (apR.status === 'fulfilled' && Array.isArray(apR.value)) {
      overdueAP = (apR.value as any[]).filter(r => r.status === 'overdue').length;
    }

    // Compras pendientes
    let pendingPurchases = 0;
    if (purchR.status === 'fulfilled' && Array.isArray(purchR.value)) {
      pendingPurchases = (purchR.value as any[]).length;
    }

    // Suscripción
    if (subR.status === 'fulfilled' && subR.value) {
      setSubEndsAt((subR.value as any)?.ends_at ?? null);
    }

    setStats({ todayTotal, todayCount, lowStockCount, overdueAP, pendingPurchases });
    setLoading(false);
  }, [tenantId, isSaasAdmin, hasFullInventory, pf.accounts_payable, pf.purchases]);

  useEffect(() => { load(); }, [load]);

  // Auto-conectar a QZ Tray para banner de impresora
  useEffect(() => {
    const connectQZ = async () => {
      try {
        if (qzIsConnected()) { setQzConnected(true); return; }
        await qzConnect();
        setQzConnected(true);
      } catch { setQzConnected(false); }
    };
    connectQZ();
  }, []);

  const subDaysLeft = (() => {
    if (!subEndsAt) return null;
    const d = subEndsAt.includes('T') ? new Date(subEndsAt) : new Date(subEndsAt + 'T00:00:00');
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  })();
  const showSubBanner = subDaysLeft !== null && subDaysLeft <= 15;

  const { canAccess, isExplicitlyGranted } = useRolePermissions();
  // Solo mostrar tiles habilitados por plan Y por el rol del user.
  // Settings/Configuración pasa por plan + rol (si el owner lo cerró, gerente no la ve).
  // Admin/owner: siempre ve la Recepción de facturas (por correo).
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const tiles = ALL_TILES.filter(t => {
    // Separación de funciones: el cajero cobra pero no arma ventas; el agente
    // arma pedidos pero no ve la caja. No es un "permiso", es el flujo.
    // El rol oculta por defecto, pero un permiso concedido a mano lo destraba:
    // si no, un empleado marcado como «cajero» se quedaba sin el botón de Vender
    // y solo se podía arreglar cambiándole el rol.
    if (t.hideForRoles?.includes(user?.role as any) && !isAdmin
        && !isExplicitlyGranted(t.feature as string)) return false;
    // Recepción de comprobantes: ahora es POR CORREO (no depende de Alanube).
    // El admin/owner siempre la ve; para el resto, requiere el plan + rol.
    if (t.path === '/fe-recepcion') {
      // Solo si la facturación electrónica está ACTIVA en el plan (para todos,
      // incluido el admin): sin FE no tiene sentido recepcionar comprobantes.
      if (!(pf.electronic_invoice ?? false)) return false;
      if (isAdmin) return true;
      return canAccess('electronic_invoice');
    }
    // 'settings' siempre; 'customers' visible salvo que se desactive; el resto
    // (incluida Distribución) depende del flag del plan.
    const planHas = t.feature === 'settings'
      || (t.feature === 'customers' ? (pf.customers !== false)
      // Inventario: mostrar aunque solo esté activado "solo productos".
      : t.feature === 'inventory' ? (!!pf.inventory || !!pf.inventory_products_only)
      : (pf[t.feature as keyof PlanFeatures] ?? false));
    const planAlso = (t.alsoIf ?? []).some(f => flagOn(pf, f));
    if (!planHas && !planAlso) return false;
    // Mapear feature → módulo de role_permissions. Si no hay mapeo, no se gatea.
    const moduleKey = t.feature === 'settings' ? null : t.feature;
    if (!moduleKey) return true;
    // Con banderas alternativas, cualquiera de los módulos permitidos alcanza:
    // el agente de venta tiene permiso de «clientes», no de «rastreo», y sin
    // esto el mapa del equipo le seguía quedando escondido.
    return canAccess(moduleKey as string)
      || (t.alsoIf ?? []).some(f => flagOn(pf, f) && canAccess(f));
  });

  /**
   * BUSCADOR Y FAVORITOS DEL TABLERO.
   *
   * Con treinta y pico de módulos, encontrar uno es bajar por una cuadrícula
   * leyendo etiqueta por etiqueta. Y los tres o cuatro que cada persona usa
   * todos los días quedan mezclados con los que abre una vez al mes.
   *
   * Los favoritos se guardan en el navegador y por NEGOCIO: el contador que
   * atiende tres comercios no quiere los mismos atajos en los tres, y es una
   * preferencia personal, no una configuración del negocio que haya que
   * sincronizar.
   */
  const claveFav = `novapos_tablero_favoritos_${tenantId ?? 'sin-negocio'}`;
  const [busqueda, setBusqueda] = useState('');
  const [favoritos, setFavoritos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(claveFav) ?? '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { setFavoritos(JSON.parse(localStorage.getItem(claveFav) ?? '[]')); } catch { setFavoritos([]); }
  }, [claveFav]);

  const alternarFavorito = (path: string) => {
    setFavoritos(prev => {
      const next = prev.includes(path) ? prev.filter(x => x !== path) : [...prev, path];
      try { localStorage.setItem(claveFav, JSON.stringify(next)); } catch { /* modo privado */ }
      return next;
    });
  };

  /**
   * Texto comparable: sin tildes ni mayúsculas.
   *
   * Nadie escribe tildes buscando. Sin esto, «facturacion» no encontraba
   * «Facturación» y el buscador parecía roto justo con la palabra más usada.
   */
  const sinTildes = (v: any) =>
    String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  /**
   * CÓMO LO LLAMA LA GENTE, no cómo se llama el botón.
   *
   * Probado en un navegador: buscar «facturacion» no encontraba nada, porque
   * los módulos se llaman «FE Facturas» y «FE Recepción». Quien busca escribe
   * la palabra que usa todos los días, no la etiqueta que le pusimos — y un
   * buscador que no encuentra «facturación» en un sistema de facturación se
   * siente roto a la primera.
   *
   * Solo los que hacen falta: agregar sinónimos a todo volvería la lista
   * imposible de mantener y haría que cualquier búsqueda devuelva de todo.
   */
  const SINONIMOS: Record<string, string> = {
    '/fe-facturas': 'facturacion electronica hacienda comprobantes tiquete',
    '/fe-recepcion': 'facturacion recepcion compras recibidas proveedores correo xml',
    '/pos': 'caja cobrar vender punto de venta',
    '/accounting': 'contabilidad asientos libro diario mayor balance partida doble',
    '/hr': 'rh recursos humanos planilla empleados salarios asistencia marcar hora vacaciones aguinaldo incapacidad ccss',
    '/inventory': 'bodega stock existencias productos articulos',
    '/accounts-payable': 'cuentas por pagar proveedores deudas',
    '/accounts-receivable': 'cobrar credito fiado deudores',
    '/expenses': 'gastos egresos salidas',
    '/purchases': 'compras ordenes proveedores',
    '/customers': 'clientes compradores',
    '/reports': 'reportes informes estadisticas numeros',
    '/cash-management': 'caja arqueo cierre apertura efectivo',
    '/settings': 'configuracion ajustes preferencias',
    '/users': 'usuarios empleados permisos roles',
    '/menu-digital': 'menu carta qr restaurante',
    '/catalogo-digital': 'catalogo vitrina qr productos',
    '/promotions': 'promociones descuentos ofertas 2x1',
    '/returns': 'devoluciones cambios',
    '/labels': 'etiquetas codigos de barras precios',
  };

  const q = sinTildes(busqueda);
  const tilesFiltrados = q
    ? tiles.filter(t =>
        sinTildes(t.label).includes(q)
        || sinTildes(t.path).includes(q)
        || sinTildes(SINONIMOS[t.path] ?? '').includes(q))
    : tiles;

  /**
   * Los favoritos van primero, en el orden en que se marcaron.
   *
   * Mientras se busca NO se reordena: quien escribió «conta» quiere ver lo
   * que coincide, no sus atajos arriba empujando el resultado hacia abajo.
   */
  const tilesOrdenados = q
    ? tilesFiltrados
    : [...tilesFiltrados].sort((a, b) => {
        const ia = favoritos.indexOf(a.path);
        const ib = favoritos.indexOf(b.path);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

  // Si el POS está desactivado, Distribución y Repartidor van de primero.
  if (pf.pos === false) {
    const isDist = (t: Tile) => t.path === '/distribution' || t.path === '/driver';
    tiles.sort((a, b) => Number(isDist(b)) - Number(isDist(a)));
  }

  /**
   * AVISOS para el menú flotante de notificaciones.
   *
   * Antes esto eran tres chips sueltos en el tablero y un banner aparte para la
   * impresora. Cada uno se veía solo si uno estaba mirando esa parte de la
   * pantalla, y los avisos que no tenían chip —ventas sin subir, apartados por
   * vencer, cuota de comprobantes— no se veían en ninguna parte.
   *
   * Acá se arman los que salen de datos que el tablero YA cargó; el menú agrega
   * los que hay que ir a consultar.
   */
  const avisosBase: Aviso[] = [];
  if (stats) {
    if (hasFullInventory && stats.lowStockCount > 0) {
      avisosBase.push({
        id: 'poco-stock',
        nivel: 'aviso',
        icono: AlertTriangle,
        texto: `${stats.lowStockCount} producto${stats.lowStockCount !== 1 ? 's' : ''} con poco stock`,
        detalle: 'Están por debajo del mínimo que les pusiste.',
        path: '/inventory',
      });
    }
    if (pf.accounts_payable && stats.overdueAP > 0) {
      avisosBase.push({
        id: 'cxp-vencidas',
        nivel: 'urgente',
        icono: Wallet,
        texto: `${stats.overdueAP} cuenta${stats.overdueAP !== 1 ? 's' : ''} por pagar vencida${stats.overdueAP !== 1 ? 's' : ''}`,
        path: '/accounts-payable',
      });
    }
    if (pf.purchases && stats.pendingPurchases > 0) {
      avisosBase.push({
        id: 'compras-pendientes',
        nivel: 'info',
        icono: ClipboardList,
        texto: `${stats.pendingPurchases} compra${stats.pendingPurchases !== 1 ? 's' : ''} pendiente${stats.pendingPurchases !== 1 ? 's' : ''}`,
        detalle: 'Pedidos hechos que todavía no se recibieron en inventario.',
        path: '/purchases',
      });
    }
  }
  if (!qzConnected) {
    avisosBase.push({
      id: 'impresora-qz',
      nivel: 'aviso',
      icono: WifiOff,
      texto: 'Impresora térmica desconectada',
      detalle: 'Las ventas se pueden cobrar igual, pero el tiquete no va a salir.',
      path: '/settings',
    });
  }
  const avisoSub = avisoDeSuscripcion(subEndsAt);
  if (avisoSub) avisosBase.push(avisoSub);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {asistente && <AsistenteIA onClose={() => setAsistente(false)} />}
      {fichando && <FichajeModal onClose={() => setFichando(false)} />}

      {/* ── MARCAR HORA ──────────────────────────────────────────────────
          Va en el tablero y no adentro de Planilla a propósito: lo usa TODO
          el personal varias veces al día —entrada, salida— y nadie va a
          navegar tres pantallas para eso. Medido antes de hacerlo: el fichaje
          existía en el servidor desde hace rato y tenía CERO marcajes, porque
          no había por dónde usarlo. */}
      {/* Chico: ocupa lo que mide su texto, no el ancho de la pantalla. Un
          botón que se usa en dos segundos no tiene por qué pesar lo mismo que
          un módulo. Los 44 px de alto se mantienen: se toca con el dedo. */}
      {flagOn(planFeatures, 'hr') && (
        <div className="flex">
          <button
            type="button"
            onClick={() => setFichando(true)}
            title="Marcar entrada o salida con tu código o tu huella"
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black shadow-sm transition"
          >
            <Clock size={16} /> Marcar hora
          </button>
        </div>
      )}

      {/* ── Panel Admin — primero, porque es donde entra el administrador ──
          Estaba solo al final de la barra lateral, dentro de «Sistema»: quien
          administra la plataforma entra varias veces al día y tenía que abrir el
          menú y bajar hasta el último grupo. */}
      {isSaasAdmin && (
        <button
          type="button"
          onClick={() => navigate('/create-owner')}
          className="w-full flex items-center gap-3 rounded-2xl px-5 py-4 bg-slate-900 hover:bg-slate-800 text-white shadow-md transition"
        >
          <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <User2 size={22} />
          </span>
          <span className="text-left min-w-0">
            <span className="block font-black text-lg leading-tight">Panel Admin</span>
            <span className="block text-slate-300 text-xs">Negocios, planes, facturación y demos</span>
          </span>
        </button>
      )}

      {/* ASISTENTE — en el cuerpo del panel, no flotando.
          La esquina de abajo a la derecha ya tiene las notificaciones y la
          guía del módulo: un tercer botón flotante ahí se monta encima de los
          otros dos, y encima de ellos el que pierde es siempre el de más
          abajo. Acá se ve de entrada y no le tapa nada a nadie. */}
      <button
        type="button"
        onClick={() => setAsistente(true)}
        className="w-full flex items-center gap-3 rounded-2xl px-5 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md transition"
      >
        <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Sparkles size={22} />
        </span>
        <span className="text-left min-w-0">
          <span className="block font-black text-lg leading-tight">Preguntale a tu negocio</span>
          <span className="block text-violet-200 text-xs">
            Cuánto vendiste, qué deja más plata, quién te debe, qué se está acabando
          </span>
        </span>
      </button>

      {/* ── Hero compacto: saludo + ventas de hoy ────────────────────────── */}
      <div className="bg-linear-to-br from-emerald-600 via-emerald-600 to-teal-700 rounded-2xl px-5 sm:px-6 py-5 text-white shadow-md flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-emerald-200 text-xs font-semibold capitalize">
            {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight mt-0.5 truncate">
            {greeting(user?.full_name || user?.email)}
          </h1>
          {tenant && (
            <p className="text-emerald-200 text-sm mt-0.5 truncate">{tenant.name}</p>
          )}
        </div>
        <div className="bg-white/15 rounded-2xl px-5 py-3 text-center min-w-32">
          <p className="text-xs text-emerald-100 font-semibold uppercase tracking-wider">Ventas hoy</p>
          <p className="text-2xl sm:text-3xl font-black mt-0.5 tabular-nums">
            {loading ? '…' : fmt(stats?.todayTotal ?? 0)}
          </p>
          <p className="text-xs text-emerald-200 mt-0.5">
            {loading ? '' : `${stats?.todayCount ?? 0} factura${stats?.todayCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ── Banners críticos (solo si aplica) ────────────────────────────── */}
      {showSubBanner && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 border ${
          subDaysLeft! < 0
            ? 'bg-red-50 border-red-200 text-red-800'
            : subDaysLeft! <= 7
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <CalendarClock size={18} className="shrink-0" />
          <p className="font-bold text-sm flex-1">
            {subDaysLeft! < 0
              ? `Suscripción vencida hace ${Math.abs(subDaysLeft!)} día${Math.abs(subDaysLeft!) !== 1 ? 's' : ''}`
              : subDaysLeft === 0
              ? 'Tu suscripción vence hoy'
              : `Tu suscripción vence en ${subDaysLeft} día${subDaysLeft !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}

      {/* ── Panel multi-empresa: stats por sucursal del grupo ────────────── */}
      <GroupBranchesPanel />

      {/* Los avisos que antes eran chips acá ahora están todos juntos en el
          menú flotante de notificaciones (abajo a la derecha). */}

      {/* ── Buscador ──────────────────────────────────────────────────────
          Con más de treinta módulos, encontrar uno es bajar leyendo etiqueta
          por etiqueta. Acá se escribe y listo. */}
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar un módulo… (contabilidad, inventario, caja)"
          className="w-full pl-11 pr-10 py-3 rounded-2xl border-2 border-gray-200 bg-white text-base focus:outline-none focus:border-emerald-500"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} aria-label="Limpiar"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
            ✕
          </button>
        )}
      </div>

      {/* Qué se está viendo. Sin esto, buscar algo que no existe deja una
          pantalla vacía sin explicación. */}
      {busqueda.trim() && (
        <p className="text-sm text-gray-500 -mt-1">
          {tilesOrdenados.length === 0
            ? <>No hay ningún módulo que se llame así. Puede que no esté incluido en tu plan.</>
            : <>{tilesOrdenados.length} módulo(s) encontrados</>}
        </p>
      )}
      {!busqueda.trim() && favoritos.length === 0 && tiles.length > 8 && (
        <p className="text-xs text-gray-400 -mt-1">
          Tocá la estrella de un módulo para dejarlo de primero.
        </p>
      )}

      {/* ── Botones gigantes estilo Eleventa ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {tilesOrdenados.map((t) => {
          const Icon = t.icon;
          const esFavorito = favoritos.includes(t.path);
          return (
            <button
              key={t.path}
              type="button"
              onClick={() => navigate(t.path)}
              className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 text-left bg-linear-to-br ${t.bg} text-white shadow-md hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] transition-all duration-150 min-h-40 sm:min-h-48 flex flex-col justify-between`}
            >
              {/* La estrella. `stopPropagation` para que marcarla no abra el
                  módulo: tocar «favorito» y que se te vaya la pantalla es
                  exactamente lo que no se espera. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={esFavorito ? `Quitar ${t.label} de los primeros` : `Poner ${t.label} de primero`}
                title={esFavorito ? 'Quitar de los primeros' : 'Ponerlo de primero'}
                onClick={(e) => { e.stopPropagation(); alternarFavorito(t.path); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); alternarFavorito(t.path); }
                }}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                <Star size={18}
                  className={esFavorito ? 'text-amber-300' : 'text-white/45'}
                  fill={esFavorito ? 'currentColor' : 'none'} />
              </span>
              {/* Decoración suave */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-white/5 blur-xl pointer-events-none" />

              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Icon size={32} strokeWidth={2.2} className="text-white" />
              </div>

              <h3 className="relative text-xl sm:text-2xl font-black leading-tight mt-3">
                {t.label}
              </h3>
            </button>
          );
        })}
      </div>

      {/* Notificaciones: flotante, para que siga a la vista mientras se baja
          por el tablero. Si no hay nada pendiente, es un botón discreto. */}
      <NotificationsMenu base={avisosBase} />
    </div>
  );
};

export default Dashboard;
