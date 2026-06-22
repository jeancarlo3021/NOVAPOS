import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PlanGuard } from '@/components/PlanGuard';
import { Login } from '@/modules/auth/Login';
import { ResetPassword } from '@/modules/auth/ResetPassword';
import { MainLayout } from '@/components/layout/MainLayout';
import { Dashboard } from '@/modules/dashboard/Dasboard';
import { SyncIndicator } from '@/components/SyncIndicator';
import { QzReconnectToast } from '@/components/QzReconnectToast';
import { ClearCacheShortcut } from '@/components/ClearCacheShortcut';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

// ── Módulos cargados bajo demanda ─────────────────────────────────────────
// Solo el shell (Login, Dashboard, layout) viaja en el bundle inicial; el
// resto se baja cuando el usuario navega a la ruta correspondiente. Esto
// reduce ~70% el JS inicial y acelera el primer render del POS / login.

const POSMain                  = lazy(() => import('./modules/pos/POSMain').then(m => ({ default: m.POSMain })));
const SettingsPage             = lazy(() => import('./modules/settings/pages/Settingspage').then(m => ({ default: m.SettingsPage })));
const InventoryDashboard       = lazy(() => import('./modules/inventory').then(m => ({ default: m.InventoryDashboard })));
const CategoriesManagement     = lazy(() => import('./modules/inventory/categories/CategoriesManagement').then(m => ({ default: m.CategoriesManagement })));
const UnitTypesManagement      = lazy(() => import('./modules/inventory/categories/UnitTypesManagement').then(m => ({ default: m.UnitTypesManagement })));
const Users                    = lazy(() => import('./modules/users/Users').then(m => ({ default: m.Users })));
const Plans                    = lazy(() => import('./modules/users/Plans'));
const ReportsDashboard         = lazy(() => import('./modules/reports/ReportsDashboard'));
const BranchReportsDashboard   = lazy(() => import('./modules/reports/BranchReportsDashboard').then(m => ({ default: m.BranchReportsDashboard })));
const Recipes                  = lazy(() => import('./modules/recipes/Recipes').then(m => ({ default: m.Recipes })));
const DistributionDashboard    = lazy(() => import('./modules/distribution/DistributionDashboard').then(m => ({ default: m.DistributionDashboard })));
const RouteRun                 = lazy(() => import('./modules/distribution/RouteRun').then(m => ({ default: m.RouteRun })));
const DriverView               = lazy(() => import('./modules/distribution/DriverView').then(m => ({ default: m.DriverView })));
const ExpensesDashboard        = lazy(() => import('./modules/expenses/ExpensesDashboard').then(m => ({ default: m.ExpensesDashboard })));
const PurchasesDashboard       = lazy(() => import('./modules/purchases/PurchasesDashboard').then(m => ({ default: m.PurchasesDashboard })));
const HRDashboard              = lazy(() => import('./modules/hr/HRDashboard').then(m => ({ default: m.HRDashboard })));
const AccountsPayableDashboard = lazy(() => import('./modules/accountsPayable/AccountsPayableDashboard').then(m => ({ default: m.AccountsPayableDashboard })));
const AccountsReceivableDashboard = lazy(() => import('./modules/accountsReceivable/AccountsReceivableDashboard').then(m => ({ default: m.AccountsReceivableDashboard })));
const PromotionsDashboard      = lazy(() => import('./modules/promotions/PromotionsDashboard').then(m => ({ default: m.PromotionsDashboard })));
const CreateOwner              = lazy(() => import('./modules/auth/CreateOwner').then(m => ({ default: m.CreateOwner })));
const TablesDashboard          = lazy(() => import('./modules/tables/TablesDashboard').then(m => ({ default: m.TablesDashboard })));
const BillingDashboard         = lazy(() => import('./modules/billing/BillingDashboard').then(m => ({ default: m.BillingDashboard })));
const BranchesAdmin            = lazy(() => import('./modules/branches/BranchesAdmin').then(m => ({ default: m.BranchesAdmin })));
const TransfersDashboard       = lazy(() => import('./modules/branches/TransfersDashboard').then(m => ({ default: m.TransfersDashboard })));
const CustomersList            = lazy(() => import('./modules/customers/CustomersList').then(m => ({ default: m.CustomersList })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-500 animate-spin" />
      </div>
    </div>
  );
}

function AppContent() {
  // Token refresh hook
  useTokenRefresh();

  return (
    <>
      <ClearCacheShortcut />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />

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
              <Route path="/recipes" element={
                <PlanGuard feature="inventory"><Recipes /></PlanGuard>
              } />
              <Route path="/reports" element={
                <PlanGuard feature="reports">
                  <ReportsDashboard />
                </PlanGuard>
              } />
              <Route path="/branch-reports" element={
                <PlanGuard feature="reports">
                  <BranchReportsDashboard />
                </PlanGuard>
              } />
              <Route path="/expenses" element={
                <PlanGuard feature="expenses">
                  <ExpensesDashboard />
                </PlanGuard>
              } />
              <Route path="/purchases" element={
                <PlanGuard feature="purchases">
                  <PurchasesDashboard />
                </PlanGuard>
              } />
              <Route path="/hr" element={<HRDashboard />} />
              <Route path="/promotions" element={
                <PlanGuard feature="promotions">
                  <PromotionsDashboard />
                </PlanGuard>
              } />
              <Route path="/customers" element={<CustomersList />} />
              <Route path="/distribution" element={<DistributionDashboard />} />
              <Route path="/distribution/:id" element={<RouteRun />} />
              <Route path="/driver" element={<DriverView />} />
              <Route path="/accounts-payable" element={
                <PlanGuard feature="accounts_payable">
                  <AccountsPayableDashboard />
                </PlanGuard>
              } />
              <Route path="/accounts-receivable" element={
                <PlanGuard feature="accounts_receivable">
                  <AccountsReceivableDashboard />
                </PlanGuard>
              } />
              <Route path="/tables" element={
                <PlanGuard feature="tables"><TablesDashboard /></PlanGuard>
              } />
              <Route path="/billing" element={
                <PlanGuard feature="restaurant"><BillingDashboard /></PlanGuard>
              } />
              <Route path="/branches"  element={
                <PlanGuard feature="multi_branch"><BranchesAdmin /></PlanGuard>
              } />
              <Route path="/transfers" element={
                <PlanGuard feature="multi_branch_transfers"><TransfersDashboard /></PlanGuard>
              } />

              {/* Owner only */}
              <Route path="/create-owner" element={<CreateOwner />} />
              <Route path="/plans" element={<Plans />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <SyncIndicator />
        <QzReconnectToast />
    </>
    );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
