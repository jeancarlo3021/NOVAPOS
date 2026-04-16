import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Login } from '@/modules/auth/Login';
import { MainLayout } from '@/components/layout/MainLayout';
import { Dashboard } from '@/modules/dashboard/Dasboard';
import { CreateOwner } from '@/modules/auth/CreateOwner';
import { Users } from '@/modules/users/Users';
import Plans from '@/modules/users/Plans';
import {SyncIndicator} from '@/components/SyncIndicator';
import { InventoryDashboard } from './modules/inventory';
import { CategoriesAndUnitsManagement } from './modules/inventory/categories/CategoriesManagement';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Ruta de Login */}
          <Route path="/login" element={<Login />} />

          {/* Rutas Protegidas */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<div className="p-6"><h1>POS</h1></div>} />
            <Route path='/create-owner' element={<CreateOwner />} />
            <Route path='/users' element={<Users/>}></Route>
            <Route path='/plans' element={<Plans/>}/>
            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path='/categorie' element={<CategoriesAndUnitsManagement/>}/>
            <Route path="reports" element={<div className="p-6"><h1>Reportes</h1></div>} />
            <Route path="settings" element={<div className="p-6"><h1>Configuración</h1></div>} />
          </Route>
          {/* Ruta por defecto */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SyncIndicator />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
