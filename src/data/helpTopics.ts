// Contenido del Centro de Ayuda. Cada categoría agrupa guías paso a paso.
// Es solo texto (sin backend): se puede ampliar libremente.

export interface HelpItem {
  q: string;            // pregunta / título
  steps: string[];      // pasos o explicación
  keywords?: string;    // términos extra para la búsqueda
}

export interface HelpCategory {
  id: string;
  title: string;
  emoji: string;
  items: HelpItem[];
  /** Feature del plan necesaria para mostrar esta categoría (planFeatures[feature] truthy). */
  feature?: string;
  /** Módulo de permisos: solo se muestra si el rol puede acceder (canAccess). */
  module?: string;
  /** Rutas donde esta categoría es más relevante (para ordenar contextual). */
  paths?: string[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'pos',
    title: 'Punto de Venta (POS)',
    emoji: '🛒',
    feature: 'pos', module: 'pos', paths: ['/pos'],
    items: [
      {
        q: '¿Cómo hago una venta?',
        keywords: 'cobrar vender factura',
        steps: [
          'Abrí el módulo "Vender" desde el dashboard.',
          'Tocá los productos para agregarlos al carrito (o buscá por nombre/código).',
          'Cuando termines, tocá "Cobrar".',
          'Elegí el método de pago (Efectivo, Tarjeta, SINPE) e ingresá el monto recibido.',
          'Confirmá: se imprime el ticket y se descuenta el inventario.',
        ],
      },
      {
        q: '¿Cómo vendo un producto por peso (kg)?',
        keywords: 'balanza peso kilo carne',
        steps: [
          'Los productos por peso muestran su unidad (ej. /kg).',
          'Al agregarlo se abre el teclado de peso.',
          'Ingresá el peso, o cambiá a "Por monto (₡)" para escribir los colones y que calcule el peso solo.',
          'Confirmá para agregarlo al carrito.',
        ],
      },
      {
        q: '¿Cómo cobro a crédito a un cliente?',
        keywords: 'credito fiado cuenta cobrar',
        steps: [
          'Primero seleccioná el cliente (debe tener "Venta a crédito" activada en su ficha).',
          'Agregá los productos y tocá "Cobrar".',
          'Elegí el método "Crédito" (aparece solo si el cliente tiene crédito).',
          'Se muestra el saldo y el disponible. Si supera el límite, no deja cobrar.',
          'Al confirmar se genera una Cuenta por Cobrar y se imprime doble factura (cliente y vendedor).',
        ],
      },
      {
        q: '¿Cómo abro y cierro la caja?',
        keywords: 'apertura cierre arqueo fondo',
        steps: [
          'Apertura: tocá "Apertura de caja" e ingresá el fondo inicial.',
          'Durante el día registrá entradas/salidas si hace falta.',
          'Cierre: tocá "Cierre de caja", contá el efectivo y los métodos.',
          'El sistema muestra el faltante/sobrante del total (fondo + ventas) e imprime el cierre.',
        ],
      },
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes y Zonas',
    emoji: '👤',
    feature: 'customers', module: 'customers', paths: ['/customers'],
    items: [
      {
        q: '¿Cómo creo un cliente?',
        keywords: 'nuevo cliente registrar',
        steps: [
          'Entrá a "Clientes" y tocá "Nuevo cliente".',
          'Completá nombre, identificación y datos de contacto.',
          'Si vende a crédito, activá "Venta a crédito" y poné el límite (0 = sin límite).',
          'Guardá.',
        ],
      },
      {
        q: '¿Cómo creo y asigno zonas?',
        keywords: 'zona ruta distribucion',
        steps: [
          'En "Clientes" tocá el botón "Zonas" para crear/eliminar zonas.',
          'Al editar un cliente, elegí su zona en el selector (o creá una con "+ Zona").',
          'Al crear una ruta, filtrá por zona para asignar solo esos clientes.',
        ],
      },
      {
        q: '¿Cómo pongo un precio especial por cliente?',
        keywords: 'precio especial descuento cliente',
        steps: [
          'En "Clientes", abrí el cliente y entrá a "Precios".',
          'Asigná el precio especial por producto.',
          'En el POS y en Distribución, al seleccionar ese cliente, se aplican esos precios (se ven en violeta).',
        ],
      },
    ],
  },
  {
    id: 'distribucion',
    title: 'Distribución (camión)',
    emoji: '🚚',
    feature: 'distribution', module: 'distribution', paths: ['/distribution', '/driver'],
    items: [
      {
        q: '¿Cómo creo una ruta?',
        keywords: 'ruta nueva camion repartidor',
        steps: [
          'Entrá a "Distribución" y tocá "Nueva ruta".',
          'Elegí el camión, el repartidor, la fecha y la modalidad.',
          'Opcional: asigná clientes (por zona) para que el gerente les tome pedidos.',
          'Creá la ruta.',
        ],
      },
      {
        q: '¿Cómo cargo el camión?',
        keywords: 'cargar carga inventario bodega peso',
        steps: [
          'En la ruta tocá "Cargar".',
          'Cada producto muestra "Sistema: N" (lo que hay en bodega).',
          'Subí la cantidad con + / − (acepta decimales).',
          'Para productos por peso usá el botón "⚖ Peso / ₡": ingresá peso o monto en colones.',
          'Tocá "Cargar camión": descuenta del inventario y lo suma al camión.',
        ],
      },
      {
        q: '¿Cómo vende el repartidor?',
        keywords: 'vender autoventa mostrador',
        steps: [
          'Abrí la ruta y tocá "Vender" (mostrador) o "Vender" en un cliente.',
          'Solo aparecen los productos cargados en el camión (no se puede vender de más).',
          'Elegí el método de pago y cobrá; se imprime el ticket.',
          'Si el cliente no compró, tocá "No compró".',
        ],
      },
      {
        q: '¿Cómo cierra la ruta el repartidor?',
        keywords: 'cierre ruta corte sobrante restante',
        steps: [
          'En "Repartidor" → pestaña Rutas, tocá "Cerrar ruta".',
          'Se devuelve el sobrante del camión al inventario y se hace el corte.',
          'En el resumen tenés dos botones: "Imprimir cierre" (ventas por método) y "Restante" (inventario devuelto).',
        ],
      },
      {
        q: '¿Qué es "Por entregar" en el repartidor?',
        keywords: 'entregar pedido preventa verificar',
        steps: [
          'Son los pedidos que tomó el gerente para ese cliente.',
          'Verificá los productos con la lista antes de salir.',
          'Al llegar, tocá "Verificar y entregar", elegí cómo pagó y confirmá: se factura e imprime.',
        ],
      },
    ],
  },
  {
    id: 'cobrar',
    title: 'Cuentas por Cobrar',
    emoji: '💰',
    feature: 'accounts_receivable', module: 'accounts_payable', paths: ['/accounts-receivable'],
    items: [
      {
        q: '¿Dónde veo lo que me deben?',
        keywords: 'credito saldo deuda abono',
        steps: [
          'Entrá a "Cuentas por Cobrar" desde el dashboard.',
          'Arriba ves el saldo total, lo vencido y las cuentas pendientes.',
          'Cada cuenta muestra cliente, factura, vencimiento y saldo.',
        ],
      },
      {
        q: '¿Cómo registro un abono?',
        keywords: 'pago abono cobrar',
        steps: [
          'En "Cuentas por Cobrar", tocá "Abonar" en la cuenta.',
          'Ingresá el monto y el método de pago.',
          'Se actualiza el saldo; cuando llega a 0 queda "Pagada".',
        ],
      },
      {
        q: '¿Cómo creo una cuenta manual?',
        keywords: 'manual nueva cuenta',
        steps: [
          'Tocá "Nueva cuenta", elegí el cliente (o escribí el nombre).',
          'Poné el monto, la fecha de vencimiento y notas.',
          'Guardá.',
        ],
      },
    ],
  },
  {
    id: 'bodegas',
    title: 'Bodegas y Camiones',
    emoji: '🏬',
    feature: 'multi_branch', module: 'inventory', paths: ['/branches'],
    items: [
      {
        q: '¿Cómo creo una bodega o sucursal?',
        keywords: 'bodega sucursal almacen crear',
        steps: [
          'Entrá a "Sucursales y Bodegas".',
          'Tocá "Nueva bodega" (o sucursal).',
          'Poné el nombre y el tipo (central o sucursal).',
          'Guardá: ya podés mover stock hacia/desde esa bodega.',
        ],
      },
      {
        q: '¿Cómo creo un camión para Distribución?',
        keywords: 'camion truck reparto distribucion bodega',
        steps: [
          'Un camión es una bodega de tipo "camión".',
          'En "Sucursales y Bodegas" tocá "Nueva bodega" y elegí el tipo Camión.',
          'Asigná el repartidor (conductor) al camión.',
          'Después, en "Distribución" creás la ruta usando ese camión.',
        ],
      },
    ],
  },
  {
    id: 'transferencias',
    title: 'Transferencias',
    emoji: '🔁',
    feature: 'multi_branch_transfers', module: 'inventory', paths: ['/transfers'],
    items: [
      {
        q: '¿Cómo transfiero stock entre bodegas?',
        keywords: 'transferencia traslado mover stock bodega',
        steps: [
          'Entrá a "Transferencias" y tocá "Nueva transferencia".',
          'Elegí la bodega de origen y la de destino.',
          'Agregá los productos y cantidades a mover.',
          'Enviá la transferencia. Queda "en tránsito".',
          'En la bodega destino, marcala como "Recibida": el stock se mueve.',
        ],
      },
    ],
  },
  {
    id: 'usuarios',
    title: 'Usuarios y Roles',
    emoji: '👥',
    feature: 'users', module: 'users', paths: ['/users'],
    items: [
      {
        q: '¿Cómo creo un usuario?',
        keywords: 'usuario empleado crear cuenta',
        steps: [
          'Entrá a "Usuarios" y tocá "Nuevo usuario".',
          'Poné nombre, correo/usuario y contraseña.',
          'Elegí el rol (Cajero, Gerente, Repartidor, etc.).',
          'Guardá: el usuario ya puede iniciar sesión.',
        ],
      },
      {
        q: '¿Qué hace el rol "Repartidor"?',
        keywords: 'repartidor rol chofer distribucion',
        steps: [
          'El Repartidor solo ve sus rutas y los pedidos por entregar.',
          'Puede vender lo que tiene cargado en el camión y cerrar la ruta.',
          'No toma pedidos (eso lo hace el gerente).',
          'Requiere que el plan tenga "Distribución" activada.',
        ],
      },
      {
        q: '¿Cómo cambio los permisos de un rol?',
        keywords: 'permisos rol modulos acceso',
        steps: [
          'En "Usuarios" entrá a "Roles".',
          'Elegí el rol y activá/desactivá los módulos que puede ver.',
          'Guardá: aplica a todos los usuarios de ese rol.',
          'Solo aparecen los módulos que incluye tu plan.',
        ],
      },
    ],
  },
  {
    id: 'impresora',
    title: 'Impresoras',
    emoji: '🖨️',
    items: [
      {
        q: 'QZ Tray no conecta (Edge/Chrome)',
        keywords: 'qz tray impresora certificado conexion',
        steps: [
          'Asegurate de que la app QZ Tray esté abierta en la computadora.',
          'Abrí en el navegador https://localhost:8181 y aceptá el certificado (Avanzado → Continuar).',
          'Volvé a la app y tocá "Conectar".',
          'Si se cae, el sistema reintenta solo y avisa con un mensaje.',
        ],
      },
      {
        q: 'Configurar impresora Bluetooth',
        keywords: 'bluetooth impresora comandera cajon',
        steps: [
          'En Configuración → Impresoras elegí "Bluetooth".',
          'Agregá la caja principal y las comanderas; conectá cada una.',
          'Podés activar "Abrir cajón" y usar "Reconectar todas".',
        ],
      },
    ],
  },
  {
    id: 'reportes',
    title: 'Reportes',
    emoji: '📊',
    feature: 'reports', module: 'reports', paths: ['/reports'],
    items: [
      {
        q: '¿Dónde veo las ventas y reportes?',
        keywords: 'reportes ventas distribucion cobrar',
        steps: [
          'Entrá a "Reportes".',
          'Elegí el reporte (Ventas, Ganancias, Cierres, Distribución, Cuentas por Cobrar…).',
          'Ajustá el rango de fechas arriba.',
          'El reporte de Distribución muestra el desglose por método (efectivo, tarjeta, SINPE, crédito).',
        ],
      },
    ],
  },
];
