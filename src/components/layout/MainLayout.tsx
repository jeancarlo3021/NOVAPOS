import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isPOS = location.pathname === '/pos';

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar - Se oculta en POS */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Se oculta en POS */}
        <Header setSidebarOpen={setSidebarOpen} />
        
        {/* Main Content */}
        <main className={`flex-1 overflow-y-auto ${isPOS ? 'p-0' : 'p-4 sm:p-6 lg:p-8'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};