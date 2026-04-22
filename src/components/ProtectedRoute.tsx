import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    // ✅ Timeout de seguridad: si pasa 3 segundos, continuar de todas formas
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        console.warn('⚠️ AuthContext tardó más de 3 segundos, continuando...');
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

  // ✅ Usuario autenticado, mostrar contenido
  return <>{children}</>;
};