import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CashSession, CartItem } from '@/types/Types_POS';

interface POSModalsProps {
  showOpenModal: boolean;
  showCloseModal: boolean;
  showPaymentModal: boolean;
  showReceiptModal: boolean;
  currentSession: CashSession | null;
  user: any;
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  lastInvoice: any;
  paymentData: any;
  onOpenModalClose: () => void;
  onCloseModalClose: () => void;
  onPaymentModalClose: () => void;
  onReceiptModalClose: () => void;
  onOpenCashSuccess: () => void;
  onCloseCashSuccess: () => void;
  onPaymentSuccess: (invoice: any, payment: any) => void;
  onPaymentError: (error: string) => void;
}

export const POSModals: React.FC<POSModalsProps> = ({
  showOpenModal,
  showCloseModal,
  showPaymentModal,
  showReceiptModal,
  total,
  onOpenModalClose,
  onCloseModalClose,
  onPaymentModalClose,
  onReceiptModalClose,
  onOpenCashSuccess,
  onCloseCashSuccess,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');

  const handleOpenCash = async () => {
    if (!openingAmount || parseFloat(openingAmount) <= 0) {
      onPaymentError('Ingresa un monto válido');
      return;
    }
    // TODO: Llamar al service para abrir caja
    onOpenCashSuccess();
  };

  const handleCloseCash = async () => {
    if (!closingAmount || parseFloat(closingAmount) < 0) {
      onPaymentError('Ingresa un monto válido');
      return;
    }
    // TODO: Llamar al service para cerrar caja
    onCloseCashSuccess();
  };

  const handlePayment = async () => {
    if (!amountPaid || parseFloat(amountPaid) < total) {
      onPaymentError('Monto insuficiente');
      return;
    }
    // TODO: Procesar pago
    onPaymentSuccess({ id: '1' }, { method: paymentMethod, amount: amountPaid });
  };

  return (
    <>
      {/* OPEN CASH MODAL */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Abrir Caja</h2>
              <button onClick={onOpenModalClose} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Monto Inicial</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onOpenModalClose}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenCash}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition"
                >
                  Abrir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE CASH MODAL */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Cerrar Caja</h2>
              <button onClick={onCloseModalClose} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Monto Final</label>
                <input
                  type="number"
                  step="0.01"
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onCloseModalClose}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseCash}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Procesar Pago</h2>
              <button onClick={onPaymentModalClose} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800 rounded p-4 mb-4">
                <p className="text-sm text-slate-400">Total a Pagar</p>
                <p className="text-2xl font-bold text-blue-400">${total.toFixed(2)}</p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Método de Pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="check">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Monto Recibido</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onPaymentModalClose}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePayment}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded transition"
                >
                  Pagar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Recibo</h2>
              <button onClick={onReceiptModalClose} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <p>✅ Pago procesado correctamente</p>
              <p>Total: ${total.toFixed(2)}</p>
              <button
                onClick={onReceiptModalClose}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};