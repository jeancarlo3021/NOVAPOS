import { Menu} from 'lucide-react';
import { TenantSwitcher } from './TenantSwitcher';
import { useLocation } from 'react-router-dom';

interface HeaderProps {
  setSidebarOpen: (isOpen: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ setSidebarOpen }) => {
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  // Si es POS, no mostrar header
  if (isPOS) {
    return null;
  }

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
      <div className="flex items-center gap-4">
        <TenantSwitcher />
      </div>
    </header>
  );
};