'use client';

import React, { useState } from 'react';
import {
  Settings,
  Store,
  CreditCard,
  Bell,
  Printer,
  ChevronRight,
  X,
  MonitorSmartphone,
  FileText,
  ShieldCheck,
  Tag,
  Truck,
} from 'lucide-react';
import { GeneralSettings } from '../components/General/GeneralSettings';
import { AccountSettings } from '../components/Account/AccountSettings';
import { PaymentSettings } from '../components/Payments/PaymentSettings';
import { NotificationSettings } from '../components/Notifications/NotificationsSettings';
import { ReceiptSettings } from '../components/Receipt/ReceiptSettings';
import { POSViewSettings } from '../components/POSView/POSViewSettings';
import { ElectronicInvoiceSettings } from '../components/ElectronicInvoice/ElectronicInvoiceSettings';
import { LabelPrinterSettings } from '../components/LabelPrinter/LabelPrinterSettings';
import { DeliverySettings } from '../components/Delivery/DeliverySettings';
import { useAuth } from '@/context/AuthContext';
import { MANAGER_ROLES } from '@/types/Types_Users';

type SettingTab = 'general' | 'products' | 'payments' | 'users' | 'notifications' | 'receipt' | 'pos_view' | 'electronic_invoice' | 'labels' | 'delivery' | 'account';

const SETTINGS_TABS = [
  {
    id: 'general' as SettingTab,
    label: 'General',
    icon: Store,
    description: 'Información del negocio',
  },
  {
    id: 'payments' as SettingTab,
    label: 'Pagos',
    icon: CreditCard,
    description: 'Métodos de pago',
  },
  {
    id: 'receipt' as SettingTab,
    label: 'Factura',
    icon: Printer,
    description: 'Personalización de factura',
  },
  {
    id: 'electronic_invoice' as SettingTab,
    label: 'Facturación Electrónica',
    icon: FileText,
    description: 'Hacienda CR, certificado, ATV',
  },
  {
    id: 'labels' as SettingTab,
    label: 'Etiquetadora',
    icon: Tag,
    description: 'Impresora de etiquetas y calibración',
  },
  {
    id: 'pos_view' as SettingTab,
    label: 'Vista del POS',
    icon: MonitorSmartphone,
    description: 'Táctil o escritorio',
  },
  {
    id: 'delivery' as SettingTab,
    label: 'Delivery',
    icon: Truck,
    description: 'Comisiones de Uber, Didi, etc.',
  },
  {
    id: 'notifications' as SettingTab,
    label: 'Notificaciones',
    icon: Bell,
    description: 'Alertas y notificaciones',
  },
  {
    id: 'account' as SettingTab,
    label: 'Cuenta',
    icon: ShieldCheck,
    description: 'Cambiar contraseña',
  },
];

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingTab>('general');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
const { planFeatures, user } = useAuth();
const isManager = MANAGER_ROLES.includes((user?.role ?? '') as any);

  // Filtrar tabs según si es products_only
  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    // Ocultar notificaciones si es inventory_products_only
    if (planFeatures?.inventory_products_only && tab.id === 'notifications' || tab.id === 'payments') {
      return false;
    }
    // Facturación Electrónica: requiere feature de plan Y rol manager
    // (owner, admin, gerente). Un cajero nunca debería ver la config de FE.
    if (tab.id === 'electronic_invoice') {
      if (!planFeatures?.electronic_invoice) return false;
      if (!isManager) return false;
    }
    // Etiquetadora: solo si el plan tiene el módulo de etiquetas.
    if (tab.id === 'labels' && !planFeatures?.labels) return false;
    // Delivery: solo si el plan tiene la función de delivery.
    if (tab.id === 'delivery' && !(planFeatures as any)?.pos_delivery) return false;
    // Cuenta / cambio de contraseña: solo el propietario.
    if (tab.id === 'account' && user?.role !== 'owner') return false;
    return true;
  });

  // Si el tab activo se oculta, cambiar a 'general'
  React.useEffect(() => {
    if (planFeatures?.inventory_products_only && activeTab === 'notifications' || activeTab === 'payments') {
      setActiveTab('general');
    }
  }, [planFeatures?.inventory_products_only, activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'payments':
        return <PaymentSettings />;
      case 'receipt':
        return <ReceiptSettings />;
      case 'pos_view':
        return <POSViewSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'electronic_invoice':
        return <ElectronicInvoiceSettings />;
      case 'labels':
        return <LabelPrinterSettings />;
      case 'delivery':
        return <DeliverySettings />;
      case 'account':
        return <AccountSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings size={28} className="text-blue-600" />
            <h1 className="text-2xl font-black text-gray-900">Configuración</h1>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition flex items-center gap-3 ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon size={20} />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{tab.label}</p>
                  <p className="text-xs text-gray-500">{tab.description}</p>
                </div>
                {isActive && <ChevronRight size={20} />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="p-2 bg-white rounded-lg border border-gray-200"
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30">
          <div className="bg-white w-64 h-full shadow-lg">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h1 className="text-xl font-black">Configuración</h1>
              <button onClick={() => setShowMobileMenu(false)}>
                <X size={24} />
              </button>
            </div>
            <nav className="p-4 space-y-2">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMobileMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Icon size={20} />
                    <span className="font-semibold">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-8 max-w-4xl">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};