'use client';

import React from 'react';

interface ReceiptConfig {
  paperWidth: 32 | 40 | 48 | 56 | 80;
  showLogo: boolean;
  logoUrl?: string;
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
  setConfig: (config: ReceiptConfig) => void;
}

export const ReceiptFormat: React.FC<Props> = ({ config, setConfig }) => {
  const paperWidths = [
    { value: 32, label: '32 caracteres (58mm)' },
    { value: 40, label: '40 caracteres (80mm)' },
    { value: 48, label: '48 caracteres (80mm)' },
    { value: 56, label: '56 caracteres (80mm)' },
    { value: 80, label: '80 caracteres (A4)' },
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setConfig({
          ...config,
          logoUrl: event.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ancho de Papel */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ancho de Papel</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paperWidths.map(width => (
            <button
              key={width.value}
              onClick={() => setConfig({ ...config, paperWidth: width.value as any })}
              className={`p-4 border-2 rounded-lg text-left transition ${
                config.paperWidth === width.value
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-gray-900">{width.label}</p>
              <p className="text-sm text-gray-500">
                {width.value === 80 ? 'Impresora estándar' : 'Impresora térmica'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Logo</h3>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showLogo}
              onChange={(e) => setConfig({ ...config, showLogo: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300"
            />
            <span className="font-semibold text-gray-900">Mostrar logo</span>
          </label>
        </div>

        {config.showLogo && (
          <div className="mt-4 space-y-3">
            {config.logoUrl && (
              <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                <img
                  src={config.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain p-2"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cargar imagen
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};