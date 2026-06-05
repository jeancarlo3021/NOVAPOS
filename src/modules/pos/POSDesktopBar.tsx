import { useEffect, useState } from 'react';
import { FileText, User } from 'lucide-react';
import { peekNextInvoiceNumber } from '@/services/pos/posOfflineService';

interface POSDesktopBarProps {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  invoiceNumberRefreshKey: number; // bump cuando se crea una factura
  showInvoicePreview?: boolean;
  showCustomerField?: boolean;
}

export function POSDesktopBar({
  customerName,
  onCustomerNameChange,
  invoiceNumberRefreshKey,
  showInvoicePreview = true,
  showCustomerField = true,
}: POSDesktopBarProps) {
  const [nextInvoice, setNextInvoice] = useState<string>(() => peekNextInvoiceNumber());

  // Recalcula el próximo nº cuando se confirma una factura nueva o cuando
  // otro tab abrió/cerró cosas (storage events del contador).
  useEffect(() => {
    setNextInvoice(peekNextInvoiceNumber());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'novapos_offline_invoice_counter') {
        setNextInvoice(peekNextInvoiceNumber());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [invoiceNumberRefreshKey]);

  return (
    <div className="bg-white border-b border-gray-100 px-4 py-2 shrink-0 flex items-center gap-4">
      {/* Nº próxima factura */}
      {showInvoicePreview && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
          <FileText size={15} className="text-blue-500" />
          <div className="leading-tight">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
              Próxima factura
            </p>
            <p className="text-blue-700 font-mono font-black text-sm">#{nextInvoice}</p>
          </div>
        </div>
      )}

      {/* Cliente */}
      {showCustomerField && (
      <div className="flex-1 flex items-center gap-2">
        <User size={15} className="text-gray-400 shrink-0" />
        <label htmlFor="pos-customer" className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">
          Cliente:
        </label>
        <input
          id="pos-customer"
          type="text"
          value={customerName}
          onChange={(e) => onCustomerNameChange(e.target.value)}
          placeholder="Nombre del cliente (opcional)"
          className="flex-1 max-w-md px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          autoComplete="off"
        />
        {customerName && (
          <button
            type="button"
            onClick={() => onCustomerNameChange('')}
            className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition"
          >
            limpiar
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export default POSDesktopBar;
