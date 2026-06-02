'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp, BarChart2, ShoppingCart, Package, Users,
  Lock, RefreshCw, ChevronDown, TrendingDown, Vault, Target, WifiOff, Clock,
  FileText, ChevronRight, ChevronLeft,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { BasicSalesReport } from './views/BasicSalesReport';
import { AdvancedSalesReport } from './views/AdvancedSalesReport';
import { PurchasesReport } from './views/PurchasesReport';
import { StockReport } from './views/StockReport';
import { SellerReport } from './views/SellerReport';
import { ExpensesReport } from './views/ExpensesReport';
import { ProductDetailReport } from './views/ProductDetailReport';
import { CashSessionsReport } from './views/CashSessionsReport';
import { ProfitReport } from './views/ProfitReport';
import { HourlySalesReport } from './views/HourlySalesReport';
import { StockAdjustmentsReport } from './views/StockAdjustmentsReport';

// ── Date helpers ─────────────────────────────────────────────────────────────

function getDateRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId =
  | 'basic' | 'advanced' | 'hourly' | 'purchases' | 'stock' | 'stock_adjustments'
  | 'sellers' | 'expenses' | 'products' | 'cash' | 'profit';

interface Tab {
  id: TabId;
  label: string;
  description?: string;
  icon: React.ElementType;
  featureKey: keyof import('@/context/AuthContext').PlanFeatures;
  group: 'ventas' | 'inventario' | 'finanzas' | 'operacional';
}

const TABS: Tab[] = [
  // Ventas
  { id: 'basic',    label: 'Ventas Básicas',    description: 'Resumen general',          icon: TrendingUp,    featureKey: 'reports_basic',         group: 'ventas' },
  { id: 'advanced', label: 'Ventas Avanzadas',  description: 'Análisis completo',         icon: BarChart2,     featureKey: 'report_advanced_sales', group: 'ventas' },
  { id: 'hourly',   label: 'Ventas por Hora',   description: 'Patrones horarios',         icon: Clock,         featureKey: 'report_hourly_sales',   group: 'ventas' },

  // Inventario
  { id: 'purchases', label: 'Compras',                  description: 'Órdenes y proveedores',           icon: ShoppingCart,  featureKey: 'report_purchases',           group: 'inventario' },
  { id: 'stock',     label: 'Stock',                    description: 'Inventario actual',               icon: Package,       featureKey: 'report_stock',               group: 'inventario' },
  { id: 'stock_adjustments', label: 'Movimientos de Stock', description: 'Ajustes manuales con motivo', icon: Package,       featureKey: 'report_stock_adjustments',   group: 'inventario' },
  { id: 'products',  label: 'Detalle Productos',        description: 'Análisis por producto',           icon: Package,       featureKey: 'report_product_detail',      group: 'inventario' },

  // Finanzas
  { id: 'expenses', label: 'Gastos',            description: 'Egresos del negocio',       icon: TrendingDown,  featureKey: 'report_expenses',     group: 'finanzas' },
  { id: 'profit',   label: 'Ganancias',         description: 'Margen y rentabilidad',     icon: Target,        featureKey: 'report_profit',       group: 'finanzas' },

  // Operacional
  { id: 'sellers',  label: 'Por Vendedor',      description: 'Desempeño del equipo',      icon: Users,         featureKey: 'report_sellers',      group: 'operacional' },
  { id: 'cash',     label: 'Cierres de Caja',   description: 'Cuadres y arqueos',         icon: Vault,         featureKey: 'report_cash_sessions',group: 'operacional' },
];

const GROUP_LABELS: Record<string, string> = {
  ventas: 'Ventas',
  inventario: 'Inventario',
  finanzas: 'Finanzas',
  operacional: 'Operacional',
};

// ── Locked overlay ────────────────────────────────────────────────────────────

function LockedTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
        <Lock size={28} className="text-gray-400" />
      </div>
      <div className="text-center max-w-xs">
        <p className="font-black text-gray-800 text-lg">Módulo bloqueado</p>
        <p className="text-gray-400 text-sm mt-1">Actualiza al plan avanzado para acceder a este reporte.</p>
      </div>
    </div>
  );
}

// ── Date range bar ────────────────────────────────────────────────────────────

interface DateRangeBarProps {
  customFrom: string;
  customTo: string;
  activePreset: number;
  onPreset: (days: 7 | 30 | 90) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  onApply: () => void;
  onRefresh: () => void;
}

