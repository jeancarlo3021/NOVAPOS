'use client';

import React, { useState, useCallback } from 'react';
import {
  Printer, CheckCircle2, Play,
  Settings, PlusCircle, Wifi, WifiOff,
  KeyRound, FileText, Info, ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { posPrinterService } from '@/services/pos/posPrinterService';
import {
  qzIsAvailable, qzConnect, qzGetPrinters, qzIsConnected,
} from '@/services/pos/qzTrayService';
import type { PrinterEntry } from '@/services/pos/qzTrayService';
import { PrinterRow } from './components/PrinterRow';

export type { PrinterEntry };

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReceiptConfig {
  printerType: 'thermal' | 'browser' | 'qztray' | 'bluetooth';
  autoprint: boolean;
  qz_certificate?: string;
  printers?: PrinterEntry[];
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
  setConfig: (config: ReceiptConfig) => void;
}

type QZStatus = 'idle' | 'connecting' | 'connected' | 'error';

const PRIVATE_KEY_LS = 'qz_private_key';

// ── Helpers ───────────────────────────────────────────────────────────────────

function newPrinter(type: 'receipt' | 'comanda'): PrinterEntry {
  return { id: `${Date.now()}`, label: '', type, connection: 'usb', printer_name: '', ip: '', port: 9100, is_active: true };
}

function addLog(prev: string[], msg: string): string[] {
  return [`[${new Date().toLocaleTimeString('es-CR')}] ${msg}`, ...prev].slice(0, 8);
}

// ── Main component ────────────────────────────────────────────────────────────

export const PrinterSettings: React.FC<Props> = ({ config, setConfig }) => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';

  const [qzStatus, setQZStatus]     = useState<QZStatus>(() => qzIsConnected() ? 'connected' : 'idle');
  const [qzPrinters, setQZPrinters] = useState<string[]>([]);
  const [logs, setLogs]             = useState<string[]>(['Esperando acciones...']);

  const [privateKey, setPrivateKey]   = useState(() => localStorage.getItem(PRIVATE_KEY_LS) ?? '');
  const [showPrivKey, setShowPrivKey] = useState(false);
  const [showCertPanel, setShowCertPanel] = useState(false);

  const [testLoading, setTestLoading] = useState<string | null>(null);

  const printers: PrinterEntry[] = config.printers ?? [];

  const log = (msg: string) => setLogs(prev => addLog(prev, msg));

  // ── QZ connection ─────────────────────────────────────────────────────────────

  const handleToggleConnection = useCallback(async () => {
    if (qzStatus === 'connected') {
      setQZStatus('idle');
      setQZPrinters([]);
      log('Desconectado de QZ Tray');
      return;
    }
    if (!qzIsAvailable()) {
      setQZStatus('error');
      log('❌ QZ Tray no está instalado o no está corriendo');
      return;
    }
    setQZStatus('connecting');
    log('Conectando a QZ Tray...');
    try {
      await qzConnect(config.qz_certificate);
      const list = await qzGetPrinters();
      setQZPrinters(list);
      setQZStatus('connected');
      log(`✅ Conectado · ${list.length} impresora${list.length !== 1 ? 's' : ''} detectada${list.length !== 1 ? 's' : ''}`);
    } catch (err) {
      setQZStatus('error');
      log(`❌ ${err instanceof Error ? err.message : 'Error al conectar'}`);
    }
  }, [qzStatus, config.qz_certificate]);

  // ── Printer CRUD ──────────────────────────────────────────────────────────────

  const addPrinter = (type: 'receipt' | 'comanda') => {
    setConfig({ ...config, printers: [...printers, newPrinter(type)] });
    log(`➕ Nueva estación ${type === 'receipt' ? 'de recibo' : 'de comanda'} añadida`);
  };

  const updatePrinter = (id: string, patch: Partial<PrinterEntry>) =>
    setConfig({ ...config, printers: printers.map(p => p.id === id ? { ...p, ...patch } : p) });

  const removePrinter = (id: string, label: string) => {
    setConfig({ ...config, printers: (config.printers ?? []).filter(p => p.id !== id) });
    log(`🗑️ Estación "${label || 'sin nombre'}" eliminada`);
  };

  // ── Test & demo ───────────────────────────────────────────────────────────────

  const handleTestPrint = async (printer: PrinterEntry) => {
    if (!tenantId) return;
    if (qzStatus !== 'connected') { log('⚠️ Conecta QZ Tray primero'); return; }
    setTestLoading(printer.id);
    log(`Enviando prueba a "${printer.label || printer.printer_name || printer.ip}"...`);
    try {
      await posPrinterService.printTest(tenantId);
      log(`✅ Prueba en "${printer.label}" completada`);
    } catch (err) {
      log(`❌ Error: ${err instanceof Error ? err.message : 'Error al imprimir'}`);
    } finally {
      setTestLoading(null);
    }
  };

  const handleSimulateOrder = () => {
    if (qzStatus !== 'connected') { log('⚠️ QZ Tray no está activo'); return; }
    log('🚀 Procesando Pedido de prueba...');
    const receipts = printers.filter(p => p.type === 'receipt' && p.is_active);
    const comandas = printers.filter(p => p.type === 'comanda' && p.is_active);
    setTimeout(() => receipts.forEach(p => log(`📄 Enviando ticket → ${p.label || 'Caja'}`)), 400);
    setTimeout(() => comandas.forEach(p => log(`🍳 Enviando comanda → ${p.label || 'Cocina'}`)), 900);
    setTimeout(() => log('✨ ¡Impresión completada!'), 1500);
  };

  const isQZMode = config.printerType === 'qztray' || config.printerType === 'thermal';

  return (
    <div className="space-y-6">

      {/* ── Tipo ── */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tipo de impresión</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'browser',   label: 'Navegador', icon: '🌐' },
            { id: 'qztray',    label: 'QZ Tray',   icon: '🖨️' },
            { id: 'bluetooth', label: 'Bluetooth', icon: '📶' },
          ].map(t => (
            <button key={t.id}
              onClick={() => setConfig({ ...config, printerType: t.id as any })}
              className={`p-3 border-2 rounded-xl text-left text-sm transition flex items-center gap-2 ${
                config.printerType === t.id || (t.id === 'qztray' && config.printerType === 'thermal')
                  ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-800'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {config.printerType === 'browser' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Al imprimir se abrirá el diálogo del navegador. Funciona con cualquier impresora del equipo.
        </div>
      )}

      {config.printerType === 'bluetooth' && <BluetoothPanel log={log} tenantId={tenantId} />}

      {isQZMode && (
        <>
          {/* ── PrintCenter layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left 2/3 ── */}
            <div className="lg:col-span-2 space-y-5">

              {/* Estaciones card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <Settings size={16} className="text-slate-400" />
                    Estaciones Configuradas
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => addPrinter('receipt')}
                      className="text-emerald-600 hover:text-emerald-700 text-xs font-bold flex items-center gap-1">
                      <PlusCircle size={14} /> Recibo
                    </button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => addPrinter('comanda')}
                      className="text-orange-500 hover:text-orange-600 text-xs font-bold flex items-center gap-1">
                      <PlusCircle size={14} /> Comanda
                    </button>
                  </div>
                </div>

                {printers.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    <Printer size={32} className="mx-auto mb-2 opacity-20" />
                    Sin estaciones configuradas.<br />Añade un recibo o una comanda.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {printers.map(printer => (
                      <PrinterRow
                        key={printer.id}
                        printer={printer}
                        qzPrinters={qzPrinters}
                        onChange={patch => updatePrinter(printer.id, patch)}
                        onRemove={() => removePrinter(printer.id, printer.label)}
                        onTest={() => handleTestPrint(printer)}
                        testLoading={testLoading === printer.id}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Simulate order CTA */}
              <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-lg font-black mb-1">Simular Pedido Completo</h2>
                  <p className="text-indigo-200 text-sm">Envía ticket a caja y comanda a cocina simultáneamente.</p>
                </div>
                <button onClick={handleSimulateOrder}
                  className="relative z-10 bg-white text-indigo-600 px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-indigo-50 active:scale-95 transition shadow-md shrink-0">
                  <Play fill="currentColor" size={16} />
                  SIMULAR PEDIDO
                </button>
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500 rounded-full opacity-40 pointer-events-none" />
              </div>

              {/* Certificate section (collapsible) */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setShowCertPanel(v => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <KeyRound size={15} className="text-amber-500" />
                    Certificado QZ Tray
                  </span>
                  <ChevronDown size={15} className={`text-slate-400 transition-transform ${showCertPanel ? 'rotate-180' : ''}`} />
                </button>

                {showCertPanel && (
                  <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                    <details className="mt-3">
                      <summary className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 cursor-pointer list-none">
                        <Info size={12} /> ¿Cómo generar el certificado?
                      </summary>
                      <div className="mt-2 bg-slate-900 text-green-400 text-xs rounded-xl p-3 font-mono space-y-0.5">
                        <p className="text-slate-500"># Una sola vez en terminal:</p>
                        <p>openssl genrsa -out private-key.pem 2048</p>
                        <p>openssl req -new -x509 -key private-key.pem \</p>
                        <p>&nbsp;&nbsp;-out certificate.pem -days 3650 -subj "/CN=NovaPOS"</p>
                      </div>
                    </details>

                    {/* Private key */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                          <KeyRound size={11} className="text-amber-500" /> Llave Privada
                          <span className="font-normal text-slate-400 ml-1">(solo este equipo)</span>
                        </label>
                        <button onClick={() => setShowPrivKey(v => !v)} className="text-xs text-slate-400 hover:text-slate-600">
                          {showPrivKey ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>
                      <textarea rows={3}
                        value={showPrivKey ? privateKey : (privateKey ? '•'.repeat(40) : '')}
                        onChange={e => { setPrivateKey(e.target.value); localStorage.setItem(PRIVATE_KEY_LS, e.target.value); }}
                        onFocus={() => setShowPrivKey(true)}
                        placeholder={'-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'}
                        className="w-full font-mono text-xs border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-300 resize-none bg-amber-50/40"
                      />
                    </div>

                    {/* Public cert */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1">
                        <FileText size={11} className="text-indigo-500" /> Certificado Público
                      </label>
                      <textarea rows={3}
                        value={config.qz_certificate ?? ''}
                        onChange={e => setConfig({ ...config, qz_certificate: e.target.value })}
                        placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                        className="w-full font-mono text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 resize-none"
                      />
                      <p className="text-xs text-slate-400 mt-1">También se pega en QZ Tray → Certificate.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right 1/3 ── */}
            <div className="space-y-5">

              {/* Connection button */}
              <button
                onClick={handleToggleConnection}
                disabled={qzStatus === 'connecting'}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition shadow-sm border ${
                  qzStatus === 'connected'
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : qzStatus === 'error'
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {qzStatus === 'connecting'
                  ? <><RefreshCw size={17} className="animate-spin" /> Conectando...</>
                  : qzStatus === 'connected'
                  ? <><Wifi size={17} /> Servicio Activo</>
                  : <><WifiOff size={17} /> Conectar QZ Tray</>
                }
              </button>

              {/* Console */}
              <div className="bg-slate-900 rounded-2xl p-5 text-slate-300 shadow-lg">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    qzStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                    qzStatus === 'error'     ? 'bg-red-500' : 'bg-slate-600'
                  }`} />
                  Consola de Impresión
                </h2>
                <div className="space-y-2 font-mono text-xs min-h-30">
                  {logs.map((line, i) => (
                    <div key={i} className={i === 0 ? 'text-indigo-400' : 'text-slate-500'}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hardware status */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-slate-800">
                  <CheckCircle2 size={16} className={qzStatus === 'connected' ? 'text-green-500' : 'text-slate-300'} />
                  Estado del Hardware
                </h3>
                <ul className="space-y-3 text-xs">
                  <li className="flex justify-between">
                    <span className="text-slate-500">QZ Tray</span>
                    <span className={`font-bold ${qzStatus === 'connected' ? 'text-green-600' : 'text-slate-400'}`}>
                      {qzStatus === 'connected' ? 'Activo' : qzStatus === 'error' ? 'Error' : 'Inactivo'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Protocolo</span>
                    <span className="font-semibold text-slate-700">WebSocket</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Impresoras detectadas</span>
                    <span className="font-bold text-slate-700">{qzPrinters.length}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Estaciones configuradas</span>
                    <span className="font-bold text-slate-700">{printers.length}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Certificado</span>
                    <span className={`font-bold ${config.qz_certificate ? 'text-green-600' : 'text-amber-500'}`}>
                      {config.qz_certificate ? 'Cargado' : 'Sin configurar'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Llave privada</span>
                    <span className={`font-bold ${privateKey ? 'text-green-600' : 'text-amber-500'}`}>
                      {privateKey ? 'Guardada' : 'Sin configurar'}
                    </span>
                  </li>
                </ul>

                {qzStatus === 'error' && (
                  <div className="mt-4 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                    <p className="font-semibold mb-1">Para usar impresoras directas:</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      <li>Instala <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">QZ Tray</a></li>
                      <li>Inícialo en el equipo</li>
                      <li>Clic en "Conectar QZ Tray"</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Auto-print toggle */}
              <label className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer shadow-sm">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Impresión Automática</p>
                  <p className="text-xs text-slate-400 mt-0.5">Imprimir al confirmar cada venta</p>
                </div>
                <input type="checkbox"
                  checked={config.autoprint}
                  onChange={e => setConfig({ ...config, autoprint: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

// ── Panel de impresora Bluetooth ─────────────────────────────────────────────
function BluetoothPanel({ log, tenantId }: { log: (m: string) => void; tenantId: string }) {
  const [hasBLE] = useState(() =>
    typeof navigator !== 'undefined' && !!(navigator as any).bluetooth);
  const [hasSerial] = useState(() =>
    typeof navigator !== 'undefined' && !!(navigator as any).serial);
  const [hasUSB] = useState(() =>
    typeof navigator !== 'undefined' && !!(navigator as any).usb);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [busy, setBusy] = useState<'ble' | 'serial' | 'usb' | 'test' | null>(null);

  const connectBLE = async () => {
    setBusy('ble');
    try {
      const { btRequestDevice } = await import('@/services/pos/bluetoothPrinterService');
      const name = await btRequestDevice();
      setDeviceName(name);
      log(`✅ Impresora conectada (Bluetooth BLE): ${name}`);
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : 'No se pudo conectar'}`);
    } finally { setBusy(null); }
  };

  const connectSerial = async () => {
    setBusy('serial');
    try {
      const { serialRequestPort } = await import('@/services/pos/bluetoothPrinterService');
      const name = await serialRequestPort();
      setDeviceName(name);
      log(`✅ Impresora conectada (puerto serie/COM): ${name}`);
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : 'No se pudo conectar al puerto'}`);
    } finally { setBusy(null); }
  };

  const connectUSB = async () => {
    setBusy('usb');
    try {
      const { usbRequestDevice } = await import('@/services/pos/bluetoothPrinterService');
      const name = await usbRequestDevice();
      setDeviceName(name);
      log(`✅ Impresora conectada (USB): ${name}`);
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : 'No se pudo conectar por USB'}`);
    } finally { setBusy(null); }
  };

  const test = async () => {
    if (!tenantId) return;
    setBusy('test');
    try {
      await posPrinterService.printTest(tenantId);
      log('🖨️ Ticket de prueba enviado');
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : 'Error al imprimir'}`);
    } finally { setBusy(null); }
  };

  if (!hasBLE && !hasSerial && !hasUSB) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Este navegador no soporta Bluetooth, USB ni puerto serie web. Usá <strong>Chrome</strong> o
        <strong> Edge</strong> sobre HTTPS. En iPhone/Safari no está disponible.
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-blue-900 text-sm">Impresora Bluetooth</p>
          <p className="text-xs text-blue-600">
            {deviceName ? `Conectada: ${deviceName}` : 'Sin impresora conectada'}
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          deviceName ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {deviceName ? '● Conectada' : '○ Sin conectar'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Móvil / impresoras BLE */}
        {hasBLE && (
          <button onClick={connectBLE} disabled={busy === 'ble'}
            className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
            {busy === 'ble' ? 'Buscando…' : '📶 Conectar (celular/BLE)'}
          </button>
        )}
        {/* Computadora — impresora BT emparejada en el SO (puerto COM) */}
        {hasSerial && (
          <button onClick={connectSerial} disabled={busy === 'serial'}
            className="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
            {busy === 'serial' ? 'Buscando…' : '💻 Conectar (computadora/COM)'}
          </button>
        )}
        {/* Respaldo: USB por cable en computadora */}
        {hasUSB && (
          <button onClick={connectUSB} disabled={busy === 'usb'}
            className="px-3 py-2.5 rounded-xl border-2 border-indigo-300 bg-white text-indigo-700 text-sm font-bold hover:bg-indigo-50 disabled:opacity-50">
            {busy === 'usb' ? 'Buscando…' : '🔌 Conectar por USB'}
          </button>
        )}
        <button onClick={test} disabled={busy === 'test' || !deviceName}
          className="col-span-2 px-3 py-2.5 rounded-xl border-2 border-blue-300 bg-white text-blue-700 text-sm font-bold hover:bg-blue-50 disabled:opacity-50">
          {busy === 'test' ? 'Imprimiendo…' : 'Imprimir prueba'}
        </button>
      </div>

      <div className="text-[11px] text-blue-700 space-y-1">
        <p className="font-bold">📱 En celular/tablet (Android):</p>
        <p className="pl-3">Encendé la impresora → "Conectar (celular/BLE)" → elegila de la lista.</p>
        <p className="font-bold mt-1.5">💻 Bluetooth en computadora (Windows/Mac):</p>
        <p className="pl-3">
          1. Emparejá la impresora Bluetooth desde la configuración del sistema operativo
          (Windows: Configuración → Bluetooth → Agregar dispositivo).<br />
          2. Eso crea un <strong>puerto COM</strong>. Tocá "Conectar (computadora/COM)" y elegí ese puerto
          (probá los COM disponibles si hay varios).
        </p>
      </div>
    </div>
  );
}

