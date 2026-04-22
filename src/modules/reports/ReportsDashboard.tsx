'use client';

import React, { useState } from 'react';
import {
  TrendingUp, BarChart2, ShoppingCart, Package, Users,
  Lock, RefreshCw, ChevronDown,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { BasicSalesReport } from './views/BasicSalesReport';
import { AdvancedSalesReport } from './views/AdvancedSalesReport';
import { PurchasesReport } from './views/PurchasesReport';
import { StockReport } from './views/StockReport';
import { SellerReport } from './views/SellerReport';

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

type TabId = 'basic' | 'advanced' | 'purchases' | 'stock' | 'sellers';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  requiresAdvanced: boolean;
}

const TABS: Tab[] = [
  { id: 'basic',     label: 'Ventas Básicas',   icon: TrendingUp,    requiresAdvanced: false },
  { id: 'advanced',  label: 'Ventas Avanzadas',  icon: BarChart2,     requiresAdvanced: true },
  { id: 'purchases', label: 'Compras',           icon: ShoppingCart,  requiresAdvanced: true },
  { id: 'stock',     label: 'Stock',             icon: Package,       requiresAdvanced: true },
  { id: 'sellers',   label: 'Por Vendedor',      icon: Users,         requiresAdvanced: true },
];

// ── Locked overlay ────────────────────────────────────────────────────────────

function LockedTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
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
  loading?: boolean;
  onRefresh: () => void;
}

function DateRangeBar({
  customFrom,
  customTo,
  activePreset,
  onPreset,
  onCustomFrom,
  onCustomTo,
  onApply,
  onRefresh,
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
        <input
          type="date"
          value={customFrom}
          onChange={(e) => onCustomFrom(e.target.value)}
          className="text-sm bg-transparent outline-none text-gray-600"
        />
        <ChevronDown size={12} className="text-gray-400 -rotate-90" />
        <input
          type="date"
          value={customTo}
          onChange={(e) => onCustomTo(e.target.value)}
          className="text-sm bg-transparent outline-none text-gray-600"
        />
      </div>
      <button
        onClick={onApply}
        className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition"
      >
        Aplicar
      </button>
      <button
        onClick={onRefresh}
        className="p-2 rounded-lg bg-white border border-gray-200 hover:border-emerald-300 text-gray-500 hover:text-emerald-600 transition"
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

const ReportsDashboard: React.FC = () => {
  const { planFeatures } = useAuth();
  const { tenantId } = useTenantId();

  const hasBasic = planFeatures.reports_basic || planFeatures.reports;
  const hasAdvanced = planFeatures.reports;

  const [activeTab, setActiveTab] = useState<TabId>('basic');
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

  const visibleTabs = TABS.filter((t) => !t.requiresAdvanced || hasAdvanced);
  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const isAdvancedTab = currentTab.requiresAdvanced;

  if (!hasAdvanced && currentTab.requiresAdvanced) {
    setActiveTab('basic');
  }

  return (
    <div className="space-y-0 max-w-7xl mx-auto">
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Reportes</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {hasAdvanced ? 'Plan avanzado' : 'Plan básico'} · {range.from} → {range.to}
            </p>
          </div>
          {isAdvancedTab && (
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

        <div className="flex gap-1 mt-4 overflow-x-auto pb-0.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  active
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
          {!hasAdvanced &&
            TABS.filter((t) => t.requiresAdvanced).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  disabled
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 cursor-not-allowed whitespace-nowrap"
                >
                  <Icon size={15} />
                  {tab.label}
                  <Lock size={12} />
                </button>
              );
            })}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'basic' && <BasicSalesReport key={refreshKey} tenantId={tenantId} />}
        {activeTab === 'advanced' &&
          (hasAdvanced ? (
            <AdvancedSalesReport
              key={`adv-${refreshKey}`}
              tenantId={tenantId}
              from={range.from}
              to={range.to}
            />
          ) : (
            <LockedTab />
          ))}
        {activeTab === 'purchases' &&
          (hasAdvanced ? (
            <PurchasesReport
              key={`pur-${refreshKey}`}
              tenantId={tenantId}
              from={range.from}
              to={range.to}
            />
          ) : (
            <LockedTab />
          ))}
        {activeTab === 'stock' &&
          (hasAdvanced ? (
            <StockReport key={`stk-${refreshKey}`} tenantId={tenantId} />
          ) : (
            <LockedTab />
          ))}
        {activeTab === 'sellers' &&
          (hasAdvanced ? (
            <SellerReport
              key={`sel-${refreshKey}`}
              tenantId={tenantId}
              from={range.from}
              to={range.to}
            />
          ) : (
            <LockedTab />
          ))}
      </div>
    </div>
  );
};

export default ReportsDashboard;