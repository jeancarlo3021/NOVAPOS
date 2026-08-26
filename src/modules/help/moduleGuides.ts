/**
 * Guías de uso por módulo.
 *
 * Cada pantalla explica CÓMO se usa en el orden en que se usa de verdad, no qué
 * botones tiene. El objetivo es que alguien que entra por primera vez —o que
 * entra una vez al mes— sepa por dónde empezar sin llamar a soporte.
 */
export interface GuideStep {
  title: string;
  detail: string;
  /** Se muestra solo si el plan trae esta feature. */
  feature?: string;
  /** Ruta a la que lleva el paso al tocarlo (con ?tab= si aplica). */
  to?: string;
  /**
   * Elemento de la pantalla que este paso explica, por `data-tour`.
   * Con esto la guía puede señalarlo en vivo: se resalta el botón y la viñeta
   * queda pegada a él, en vez de describirlo con palabras.
   */
  target?: string;
}

/**
 * Requisito PREVIO: algo que hay que dejar configurado antes, o el módulo
 * simplemente no funciona. Se muestra arriba de los pasos porque es la causa
 * número uno de "no me sirve": no está roto, falta el paso de antes.
 */
export interface GuideRequirement {
  what: string;
  /** Se muestra solo si el plan trae esta feature. */
  feature?: string;
  /** Ruta donde se configura: el requisito se toca y lleva ahí. */
  to?: string;
  /** Dónde se configura, con el camino tal como se ve en el menú. */
  where?: string;
  /** Qué pasa si falta. */
  why?: string;
}

export interface ModuleGuide {
  key: string;
  title: string;
  intro: string;
  /** Lo que hay que tener listo ANTES de usar el módulo. */
  requires?: GuideRequirement[];
  steps: GuideStep[];
  /** Cosas que casi siempre se preguntan después. */
  tips?: Array<string | { text: string; feature?: string }>;
}

