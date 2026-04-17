'use client';

import React, { useState } from 'react';
import { CartItem, CashSession } from '@/types/Types_POS';
import { Button } from '@/components/ui/uiComponents';
import { Printer, Download, X } from 'lucide-react';
import { posPrinterService, ReceiptData } from '@/services/pos/posPrinterService';

interface POSReceiptInvoiceProps {
  invoiceNumber: string;
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'sinpe';
  customerName?: string;
  customerPhone?: string;
  cashSession: CashSession;
  onClose: () => void;
}

export const POSReceiptInvoice: React.FC<POSReceiptInvoiceProps> = ({
  invoiceNumber,
  cartItems,
  subtotal,
  taxAmount,
  total,
  paymentMethod,
  customerName,
  customerPhone,
  cashSession,
  onClose,
}) => {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const paymentMethodLabel = {
    cash: '💵 Efectivo',
    card: '💳 Tarjeta',
    sinpe: '📱 SINPE',
  }[paymentMethod];

  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedTime = currentDate.toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Preparar datos para impresión
  const receiptData: ReceiptData = {
    invoiceNumber,
    date: formattedDate,
    time: formattedTime,
    customerName,
    customerPhone,
    items: cartItems.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      subtotal: item.subtotal,
    })),
    subtotal,
    tax: taxAmount,
    total,
    paymentMethod: paymentMethodLabel,
  };

  // Imprimir en impresora POS
  const handlePrintPOS = async () => {
    setPrinting(true);
    setPrintError('');

    try {
      // Intentar con QZ Tray primero (mejor para POS)
      try {
        await posPrinterService.printQZTray(receiptData);
        console.log('Impreso con QZ Tray');
      } catch (qzError) {
        // Si QZ Tray no está disponible, usar impresión del navegador
        console.log('QZ Tray no disponible, usando impresión del navegador');
        await posPrinterService.printBrowser(receiptData);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      setPrintError(errorMsg);
      console.error('Error de impresión:', error);
    } finally {
      setPrinting(false);
    }
  };

  // Imprimir en navegador (fallback)
  const handlePrintBrowser = async () => {
    setPrinting(true);
    setPrintError('');

    try {
      await posPrinterService.printBrowser(receiptData);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      setPrintError(errorMsg);
      console.error('Error de impresión:', error);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 p-6 text-white flex items-center justify-between rounded-t-2xl">
          <h2 className="text-2xl font-bold">✅ Pago Confirmado</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-green-700 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Receipt Content */}
        <div id="receipt-content" className="p-8 bg-white">
          {/* Error Message */}
          {printError && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 text-red-800">
              <p className="font-semibold">Error de impresión:</p>
              <p className="text-sm">{printError}</p>
            </div>
          )}

          {/* Receipt Container - 80mm width (thermal printer standard) */}
          <div className="max-w-sm mx-auto bg-white p-4 border-2 border-gray-300 rounded-lg font-mono text-sm">
            {/* Header */}
            <div className="text-center border-b-2 border-gray-300 pb-4 mb-4">
              <h1 className="text-2xl font-bold">🛒 TICKET DE VENTA</h1>
              <p className="text-xs text-gray-600 mt-1">Factura #{invoiceNumber}</p>
              <p className="text-xs text-gray-600">{formattedDate} {formattedTime}</p>
            </div>

            {/* Cliente */}
            {(customerName || customerPhone) && (
              <div className="border-b-2 border-gray-300 pb-3 mb-3">
                <p className="text-xs font-bold text-gray-700">CLIENTE:</p>
                {customerName && <p className="text-xs">{customerName}</p>}
                {customerPhone && <p className="text-xs">Tel: {customerPhone}</p>}
              </div>
            )}

            {/* Items */}
            <div className="border-b-2 border-gray-300 pb-3 mb-3">
              <div className="text-xs font-bold text-gray-700 mb-2">ARTÍCULOS:</div>
              {cartItems.map((item, index) => (
                <div key={index} className="text-xs mb-2">
                  <div className="flex justify-between">
                    <span className="font-semibold flex-1">{item.product.name}</span>
                    <span className="text-right">₡{item.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="text-gray-600 flex justify-between">
                    <span>{item.quantity}x ₡{item.unit_price.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-b-2 border-gray-300 pb-3 mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span>Subtotal:</span>
                <span>₡{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span>Impuesto (13%):</span>
                <span>₡{taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t pt-2">
                <span>TOTAL:</span>
                <span>₡{total.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="border-b-2 border-gray-300 pb-3 mb-3">
              <div className="text-xs font-bold text-gray-700">MÉTODO DE PAGO:</div>
              <div className="text-xs font-semibold text-green-600">{paymentMethodLabel}</div>
            </div>

            {/* Footer */}
            <div className="text-center">
              <p className="text-xs font-bold text-gray-700 mb-2">¡GRACIAS POR SU COMPRA!</p>
              <p className="text-xs text-gray-600">Ticket #{invoiceNumber}</p>
              <p className="text-xs text-gray-600 mt-1">Caja: {cashSession.id.substring(0, 8)}</p>
              <div className="mt-3 pt-3 border-t-2 border-gray-300">
                <p className="text-xs text-gray-600">Vuelva pronto</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex gap-3 flex-wrap">
          <Button
            variant="primary"
            size="lg"
            onClick={handlePrintPOS}
            disabled={printing}
            loading={printing}
            className="flex-1 flex items-center justify-center gap-2 min-w-40 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
          >
            <Printer size={20} />
            {printing ? 'Imprimiendo...' : 'Imprimir POS'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={handlePrintBrowser}
            disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 min-w-40"
          >
            <Download size={20} />
            Imprimir Navegador
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onClose}
            disabled={printing}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 min-w-40"
          >
            ✅ Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
};