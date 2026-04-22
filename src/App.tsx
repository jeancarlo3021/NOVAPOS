import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PlanGuard } from '@/components/PlanGuard';
import { Login } from '@/modules/auth/Login';
import { MainLayout } from '@/components/layout/MainLayout';
import { Dashboard } from '@/modules/dashboard/Dasboard';
import { CreateOwner }  from '@/modules/auth/CreateOwner';
import { Users } from '@/modules/users/Users';
import Plans from '@/modules/users/Plans';
import { SyncIndicator } from '@/components/SyncIndicator';
import { InventoryDashboard } from './modules/inventory';
import { CategoriesManagement } from './modules/inventory/categories/CategoriesManagement';
import { UnitTypesManagement } from './modules/inventory/categories/UnitTypesManagement';
import { POSMain } from './modules/pos/POSMain';
import { SettingsPage } from './modules/settings/pages/Settingspage';
import  ReportsDashboard  from './modules/reports/ReportsDashboard';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Always accessible */}
            <Route index element={<Dashboard />} />
            <Route path="/pos" element={
              <PlanGuard feature="pos"><POSMain /></PlanGuard>
            } />
            <Route path="/settings" element={
              <PlanGuard feature="settings"><SettingsPage /></PlanGuard>
            } />

            {/* Plan-gated */}
            <Route path="/inventory" element={
              <PlanGuard feature="inventory"><InventoryDashboard /></PlanGuard>
            } />
            <Route path="/categorie" element={
              <PlanGuard feature="inventory"><CategoriesManagement /></PlanGuard>
            } />
            <Route path="/unit-types" element={
              <PlanGuard feature="inventory"><UnitTypesManagement /></PlanGuard>
            } />
            <Route path="/users" element={
              <PlanGuard feature="users"><Users /></PlanGuard>
            } />
            <Route path="/reports" element={
              <PlanGuard feature="reports_basic">
                <ReportsDashboard />
              </PlanGuard>
            } />

            {/* Owner only */}
            <Route path="/create-owner" element={<CreateOwner />} />
            <Route path="/plans" element={<Plans />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SyncIndicator />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
