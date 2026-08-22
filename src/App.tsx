import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PlanGuard } from '@/components/PlanGuard';
import { Login } from '@/modules/auth/Login';
import { ResetPassword } from '@/modules/auth/ResetPassword';
import { MainLayout } from '@/components/layout/MainLayout';
import { Dashboard } from '@/modules/dashboard/Dasboard';
import { ReauthBanner } from '@/components/ReauthBanner';
import { QzReconnectToast } from '@/components/QzReconnectToast';
import { BluetoothReconnectButton } from '@/components/BluetoothReconnectButton';
import { ClearCacheShortcut } from '@/components/ClearCacheShortcut';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

// ── Módulos cargados bajo demanda ─────────────────────────────────────────
// Solo el shell (Login, Dashboard, layout) viaja en el bundle inicial; el
// resto se baja cuando el usuario navega a la ruta correspondiente. Esto
// reduce ~70% el JS inicial y acelera el primer render del POS / login.

const POSMain                  = lazy(() => import('./modules/pos/POSMain').then(m => ({ default: m.POSMain })));
const ProformasDashboard       = lazy(() => import('./modules/proformas/ProformasDashboard').then(m => ({ default: m.ProformasDashboard })));
const SettingsPage             = lazy(() => import('./modules/settings/pages/Settingspage').then(m => ({ default: m.SettingsPage })));
const InventoryDashboard       = lazy(() => import('./modules/inventory').then(m => ({ default: m.InventoryDashboard })));
const CategoriesManagement     = lazy(() => import('./modules/inventory/categories/CategoriesManagement').then(m => ({ default: m.CategoriesManagement })));
const UnitTypesManagement      = lazy(() => import('./modules/inventory/categories/UnitTypesManagement').then(m => ({ default: m.UnitTypesManagement })));
const Users                    = lazy(() => import('./modules/users/Users').then(m => ({ default: m.Users })));
const Plans                    = lazy(() => import('./modules/users/Plans'));
const ReportsDashboard         = lazy(() => import('./modules/reports/ReportsDashboard'));
const BranchReportsDashboard   = lazy(() => import('./modules/reports/BranchReportsDashboard').then(m => ({ default: m.BranchReportsDashboard })));
const Recipes                  = lazy(() => import('./modules/recipes/Recipes').then(m => ({ default: m.Recipes })));
const MenuBuilder              = lazy(() => import('./modules/menu/MenuBuilder').then(m => ({ default: m.MenuBuilder })));
const PublicMenu               = lazy(() => import('./modules/menu/PublicMenu').then(m => ({ default: m.PublicMenu })));
const DistributionDashboard    = lazy(() => import('./modules/distribution/DistributionDashboard').then(m => ({ default: m.DistributionDashboard })));
const RouteRun                 = lazy(() => import('./modules/distribution/RouteRun').then(m => ({ default: m.RouteRun })));
const TruckTrackingMap         = lazy(() => import('./modules/distribution/TruckTrackingMap').then(m => ({ default: m.TruckTrackingMap })));
const TrackingSettings         = lazy(() => import('./modules/distribution/TrackingSettings').then(m => ({ default: m.TrackingSettings })));
const DriverView               = lazy(() => import('./modules/distribution/DriverView').then(m => ({ default: m.DriverView })));
const ExpensesDashboard        = lazy(() => import('./modules/expenses/ExpensesDashboard').then(m => ({ default: m.ExpensesDashboard })));
const PurchasesDashboard       = lazy(() => import('./modules/purchases/PurchasesDashboard').then(m => ({ default: m.PurchasesDashboard })));
const HRDashboard              = lazy(() => import('./modules/hr/HRDashboard').then(m => ({ default: m.HRDashboard })));
const AccountsPayableDashboard = lazy(() => import('./modules/accountsPayable/AccountsPayableDashboard').then(m => ({ default: m.AccountsPayableDashboard })));
const AccountsReceivableDashboard = lazy(() => import('./modules/accountsReceivable/AccountsReceivableDashboard').then(m => ({ default: m.AccountsReceivableDashboard })));
const PromotionsDashboard      = lazy(() => import('./modules/promotions/PromotionsDashboard').then(m => ({ default: m.PromotionsDashboard })));
const LabelsDashboard          = lazy(() => import('./modules/labels/LabelsDashboard').then(m => ({ default: m.LabelsDashboard })));
const CreateOwner              = lazy(() => import('./modules/auth/CreateOwner').then(m => ({ default: m.CreateOwner })));
const TablesDashboard          = lazy(() => import('./modules/tables/TablesDashboard').then(m => ({ default: m.TablesDashboard })));
const ModifiersManager         = lazy(() => import('./modules/modifiers/ModifiersManager').then(m => ({ default: m.ModifiersManager })));
const SalesAgentsManager       = lazy(() => import('./modules/agents/SalesAgentsManager').then(m => ({ default: m.SalesAgentsManager })));
const WarrantiesDashboard      = lazy(() => import('./modules/warranties/WarrantiesDashboard').then(m => ({ default: m.WarrantiesDashboard })));
const DeliveryRun              = lazy(() => import('./modules/agents/DeliveryRun').then(m => ({ default: m.DeliveryRun })));
const DeliveryAgenda           = lazy(() => import('./modules/agents/DeliveryAgenda').then(m => ({ default: m.DeliveryAgenda })));
const AgentOrderPOS            = lazy(() => import('./modules/agents/AgentOrderPOS').then(m => ({ default: m.AgentOrderPOS })));
const CashierDesk              = lazy(() => import('./modules/agents/CashierDesk').then(m => ({ default: m.CashierDesk })));
const SalesReturns             = lazy(() => import('./modules/returns/SalesReturns').then(m => ({ default: m.SalesReturns })));
const AccountantPortal         = lazy(() => import('./modules/accountant/AccountantPortal').then(m => ({ default: m.AccountantPortal })));
const BusinessesPanel          = lazy(() => import('./modules/accountant/BusinessesPanel').then(m => ({ default: m.BusinessesPanel })));
const AndroidApp               = lazy(() => import('./modules/android/AndroidApp').then(m => ({ default: m.AndroidApp })));
const SupplierReturns          = lazy(() => import('./modules/returns/SupplierReturns').then(m => ({ default: m.SupplierReturns })));
const BillingDashboard         = lazy(() => import('./modules/billing/BillingDashboard').then(m => ({ default: m.BillingDashboard })));
const BranchesAdmin            = lazy(() => import('./modules/branches/BranchesAdmin').then(m => ({ default: m.BranchesAdmin })));
const TransfersDashboard       = lazy(() => import('./modules/branches/TransfersDashboard').then(m => ({ default: m.TransfersDashboard })));
const CustomersList            = lazy(() => import('./modules/customers/CustomersList').then(m => ({ default: m.CustomersList })));
const InfoDashboard            = lazy(() => import('./modules/info/InfoDashboard').then(m => ({ default: m.InfoDashboard })));
const FeInvoicesDashboard      = lazy(() => import('./modules/hacienda/FeInvoicesDashboard').then(m => ({ default: m.FeInvoicesDashboard })));
const D150Report               = lazy(() => import('./modules/hacienda/D150Report').then(m => ({ default: m.D150Report })));
const FeposMain                = lazy(() => import('./modules/hacienda/FeposMain').then(m => ({ default: m.FeposMain })));
const ReceptionDashboard       = lazy(() => import('./modules/hacienda/ReceptionDashboard').then(m => ({ default: m.ReceptionDashboard })));

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
          {/* Menú digital PÚBLICO: lo abre el cliente escaneando el QR de la
              mesa. Va fuera de ProtectedRoute porque su razón de ser es que no
              haga falta iniciar sesión. */}
          <Route path="/m/:slug" element={<PublicMenu />} />

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
              <Route path="/proformas" element={
                <PlanGuard feature="proformas"><ProformasDashboard /></PlanGuard>
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
              <Route path="/labels" element={
                <PlanGuard feature="labels"><LabelsDashboard /></PlanGuard>
              } />
              <Route path="/users" element={
                <PlanGuard feature="users"><Users /></PlanGuard>
              } />
              {/* Ventanita: ES el POS. Reusa caja, pagos, factura electrónica,
                  impresión y descuentos en vez de reimplementarlos a medias; lo
                  que cambia es «Comer acá / Para llevar», el bipper y la fila de
                  despacho, que POSMain activa al ver esta ruta. */}
              <Route path="/ventanita" element={
                <PlanGuard feature="window_service"><POSMain /></PlanGuard>
              } />
              <Route path="/menu-digital" element={
                <PlanGuard feature="digital_menu"><MenuBuilder /></PlanGuard>
              } />
              <Route path="/recipes" element={
                <PlanGuard feature="recipes"><Recipes /></PlanGuard>
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
              <Route path="/distribution/tracking" element={
                <PlanGuard feature="tracking"><TruckTrackingMap /></PlanGuard>
              } />
              <Route path="/distribution/tracking-settings" element={
                <PlanGuard feature="tracking"><TrackingSettings /></PlanGuard>
              } />
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
              <Route path="/modifiers" element={
                <PlanGuard feature="modifiers"><ModifiersManager /></PlanGuard>
              } />
              <Route path="/accountant" element={<AccountantPortal />} />
              <Route path="/businesses" element={<BusinessesPanel />} />
              <Route path="/android-app" element={<PlanGuard feature="android_app"><AndroidApp /></PlanGuard>} />
              <Route path="/sales-agents" element={
                <PlanGuard feature="sales_agents"><SalesAgentsManager /></PlanGuard>
              } />
              <Route path="/returns" element={
                <PlanGuard feature="returns"><SalesReturns /></PlanGuard>
              } />
              <Route path="/supplier-returns" element={
                <PlanGuard feature="supplier_returns"><SupplierReturns /></PlanGuard>
              } />
              {/* Vistas SEPARADAS por rol: el cajero cobra pero no arma ventas,
                  y el agente arma pedidos pero no ve la caja. */}
              {/* CAJA: bandeja de pedidos + apertura/cierre/movimientos + cobro.
                  NUEVO PEDIDO: el mismo POS de venta, pero envía a caja. */}
              <Route path="/caja" element={
                <PlanGuard feature="cashier_desk"><CashierDesk /></PlanGuard>
              } />
              <Route path="/agent-orders" element={
                <PlanGuard feature="agent_orders"><AgentOrderPOS /></PlanGuard>
              } />
              {/* AGENDA: planificación de entregas por día, con responsable y hora. */}
              <Route path="/agenda-entregas" element={
                <PlanGuard feature="agent_agenda"><DeliveryAgenda /></PlanGuard>
              } />
              {/* RUTA DEL DÍA: lo que le toca entregar a cada responsable. */}
              {/* GARANTÍAS: casos de producto malo, del recibo al cierre. */}
              <Route path="/garantias" element={
                <PlanGuard feature="warranties"><WarrantiesDashboard /></PlanGuard>
              } />
              <Route path="/entregas" element={
                <PlanGuard feature="agent_agenda"><DeliveryRun /></PlanGuard>
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

              <Route path="/info" element={<InfoDashboard />} />
              <Route path="/fe-facturas" element={
                <PlanGuard feature="electronic_invoice"><FeInvoicesDashboard /></PlanGuard>
              } />
              <Route path="/d150" element={<D150Report />} />
              <Route path="/fe-recepcion" element={
                <PlanGuard feature="electronic_invoice"><ReceptionDashboard /></PlanGuard>
              } />
              <Route path="/fe-pos" element={
                <PlanGuard feature="fe_pos"><FeposMain /></PlanGuard>
              } />

              {/* Owner only */}
              <Route path="/create-owner" element={<CreateOwner />} />
              <Route path="/plans" element={<Plans />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ReauthBanner />
        <QzReconnectToast />
        <BluetoothReconnectButton />
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
