'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Minus } from 'lucide-react';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { CashSession } from '@/types/Types_POS';
import { Alert, Button, Input, Textarea, Badge, Card, CardContent } from '@/components/ui/uiComponents';

// ✅ DENOMINACIONES DEFINIDAS LOCALMENTE
const COLONES_DENOMINATIONS = [
  { value: 50000, label: '₡50,000', type: 'billete' },
  { value: 20000, label: '₡20,000', type: 'billete' },
  { value: 10000, label: '₡10,000', type: 'billete' },
  { value: 5000, label: '₡5,000', type: 'billete' },
  { value: 2000, label: '₡2,000', type: 'billete' },
  { value: 1000, label: '₡1,000', type: 'billete' },
  { value: 500, label: '₡500', type: 'moneda' },
  { value: 100, label: '₡100', type: 'moneda' },
  { value: 50, label: '₡50', type: 'moneda' },
  { value: 25, label: '₡25', type: 'moneda' },
  { value: 10, label: '₡10', type: 'moneda' },
  { value: 5, label: '₡5', type: 'moneda' },
];

interface CashCloseModalProps {
  session: CashSession;
  onSuccess: (session: CashSession) => void;
  onCancel: () => void;
}

export const CashCloseModal: React.FC<CashCloseModalProps> = ({
  session,
  onSuccess,
  onCancel,
}) => {
  const [denominations, setDenominations] = useState<{ value: number; quantity: number }[]>(
    COLONES_DENOMINATIONS.map(d => ({ value: d.value, quantity: 0 }))
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    loadData();
    console.log('✅ Denominaciones cargadas:', COLONES_DENOMINATIONS.length);
  }, []);

  const loadData = async () => {
    try {
      // Usar datos de la sesión directamente
      // Por ahora, asumimos que no hay ventas registradas
      // En una versión futura, esto vendría de una consulta a la BD
      const totalSales = 0; // Placeholder - obtener de invoices si es necesario
      const expectedClosing = session.opening_amount + totalSales;

      setSummary({
        total_sales: totalSales,
        expected_closing: expectedClosing,
      });
    } catch (err) {
      console.error('Error loading data:', err);
      // Fallback: usar solo el monto de apertura
      setSummary({
        total_sales: 0,
        expected_closing: session.opening_amount,
      });
    }
  };

  const handleQuantityChange = (value: number, quantity: number) => {
    setDenominations(
      denominations.map(d => (d.value === value ? { ...d, quantity: Math.max(0, quantity) } : d))
    );
  };

  const closingAmount = denominations.reduce((sum, d) => sum + d.value * d.quantity, 0);
  const difference = summary ? closingAmount - summary.expected_closing : 0;

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (closingAmount <= 0) {
    setError('Ingresa al menos una denominación');
    return;
  }

  setLoading(true);
  setError('');

  try {
    console.log('🔒 Enviando cierre de caja...');
    console.log('Session ID:', session.id);
    console.log('Closing Amount:', closingAmount);
    console.log('Notes:', notes);

    // ✅ CORRECTO: Pasar un objeto CloseCashSessionInput
    const updatedSession = await cashSessionService.closeCashSession({
      id: session.id,
      closing_amount: closingAmount,
      notes: notes || undefined,
    });

    console.log('✅ Caja cerrada exitosamente:', updatedSession);
    onSuccess(updatedSession);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error al cerrar caja';
    setError(errorMsg);
    console.error('❌ Error closing cash session:', err);
  } finally {
    setLoading(false);
  }
};


  const billetes = denominations.filter(
    d => COLONES_DENOMINATIONS.find(denom => denom.value === d.value)?.type === 'billete'
  );
  const monedas = denominations.filter(
    d => COLONES_DENOMINATIONS.find(denom => denom.value === d.value)?.type === 'moneda'
  );

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-700 p-8 text-white rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-4 rounded-full">
              <DollarSign size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-4xl font-bold">Cierre de Caja</h2>
              <p className="text-red-100 mt-1">Verifica y confirma el cierre</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {error && (
            <Alert
              type="error"
              title="Error"
              message={error}
              onClose={() => setError('')}
            />
          )}

          {/* Resumen */}
          {summary && (
            <Card className="mb-8 border-2 border-gray-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg text-gray-900 mb-4">📊 Resumen del Día</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 font-medium mb-1">Monto Inicial</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ₡{session.opening_amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-gray-600 font-medium mb-1">Total Ventas</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₡{summary.total_sales.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border-2 border-blue-300">
                    <p className="text-sm text-gray-600 font-medium mb-1">Cierre Esperado</p>
                    <p className="text-2xl font-bold text-blue-700">
                      ₡{summary.expected_closing.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Billetes */}
            <div>
              <h3 className="font-bold text-xl text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-3xl">💵</span> Billetes
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {billetes.map(denom => {
                  const label = COLONES_DENOMINATIONS.find(d => d.value === denom.value)?.label;
                  const subtotal = denom.value * denom.quantity;
                  return (
                    <div
                      key={denom.value}
                      className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border-2 border-green-200 hover:border-green-400 transition"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-bold text-lg text-gray-900">{label}</span>
                        <Badge variant="success">₡{subtotal.toLocaleString()}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(denom.value, denom.quantity - 1)
                          }
                          className="px-2"
                        >
                          <Minus size={16} />
                        </Button>
                        <Input
                          type="number"
                          value={denom.quantity}
                          onChange={(e) =>
                            handleQuantityChange(denom.value, parseInt(e.target.value) || 0)
                          }
                          className="flex-1 text-center text-lg font-bold"
                          min="0"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(denom.value, denom.quantity + 1)
                          }
                          className="px-2"
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monedas */}
            <div>
              <h3 className="font-bold text-xl text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-3xl">🪙</span> Monedas
              </h3>
              <div className="grid grid-cols-4 gap-4">
                {monedas.map(denom => {
                  const label = COLONES_DENOMINATIONS.find(d => d.value === denom.value)?.label;
                  const subtotal = denom.value * denom.quantity;
                  return (
                    <div
                      key={denom.value}
                      className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border-2 border-blue-200 hover:border-blue-400 transition"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-gray-900">{label}</span>
                        <Badge variant="info">₡{subtotal}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(denom.value, denom.quantity - 1)
                          }
                          className="px-1"
                        >
                          <Minus size={14} />
                        </Button>
                        <Input
                          type="number"
                          value={denom.quantity}
                          onChange={(e) =>
                            handleQuantityChange(denom.value, parseInt(e.target.value) || 0)
                          }
                          className="flex-1 text-center text-sm font-bold"
                          min="0"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(denom.value, denom.quantity + 1)
                          }
                          className="px-1"
                        >
                          <Plus size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-lg font-bold text-gray-900 mb-3">
                📝 Notas (Opcional)
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Diferencia por, Observaciones..."
                rows={3}
              />
            </div>

            {/* Diferencia */}
            {difference !== 0 && (
              <div
                className={`p-6 rounded-xl font-bold text-lg flex items-center gap-3 border-2 ${
                  difference > 0
                    ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border-green-300'
                    : 'bg-gradient-to-r from-yellow-50 to-yellow-100 text-yellow-800 border-yellow-300'
                }`}
              >
                {difference > 0 ? (
                  <>
                    <span className="text-3xl">✅</span>
                    <span>Sobrante: ₡{difference.toLocaleString()}</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">⚠️</span>
                    <span>Faltante: ₡{Math.abs(difference).toLocaleString()}</span>
                  </>
                )}
              </div>
            )}

            {/* Resumen de cierre */}
            <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 rounded-xl p-8">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold text-gray-900">Total Contado:</span>
                <span className="text-5xl font-bold text-red-600">
                  ₡{closingAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={onCancel}
                disabled={loading}
                className="flex-1"
              >
                ❌ Cancelar
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="lg"
                disabled={loading || closingAmount <= 0}
                loading={loading}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
              >
                🔒 Cerrar Caja
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};