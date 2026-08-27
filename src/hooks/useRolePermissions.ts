import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { rolePermissionsService } from '@/services/users/rolePermissionsService';
import type { UserPermissionMatrix } from '@/types/Types_Users';

/**
 * Cache por (tenantId, role) para no consultar en cada render del Sidebar.
 *
 * CON VENCIMIENTO a propósito: sin él, un permiso concedido por el dueño no
 * llegaba nunca al empleado que ya tenía la sesión abierta —la matriz vivía en
 * memoria hasta cerrar el navegador— y parecía que "no se aplicaron los
 * permisos". Ahora se revalida sola cada pocos minutos.
 */
const TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; matrix: UserPermissionMatrix }>();
const fresh = (k: string) => {
  const hit = cache.get(k);
  return hit && Date.now() - hit.at < TTL_MS ? hit.matrix : null;
};

export function useRolePermissions() {
  const { user, tenant } = useAuth();
  const role = user?.role ?? '';
  const tenantId = tenant?.id ?? '';
  const cacheKey = `${tenantId}::${role}`;

  const [matrix, setMatrix] = useState<UserPermissionMatrix>(() => fresh(cacheKey) ?? cache.get(cacheKey)?.matrix ?? {});
  const [loaded, setLoaded] = useState(() => cache.has(cacheKey));

  useEffect(() => {
    if (!role || !tenantId) return;
    // Owner / admin: acceso total (no consultamos, asumimos can_access=true).
    if (role === 'owner' || role === 'admin') {
      setMatrix({});
      setLoaded(true);
      return;
    }
    // Lo cacheado se muestra de una (la pantalla no puede quedar en blanco),
    // pero si venció se vuelve a pedir en segundo plano.
    const enCache = cache.get(cacheKey);
    if (enCache) { setMatrix(enCache.matrix); setLoaded(true); }
    if (fresh(cacheKey)) return;

    (async () => {
      try {
        const m = await rolePermissionsService.getRolePermissions(role);
        cache.set(cacheKey, { at: Date.now(), matrix: m });
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
  const isExplicitlyGranted = (module: string): boolean => {
    // Sin matriz guardada, el rol está SIN CONFIGURAR y todo el sistema lo trata
    // como permitido (canAccess/canDo devuelven true, y la pantalla de Roles
    // muestra todos los módulos encendidos). Esta regla tiene que decir lo mismo.
    //
    // Cuando no lo hacía, un cajero sin permisos configurados se quedaba sin el
    // botón de Vender y NO había manera de devolvérselo: la pantalla de Roles ya
    // le mostraba «Punto de venta» activado, así que el dueño no tenía nada que
    // marcar. La separación cajero/agente sigue en pie para quien SÍ configura
    // los roles: basta con destildar el módulo y guardar.
    if (!hasMatrix) return true;
    return matrix[module]?.can_access === true;
  };

  return { matrix, loaded, isOwnerOrAdmin, canAccess, canDo, isExplicitlyGranted };
}

// Invalidador externo — para llamar tras guardar permisos y forzar refetch.
export function clearRolePermissionsCache() {
  cache.clear();
}
