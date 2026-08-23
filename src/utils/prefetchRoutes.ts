/**
 * Precarga en segundo plano las pantallas que el negocio abre todos los días.
 *
 * Las rutas son `lazy()`, así que la primera vez que alguien entra al POS se
 * queda mirando el spinner mientras baja el chunk. Esto lo baja ANTES, cuando el
 * navegador está desocupado y ya se pintó el menú: no compite con el arranque y
 * la navegación se siente inmediata.
 *
 * Solo se precarga lo que el plan incluye — bajar el POS a un negocio que no lo
 * tiene sería gastarle los datos para nada.
 */
type Features = Record<string, unknown>;

const onIdle = (fn: () => void, timeout = 4000) => {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 2500);
};

let done = false;

export function prefetchCommonRoutes(features: Features | null | undefined) {
  if (done || !features) return;
  done = true;

  const has = (k: string) => (features as any)[k] === true;
  const grab = (load: () => Promise<unknown>) => { void load().catch(() => {}); };

  onIdle(() => {
    if (has('pos')) grab(() => import('@/modules/pos/POSMain'));
    if (has('inventory') || has('inventory_products_only')) {
      grab(() => import('@/modules/inventory/InventoryDashboard'));
    }
    // Una segunda tanda, más liviana, cuando la primera ya terminó: así el POS
    // gana la carrera por el ancho de banda.
    onIdle(() => {
      if (has('customers')) grab(() => import('@/modules/customers/CustomersList'));
      if (has('cashier_desk')) grab(() => import('@/modules/agents/CashierDesk'));
    }, 8000);
  });
}

export default prefetchCommonRoutes;
