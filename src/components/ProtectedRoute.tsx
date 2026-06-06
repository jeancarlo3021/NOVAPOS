import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AccountSuspendedModal } from './AccountSuspendedModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// inactive y cancelled bloquean por completo (no logging at all to dashboard).
// 'suspended' (morosidad > 15 días) ahora permite acceso SOLO-LECTURA al
// inventario; cualquier otra ruta se redirige a /inventory.
const HARD_BLOCK_STATUSES = new Set(['inactive', 'cancelled']);

// Rutas que SÍ se permiten en modo solo-lectura. Mantenelo conservador.
const READ_ONLY_ALLOWED_PATHS = new Set<string>([
  '/inventory',
  '/create-owner', // el super-admin no se ve afectado
]);

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, tenant, loading: authLoading } = useAuth();
  const location = useLocation();
  const [isReady, setIsReady] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    // ✅ Timeout de seguridad: si pasa 3 segundos, continuar de todas formas
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setHasTimedOut(true);
        setIsReady(true);
      }
    }, 3000);

    // ✅ Si authLoading cambia a false, marcar como listo
    if (!authLoading) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (isMountedRef.current) {
        setIsReady(true);
      }
    }

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [authLoading]);

  // ✅ Mostrar spinner SOLO en la carga inicial (máximo 3 segundos)
  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          {/* Spinner mejorado */}
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-500 animate-spin"></div>
          </div>

          {/* Texto */}
          <p className="text-gray-700 font-medium mb-2">Verificando autenticación...</p>
          <p className="text-sm text-gray-500">
            {hasTimedOut ? 'Continuando...' : 'Por favor espera un momento'}
          </p>

          {/* Indicador de progreso */}
          <div className="mt-6 w-48 h-1 bg-gray-200 rounded-full overflow-hidden mx-auto">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ 
                width: hasTimedOut ? '100%' : '60%'
              }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Si no hay usuario, redirigir a login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ✅ Tenant cancelado / inactivo → bloquea TODO con modal (no hay redención).
  if (tenant?.status && HARD_BLOCK_STATUSES.has(tenant.status)) {
    return <AccountSuspendedModal status={tenant.status} />;
  }

  // ✅ Tenant suspendido (morosidad > 15 días): modo solo-lectura.
  // Permitimos navegar solo a /inventory; cualquier otra ruta se redirige.
  if (tenant?.status === 'suspended') {
    const path = location.pathname;
    const allowed = Array.from(READ_ONLY_ALLOWED_PATHS).some(p => path === p || path.startsWith(p + '/'));
    if (!allowed) {
      return <Navigate to="/inventory" replace />;
    }
  }

  // ✅ Usuario autenticado, mostrar contenido
  return <>{children}</>;
};