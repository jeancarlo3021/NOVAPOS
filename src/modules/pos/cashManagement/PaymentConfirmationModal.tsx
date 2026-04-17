'use client';

import React, { useState } from 'react';
import { DollarSign, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { CartItem } from '@/types/Types_POS';
import { Alert, Button, Input } from '@/components/ui/uiComponents';

interface PaymentConfirmationModalProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  onConfirm: (paymentData: PaymentData) => void;
  onCancel: () => void;
  loading?: boolean;
}

export interface PaymentData {
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'cash' | 'card' | 'sinpe';
}

export const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  cartItems,
  subtotal,
  taxAmount,
  total,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe'>('cash');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!paymentMethod) {
      setError('Selecciona un método de pago');
      return;
    }

    onConfirm({
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      paymentMethod,
    });
  };

  const paymentMethods = [
    {
      id: 'cash',
      label: 'Efectivo',
      icon: Banknote,
      color: 'from-green-600 to-green-700',
      bgColor: 'from-green-50 to-green-100',
      borderColor: 'border-green-300',
    },
    {
      id: 'card',
      label: 'Tarjeta',
      icon: CreditCard,
      color: 'from-blue-600 to-blue-700',
      bgColor: 'from-blue-50 to-blue-100',
      borderColor: 'border-blue-300',
    },
    {
      id: 'sinpe',
      label: 'SINPE',
      icon: Smartphone,
      color: 'from-purple-600 to-purple-700',
      bgColor: 'from-purple-50 to-purple-100',
      borderColor: 'border-purple-300',
    },
  ];

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-4 rounded-full">
              <DollarSign size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-4xl font-bold">Confirmar Pago</h2>
              <p className="text-blue-100 mt-1">Verifica los detalles antes de procesar</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="pl-8 pr-8 pt-2 pb-4">
          {error && (
            <Alert
              type="error"
              title="Error"
              message={error}
              onClose={() => setError('')}
            />
          )}

          {/* Resumen de Venta */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 mb-6 border-2 border-gray-200">
            <h3 className="font-bold text-lg text-gray-900 mb-2">📊 Resumen de Venta</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Items:</span>
                <span className="font-semibold text-gray-900">{cartItems.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold text-gray-900">₡{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Impuesto (13%):</span>
                <span className="font-semibold text-gray-900">₡{taxAmount.toLocaleString()}</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">Total:</span>
                <span className="text-3xl font-bold text-blue-600">₡{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="mb-8">
            <h3 className="font-bold text-lg text-gray-900 mb-4">👤 Datos del Cliente (Opcional)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Cliente
                </label>
                <Input
                  type="text"
                  placeholder="Ej: Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono (Opcional)
                </label>
                <Input
                  type="tel"
                  placeholder="Ej: 8765-4321"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tipo de Pago */}
          <div className="mb-8">
            <h3 className="font-bold text-lg text-gray-900 mb-4">💳 Tipo de Pago</h3>
            <div className="grid grid-cols-3 gap-4">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = paymentMethod === method.id;

                return (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id as 'cash' | 'card' | 'sinpe')}
                    className={`p-6 rounded-xl border-2 transition-all transform hover:scale-105 ${
                      isSelected
                        ? `bg-gradient-to-br ${method.bgColor} border-2 ${method.borderColor} ring-2 ring-offset-2 ring-${method.id === 'cash' ? 'green' : method.id === 'card' ? 'blue' : 'purple'}-500`
                        : `bg-gray-50 border-gray-200 hover:border-gray-300`
                    }`}
                  >
                    <Icon
                      size={32}
                      className={`mx-auto mb-2 ${
                        isSelected
                          ? method.id === 'cash'
                            ? 'text-green-600'
                            : method.id === 'card'
                            ? 'text-blue-600'
                            : 'text-purple-600'
                          : 'text-gray-400'
                      }`}
                    />
                    <p
                      className={`font-bold text-sm ${
                        isSelected
                          ? method.id === 'cash'
                            ? 'text-green-900'
                            : method.id === 'card'
                            ? 'text-blue-900'
                            : 'text-purple-900'
                          : 'text-gray-600'
                      }`}
                    >
                      {method.label}
                    </p>
                    {isSelected && (
                      <div className="mt-2">
                        <span className="text-xs font-bold text-green-600">✓ Seleccionado</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-4">
            <Button
              variant="secondary"
              size="lg"
              onClick={onCancel}
              disabled={loading}
              className="flex-1"
            >
              ❌ Cancelar
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleConfirm}
              disabled={loading}
              loading={loading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              ✅ Confirmar Pago
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};