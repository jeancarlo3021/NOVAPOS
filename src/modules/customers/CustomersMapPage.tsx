import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Loader2, RefreshCw, Crosshair, AlertCircle } from 'lucide-react';
import { customersService, type Customer } from '@/services/customers/customersService';
import { CustomersMapModal } from './CustomersMapModal';

/**
 * Mapa de ubicaciones, como pantalla propia.
 *
 * El mapa ya vivía dentro de Clientes, pero quien sale a la calle no entra a
 * administrar clientes: entra a ver dónde están. Con su propio botón en el menú
 * se llega en un toque.
 */
export const CustomersMapPage: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCustomers(await customersService.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ubicados = customers.filter(c => c.lat != null && c.lng != null).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-sm font-bold text-gray-400">
        <Loader2 size={18} className="animate-spin" /> Cargando ubicaciones…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <Crosshair size={20} className="text-emerald-600" /> Ubicaciones
        </span>
        <span className="text-xs font-bold text-gray-400">
          {ubicados} de {customers.length} cliente(s) ubicados
        </span>
        <div className="flex-1" />
        <button onClick={() => void load()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className="text-gray-500" />
        </button>
        <button onClick={() => navigate('/customers')}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black">
          Ubicar clientes
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* El mapa se muestra como contenido de la página: cerrar vuelve al menú. */}
      <CustomersMapModal
        customers={customers}
        onClose={() => navigate('/')}
        onPick={() => navigate('/customers')}
      />
    </div>
  );
};

export default CustomersMapPage;