export const MODULE_GUIDES: ModuleGuide[] = [
  {
    key: 'pos',
    title: 'Punto de venta',
    intro: 'Cobrar rápido y que la caja cuadre al final del día.',
    requires: [
      { what: 'Impresora de tiquetes configurada', to: '/settings?tab=receipt', where: 'Configuración → Factura', why: 'Sin impresora se cobra igual, pero no sale el tiquete ni se abre el cajón de dinero.', feature: 'pos' },
      { what: 'Productos con precio', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'Un producto en ₡0 no se puede vender ni facturar.', feature: 'inventory' },
      { what: 'Medios de pago activos', to: '/settings?tab=payments', where: 'Configuración → Pagos', why: 'Es lo que aparece en la pantalla de cobro.' },
    ],
    steps: [
      { title: 'Abrí la caja', target: 'pos-cash', detail: 'Poné el fondo con que arrancás. Si el negocio no lleva control de efectivo, activá "No abrir caja" en Configuración → Pagos y se abre sola en ₡0.' },
      { title: 'Agregá productos', target: 'pos-search', detail: 'Pistola de código, o escribí nombre/código y Enter. F2 salta al buscador.' },
      { title: 'Elegí el cliente si hace falta', target: 'pos-customer', detail: 'Obligatorio solo para factura electrónica y para vender a crédito.', feature: 'customers' },
      { title: 'Cobrá (F12)', target: 'pos-charge', detail: 'Elegí el medio de pago; con pago mixto repartís el monto entre varios. F1 cobra e imprime, F2 cobra sin imprimir.' },
      { title: 'Cerrá la caja', target: 'pos-cash', detail: 'Contá el efectivo por denominación. El sistema compara con lo que registró y muestra la diferencia.' },
    ],
    tips: [
      'Si aparece el aviso de ventas sin subir, tocá "Subir ahora" ANTES de cerrar: si no, esas ventas no entran en el arqueo.',
      'El total se redondea a múltiplos de ₡10, porque ya no circulan monedas de ₡5.',
    ],
  },
  {
    key: 'inventory',
    title: 'Inventario',
    intro: 'Que el stock del sistema sea el que hay en la bodega.',
    requires: [
      { what: 'Categorías creadas', to: '/inventory?tab=categories', where: 'Inventario → Categorías', why: 'Sin categorías el POS no se puede filtrar y los reportes salen todos juntos.', feature: 'inventory_categories' },
      { what: 'Tipos de unidad', to: '/inventory?tab=unitTypes', where: 'Inventario → Tipos de unidad', why: 'Definen si se vende por unidad, kilo o litro.', feature: 'inventory_unit_types' },
      { what: 'CABYS por defecto', to: '/settings?tab=electronic_invoice', where: 'Configuración → Facturación Electrónica', why: 'Cubre a los productos que se creen sin código propio.', feature: 'electronic_invoice' },
    ],
    steps: [
      { title: 'Creá las categorías', to: '/inventory?tab=categories', detail: 'Sirven para filtrar en el POS y para los reportes. Con 5 o 6 alcanza para empezar.' },
      { title: 'Cargá los productos', to: '/inventory?tab=products', target: 'inv-new-product', detail: 'Uno por uno, o masivo por Excel/XML. Poné costo y precio: sin costo no hay margen ni ganancia real en los reportes.' },
      { title: 'Definí quién lleva stock', detail: 'Un servicio o algo que nunca se cuenta va con "stock infinito": así el POS no bloquea la venta.' },
      { title: 'Ajustá con motivo', detail: 'Cada diferencia se registra (merma, daño, conteo). Un ajuste sin motivo es un hueco que después nadie explica.' },
      { title: 'Revisá alertas', to: '/inventory?tab=alerts', detail: 'La pestaña de stock bajo muestra qué hay que pedir antes de quedarse sin.' },
    ],
    tips: [
      { text: 'El CABYS y el IVA del producto son los que se mandan a Hacienda: cargalos al crear y no hay que corregir facturas después.', feature: 'electronic_invoice' },
      { text: 'Los meses de garantía del producto alimentan el módulo de Garantías.', feature: 'warranties' },
    ],
  },
  {
    key: 'kits',
    title: 'Kits de productos',
    intro: 'Vender un combo que por dentro descuenta otros productos.',
    requires: [
      { what: 'Los productos que van adentro, ya creados', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'El kit descuenta esos productos: si no existen, no hay qué descontar.' },
      { what: 'El producto que se vende como kit', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'El kit necesita su propio precio, código y CABYS.' },
    ],
    steps: [
      { title: 'Creá el producto que se vende', detail: 'El kit ES un producto normal: tiene su precio, su código y su CABYS.' },
      { title: 'Marcalo como kit', to: '/inventory?tab=kits', detail: 'En Inventario → Kits, "Nuevo kit" y elegí ese producto. Su stock deja de controlarse: manda el de los componentes.' },
      { title: 'Armá qué lleva adentro', detail: 'Buscá cada producto y poné la cantidad. Se ve el costo, el margen y cuántos kits se pueden armar hoy.' },
      { title: 'Vendé normal', detail: 'En el POS es un producto más. Al cobrar, el inventario baja por los componentes, no por el kit.' },
    ],
    tips: ['Al anular una venta con kit, los componentes vuelven al inventario.'],
  },
  {
    key: 'purchases',
    title: 'Compras y recepción',
    intro: 'Meter la mercadería del proveedor sin teclear producto por producto.',
    requires: [
      { what: 'Correo de recepción configurado', to: '/settings?tab=electronic_invoice', where: 'Configuración → Facturación Electrónica', why: 'Es donde caen los comprobantes que mandan los proveedores.', feature: 'electronic_invoice' },
      { what: 'Empresa dada de alta en Alanube', to: '/settings?tab=electronic_invoice', where: 'Configuración → Facturación Electrónica', why: 'Sin eso la aceptación queda solo en el sistema y Hacienda nunca se entera.', feature: 'electronic_invoice' },
      { what: 'Proveedores cargados', to: '/inventory?tab=suppliers', where: 'Inventario → Proveedores', why: 'Para ligar la compra a quién se le compró.', feature: 'inventory_suppliers' },
    ],
    steps: [
      { title: 'Recibí el comprobante', to: '/fe-recepcion', detail: 'Llega por correo automáticamente, o subí el XML a mano en Recepción.' },
      { title: 'Decidí qué es', detail: 'Compra (entra a inventario) o gasto. Si te equivocaste, hay botón para cambiarlo.' },
      { title: 'Revisá y recibí', detail: 'Cotejá cada línea con tu catálogo: los que ya existen se actualizan, los nuevos se crean. Podés fijar el margen y el segundo código.' },
      { title: 'Aceptá el comprobante', detail: 'La aceptación toma el crédito fiscal y manda el Mensaje Receptor a Hacienda.', feature: 'electronic_invoice' },
    ],
    tips: [
      'Si el estado dice "Aceptado · sin enviar", el crédito quedó tomado pero Hacienda no se enteró: usá "Reenviar".',
      'Una nota de crédito del proveedor se detecta sola: resta el crédito y devuelve los productos.',
    ],
  },
  {
    key: 'customers',
    title: 'Clientes',
    intro: 'La ficha que después usan la factura electrónica, el crédito y la ruta.',
    requires: [
      { what: 'Zonas creadas', to: '/customers', where: 'Clientes → Zonas', why: 'La zona ordena la ruta y filtra la cartera de cada vendedor.', feature: 'distribution' },
    ],
    steps: [
      { title: 'Creá el cliente', detail: 'Nombre y teléfono alcanzan para vender; para factura electrónica hacen falta cédula, ubicación y otras señas.' },
      { title: 'Asignale zona', detail: 'La zona ordena la ruta y filtra la cartera de cada vendedor.' },
      { title: 'Definí su crédito', detail: 'Si le vas a fiar, activá crédito y ponele límite: el POS no deja pasarse.' },
    ],
    tips: ['Un cliente marcado "excluir del cierre" (ej. empleados) no se cuenta en el arqueo de caja.'],
  },
  {
    key: 'accounts_receivable',
    title: 'Cuentas por cobrar',
    intro: 'Saber quién debe, cuánto y desde cuándo.',
    requires: [
      { what: 'Clientes con crédito habilitado', to: '/customers', where: 'Clientes → ficha del cliente', why: 'El POS solo deja vender a crédito a quien lo tiene activo.', feature: 'customers' },
      { what: 'Impresora configurada', where: 'Configuración → Factura', why: 'Los estados de cuenta y recibos de abono salen por ahí.' },
    ],
    steps: [
      { title: 'La cuenta nace sola', detail: 'Toda venta a crédito crea su cuenta. También podés crear una a mano.' },
      { title: 'Cobrá el abono', detail: 'Por factura, o "Abono masivo": el cliente entrega un monto y se reparte de la más vieja a la más nueva.' },
      { title: 'Entregá el comprobante', detail: 'Al abonar podés emitir tiquete o factura electrónica del abono.', feature: 'electronic_invoice' },
      { title: 'Imprimí el estado de cuenta', detail: 'Simplificado, detallado con productos, o el consolidado de todo lo pendiente.' },
    ],
    tips: ['Si tu usuario tiene zona asignada, solo ves esa zona; la cartera completa la ve la gerencia.'],
  },
  {
    key: 'agenda',
    title: 'Agenda de entregas',
    intro: 'Planificar el día: qué se entrega, quién lo entrega y a qué hora.',
    requires: [
      { what: 'Agentes de venta creados', to: '/sales-agents', where: 'Agentes de venta', why: 'Son los responsables que se asignan a cada entrega.', feature: 'sales_agents' },
      { what: 'Clientes con zona y dirección', to: '/customers', where: 'Clientes', why: 'Sin lugar no se puede armar la ruta del día.' },
    ],
    steps: [
      { title: 'Mirá el calendario', detail: 'Cada día muestra cuántas entregas hay, la franja horaria y el monto.' },
      { title: 'Asigná responsable', detail: 'Elegí quién entrega cada pedido. Una persona no puede tener dos cosas a la misma hora.' },
      { title: 'Poné la hora', detail: 'Campo de hora, o los botones +15m / +30m / +60m para posponer.' },
      { title: 'Agregá tareas', detail: 'Mandados y trámites ("ir a la encomienda") con lugares y fotos, marcables como realizados.' },
      { title: 'Reprogramá lo que no se pudo', detail: 'Lo que vuelve sin hacer aparece en rojo pidiendo fecha nueva, con el motivo.' },
    ],
  },
  {
    key: 'entregas',
    title: 'Entregas del día',
    intro: 'La pantalla del que sale a repartir.',
    requires: [
      { what: 'Tu usuario ligado a un agente', to: '/sales-agents', where: 'Agentes de venta', why: 'La ruta muestra lo asignado a vos: sin ese vínculo aparece vacía.', feature: 'sales_agents' },
      { what: 'Entregas ya agendadas', to: '/agenda-entregas', where: 'Agenda de entregas', why: 'Acá se trabaja lo que se planificó allá.' },
    ],
    steps: [
      { title: 'Mirá tu ruta', detail: 'Solo tus entregas, ordenadas por hora, con cliente, teléfono y lugar.' },
      { title: 'Contactá antes de ir', detail: 'El teléfono abre WhatsApp directo; al lado está el botón de llamar y el mapa.' },
      { title: 'Ajustá lo que no se llevó', detail: 'Con "Ajustar" quitás productos, cambiás cantidades o el precio negociado.' },
      { title: 'Entregado → Caja', detail: 'Reserva el pedido y abre el cobro en caja con ese pedido.' },
      { title: 'Si no se pudo', detail: 'Botón "No se pudo" con el motivo: vuelve a la bandeja y la agenda pide fecha nueva.' },
    ],
  },
  {
    key: 'caja',
    title: 'Caja (pedidos de agentes)',
    intro: 'Recibir lo que arman los agentes y cobrarlo.',
    requires: [
      { what: 'Caja abierta', where: 'La misma pantalla, botón Abrir caja', why: 'Sin caja abierta no se puede cobrar ningún pedido.' },
      { what: 'Impresora configurada', where: 'Configuración → Factura', why: 'Para entregar el tiquete al cliente.' },
    ],
    steps: [
      { title: 'Abrí la caja', detail: 'Sin caja abierta no se puede cobrar.' },
      { title: 'Elegí el pedido', detail: 'La franja azul de arriba muestra el siguiente; también podés tocar cualquiera de la bandeja (F12 cobra el siguiente).' },
      { title: 'Confirmá comprobante y datos', detail: 'Antes de cobrar se elige tiquete o factura, se agrega el IVA si corresponde y se completan los datos del cliente.' },
      { title: 'Cobrá', detail: 'Medio de pago, e imprimir o descargar en PDF.' },
    ],
    tips: ['La bandeja trabaja por día: "Hasta hoy" incluye lo atrasado para que nada quede enterrado.'],
  },
  {
    key: 'agent_orders',
    title: 'Nuevo pedido (agente)',
    intro: 'Armar el pedido donde el cliente y mandarlo a caja.',
    requires: [
      { what: 'Tu usuario ligado a un agente', to: '/sales-agents', where: 'Agentes de venta', why: 'El pedido sale a nombre del agente y de ahí se calcula la comisión.', feature: 'sales_agents' },
      { what: 'Productos con precio', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'Es el catálogo con el que se arma el pedido.' },
    ],
    steps: [
      { title: 'Elegí el cliente', detail: 'Buscalo o creálo. Para factura electrónica necesita cédula.' },
      { title: 'Poné día y lugar', detail: 'Si es para otro día, el cliente y el lugar son obligatorios: con eso se arma la ruta.' },
      { title: 'Cargá los productos', detail: 'Igual que en el POS. Los kits agregan todo su contenido de un toque.' },
      { title: 'Enviá a caja (F12)', detail: 'El pedido queda en la bandeja del cajero con el comprobante que pidió el cliente.' },
    ],
    tips: ['Con "Desde proforma" pasás una cotización al pedido sin volver a cargar nada.'],
  },
  {
    key: 'leads',
    title: 'Leads (seguimiento)',
    intro: 'Que ningún interesado se pierda entre el primer "¿cuánto vale?" y la venta.',
    requires: [
      { what: 'Agentes de venta creados', to: '/sales-agents', where: 'Agentes de venta', why: 'Cada interesado se atiende por un agente, y cada agente ve solo lo suyo.', feature: 'sales_agents' },
    ],
    steps: [
      { title: 'Anotá al interesado', detail: 'Nombre, teléfono, qué pidió y por dónde llegó. Toma un minuto y evita perderlo.' },
      { title: 'Registrá cada contacto', detail: 'Llamada, WhatsApp, visita… con qué pasó y cuándo volver a hablarle.' },
      { title: 'Movelo de etapa', detail: 'Contactado → Cotizado → Negociando, según avance.' },
      { title: 'Cerralo', detail: 'Ganado cuando se concreta; perdido con el motivo, que es lo que sirve para no repetirlo.' },
    ],
    tips: ['El contador rojo "sin llamar" son los que ya tocaba contactar: empezá el día por ahí.'],
  },
  {
    key: 'demos',
    title: 'Solicitudes de demo',
    intro: 'Pedir una prueba con los módulos que el prospecto necesita ver.',
    requires: [
      { what: 'Planes creados', to: '/plans', where: 'Planes', why: 'Al pasar la demo a cliente hay que elegirle un plan.' },
      { what: 'Cron de limpieza activo', where: 'Servidor: /cron/purge-demos', why: 'Es lo que borra las demos que nadie convirtió a los 30 días.' },
    ],
    steps: [
      { title: 'Pedí la demo', detail: 'Datos del negocio y marcá los módulos. Los paquetes rápidos arman la selección típica por rubro.' },
      { title: 'Dictá el acceso', detail: 'El usuario y la clave se generan del nombre del negocio; se copian o se mandan por WhatsApp.' },
      { title: 'La gerencia la crea', detail: 'Con "Crear demo y dar acceso" nace el negocio de prueba con esos módulos y el usuario listo para entrar.' },
      { title: 'Si le gustó', detail: '"Pasar a cliente": se elige el plan, deja de ser demo y conserva todo lo que cargó.' },
    ],
    tips: ['Si nadie la convierte, la demo se borra sola 30 días después de vencer.'],
  },
  {
    key: 'warranties',
    title: 'Garantías',
    intro: 'Del producto que el cliente trae fallado hasta que se le resuelve.',
    requires: [
      { what: 'Meses de garantía en los productos', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'Sin eso no se puede calcular si el producto sigue cubierto.', feature: 'inventory' },
      { what: 'Proveedores cargados', to: '/inventory?tab=suppliers', where: 'Inventario → Proveedores', why: 'Para saber a quién se le reclama.' },
    ],
    steps: [
      { title: 'Recibí el producto', detail: 'Buscá la factura: aparecen sus líneas con la vigencia calculada. También se puede recibir sin factura.' },
      { title: 'Documentá', detail: 'Serie, falla y fotos del estado en que entró: es el respaldo contra el "así no lo entregué".' },
      { title: 'Mandalo al proveedor', detail: 'El caso pasa a "Donde proveedor" y se cuentan los días que lleva afuera.' },
      { title: 'Cerralo', detail: 'Aprobada o rechazada, y al entregar elegís la solución: reparado, cambiado, devolución o nota de crédito.' },
    ],
    tips: ['Los meses de garantía salen del producto: cargalos en Inventario y la vigencia se calcula sola.'],
  },
  {
    key: 'recipes',
    title: 'Recetas',
    intro: 'Saber cuánto cuesta cada plato y descontar los ingredientes al vender.',
    requires: [
      { what: 'Insumos cargados con costo y unidad', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'El costo del plato sale de ahí; sin costo, la receta no dice nada.' },
      { what: 'Unidades de medida', to: '/inventory?tab=unitTypes', where: 'Inventario → Tipos de unidad', why: 'Sin unidades no se puede convertir gramos a kilos y el costeo falla.', feature: 'inventory_unit_types' },
    ],
    steps: [
      { title: 'Cargá los insumos', detail: 'Son productos de inventario con su unidad y su costo.' },
      { title: 'Armá la receta', detail: 'Ingredientes, cantidades y merma. El costo se calcula solo.' },
      { title: 'Ligala al producto que se vende', detail: 'Al venderlo se descuentan los INGREDIENTES, no el plato.' },
      { title: 'Revisá el food cost', detail: 'Compara el costo teórico contra el consumo real y muestra la diferencia.' },
    ],
  },
  {
    key: 'labels',
    title: 'Etiquetas',
    intro: 'Imprimir etiquetas con código de barras para marcar la mercadería.',
    requires: [
      { what: 'Etiquetadora configurada', to: '/settings?tab=labels', where: 'Configuración → Etiquetadora', why: 'Hay que decirle el modelo, el tamaño de la etiqueta y cuántas van por fila. Sin eso la impresión sale corrida o en blanco.' },
      { what: 'QZ Tray instalado y corriendo', to: '/settings?tab=labels', where: 'Configuración → Etiquetadora → Impresora', why: 'Es el puente entre el navegador y la etiquetadora: sin él no aparece ninguna impresora.' },
      { what: 'Productos con código', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'El código de barras se genera del código del producto.' },
    ],
    steps: [
      { title: 'Configurá la etiquetadora primero', to: '/settings?tab=labels', detail: 'Tamaño de etiqueta, márgenes y columnas. Hacé una prueba con una hoja antes de mandar cien.' },
      { title: 'Elegí los productos', detail: 'Buscalos y agregalos a la lista de impresión.' },
      { title: 'Poné cuántas de cada uno', detail: 'Normalmente una por unidad que llegó en la compra.' },
      { title: 'Revisá la vista previa', detail: 'Ahí se ve si el precio y el código entran bien en el tamaño elegido.' },
      { title: 'Imprimí', detail: 'Si sale corrida, ajustá márgenes en la configuración; no es la impresora, es el calibrado.' },
    ],
    tips: ['La configuración de la etiquetadora es POR DISPOSITIVO: cada computadora tiene la suya.'],
  },
  {
    key: 'reports',
    title: 'Reportes',
    intro: 'Ver qué se vendió, qué dejó y a dónde se fue la plata.',
    requires: [
      { what: 'Costo en los productos', to: '/inventory?tab=products', where: 'Inventario → Productos', why: 'Sin costo, el reporte de ganancia muestra la venta completa como utilidad.' },
      { what: 'Cierres de caja hechos', to: '/pos', where: 'Punto de venta', why: 'El reporte de cajas se arma con esos cierres.', feature: 'pos_cash_management' },
    ],
    steps: [
      { title: 'Elegí el período', detail: 'Casi todos los reportes trabajan por rango de fechas.' },
      { title: 'Empezá por ventas', detail: 'Qué se vendió, en qué horas y quién lo vendió.' },
      { title: 'Mirá la ganancia', detail: 'Usa el costo congelado de cada venta, así una venta vieja no se recostea con el precio de hoy.' },
      { title: 'Exportá', detail: 'A Excel o PDF cuando lo pide el contador.' },
    ],
  },
  {
    key: 'settings',
    title: 'Configuración',
    intro: 'Lo que se ajusta una vez y después no se toca más.',
    requires: [
      { what: 'QZ Tray instalado (si imprimís por impresora local)', to: '/settings?tab=receipt', where: 'Configuración → Factura → Impresora', why: 'Es el puente entre el navegador y la impresora.' },
    ],
    steps: [
      { title: 'General', to: '/settings?tab=general', detail: 'Nombre, cédula, dirección y teléfono del negocio: salen en el tiquete y en la factura electrónica.' },
      { title: 'Pagos', to: '/settings?tab=payments', detail: 'Qué medios de pago ofrece la caja, y si se exige abrir caja.' },
      { title: 'Factura', to: '/settings?tab=receipt', detail: 'Ancho de papel, logo, impresora y copias.' },
      { title: 'Facturación electrónica', to: '/settings?tab=electronic_invoice', detail: 'Datos del emisor, certificado y ambiente. La ubicación tiene que coincidir con la inscrita en ATV.', feature: 'electronic_invoice' },
    ],
  },
];

