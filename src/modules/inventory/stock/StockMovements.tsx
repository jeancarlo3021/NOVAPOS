import React, { useMemo, useState } from 'react';
import { RotateCw, Sliders, Search, X, ClipboardCheck } from 'lucide-react';
import { useInventoryProducts } from '@/hooks/useInventoryProducts';
import { useTenantId } from '@/hooks/useTenant';
import { StockAdjustModal } from '../products/StockAdjustModal';
import { PhysicalCountModal } from './PhysicalCountModal';
import {
  Card,
  CardContent,
  Spinner,
  Button,
  Badge,
  Divider
} from '@/components/ui/uiComponents';

export const StockMovements: React.FC = () => {
  const { tenantId } = useTenantId();
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [showPhysicalCount, setShowPhysicalCount] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'critical' | 'ok'>('all');

  const {
    products,
    loading,
    refreshing: _refreshing,
    error,
    refresh: retry,
  } = useInventoryProducts(tenantId);
  void _refreshing;

  // Productos sin control de stock (tracks_stock=false) son "ilimitados":
  // no aparecen en críticos/bajos y nunca cuentan en las alertas.
  const tracksStock = (p: any) => p.tracks_stock !== false;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      const tracks = tracksStock(p);
      const isCritical = tracks && p.stock_quantity === 0;
      const isLow = tracks && !isCritical && p.stock_quantity <= (p.min_stock_level ?? 0);
      const isUnlimited = !tracks;
      const isOk = isUnlimited || (tracks && !isCritical && !isLow);
      if (filter === 'critical' && !isCritical) return false;
      if (filter === 'low' && !isLow) return false;
      if (filter === 'ok' && !isOk) return false;
      if (!q) return true;
      return (
        (p.name?.toLowerCase() ?? '').includes(q) ||
        (p.sku?.toLowerCase() ?? '').includes(q)
      );
    });
  }, [products, search, filter]);

  const counts = useMemo(() => {
    let critical = 0, low = 0, ok = 0;
    products.forEach(p => {
      if (!tracksStock(p)) { ok++; return; } // ilimitado → cuenta como OK
      if (p.stock_quantity === 0) critical++;
      else if (p.stock_quantity <= (p.min_stock_level ?? 0)) low++;
      else ok++;
    });
    return { critical, low, ok, total: products.length };
  }, [products]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Stock de Productos</h2>
          <p className="text-gray-500 mt-1">Revisa el stock actual y realiza ajustes con motivo</p>
        </div>
        <button
          onClick={() => setShowPhysicalCount(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm">
          <ClipboardCheck size={17} /> Toma física
        </button>
      </div>

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-red-800">🚨 {error}</span>
          </div>
          <Button
            onClick={retry}
            size="sm"
            className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
          >
            <RotateCw size={16} />
            Reintentar
          </Button>
        </div>
      )}

      {products.length > 0 && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="text-xl font-bold text-gray-900">Stock Actual de Productos</h3>
            <span className="text-xs text-gray-500 font-semibold">
              {filteredProducts.length} de {counts.total}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div className="relative flex-1 min-w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100 text-gray-400"
                  title="Limpiar"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {([
                ['all',      `Todos (${counts.total})`],
                ['ok',       `Normal (${counts.ok})`],
                ['low',      `Bajo (${counts.low})`],
                ['critical', `Sin stock (${counts.critical})`],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    filter === val ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-500 font-semibold">Sin resultados</p>
              <p className="text-gray-400 text-xs mt-1">Ajusta el buscador o el filtro</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const tracks = tracksStock(product);
              const isLowStock = tracks && product.stock_quantity <= (product.min_stock_level ?? 0);
              const isCritical = tracks && product.stock_quantity === 0;
              const isUnlimited = !tracks;

              return (
                <Card
                  key={product.id}
                  className={`border-2 transition-all hover:shadow-md ${
                    isUnlimited
                      ? 'border-blue-200 bg-blue-50'
                      : isCritical
                      ? 'border-red-300 bg-red-50'
                      : isLowStock
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900">{product.name}</h4>
                        <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                      </div>
                      {isUnlimited && (
                        <Badge variant="info" className="text-xs">
                          ∞ ILIMITADO
                        </Badge>
                      )}
                      {isCritical && (
                        <Badge variant="error" className="text-xs">
                          CRÍTICO
                        </Badge>
                      )}
                      {isLowStock && !isCritical && (
                        <Badge variant="warning" className="text-xs">
                          BAJO
                        </Badge>
                      )}
                    </div>

                    <Divider className="my-3" />

                    {isUnlimited ? (
                      <div className="bg-white/60 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="text-blue-600 text-xl font-black">∞</span>
                        <div>
                          <p className="text-blue-800 font-bold text-xs">Stock ilimitado</p>
                          <p className="text-blue-500 text-[10px]">No descuenta del inventario</p>
                        </div>
                      </div>
                    ) : (
                      <>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Stock Actual:</span>
                        <span
                          className={`text-2xl font-bold ${
                            isCritical
                              ? 'text-red-600'
                              : isLowStock
                              ? 'text-orange-600'
                              : 'text-green-600'
                          }`}
                        >
                          {product.stock_quantity}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Mínimo:</span>
                        <span className="font-semibold text-gray-900">{product.min_stock_level}</span>
                      </div>
                    </div>

                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isCritical
                            ? 'bg-red-500'
                            : isLowStock
                            ? 'bg-orange-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (product.min_stock_level ?? 0) > 0
                              ? (product.stock_quantity / (product.min_stock_level ?? 1)) * 100
                              : 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>

                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setAdjustProductId(product.id)}
                      disabled={isUnlimited}
                      className={`mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition ${
                        isUnlimited
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                      }`}
                      title={isUnlimited ? 'Este producto no maneja stock' : 'Ajustar stock'}
                    >
                      <Sliders size={14} /> {isUnlimited ? 'Sin stock controlado' : 'Ajustar stock'}
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </div>
      )}

      {adjustProductId && (() => {
        const p = products.find(x => x.id === adjustProductId);
        if (!p) return null;
        return (
          <StockAdjustModal
            product={{ id: p.id, name: p.name, sku: p.sku, stock_quantity: p.stock_quantity }}
            onClose={() => setAdjustProductId(null)}
            onSuccess={async () => {
              setAdjustProductId(null);
              await retry();
            }}
          />
        );
      })()}

      {showPhysicalCount && (
        <PhysicalCountModal
          onClose={() => setShowPhysicalCount(false)}
          onApplied={() => { void retry(); }}
        />
      )}
    </div>
  );
};