function DateRangeBar({
  customFrom, customTo, activePreset,
  onPreset, onCustomFrom, onCustomTo, onApply, onRefresh,
}: DateRangeBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {([7, 30, 90] as const).map((d) => (
        <button
          key={d}
          onClick={() => onPreset(d)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            activePreset === d
              ? 'bg-emerald-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-emerald-300'
          }`}
        >
          {d}d
        </button>
      ))}
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1">
        <input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)}
          className="text-sm bg-transparent outline-none text-gray-600" />
        <ChevronDown size={12} className="text-gray-400 -rotate-90" />
        <input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)}
          className="text-sm bg-transparent outline-none text-gray-600" />
      </div>
      <button onClick={onApply}
        className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition">
        Aplicar
      </button>
      <button onClick={onRefresh}
        className="p-2 rounded-lg bg-white border border-gray-200 hover:border-emerald-300 text-gray-500 hover:text-emerald-600 transition">
        <RefreshCw size={15} />
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

const ReportsDashboard: React.FC = () => {
  const { planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn); };
  }, []);

  const hasAdvanced = planFeatures.reports;
  const hasBasic = planFeatures.reports_basic;

  // Por defecto un reporte está habilitado salvo que el plan lo deshabilite
  // explícitamente (undefined → true para compat con planes antiguos).
  const isTabEnabled = (tab: Tab): boolean => {
    if (tab.id === 'basic') return !!hasBasic;
    if (!hasAdvanced) return false;
    const v = planFeatures[tab.featureKey];
    return v === undefined ? true : !!v;
  };

  const [activeTab, setActiveTab] = useState<TabId>(() => hasAdvanced ? 'advanced' : 'basic');
  const [range, setRange] = useState(() => getDateRange(7));
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [activePreset, setActivePreset] = useState<number>(7);
  const [refreshKey, setRefreshKey] = useState(0);

  const applyPreset = (days: 7 | 30 | 90) => {
    const r = getDateRange(days);
    setRange(r);
    setCustomFrom(r.from);
    setCustomTo(r.to);
    setActivePreset(days);
    setRefreshKey((k) => k + 1);
  };

  const applyCustom = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      setRange({ from: customFrom, to: customTo });
      setActivePreset(0);
      setRefreshKey((k) => k + 1);
    }
  };

  // Cada reporte aparece sólo si el plan lo permite. 'basic' depende de
  // reports_basic; el resto requiere `reports` + su flag específico.
  const visibleTabs = TABS.filter(isTabEnabled);

  const validTab = visibleTabs.find(t => t.id === activeTab) ?? visibleTabs[0];
  const currentTab = validTab ?? TABS[0];
  const isCurrentTabEnabled = visibleTabs.some(t => t.id === currentTab.id);
  const hasDateRange = currentTab.id !== 'basic' && currentTab.id !== 'stock';

  // Agrupar tabs visibles
  const groupedTabs = visibleTabs.reduce((acc, tab) => {
    if (!acc[tab.group]) acc[tab.group] = [];
    acc[tab.group].push(tab);
    return acc;
  }, {} as Record<string, Tab[]>);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">

      {/* ── Sidebar de Reportes ── */}
      <aside className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        {/* Header del sidebar */}
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <FileText size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-black text-gray-900 leading-tight">Reportes</h1>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{hasAdvanced ? 'Plan avanzado' : 'Plan básico'}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition"
            title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navegación agrupada */}
        <nav className="flex-1 overflow-y-auto py-2">
          {Object.entries(groupedTabs).map(([group, tabs]) => (
            <div key={group} className="mb-2">
              {!sidebarCollapsed && (
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {GROUP_LABELS[group]}
                </p>
              )}
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={sidebarCollapsed ? tab.label : ''}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition relative ${
                      active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r" />
                    )}
                    <Icon size={16} className={active ? 'text-emerald-600' : 'text-gray-400'} />
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0 text-left">
                        <p className="leading-tight truncate">{tab.label}</p>
                        {tab.description && (
                          <p className={`text-[10px] font-normal truncate ${active ? 'text-emerald-500' : 'text-gray-400'}`}>
                            {tab.description}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Locked tabs */}
          {visibleTabs.length < TABS.length && (
            <>
              {!sidebarCollapsed && (
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 mt-3">
                  Bloqueados
                </p>
              )}
              {TABS.filter(t => !visibleTabs.some(v => v.id === t.id)).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    disabled
                    title={sidebarCollapsed ? `${tab.label} (bloqueado)` : ''}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-gray-300 cursor-not-allowed ${
                      sidebarCollapsed ? 'justify-center' : ''
                    }`}
                  >
                    <Icon size={16} />
                    {!sidebarCollapsed && (
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="truncate">{tab.label}</span>
                        <Lock size={11} />
                      </div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* Footer del sidebar */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-t border-gray-100 text-[10px] text-gray-400">
            <p className="font-semibold">{range.from} → {range.to}</p>
          </div>
        )}
      </aside>

      {/* ── Contenido principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header del contenido */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <currentTab.icon size={20} className="text-emerald-500" />
              <div>
                <h2 className="text-lg font-black text-gray-900">{currentTab.label}</h2>
                {currentTab.description && (
                  <p className="text-xs text-gray-400">{currentTab.description}</p>
                )}
              </div>
            </div>
            {isCurrentTabEnabled && hasDateRange && (
              <DateRangeBar
                customFrom={customFrom}
                customTo={customTo}
                activePreset={activePreset}
                onPreset={applyPreset}
                onCustomFrom={setCustomFrom}
                onCustomTo={setCustomTo}
                onApply={applyCustom}
                onRefresh={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!isOnline && (
            <div className="mb-4 flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
              <WifiOff size={16} className="shrink-0" />
              <span>Sin conexión — los reportes requieren internet para calcularse en tiempo real.</span>
            </div>
          )}
          {(() => {
            if (!isTabEnabled(currentTab)) return <LockedTab />;
            switch (currentTab.id) {
              case 'basic':             return <BasicSalesReport key={refreshKey} tenantId={tenantId} />;
              case 'advanced':          return <AdvancedSalesReport key={`adv-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'hourly':            return <HourlySalesReport key={`hourly-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'purchases':         return <PurchasesReport key={`pur-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'stock':             return <StockReport key={`stk-${refreshKey}`} tenantId={tenantId} />;
              case 'stock_adjustments': return <StockAdjustmentsReport key={`adj-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'sellers':           return <SellerReport key={`sel-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'expenses':          return <ExpensesReport key={`exp-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'products':          return <ProductDetailReport key={`prd-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'cash':              return <CashSessionsReport key={`cash-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              case 'profit':            return <ProfitReport key={`profit-${refreshKey}`} tenantId={tenantId} from={range.from} to={range.to} />;
              default:                  return null;
            }
          })()}
        </div>
      </div>
    </div>
  );
};

export default ReportsDashboard;
