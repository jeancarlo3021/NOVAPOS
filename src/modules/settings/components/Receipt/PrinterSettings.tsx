'use client';

import React, { useState, useCallback } from 'react';
import {
  Printer, CheckCircle2, Play,
  PlusCircle, Wifi, WifiOff,
  KeyRound, FileText, Info, ChevronDown,
  RefreshCw, Trash2,
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

      {/* Abrir cajón al cobrar (aplica a QZ Tray y Bluetooth) */}
      {config.printerType !== 'browser' && (
        <label className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer shadow-sm">
          <div>
            <p className="font-semibold text-slate-800 text-sm">Abrir cajón al cobrar</p>
            <p className="text-xs text-slate-400 mt-0.5">Envía el pulso de apertura tras imprimir el ticket de venta</p>
          </div>
          <input type="checkbox"
            checked={config.openDrawer !== false}
            onChange={e => setConfig({ ...config, openDrawer: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>
      )}

      {config.printerType === 'browser' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Al imprimir se abrirá el diálogo del navegador. Funciona con cualquier impresora del equipo.
        </div>
      )}

      {config.printerType === 'bluetooth' && (
        <BluetoothStations config={config} setConfig={setConfig} tenantId={tenantId} />
      )}

      {isQZMode && (
        <>
          {/* ── PrintCenter layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left 2/3 ── */}
            <div className="lg:col-span-2 space-y-5">

              {/* Caja principal */}
              <QzStationGroup
                title="Caja principal" subtitle="Tickets de venta" color="emerald"
                stations={printers.filter(p => p.type === 'receipt' && p.connection !== 'bluetooth')}
                qzPrinters={qzPrinters} testLoading={testLoading}
                onAdd={() => addPrinter('receipt')} onUpdate={updatePrinter}
                onRemove={removePrinter} onTest={handleTestPrint}
              />
              {/* Comanderas */}
              <QzStationGroup
                title="Comanderas" subtitle="Cocina / barra" color="orange"
                stations={printers.filter(p => p.type === 'comanda' && p.connection !== 'bluetooth')}
                qzPrinters={qzPrinters} testLoading={testLoading}
                onAdd={() => addPrinter('comanda')} onUpdate={updatePrinter}
                onRemove={removePrinter} onTest={handleTestPrint}
              />

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

// ── Grupo de estaciones QZ Tray (caja principal / comanderas) ────────────────
function QzStationGroup({ title, subtitle, color, stations, qzPrinters, testLoading, onAdd, onUpdate, onRemove, onTest }: {
  title: string; subtitle: string; color: 'emerald' | 'orange';
  stations: PrinterEntry[]; qzPrinters: string[]; testLoading: string | null;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<PrinterEntry>) => void;
  onRemove: (id: string, label: string) => void;
  onTest: (p: PrinterEntry) => void;
}) {
  const accent = color === 'emerald' ? 'text-emerald-600' : 'text-orange-500';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <button onClick={onAdd} className={`${accent} text-xs font-bold flex items-center gap-1 shrink-0`}>
          <PlusCircle size={15} /> Agregar
        </button>
      </div>
      {stations.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          <Printer size={26} className="mx-auto mb-2 opacity-20" />
          Sin impresoras. Tocá "Agregar".
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {stations.map(printer => (
            <PrinterRow
              key={printer.id}
              printer={printer}
              qzPrinters={qzPrinters}
              onChange={patch => onUpdate(printer.id, patch)}
              onRemove={() => onRemove(printer.id, printer.label)}
              onTest={() => onTest(printer)}
              testLoading={testLoading === printer.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Estaciones Bluetooth (caja principal + comanderas) ───────────────────────
function newBtPrinter(type: 'receipt' | 'comanda'): PrinterEntry {
  return {
    id: `${Date.now()}`, label: '', type, connection: 'bluetooth',
    bt_mode: 'ble', bt_name: '', is_active: true,
  };
}

function BluetoothStations({ config, setConfig, tenantId }: {
  config: ReceiptConfig; setConfig: (c: ReceiptConfig) => void; tenantId: string;
}) {
  const hasBLE = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
  const hasSerial = typeof navigator !== 'undefined' && !!(navigator as any).serial;
  const hasUSB = typeof navigator !== 'undefined' && !!(navigator as any).usb;

  const printers = (config.printers ?? []).filter(p => p.connection === 'bluetooth');
  const receipts = printers.filter(p => p.type === 'receipt');
  const comandas = printers.filter(p => p.type === 'comanda');

  const [reconnecting, setReconnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reconnectMsg, setReconnectMsg] = useState('');

  const reconnectAll = async () => {
    if (printers.length === 0) return;
    setReconnecting(true); setReconnectMsg('');
    try {
      const svc = await import('@/services/pos/bluetoothPrinterService');
      let okCount = 0;
      for (const p of printers) {
        if (svc.btIsConnectedFor(p.id)) { okCount++; continue; }
        try { await svc.btReconnectFor(p.id, p.bt_mode ?? 'ble', p.bt_device_id); okCount++; }
        catch { /* requiere conexión manual */ }
      }
      setRefreshKey(k => k + 1);   // re-monta las filas para reflejar el estado
      setReconnectMsg(`${okCount}/${printers.length} conectadas`);
    } finally { setReconnecting(false); }
  };

  const add = (type: 'receipt' | 'comanda') =>
    setConfig({ ...config, printers: [...(config.printers ?? []), newBtPrinter(type)] });
  const update = (id: string, patch: Partial<PrinterEntry>) =>
    setConfig({ ...config, printers: (config.printers ?? []).map(p => p.id === id ? { ...p, ...patch } : p) });
  const remove = (id: string) =>
    setConfig({ ...config, printers: (config.printers ?? []).filter(p => p.id !== id) });

  if (!hasBLE && !hasSerial && !hasUSB) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Este navegador no soporta Bluetooth, USB ni puerto serie web. Usá <strong>Chrome</strong> o
        <strong> Edge</strong> sobre HTTPS. En iPhone/Safari no está disponible.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra superior: reconectar todas */}
      {printers.length > 0 && (
        <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <p className="text-sm font-bold text-slate-700">{printers.length} impresora{printers.length !== 1 ? 's' : ''} Bluetooth</p>
          <div className="flex items-center gap-2">
            {reconnectMsg && <span className="text-xs text-slate-500">{reconnectMsg}</span>}
            <button onClick={reconnectAll} disabled={reconnecting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
              <RefreshCw size={15} className={reconnecting ? 'animate-spin' : ''} />
              {reconnecting ? 'Reconectando…' : 'Reconectar todas'}
            </button>
          </div>
        </div>
      )}

      {/* Caja principal */}
      <StationGroup
        key={`receipt-${refreshKey}`}
        title="Caja principal" subtitle="Tickets de venta" color="emerald"
        stations={receipts} tenantId={tenantId} onAdd={() => add('receipt')}
        onUpdate={update} onRemove={remove}
      />
      {/* Comanderas */}
      <StationGroup
        key={`comanda-${refreshKey}`}
        title="Comanderas" subtitle="Cocina / barra" color="orange"
        stations={comandas} tenantId={tenantId} onAdd={() => add('comanda')}
        onUpdate={update} onRemove={remove}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-700 space-y-1">
        <p><strong>📱 Celular/tablet:</strong> encendé la impresora → "Conectar BLE" → elegila.</p>
        <p><strong>💻 Computadora:</strong> emparejá la impresora en el sistema (crea un puerto COM) → "Conectar COM". O conectá por cable → "USB".</p>
      </div>
    </div>
  );
}

function StationGroup({ title, subtitle, color, stations, tenantId, onAdd, onUpdate, onRemove }: {
  title: string; subtitle: string; color: 'emerald' | 'orange';
  stations: PrinterEntry[]; tenantId: string;
  onAdd: () => void; onUpdate: (id: string, patch: Partial<PrinterEntry>) => void; onRemove: (id: string) => void;
}) {
  const accent = color === 'emerald' ? 'text-emerald-600' : 'text-orange-500';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <button onClick={onAdd} className={`${accent} text-xs font-bold flex items-center gap-1 shrink-0`}>
          <PlusCircle size={15} /> Agregar
        </button>
      </div>
      {stations.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          <Printer size={26} className="mx-auto mb-2 opacity-20" />
          Sin impresoras. Tocá "Agregar".
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {stations.map(p => (
            <BluetoothStationRow key={p.id} printer={p} tenantId={tenantId}
              onChange={patch => onUpdate(p.id, patch)} onRemove={() => onRemove(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BluetoothStationRow({ printer, tenantId, onChange, onRemove }: {
  printer: PrinterEntry; tenantId: string;
  onChange: (patch: Partial<PrinterEntry>) => void; onRemove: () => void;
}) {
  const [busy, setBusy] = useState<'connect' | 'test' | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  // Reconexión rápida silenciosa al abrir (sin selector), si ya fue autorizada.
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const svc = await import('@/services/pos/bluetoothPrinterService');
        if (svc.btIsConnectedFor(printer.id)) { setConnectedName(svc.btDeviceNameFor(printer.id)); return; }
        const name = await svc.btReconnectFor(printer.id, printer.bt_mode ?? 'ble', printer.bt_device_id);
        if (active) { setConnectedName(name); setMsg('🔁 Reconectada'); }
      } catch { /* requiere conexión manual la primera vez */ }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy('connect'); setMsg('');
    try {
      const svc = await import('@/services/pos/bluetoothPrinterService');
      const mode = printer.bt_mode ?? 'ble';
      // 1) Intentar reconexión rápida (sin selector). 2) Si falla, abrir selector.
      let name: string;
      try {
        name = await svc.btReconnectFor(printer.id, mode, printer.bt_device_id);
      } catch {
        name = await svc.btConnectFor(printer.id, mode);
      }
      setConnectedName(name);
      onChange({ bt_name: name, bt_device_id: svc.btDeviceIdFor(printer.id) ?? printer.bt_device_id });
      setMsg(`✅ ${name}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'No se pudo conectar'}`);
    } finally { setBusy(null); }
  };

  const test = async () => {
    if (!tenantId) return;
    setBusy('test'); setMsg('');
    try {
      await posPrinterService.printTestBluetooth(tenantId, printer.id);
      setMsg('🖨️ Prueba enviada');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'Error al imprimir'}`);
    } finally { setBusy(null); }
  };

  const isConnected = !!connectedName || !!printer.bt_name;

  return (
    <div className="p-3 space-y-2.5">
      {/* Fila 1: nombre + activo + eliminar */}
      <div className="flex items-center gap-2">
        <input
          value={printer.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder={printer.type === 'receipt' ? 'Ej: Caja' : 'Ej: Cocina'}
          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
          <input type="checkbox" checked={printer.is_active}
            onChange={e => onChange({ is_active: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          Activa
        </label>
        <button onClick={onRemove} title="Eliminar"
          className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center shrink-0">
          <Trash2 size={15} />
        </button>
      </div>

      {/* Fila 2: modo + conectar */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={printer.bt_mode ?? 'ble'} onChange={e => onChange({ bt_mode: e.target.value as any })}
          className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="ble">📶 BLE (celular)</option>
          <option value="serial">💻 COM (PC)</option>
          <option value="usb">🔌 USB</option>
        </select>
        <button onClick={connect} disabled={busy === 'connect'}
          className="flex-1 min-w-28 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
          {busy === 'connect' ? 'Buscando…' : isConnected ? 'Reconectar' : 'Conectar'}
        </button>
        <button onClick={test} disabled={busy === 'test' || !isConnected}
          className="px-3 py-2 rounded-lg border-2 border-blue-300 bg-white text-blue-700 text-sm font-bold hover:bg-blue-50 disabled:opacity-40">
          {busy === 'test' ? '…' : 'Prueba'}
        </button>
      </div>

      {/* Estado */}
      <div className="flex items-center justify-between text-[11px]">
        <span className={isConnected ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
          {isConnected ? `● Conectada${connectedName || printer.bt_name ? `: ${connectedName || printer.bt_name}` : ''}` : '○ Sin conectar'}
        </span>
        {msg && <span className="text-slate-500 truncate ml-2">{msg}</span>}
      </div>
    </div>
  );
}

