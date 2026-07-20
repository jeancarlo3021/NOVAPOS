import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Lock, LogOut, Menu as MenuIcon, RefreshCw } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/context/AuthContext';

// Banner sticky en la parte superior cuando el tenant está en modo solo-lectura
// por morosidad. Indica al usuario que solo puede ver inventario y le da un
// botón para cerrar sesión.
const ReadOnlyBanner: React.FC = () => {
  const { logout } = useAuth();
  return (
    <div className="bg-red-600 text-white px-4 py-2.5 flex items-center gap-3 shrink-0 shadow-md z-20">
      <Lock size={18} className="shrink-0" />
      <div className="flex-1 text-sm leading-tight">
        <p className="font-black">Cuenta suspendida por morosidad</p>
        <p className="text-xs text-red-100 mt-0.5">
          Tenés más de 15 días de atraso. Podés consultar el inventario pero no se permiten cambios ni movimientos hasta regularizar el pago.
        </p>
      </div>
      <button
        onClick={() => logout()}
        className="shrink-0 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg text-xs font-bold transition"
      >
        <LogOut size={13} /> Cerrar sesión
      </button>
    </div>
  );
};

export const MainLayout = () => {
  const { isReadOnly } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [userPrefersCompact, setUserPrefersCompact] = useState(false);
  const location = useLocation();
  const isPOS = location.pathname === '/pos';
  const isReports = location.pathname.startsWith('/reports');

  // Auto-colapsar sidebar principal cuando estamos en /reports
  // pero respetar la preferencia del usuario al salir
  useEffect(() => {
    if (isReports) {
      setSidebarCompact(true);
    } else {
      setSidebarCompact(userPrefersCompact);
    }
  }, [isReports, userPrefersCompact]);

  const handleSetCompact = (compact: boolean) => {
    setSidebarCompact(compact);
    // Si NO estamos en reports, guardar la preferencia del usuario
    if (!isReports) {
      setUserPrefersCompact(compact);
    }
  };

  // Limpiar caché: quita el service worker + cachés y recarga con la última versión.
  // Útil en la app del repartidor cuando quedó una versión vieja cacheada.
  const clearCacheAndReload = async () => {
    if (!confirm('¿Actualizar la app? Se limpia la caché y se recarga con la última versión.')) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch { /* ignore */ }
    window.location.reload();
  };

  if (isPOS) {
    return (
      <div className="h-screen overflow-hidden">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {isReadOnly && <ReadOnlyBanner />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          isCompact={sidebarCompact}
          setIsCompact={handleSetCompact}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header setSidebarOpen={setSidebarOpen} />
          <main className={`flex-1 overflow-y-auto ${isReports ? '' : 'p-4 sm:p-6 lg:p-8'}`}>
            <Outlet />
          </main>
          {/* Barra inferior (solo móvil): menú + actualizar/limpiar caché. */}
          <div className="md:hidden shrink-0 border-t border-gray-200 bg-white flex items-stretch z-30 pb-[env(safe-area-inset-bottom)]">
            <button onClick={() => setSidebarOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-600 active:bg-gray-100">
              <MenuIcon size={20} /><span className="text-[10px] font-bold">Menú</span>
            </button>
            <div className="w-px bg-gray-200 my-1.5" />
            <button onClick={clearCacheAndReload}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-600 active:bg-gray-100">
              <RefreshCw size={20} /><span className="text-[10px] font-bold">Actualizar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};