const BY_KEY = new Map(MODULE_GUIDES.map(g => [g.key, g]));

/** Guía que corresponde a una ruta. */
export function guideForPath(pathname: string): ModuleGuide | null {
  const p = pathname.toLowerCase();
  const match = (route: string, key: string) => (p === route || p.startsWith(route + '/')) ? key : null;
  const key =
    match('/pos', 'pos') ?? match('/ventanita', 'pos') ??
    match('/inventory', 'inventory') ??
    match('/purchases', 'purchases') ?? match('/fe-recepcion', 'purchases') ??
    match('/customers', 'customers') ??
    match('/accounts-receivable', 'accounts_receivable') ?? match('/cobros', 'accounts_receivable') ??
    match('/agenda-entregas', 'agenda') ??
    match('/entregas', 'entregas') ??
    match('/caja', 'caja') ??
    match('/agent-orders', 'agent_orders') ??
    match('/seguimiento', 'leads') ??
    match('/demos', 'demos') ??
    match('/garantias', 'warranties') ??
    match('/recipes', 'recipes') ?? match('/recetas', 'recipes') ??
    match('/labels', 'labels') ?? match('/etiquetas', 'labels') ??
    match('/reports', 'reports') ??
    match('/settings', 'settings') ??
    null;
  return key ? (BY_KEY.get(key) ?? null) : null;
}

export const guideByKey = (key: string) => BY_KEY.get(key) ?? null;
