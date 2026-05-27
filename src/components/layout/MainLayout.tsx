import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const MainLayout = () => {
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

  if (isPOS) {
    return (
      <div className="h-screen overflow-hidden">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
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
      </div>
    </div>
  );
};