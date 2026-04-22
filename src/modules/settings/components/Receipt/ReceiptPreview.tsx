'use client';

import React from 'react';
import { Printer } from 'lucide-react';

interface ReceiptConfig {
  paperWidth: number;
  showLogo: boolean;
  logoUrl?: string;
  showStoreName: boolean;
  showStoreAddress: boolean;
  showStorePhone: boolean;
  showCashierName: boolean;
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCustomerInfo: boolean;
  footerMessage: string;
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
}

export const ReceiptPreview: React.FC<Props> = ({ config }) => {
  const getWidth = () => {
    const widths = {
      32: 'w-32',
      40: 'w-40',
      48: 'w-48',
      56: 'w-56',
      80: 'w-80',
    };
    return widths[config.paperWidth as keyof typeof widths] || 'w-80';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Vista Previa</h3>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Printer size={18} />
          Imprimir Prueba
        </button>
      </div>

      {/* Preview Container */}
      <div className="flex justify-center p-8 bg-gray-100 rounded-lg overflow-auto">
        <div
          className={`${getWidth()} bg-white p-4 shadow-lg font-mono text-xs leading-tight`}
          style={{ fontFamily: 'Courier New, monospace' }}
        >
          {/* Logo */}
          {config.showLogo && config.logoUrl && (
            <div className="text-center mb-2">
              <img
                src={config.logoUrl}
                alt="Logo"
                className="h-12 mx-auto"
              />
            </div>
          )}

          {/* Nombre del Negocio */}
          {config.showStoreName && (
            <div className="text-center font-bold mb-1">
              MI RESTAURANTE
            </div>
          )}

          {/* Dirección */}
          {config.showStoreAddress && (
            <div className="text-center text-xs mb-1">
              Calle Principal 123
            </div>
          )}

          {/* Teléfono */}
          {config.showStorePhone && (
            <div className="text-center text-xs mb-2">
              Tel: +506 2234-5678
            </div>
          )}

          <div className="border-b border-gray-300 mb-2" />

          {/* Número de Factura */}
          {config.showInvoiceNumber && (
            <div className="text-center mb-1">
              Factura #INV-001
            </div>
          )}

          {/* Fecha y Hora */}
          {config.showDateTime && (
            <div className="text-center text-xs mb-2">
              18/04/2024 20:45:30
            </div>
          )}

          {/* Información del Cliente */}
          {config.showCustomerInfo && (
            <div className="mb-2">
              <div className="font-bold">CLIENTE:</div>
              <div className="text-xs">Juan Pérez</div>
              <div className="text-xs">Tel: +506 8765-4321</div>
            </div>
          )}

          <div className="border-b border-gray-300 mb-2" />

          {/* Items */}
          <div className="font-bold mb-1">ARTÍCULOS:</div>
          <div className="text-xs mb-2">
            <div className="flex justify-between">
              <span>Arroz con Pollo</span>
              <span>₡5,500</span>
            </div>
            <div className="text-xs text-gray-600">1x ₡5,500</div>
            <div className="flex justify-between mt-1">
              <span>Refresco</span>
              <span>₡1,500</span>
            </div>
            <div className="text-xs text-gray-600">1x ₡1,500</div>
          </div>

          <div className="border-b border-gray-300 mb-2" />

          {/* Totales */}
          <div className="text-xs mb-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₡7,000</span>
            </div>
            <div className="flex justify-between">
              <span>Impuesto (13%):</span>
              <span>₡910</span>
            </div>
          </div>

          <div className="border-b border-gray-300 mb-2" />

          <div className="text-center font-bold text-sm mb-2">
            TOTAL: ₡7,910
          </div>

          {/* Método de Pago */}
          <div className="text-center text-xs mb-2">
            <div className="font-bold">MÉTODO DE PAGO:</div>
            <div>Efectivo</div>
          </div>

          {/* Cajero */}
          {config.showCashierName && (
            <div className="text-center text-xs mb-2">
              Cajero: Carlos López
            </div>
          )}

          <div className="border-b border-gray-300 mb-2" />

          {/* Mensaje de Pie */}
          <div className="text-center font-bold text-xs mb-2">
            {config.footerMessage}
          </div>

          <div className="text-center text-xs text-gray-600">
            Vuelva pronto
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          <strong>💡 Nota:</strong> Esta es una vista previa aproximada. El resultado final dependerá de tu impresora.
        </p>
      </div>
    </div>
  );
};