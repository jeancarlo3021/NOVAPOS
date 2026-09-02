import { useCallback, useEffect, useRef, useState } from 'react';
import type { CartItem } from '@/types/Types_POS';

/**
 * Soporte multi-pestaña en el POS — permite tener varias ventas en espera
 * al mismo tiempo (clásico "hold sale" / "park ticket" / mesas paralelas).
 *
 * Las pestañas se persisten en localStorage por tenant, así si el navegador
 * se cierra o se recarga la página, las ventas en progreso no se pierden.
 */

export interface POSTab {
  id: string;
  label: string;
  cartItems: CartItem[];
  customerName: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredState {
  tabs: POSTab[];
  activeId: string;
}

const KEY = (tenantId: string | null | undefined) =>
  `novapos_pos_tabs__${tenantId ?? 'local'}`;

const newId = () => `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const emptyTab = (label = 'Venta 1'): POSTab => ({
  id: newId(),
  label,
  cartItems: [],
  customerName: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function loadState(tenantId: string | null | undefined): StoredState {
  try {
    const raw = localStorage.getItem(KEY(tenantId));
    if (!raw) return { tabs: [emptyTab()], activeId: '' };
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return { tabs: [emptyTab()], activeId: '' };
    }
    return parsed;
  } catch {
    return { tabs: [emptyTab()], activeId: '' };
  }
}

export interface UsePOSTabsResult {
  tabs: POSTab[];
  activeTab: POSTab;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  newTab: (label?: string) => string;
  closeTab: (id: string) => void;
  renameTab: (id: string, label: string) => void;

  // API compatible con el patrón useState<CartItem[]> existente
  cartItems: CartItem[];
  setCartItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  customerName: string;
  setCustomerName: React.Dispatch<React.SetStateAction<string>>;

  /** Limpia el carrito y cliente del tab activo (post-cobro). */
  resetActive: () => void;
}

export function usePOSTabs(tenantId: string | null | undefined): UsePOSTabsResult {
  const [state, setState] = useState<StoredState>(() => {
    const s = loadState(tenantId);
    if (!s.activeId || !s.tabs.find(t => t.id === s.activeId)) {
      s.activeId = s.tabs[0].id;
    }
    return s;
  });

  /**
   * De qué negocio son las pestañas que hay AHORA en memoria.
   *
   * ── El error que corrige ───────────────────────────────────────────────────
   * Al abrir el POS, el negocio todavía no está resuelto (la sesión tarda un
   * instante), así que el estado arranca vacío bajo una llave provisional.
   * Cuando el negocio llegaba, pasaban dos cosas en el mismo ciclo: el efecto de
   * recarga pedía las pestañas guardadas, y el de guardado escribía el estado
   * VACÍO —que todavía no se había reemplazado— sobre la llave del negocio.
   *
   * Resultado: las ventas en espera se borraban solas a los pocos segundos de
   * entrar, sin que nadie tocara nada.
   *
   * Con esta marca, solo se guarda cuando lo que hay en memoria pertenece de
   * verdad al negocio actual.
   */
  const tenantDelEstado = useRef(tenantId);

  // Re-cargar si cambia el tenant.
  const lastTenantRef = useRef(tenantId);
  useEffect(() => {
    if (lastTenantRef.current !== tenantId) {
      lastTenantRef.current = tenantId;
      setState(loadState(tenantId));
      tenantDelEstado.current = tenantId;
    }
  }, [tenantId]);

  // Persistir cambios — solo los del negocio al que pertenecen.
  useEffect(() => {
    // Sin negocio resuelto no se escribe nada: guardar bajo una llave provisional
    // no sirve, y arriesga pisar lo bueno en cuanto el negocio aparezca.
    if (!tenantId) return;
    if (tenantDelEstado.current !== tenantId) return;
    try { localStorage.setItem(KEY(tenantId), JSON.stringify(state)); } catch { /* storage full */ }
  }, [state, tenantId]);

  const activeTab = state.tabs.find(t => t.id === state.activeId) ?? state.tabs[0];

  const updateActive = useCallback((mut: (t: POSTab) => POSTab) => {
    setState(s => ({
      ...s,
      tabs: s.tabs.map(t => t.id === s.activeId ? { ...mut(t), updatedAt: Date.now() } : t),
    }));
  }, []);

  const setCartItems = useCallback<React.Dispatch<React.SetStateAction<CartItem[]>>>(
    (next) => updateActive(t => ({
      ...t,
      cartItems: typeof next === 'function' ? (next as any)(t.cartItems) : next,
    })),
    [updateActive],
  );

  const setCustomerName = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (next) => updateActive(t => ({
      ...t,
      customerName: typeof next === 'function' ? (next as any)(t.customerName) : next,
    })),
    [updateActive],
  );

  const setActiveTabId = useCallback((id: string) => {
    setState(s => s.tabs.find(t => t.id === id) ? { ...s, activeId: id } : s);
  }, []);

  const newTab = useCallback((label?: string): string => {
    const id = newId();
    setState(s => {
      const finalLabel = label ?? `Venta ${s.tabs.length + 1}`;
      const tab: POSTab = {
        id,
        label: finalLabel,
        cartItems: [],
        customerName: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return { tabs: [...s.tabs, tab], activeId: id };
    });
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    setState(s => {
      const next = s.tabs.filter(t => t.id !== id);
      // Siempre dejamos al menos una pestaña.
      if (next.length === 0) next.push(emptyTab());
      const activeId = s.activeId === id ? next[next.length - 1].id : s.activeId;
      return { tabs: next, activeId };
    });
  }, []);

  const renameTab = useCallback((id: string, label: string) => {
    setState(s => ({
      ...s,
      tabs: s.tabs.map(t => t.id === id ? { ...t, label, updatedAt: Date.now() } : t),
    }));
  }, []);

  const resetActive = useCallback(() => {
    updateActive(t => ({ ...t, cartItems: [], customerName: '' }));
  }, [updateActive]);

  return {
    tabs: state.tabs,
    activeTab,
    activeTabId: state.activeId,
    setActiveTabId,
    newTab,
    closeTab,
    renameTab,
    cartItems: activeTab.cartItems,
    setCartItems,
    customerName: activeTab.customerName,
    setCustomerName,
    resetActive,
  };
}
