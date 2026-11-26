import {
  Scale, List, Building2, TrendingUp, Landmark, Receipt, Clock,
  Waves, Boxes, Lock, Wallet, HandCoins, TrendingDown, ShoppingBag,
  FileText, Users, BarChart3,
} from 'lucide-react';

/**
 * LAS RAMAS DE LA CONTABILIDAD.
 *
 * El módulo contable no es una pantalla: es un ciclo con partes que se usan
 * en momentos distintos del mes. Esta lista es ese mapa, y de ella sale
 * tanto el botón «Ramas» como las pestañas.
 *
 * ── Por qué están también las de otros módulos ───────────────────────────
 * Gastos, compras y cuentas por cobrar NO son pantallas de contabilidad,
 * pero son de donde salen los asientos. Alguien que entra a contabilidad
 * buscando «dónde anoto una factura de proveedor» tiene que encontrarlo acá
 * y no adivinar que está en otro menú. Van marcadas como externas: se ve que
 * llevan a otra parte.
 */

export interface Rama {
  id: string;
  label: string;
  /** Qué se hace acá, en una línea. Es lo que se lee en el panel. */
  que: string;
  /** Cuándo se usa. Lo que convierte una lista de nombres en un mapa. */
  cuando: string;
  icon: React.ElementType;
  /** Vista interna del módulo, o ruta de la app si vive en otro módulo. */
  ruta?: string;
  /** Bandera del plan que la habilita, si depende de una. */
  feature?: string;
  /** Si es nueva, para que se note qué se agregó. */
  nueva?: boolean;
}

export interface GrupoRamas {
  id: string;
  label: string;
  /** Para qué sirve el grupo entero. */
  nota: string;
  ramas: Rama[];
}

export const GRUPOS_RAMAS: GrupoRamas[] = [
  {
    id: 'registro',
    label: 'Registro',
    nota: 'Dónde queda anotado cada hecho económico.',
    ramas: [
      { id: 'diario', label: 'Libro diario', icon: List,
        que: 'Los asientos, uno por hecho económico, y la carga de asientos a mano.',
        cuando: 'Para ver qué se registró, corregir con un contra-asiento o meter un ajuste.' },
      { id: 'cuentas', label: 'Catálogo de cuentas', icon: Building2,
        que: 'Las cuentas del negocio, con su código y su tipo.',
        cuando: 'Al empezar, y cada vez que hace falta una cuenta que no está.' },
      { id: 'mayor', label: 'Libro mayor', icon: TrendingUp,
        que: 'Los movimientos de UNA cuenta, con el saldo corrido.',
        cuando: 'Cuando un saldo no es el que debería y hay que ver de dónde viene.' },
    ],
  },
  {
    id: 'estados',
    label: 'Estados financieros',
    nota: 'Los informes que resumen el período.',
    ramas: [
      { id: 'resumen', label: 'Estados financieros', icon: Scale,
        que: 'Balance de comprobación, estado de resultados y balance general.',
        cuando: 'Al cerrar el mes, y cada vez que alguien pregunta cómo va el negocio.' },
      { id: 'flujo', label: 'Flujo de caja', icon: Waves, nueva: true,
        que: 'Por dónde entró y por dónde salió la plata, con el saldo de caja y bancos.',
        cuando: 'Cuando hay utilidad en el papel y no hay plata en la cuenta.' },
    ],
  },
  {
    id: 'impuestos',
    label: 'Impuestos',
    nota: 'Lo que hay que declararle a Hacienda.',
    ramas: [
      { id: 'impuestos', label: 'IVA del período', icon: Receipt, nueva: true,
        que: 'Débito y crédito fiscal del período, y el IVA a pagar, cruzado contra los libros.',
        cuando: 'Antes de llenar la D-104, los primeros días de cada mes.' },
      { id: 'retenciones', label: 'Retenciones (D-150)', icon: FileText, ruta: '/d150',
        que: 'Las retenciones del período, en el formato del informe anual.',
        cuando: 'En la declaración informativa.' },
    ],
  },
  {
    id: 'saldos',
    label: 'Saldos con terceros',
    nota: 'Qué le deben al negocio y qué debe el negocio.',
    ramas: [
      { id: 'antiguedad', label: 'Antigüedad de saldos', icon: Clock, nueva: true,
        que: 'Lo que falta cobrar y pagar, repartido por cuántos días lleva atrasado.',
        cuando: 'Para decidir a quién llamar primero y qué cuenta ya es dudosa.' },
      { id: 'cxc', label: 'Cuentas por cobrar', icon: HandCoins, ruta: '/accounts-receivable',
        que: 'Las cuentas de los clientes, con sus abonos.',
        cuando: 'Al cobrar, y para registrar un abono contra una factura.', feature: 'accounts_receivable' },
      { id: 'cxp', label: 'Cuentas por pagar', icon: Wallet, ruta: '/accounts-payable',
        que: 'Lo que se le debe a los proveedores.',
        cuando: 'Al pagarle a un proveedor y para ver qué vence esta semana.', feature: 'accounts_payable' },
    ],
  },
  {
    id: 'patrimonio',
    label: 'Patrimonio y cierre',
    nota: 'Lo que se hace una vez al mes y no se vuelve a tocar.',
    ramas: [
      { id: 'bancos', label: 'Bancos y conciliación', icon: Landmark,
        que: 'Las cuentas bancarias, los depósitos y la liquidación de tarjetas.',
        cuando: 'Cuando llega el estado de cuenta del banco.' },
      { id: 'activos', label: 'Activos fijos', icon: Boxes, nueva: true,
        que: 'El equipo del negocio y su depreciación mensual.',
        cuando: 'Al comprar algo que dura años, y una vez al mes para correr la cuota.' },
      { id: 'cierre', label: 'Cierre de período', icon: Lock, nueva: true,
        que: 'Manda el resultado del mes a resultados acumulados y traba la fecha.',
        cuando: 'Cuando el mes ya se declaró y no tiene que cambiar más.' },
    ],
  },
  {
    id: 'origen',
    label: 'De dónde salen los asientos',
    nota: 'Estas pantallas son de otros módulos: acá se registra la operación, y la contabilidad la toma de ahí.',
    ramas: [
      { id: 'gastos', label: 'Gastos', icon: TrendingDown, ruta: '/expenses', feature: 'expenses',
        que: 'Los gastos del negocio, con su impuesto.',
        cuando: 'Cada vez que se paga algo.' },
      { id: 'compras', label: 'Compras', icon: ShoppingBag, ruta: '/purchases', feature: 'purchases',
        que: 'Las compras a proveedores.',
        cuando: 'Al recibir mercadería.' },
      { id: 'planilla', label: 'Planilla', icon: Users, ruta: '/hr', feature: 'hr',
        que: 'Salarios y cargas sociales.',
        cuando: 'En cada quincena.' },
      { id: 'reportes', label: 'Reportes', icon: BarChart3, ruta: '/reports', feature: 'reports',
        que: 'Las ventas y los márgenes, desde la operación y no desde los libros.',
        cuando: 'Para el día a día.' },
    ],
  },
];

/** Las ramas que son vistas de este módulo (no llevan a otra pantalla). */
export const RAMAS_INTERNAS = GRUPOS_RAMAS
  .flatMap(g => g.ramas).filter(r => !r.ruta);

export const ramaPorId = (id: string): Rama | undefined =>
  GRUPOS_RAMAS.flatMap(g => g.ramas).find(r => r.id === id);
