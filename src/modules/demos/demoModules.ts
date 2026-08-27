/**
 * Catálogo de módulos que se pueden pedir en una demo.
 *
 * Son las MISMAS claves de features del plan: lo que el vendedor marca acá es lo
 * que después se activa en el negocio de prueba, sin traducir nada a mano.
 */
export interface DemoModule { key: string; label: string; hint?: string }

export const DEMO_GROUPS: Array<{ group: string; modules: DemoModule[] }> = [
  {
    group: 'Venta',
    modules: [
      { key: 'pos', label: 'Punto de venta', hint: 'Caja, cobros y tiquetes' },
      { key: 'pos_card', label: 'Cobro con tarjeta' },
      { key: 'pos_sinpe', label: 'SINPE Móvil' },
      { key: 'pos_discount', label: 'Descuentos' },
      { key: 'pos_cash_management', label: 'Apertura y cierre de caja' },
      { key: 'proformas', label: 'Proformas / cotizaciones' },
      { key: 'returns', label: 'Devoluciones y anulaciones' },
      { key: 'invoice_pdf_a4', label: 'Factura en PDF (A4)' },
    ],
  },
  {
    group: 'Inventario',
    modules: [
      { key: 'inventory', label: 'Inventario', hint: 'Productos, stock y categorías' },
      { key: 'inventory_kits', label: 'Kits de productos' },
      { key: 'purchases', label: 'Compras a proveedores' },
      { key: 'supplier_returns', label: 'Devoluciones al proveedor' },
      { key: 'labels', label: 'Etiquetas y códigos de barras' },
      { key: 'warranties', label: 'Garantías' },
    ],
  },
  {
    group: 'Clientes y cobros',
    modules: [
      { key: 'customers', label: 'Clientes' },
      { key: 'accounts_receivable', label: 'Cuentas por cobrar' },
      { key: 'crm_leads', label: 'Leads (seguimiento)' },
      { key: 'promotions', label: 'Promociones' },
    ],
  },
  {
    group: 'Restaurante',
    modules: [
      { key: 'restaurant', label: 'Mesas y salón' },
      { key: 'recipes', label: 'Recetas y modificadores' },
      { key: 'restaurant_menu_recipes', label: 'POS por recetas' },
      { key: 'digital_menu', label: 'Menú digital con QR' },
      { key: 'window_service', label: 'Ventanita' },
    ],
  },
  {
    group: 'Ruta y agentes',
    modules: [
      { key: 'distribution', label: 'Distribución / rutas' },
      { key: 'tracking', label: 'Rastreo de camiones' },
      { key: 'live_team', label: 'Equipo en vivo (agentes en el mapa)' },
      { key: 'sales_agents', label: 'Agentes de venta' },
      { key: 'agent_orders', label: 'Nuevo pedido (agente)' },
      { key: 'cashier_desk', label: 'Caja de pedidos' },
      { key: 'agent_agenda', label: 'Agenda y entregas' },
    ],
  },
  {
    group: 'Administración',
    modules: [
      { key: 'electronic_invoice', label: 'Facturación electrónica' },
      { key: 'reports', label: 'Reportes' },
      { key: 'expenses', label: 'Gastos' },
      { key: 'accounts_payable', label: 'Cuentas por pagar' },
      { key: 'hr', label: 'Recursos humanos' },
      { key: 'multi_branch', label: 'Sucursales' },
      { key: 'android_app', label: 'App de Android' },
    ],
  },
];

/** Paquetes armados: lo que se pide casi siempre, sin marcar de a uno. */
export const DEMO_PRESETS: Array<{ label: string; modules: string[] }> = [
  {
    label: 'Pulpería / abarrotes',
    modules: ['pos', 'pos_card', 'pos_sinpe', 'pos_cash_management', 'inventory', 'customers', 'reports'],
  },
  {
    label: 'Restaurante',
    modules: ['pos', 'restaurant', 'recipes', 'restaurant_menu_recipes', 'digital_menu', 'inventory', 'reports'],
  },
  {
    label: 'Distribuidora con ruta',
    modules: ['pos', 'inventory', 'customers', 'accounts_receivable', 'distribution', 'sales_agents',
      'agent_orders', 'cashier_desk', 'agent_agenda', 'reports'],
  },
  {
    label: 'Ferretería / repuestos',
    modules: ['pos', 'inventory', 'inventory_kits', 'purchases', 'customers', 'accounts_receivable',
      'warranties', 'proformas', 'reports'],
  },
  {
    label: 'Con factura electrónica',
    modules: ['pos', 'inventory', 'customers', 'electronic_invoice', 'reports'],
  },
];

const ALL = new Map(DEMO_GROUPS.flatMap(g => g.modules).map(m => [m.key, m.label]));
export const moduleLabel = (key: string) => ALL.get(key) ?? key;
