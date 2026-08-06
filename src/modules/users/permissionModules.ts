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
  { key: 'distribution', label: 'Distribución', description: 'Rutas de reparto y repartidor' },
  { key: 'caja', label: 'Caja', description: 'Recibe pedidos de agentes y cobra' },
  { key: 'agent_orders', label: 'Pedidos de agente', description: 'Arma pedidos y los envía a caja' },
];
