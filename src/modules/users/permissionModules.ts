/**
 * Módulos que se pueden permitir o denegar por rol.
 *
 * Vive aparte para que la pantalla del negocio (Usuarios → Roles) y la del
 * Panel Admin ofrezcan la MISMA lista: dos catálogos separados terminan
 * mostrando permisos distintos para el mismo negocio según por dónde se entre.
 */
export interface PermissionModuleMeta {
  key: string;
  label: string;
  description: string;
}

export const PERMISSION_MODULES: PermissionModuleMeta[] = [
  { key: 'pos', label: 'Punto de Venta', description: 'Caja, cobros y ventas' },
  { key: 'inventory', label: 'Inventario', description: 'Productos, stock y categorías' },
  { key: 'reports', label: 'Reportes', description: 'Análisis y estadísticas' },
  { key: 'expenses', label: 'Gastos', description: 'Registro y gestión de gastos' },
  { key: 'purchases', label: 'Compras', description: 'Órdenes a proveedores' },
  { key: 'accounts_payable', label: 'Cuentas por Pagar', description: 'Pagos a proveedores' },
  { key: 'promotions', label: 'Promociones', description: 'Descuentos y ofertas' },
  { key: 'users', label: 'Usuarios', description: 'Gestión de usuarios y roles' },
  { key: 'hr', label: 'Recursos Humanos', description: 'Empleados y nómina' },
  { key: 'customers', label: 'Clientes', description: 'Gestión de clientes' },
  { key: 'restaurant', label: 'Restaurante / Mesas', description: 'Cobro por mesas y mapa' },
  { key: 'recipes', label: 'Recetas', description: 'Recetas e ingredientes' },
  { key: 'digital_menu', label: 'Menú digital', description: 'Carta pública con QR' },
  { key: 'window_service', label: 'Ventanita', description: 'Mostrador con fila de despacho' },
  { key: 'distribution', label: 'Distribución', description: 'Rutas de reparto y repartidor' },
  { key: 'caja', label: 'Caja', description: 'Recibe pedidos de agentes y cobra' },
  { key: 'agent_orders', label: 'Pedidos de agente', description: 'Arma pedidos y los envía a caja' },
  { key: 'agent_agenda', label: 'Agenda y entregas', description: 'Agenda del día, tareas y ruta de entregas' },
  { key: 'accounts_receivable', label: 'Cuentas por Cobrar', description: 'Crédito, abonos y cobros' },
  { key: 'proformas', label: 'Proformas', description: 'Cotizaciones y paso a venta' },
  { key: 'returns', label: 'Devoluciones', description: 'Devolución parcial y anulación de facturas' },
  { key: 'supplier_returns', label: 'Devoluciones a proveedor', description: 'Baja de stock y saldo a favor' },
  { key: 'warranties', label: 'Garantías', description: 'Casos de producto con falla y su seguimiento' },
  { key: 'electronic_invoice', label: 'Facturación Electrónica', description: 'Emisión, recepción y consultas de Hacienda' },
  { key: 'labels', label: 'Etiquetas', description: 'Impresión de etiquetas y códigos de barras' },
  { key: 'multi_branch', label: 'Sucursales', description: 'Sucursales y traslados entre bodegas' },
  { key: 'tracking', label: 'Rastreo', description: 'Ubicación de camiones en vivo' },
  { key: 'settings', label: 'Configuración', description: 'Ajustes del negocio, factura e impresoras' },
];
