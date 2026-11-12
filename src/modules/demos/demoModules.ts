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
  /**
   * RESTAURANTE, completo.
   *
   * Acá faltaba la mitad del salón: el mapa de mesas, las cuentas por mesa,
   * los extras, la comanda por estación, ColónTab, el domicilio. Un vendedor
   * que marcaba «Mesas y salón» abría la demo y no tenía plano que mostrar
   * —`restaurant` prende el cobro, `tables` prende el editor del plano—, así
   * que la demo enseñaba menos de lo que el sistema hace. Están de a una
   * porque no todos los locales quieren todo, y agrupadas para que el preset
   * de abajo las prenda de un golpe.
   */
  {
    group: 'Restaurante',
    modules: [
      { key: 'restaurant', label: 'Mesas y salón', hint: 'Cobro por mesa, toma de pedido, dividir cuenta y comandas' },
      { key: 'tables', label: 'Diseño del salón', hint: 'El plano: mesas, sillas y zonas' },
      { key: 'table_orders', label: 'Cuentas por mesa', hint: 'Abrir cuenta, sumar rondas y cobrarla al final' },
      { key: 'modifiers', label: 'Extras y modificadores', hint: 'Término, extras, «sin cebolla»' },
      { key: 'recipes', label: 'Recetas', hint: 'Platos con ingredientes y costo' },
      { key: 'recipe_inventory', label: 'Recetas con inventario' },
      { key: 'recipe_consumption', label: 'Descontar ingredientes al vender' },
      { key: 'recipe_units', label: 'Unidades y conversión en recetas' },
      { key: 'recipe_stations', label: 'Comanda por estación', hint: 'Cocina, barra, parrilla' },
      { key: 'recipe_production', label: 'Producción de subrecetas' },
      { key: 'recipe_menu_engineering', label: 'Análisis de menú', hint: 'Estrella, vaca, enigma o perro' },
      { key: 'restaurant_menu_recipes', label: 'POS por recetas' },
      { key: 'digital_menu', label: 'Menú digital con QR' },
      { key: 'mesa_digital', label: 'Mesa digital (ColónTab)', hint: 'El cliente avisa desde la mesa' },
      { key: 'digital_catalog', label: 'Catálogo digital con QR' },
      { key: 'window_service', label: 'Ventanita' },
      { key: 'pos_delivery', label: 'Delivery y domicilio', hint: 'Modo delivery, plataformas y reparto propio' },
      { key: 'pos_bipper', label: 'Bipper / localizador' },
    ],
  },
  {
    group: 'Ruta y agentes',
    modules: [
      { key: 'distribution', label: 'Distribución / rutas' },
      { key: 'tracking', label: 'Rastreo de camiones' },
      { key: 'live_team', label: 'Equipo en vivo (agentes en el mapa)' },
      { key: 'reservations', label: 'Apartados (separar mercadería con abonos)' },
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
      /**
       * El POS ELECTRÓNICO es una pantalla aparte, con su propio interruptor.
       *
       * Faltaba en esta lista: se podía marcar «Facturación electrónica» y la
       * demo igual no mostraba el POS electrónico, porque esa pantalla la
       * habilita `fe_pos`. El vendedor terminaba enseñando la función estrella…
       * que no estaba. En una demo los comprobantes son ficticios e ilimitados
       * (ver `services/feDemo.ts` del backend): no se envía nada a Hacienda.
       */
      { key: 'fe_pos', label: 'POS Electrónico' },
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
  /* RESTAURANTE: la demo completa. Es la que más se pide y la que más tenía
     que enseñar; iba con siete llaves y el vendedor se topaba con pantallas
     vacías o botones que no estaban. */
  {
    label: 'Restaurante',
    modules: [
      'pos', 'pos_card', 'pos_sinpe', 'pos_discount', 'pos_cash_management', 'pos_bipper',
      'restaurant', 'tables', 'table_orders', 'modifiers',
      'recipes', 'recipe_inventory', 'recipe_consumption', 'recipe_units', 'recipe_stations',
      'restaurant_menu_recipes',
      'digital_menu', 'mesa_digital',
      'promotions', 'pos_delivery', 'window_service',
      'inventory', 'customers', 'purchases', 'expenses', 'reports',
    ],
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
    modules: ['pos', 'inventory', 'customers', 'electronic_invoice', 'fe_pos', 'reports'],
  },
];

const ALL = new Map(DEMO_GROUPS.flatMap(g => g.modules).map(m => [m.key, m.label]));
export const moduleLabel = (key: string) => ALL.get(key) ?? key;
