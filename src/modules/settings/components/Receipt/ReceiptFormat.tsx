'use client';

import React, { useEffect, useState } from 'react';
import { Upload, Loader, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { storageService } from '@/services/storage/storageService';
import { useAuth } from '@/context/AuthContext';

interface ReceiptConfig {
  paperWidth: 32 | 40 | 48 | 56 | 80 | 'a4';
  showLogo: boolean;
  logoUrl?: string;
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
  setConfig: (config: ReceiptConfig) => void;
}

export const ReceiptFormat: React.FC<Props> = ({ config, setConfig }) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * ¿El logo SE PUEDE imprimir en la impresora térmica?
   *
   * Una térmica no entiende PNG: la imagen hay que convertirla a puntos. Si esa
   * conversión falla —o sale casi sin tinta porque el logo es muy claro— el
   * tiquete salía sin logo y no quedaba rastro de por qué. Acá se prueba la
   * conversión de verdad y se dice el resultado, con las medidas en milímetros
   * que va a ocupar en el papel.
   */
  const [logoInfo, setLogoInfo] = useState<
    { ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    const url = config.logoUrl;
    if (!config.showLogo || !url) { setLogoInfo(null); return; }
    let vivo = true;
    setLogoInfo({ ok: true, texto: 'Probando la conversión para la impresora térmica…' });
    void (async () => {
      try {
        const [{ logoEscPosDetallado }, { anchoEnCaracteres }] = await Promise.all([
          import('@/services/pos/escposImage'),
          import('@/services/pos/posPrinterService'),
        ]);
        const chars = anchoEnCaracteres((config as any).paperWidth);
        const r = await logoEscPosDetallado(String(url), chars);
        if (!vivo) return;
        if (!r.bytes) { setLogoInfo({ ok: false, texto: r.motivo ?? 'No se pudo convertir.' }); return; }
        // 203 dpi = 8 puntos por milímetro.
        const mm = (p?: number) => p ? Math.round(p / 8) : 0;
        const medidas = r.ancho ? ` · ${r.ancho}×${r.alto} puntos (${mm(r.ancho)}×${mm(r.alto)} mm)` : '';
        if ((r.tinta ?? 100) < 1) {
          setLogoInfo({
            ok: false,
            texto: `La imagen se convierte, pero queda casi sin tinta (${r.tinta}%): el papel va a `
              + `salir en blanco. Subí un logo con más contraste (negro sobre blanco funciona mejor).${medidas}`,
          });
          return;
        }
        setLogoInfo({ ok: true, texto: `Listo para la impresora térmica${medidas}.` });
      } catch (e: any) {
        if (vivo) setLogoInfo({ ok: false, texto: e?.message ?? 'No se pudo probar la conversión.' });
      }
    })();
    return () => { vivo = false; };
  }, [config.showLogo, config.logoUrl, (config as any).paperWidth]);

  const paperWidths: { value: 32 | 48 | 'a4'; label: string }[] = [
    { value: 32, label: '58 mm' },
    { value: 48, label: '80 mm' },
    { value: 'a4', label: 'A4 (hoja)' },
  ];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tenantId = user?.tenant_id;
    if (!tenantId) {
      setError('No se pudo identificar el negocio');
      return;
    }

    // También se acepta PDF: es como el diseñador entrega el logo. El sistema
    // toma su primera página y la convierte. El SVG se excluye a propósito: el
    // navegador no lo puede dibujar sin medidas y falla más adelante, con un
    // error que no explica nada.
    const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const esImagen = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
    if (!esPdf && !esImagen) {
      setError('Subí una imagen PNG o JPG, o el PDF del logo.');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      // Borrar logo anterior si existe en Storage
      if (config.logoUrl) {
        const oldPath = storageService.extractPathFromUrl(config.logoUrl, 'logos');
        if (oldPath) {
          await storageService.remove('logos', [oldPath]).catch(() => {});
        }
      }

      const url = await storageService.uploadImage('logos', tenantId, file, 'logo');
      // Agregar timestamp para forzar refresh del cache de imagen
      setConfig({ ...config, logoUrl: `${url}?t=${Date.now()}` });
    } catch (err: any) {
      setError(err.message || 'Error al subir el logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!config.logoUrl) return;
    setError(null);
    try {
      const path = storageService.extractPathFromUrl(config.logoUrl, 'logos');
      if (path) await storageService.remove('logos', [path]);
      setConfig({ ...config, logoUrl: undefined });
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el logo');
    }
  };

  return (
    <div className="space-y-6">
      {/* Ancho de Papel */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ancho de Papel</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {paperWidths.map(width => {
            const current = (config.paperWidth as any) === 'a4' ? 'a4' : (Number(config.paperWidth) <= 32 ? 32 : 48);
            const active = current === width.value;
            return (
            <button
              key={width.value}
              onClick={() => setConfig({ ...config, paperWidth: width.value as any })}
              className={`p-4 border-2 rounded-lg text-left transition ${
                active
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-gray-900">{width.label}</p>
              <p className="text-sm text-gray-500">
                {width.value === 'a4' ? 'Hoja completa (impresora normal)' : width.value === 48 ? 'Impresora térmica 80mm' : 'Impresora térmica 58mm'}
              </p>
            </button>
          );
          })}
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
              <div className="flex items-start gap-3">
                <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img
                    src={config.logoUrl}
                    alt="Logo"
                    className="w-full h-full object-contain p-2"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-lg transition"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                  {logoInfo && (
                    <p className={`flex items-start gap-1.5 text-[11px] font-semibold ${
                      logoInfo.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {logoInfo.ok
                        ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                        : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                      <span>{logoInfo.texto}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {config.logoUrl ? 'Reemplazar imagen' : 'Cargar imagen'}
              </label>
              <div className="flex items-center gap-3">
                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer transition ${
                  uploading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                }`}>
                  {uploading ? (
                    <><Loader size={16} className="animate-spin" /> Subiendo...</>
                  ) : (
                    <><Upload size={16} /> Seleccionar archivo</>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-400">JPG, PNG, WebP o PDF · se ajusta solo</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                ✗ {error}
              </div>
            )}

            <p className="text-xs text-gray-400">
              💡 La imagen se almacena en Supabase Storage y se sirve desde CDN
            </p>
          </div>
        )}
      </div>
    </div>
  );
};