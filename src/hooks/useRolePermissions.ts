import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { rolePermissionsService } from '@/services/users/rolePermissionsService';
import type { UserPermissionMatrix } from '@/types/Types_Users';

// Cache por (tenantId, role) para evitar refetch en cada render del Sidebar.
const cache = new Map<string, UserPermissionMatrix>();

export function useRolePermissions() {
  const { user, tenant } = useAuth();
  const role = user?.role ?? '';
  const tenantId = tenant?.id ?? '';
  const cacheKey = `${tenantId}::${role}`;

  const [matrix, setMatrix] = useState<UserPermissionMatrix>(() => cache.get(cacheKey) ?? {});
  const [loaded, setLoaded] = useState(() => cache.has(cacheKey));

  useEffect(() => {
    if (!role || !tenantId) return;
    // Owner / admin: acceso total (no consultamos, asumimos can_access=true).
    if (role === 'owner' || role === 'admin') {
      setMatrix({});
      setLoaded(true);
      return;
    }
    if (cache.has(cacheKey)) {
      setMatrix(cache.get(cacheKey)!);
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const m = await rolePermissionsService.getRolePermissions(role);
        console.log('[useRolePermissions] loaded for', role, 'in tenant', tenantId, ':', m);
        cache.set(cacheKey, m);
        setMatrix(m);
      } catch (err) {
        console.warn('[useRolePermissions] failed to load:', err);
      } finally { setLoaded(true); }
    })();
  }, [cacheKey, role, tenantId]);

  // Helpers
  const isOwnerOrAdmin = role === 'owner' || role === 'admin';

  // Si no hay matriz configurada (objeto vacío) → comportamiento permisivo:
  // todo lo que el PLAN permite queda visible. Esto evita romper instalaciones
  // que aún no configuraron role_permissions.
  const hasMatrix = Object.keys(matrix).length > 0;

  const canAccess = (module: string): boolean => {
    if (isOwnerOrAdmin) return true;
    if (!hasMatrix) return true;
    // Si el módulo no está en la matriz (ej. uno nuevo que el owner aún no
    // configuró), lo dejamos visible. Solo se oculta si está explícitamente
    // con can_access=false.
    if (!(module in matrix)) return true;
    return matrix[module]?.can_access === true;
  };

  /**
   * Permiso para ESCRIBIR (crear / editar / borrar).
   *
   * A diferencia de `canAccess`, acá un módulo que no está en la matriz se
   * NIEGA: si el dueño se tomó el trabajo de configurar permisos, lo que no
   * concedió no está concedido. Con la regla anterior —"módulo no configurado →
   * permitido"— a un empleado con permisos configurados para otras áreas le
   * quedaba abierto todo lo que no aparecía en la lista, y así terminó pudiendo
   * modificar el inventario.
   *
   * Si el negocio NO configuró ninguna matriz se sigue permitiendo: ahí nadie
   * decidió nada todavía y bloquear de golpe dejaría a los empleados sin trabajar.
   *
   * Esto es la mitad de la historia: la otra mitad la aplica el servidor
   * (middleware `requirePermission`). Esconder el botón evita el error honesto;
   * el servidor evita el resto.
   */
  const canDo = (module: string, action: 'create' | 'edit' | 'delete'): boolean => {
    if (isOwnerOrAdmin) return true;
    if (!hasMatrix) return true;
    const row = matrix[module];
    if (!row) return false;               // configurado pero no concedido
    if (!row.can_access) return false;
    return row[`can_${action}` as 'can_create' | 'can_edit' | 'can_delete'] === true;
  };

  /**
   * ¿El dueño le concedió este módulo a este rol EXPLÍCITAMENTE?
   *
   * Sirve para las separaciones de funciones que están escritas en el código
   * (por ejemplo: el cajero no ve el POS de venta, el agente no ve la caja).
   * Son un valor por defecto razonable, no una ley: si el dueño entra a Usuarios
   * → Roles y le da acceso al módulo, eso manda. Sin esta salida, un empleado
   * marcado como «cajero» se quedaba sin el botón de Vender y no había forma de
   * devolvérselo salvo cambiarle el rol.
   */
  const isExplicitlyGranted = (module: string): boolean =>
    matrix[module]?.can_access === true;

  return { matrix, loaded, isOwnerOrAdmin, canAccess, canDo, isExplicitlyGranted };
}

// Invalidador externo — para llamar tras guardar permisos y forzar refetch.
export function clearRolePermissionsCache() {
  cache.clear();
}
