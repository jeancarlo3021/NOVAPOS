import { useEffect, useState } from 'react';
import { FileText, User, Search, Receipt, UserCheck, KeyRound } from 'lucide-react';
import { peekNextInvoiceNumber } from '@/services/pos/posOfflineService';
import { POSCustomerSearch } from './POSCustomerSearch';
import type { Customer } from '@/services/customers/customersService';

export type DocumentType = 'ticket' | 'tiquete_electronico' | 'factura_electronica';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ticket:              'Tiquete corriente',
  tiquete_electronico: 'Tiquete electrónico',
  factura_electronica: 'Factura electrónica',
};

interface POSDesktopBarProps {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  invoiceNumberRefreshKey: number; // bump cuando se crea una factura
  showInvoicePreview?: boolean;
  showCustomerField?: boolean;
  /** Cliente formal (de la BD) cuando se seleccionó vía buscador */
  selectedCustomer?: Customer | null;
  onCustomerPick?: (c: Customer | null) => void;
  /** Tipo de documento elegido en la barra */
  documentType?: DocumentType;
  onDocumentTypeChange?: (t: DocumentType) => void;
  /** Cajero activo (kiosk mode) */
  activeCashierName?: string | null;
  onChangeCashier?: () => void;
}

export function POSDesktopBar({
  customerName,
  onCustomerNameChange,
  invoiceNumberRefreshKey,
  showInvoicePreview = true,
  showCustomerField = true,
  selectedCustomer = null,
  onCustomerPick,
  documentType = 'ticket',
  onDocumentTypeChange,
  activeCashierName,
  onChangeCashier,
}: POSDesktopBarProps) {
  const [nextInvoice, setNextInvoice] = useState<string>(() => peekNextInvoiceNumber());
  const [showSearch, setShowSearch] = useState(false);

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
        {selectedCustomer ? (
          <div className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-xs font-bold text-emerald-700 truncate">{selectedCustomer.name}</span>
            {selectedCustomer.identification && (
              <span className="text-[10px] font-mono text-emerald-500">· {selectedCustomer.identification}</span>
            )}
            <button onClick={() => { onCustomerPick?.(null); onCustomerNameChange(''); }}
              className="ml-auto text-xs text-emerald-600 hover:text-emerald-900">×</button>
          </div>
        ) : (
          /* En tablet (táctil) ocultamos el campo de nombre: solo queda "Buscar". */
          <div className="flex-1 flex items-center gap-2 pointer-coarse:hidden">
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
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          title="Buscar cliente registrado"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-emerald-50 text-emerald-600 hover:border-emerald-300 transition"
        >
          <Search size={14} />
          {/* Etiqueta solo en tablet, donde el campo de nombre está oculto */}
          {!selectedCustomer && <span className="hidden pointer-coarse:inline text-xs font-bold">Buscar cliente</span>}
        </button>
        {!selectedCustomer && customerName && (
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

      {/* Cajero activo (kiosk mode) */}
      {onChangeCashier && (
        <button
          type="button"
          onClick={onChangeCashier}
          title="Cambiar cajero (PIN)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition shrink-0 ${
            activeCashierName
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          {activeCashierName ? <UserCheck size={13} /> : <KeyRound size={13} />}
          <span className="max-w-32 truncate">
            {activeCashierName ?? 'Identificate'}
          </span>
        </button>
      )}

      {/* Tipo de documento */}
      {onDocumentTypeChange && (
        <div className="flex items-center gap-2 shrink-0">
          <Receipt size={15} className="text-gray-400" />
          <select
            value={documentType}
            onChange={(e) => {
              const t = e.target.value as DocumentType;
              // Factura Electrónica exige cliente con cédula (receptor de Hacienda).
              if (t === 'factura_electronica' && !selectedCustomer?.identification) {
                alert('Para emitir Factura Electrónica primero seleccioná un cliente con cédula (usá el buscador 🔍).');
                return;
              }
              onDocumentTypeChange(t);
            }}
            className={`px-2 py-1.5 border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
              documentType === 'factura_electronica' ? 'border-blue-300 bg-blue-50 text-blue-700 focus:ring-blue-200' :
              documentType === 'tiquete_electronico' ? 'border-cyan-300 bg-cyan-50 text-cyan-700 focus:ring-cyan-200' :
              'border-gray-200 bg-white text-gray-700 focus:ring-gray-200'
            }`}
          >
            <option value="ticket">Tiquete corriente</option>
            <option value="tiquete_electronico">Tiquete electrónico</option>
            <option value="factura_electronica" disabled={!selectedCustomer?.identification}>
              Factura electrónica{!selectedCustomer?.identification ? ' (requiere cliente)' : ''}
            </option>
          </select>
        </div>
      )}

      {showSearch && (
        <POSCustomerSearch
          selected={selectedCustomer}
          onPick={(c) => {
            onCustomerPick?.(c);
            if (c) onCustomerNameChange(c.name);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

export default POSDesktopBar;
