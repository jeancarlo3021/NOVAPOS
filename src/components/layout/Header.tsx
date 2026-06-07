import { useState } from 'react';
import { Menu, RefreshCcw, Check } from 'lucide-react';
import { TenantSwitcher } from './TenantSwitcher';
import { BranchSwitcher } from './BranchSwitcher';
import { useLocation } from 'react-router-dom';
import { clearAppCache } from '@/utils/clearAppCache';

interface HeaderProps {
  setSidebarOpen: (isOpen: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ setSidebarOpen }) => {
  const location = useLocation();
  const isPOS = location.pathname === '/pos';
  const [clearing, setClearing] = useState(false);

  if (isPOS) return null;

  const handleClearCache = async () => {
    if (clearing) return;
    if (!confirm(
      '¿Limpiar caché local y recargar la app?\n\n' +
      'Útil cuando los productos, categorías o stock no se ven actualizados.\n' +
      'NO cierra tu sesión.',
    )) return;
    setClearing(true);
    await clearAppCache({ clearAuth: false, reload: true });
  };

  return (
    <header className="flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-gray-200">
      <div className="flex items-center">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-2 mr-3 text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleClearCache}
          disabled={clearing}
          title="Limpiar caché y recargar  ·  Atajo: Ctrl + Shift + K"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-gray-600 hover:text-blue-700 text-xs font-bold transition disabled:opacity-50"
        >
          {clearing ? (
            <><Check size={13} /> Limpiando…</>
          ) : (
            <><RefreshCcw size={13} /> <span className="hidden sm:inline">Limpiar caché</span></>
          )}
        </button>
        <BranchSwitcher />
        <TenantSwitcher />
      </div>
    </header>
  );
};
