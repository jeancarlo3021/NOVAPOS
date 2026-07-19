import { apiFetch } from '@/lib/api';
import {
  qzConnect, qzIsAvailable, qzPrintToPrinter, qzPrintDefault,
  type PrinterEntry,
} from './qzTrayService';
import { formatComanda, type ComandaItem } from './comandaFormatter';

// ── Encoder CP437 single-byte para impresoras térmicas en modo Latin ───────
// Las impresoras ESC/POS NO entienden UTF-8. Cada caracter latino debe ir
// como UN byte equivalente en CP437. Si va en UTF-8, una "ó" (C3 B3) se
// interpreta como 2 caracteres y, en Xprinter chinas, como 1 ideograma.
const CP437_MAP: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86,
  'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D,
  'Ä': 0x8E, 'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94,
  'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, '¢': 0x9B,
  '£': 0x9C, '¥': 0x9D, 'ƒ': 0x9F, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
  'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, '¬': 0xAA, '½': 0xAB,
  '¼': 0xAC, '¡': 0xAD, '«': 0xAE, '»': 0xAF,
  '°': 0xF8, '·': 0xFA, '²': 0xFD,
  // Sustituciones para caracteres no representables en CP437:
  '₡': 'C'.charCodeAt(0),    // colón → 'C' (el símbolo no está en CP437)
  '€': 'E'.charCodeAt(0),
  'Á': 'A'.charCodeAt(0), 'Í': 'I'.charCodeAt(0), 'Ó': 'O'.charCodeAt(0),
  'Ú': 'U'.charCodeAt(0),
};

function encodeCP437(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Separadores Unicode de miles (narrow nbsp, nbsp, thin space, etc.) que
    // toLocaleString puede usar y NO existen en CP437 -> convertir a '.'
    if (code === 0x00A0 || code === 0x202F || code === 0x2009 ||
        code === 0x2007 || code === 0x2060 || code === 0xFEFF) {
      out.push(0x2E); // '.'
      continue;
    }
    if (code < 0x80) out.push(code);              // ASCII directo
    else if (CP437_MAP[ch] != null) out.push(CP437_MAP[ch]);
    else out.push(0x3F);                          // '?' para caracteres no soportados
  }
  return out;
}

export interface PrinterConfig {
  width?: number;
  name?: string;
  encoding?: string;
}

export interface ReceiptData {
  invoiceNumber: string;
  date: string;
  time: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;   // correo del receptor (al que se envió la factura electrónica)
  bipper?: string;          // bipper/localizador (número o nombre) para llamar al cliente
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  /** Descuento por combos/promos a nivel comprobante (se resta del total). */
  discount?: number;
  /** Etiqueta del descuento (ej. "Combos"). */
  discountLabel?: string;
  /** Ajuste por redondeo a ₡10 (positivo = se sumó, negativo = se restó). */
  rounding?: number;
  paymentMethod: string;
  // Datos del local (negocio)
  storeName?: string;
  storeRuc?: string;          // Cédula jurídica / RUC
  storeCedula?: string;       // Cédula física
  storeAddress?: string;
  storeCity?: string;
  storePhone?: string;
  storeEmail?: string;
  cashierName?: string;
  footerMessage?: string;
  logoUrl?: string;
  /** Si el negocio está en régimen simplificado (Hacienda CR), imprime la
   *  leyenda obligatoria "Autorizado mediante oficio 1197 régimen simplificado"
   *  al pie de cada factura/tiquete. */
  simplificadoFooter?: boolean;
  /** Desglose de pago mixto: si se setea, en el recibo se imprime cada
   *  línea en vez del paymentMethod único. */
  payments?: { method: 'cash' | 'card' | 'sinpe'; amount: number; voucher_number?: string }[];
  /** Etiqueta de copia (ej. "ORIGINAL - CLIENTE" / "COPIA - VENDEDOR"). */
  copyLabel?: string;
  // ── Multimoneda (cobro en dólares) ────────────────────────────────────────
  /** Moneda del pago en efectivo: 'USD' imprime el equivalente en dólares. */
  currency?: 'CRC' | 'USD';
  /** Tipo de cambio ₡ por $1 usado. */
  exchangeRate?: number;
  /** Monto recibido (₡ equivalente). */
  amountReceived?: number;
  /** Vuelto (₡ equivalente). */
  change?: number;
  /** Moneda en que se dio el vuelto. */
  changeCurrency?: 'CRC' | 'USD';
  /** Venta por delivery (informativo — no se contabiliza en caja). */
  isDelivery?: boolean;
  deliveryCommissionPct?: number;
  deliveryNet?: number;
  deliveryPlatform?: string;
  /** Oculta el "Vuelva pronto" (ej. tickets de distribución/repartidor). */
  hideThanks?: boolean;
  /** Comprobante de anulación: imprime SOLO "FACTURA ANULADA" + número + monto. */
  voidNotice?: boolean;
  // ── Factura/Tiquete Electrónico (Hacienda) ────────────────────────────────
  /** Clave numérica de 50 dígitos asignada por Hacienda. */
  feClave?: string;
  /** Consecutivo del comprobante electrónico. */
  feConsecutivo?: string;
  /** Etiqueta del tipo: "FACTURA ELECTRÓNICA" / "TIQUETE ELECTRÓNICO". */
  feTipoLabel?: string;
  /** QR (data URL PNG) con el enlace de consulta del comprobante. */
  feQrDataUrl?: string;
  /** Contenido codificado en el QR (URL de consulta) — para ESC/POS nativo. */
  feQrContent?: string;
}

/** Leyenda obligatoria al pie del comprobante electrónico (resolución DGT 4.4). */
export const FE_RESOLUTION_FOOTER =
  'Autorizada mediante resolución MH-DGT-RES-0027-2024 del 13 de noviembre del 2024 de la DGTD. Version 4.4';

export interface ReceiptConfig {
  paperWidth: 32 | 40 | 48 | 56 | 80 | 'a4';
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
  printerName?: string;
  printerType: 'thermal' | 'browser' | 'qztray' | 'bluetooth';
  autoprint: boolean;
  printers?: PrinterEntry[];
  /** Copias a imprimir por venta (1 o 2). Default 1. */
  printCopies?: number;
  /** Métodos de pago habilitados (cash/card/sinpe/credit/mixed). Default todos. */
  paymentMethods?: string[];
  /** Métodos que imprimen DOBLE factura (ORIGINAL/COPIA). Default ['credit']. */
  doubleInvoiceMethods?: string[];
}

export type { PrinterEntry };

// Paper width in mm for each character-width setting
const PAPER_WIDTH_MM: Record<number, string> = {
  32: '58mm',
  40: '72mm',
  48: '80mm',
  56: '80mm',
  80: '80mm',
};

export class POSPrinterService {
  constructor(_config: PrinterConfig = {}) {}

  private cachedConfig: ReceiptConfig | null = null;
  private cachedConfigTenantId: string | null = null;

  // Campos de IMPRESORA que son LOCALES por dispositivo (no del tenant): cada
  // equipo elige su impresora, conexión, ancho de papel, autoimpresión, etc.
  static LOCAL_PRINTER_FIELDS: (keyof ReceiptConfig)[] = [
    'printers', 'printerType', 'printerName', 'autoprint', 'paperWidth', 'printCopies',
  ];

  private localPrinterKey(tenantId: string) { return `printer_local_${tenantId}`; }

  /** Config de impresora guardada localmente (por dispositivo). */
  getLocalPrinterConfig(tenantId: string): Partial<ReceiptConfig> {
    try { return JSON.parse(localStorage.getItem(this.localPrinterKey(tenantId)) || '{}'); }
    catch { return {}; }
  }

  /** Guarda SOLO los campos de impresora en localStorage (por dispositivo). */
  saveLocalPrinterConfig(tenantId: string, cfg: Partial<ReceiptConfig>) {
    const local: any = {};
    for (const k of POSPrinterService.LOCAL_PRINTER_FIELDS) {
      if (cfg[k] !== undefined) local[k] = cfg[k];
    }
    try { localStorage.setItem(this.localPrinterKey(tenantId), JSON.stringify(local)); } catch {}
    // Invalidar cache en memoria para que la próxima impresión tome lo nuevo.
    this.clearConfigCache();
  }

  /** Sobrepone la config de impresora LOCAL sobre la del tenant. */
  private applyLocalPrinter(cfg: ReceiptConfig, tenantId: string): ReceiptConfig {
    return { ...cfg, ...this.getLocalPrinterConfig(tenantId) };
  }

  /** Devuelve la config SIN los campos de impresora (para guardar en el tenant). */
  withoutLocalPrinter(cfg: ReceiptConfig): ReceiptConfig {
    const copy: any = { ...cfg };
    for (const k of POSPrinterService.LOCAL_PRINTER_FIELDS) delete copy[k];
    return copy;
  }

  async loadReceiptConfig(tenantId: string): Promise<ReceiptConfig> {
    // Cache en memoria — evita API call en cada cobro
    if (this.cachedConfig && this.cachedConfigTenantId === tenantId) {
      return this.cachedConfig;
    }

    // Cache en localStorage como fallback rápido
    try {
      const cached = localStorage.getItem(`receipt_cfg_${tenantId}`);
      if (cached) {
        const parsed = this.applyLocalPrinter(JSON.parse(cached), tenantId);
        this.cachedConfig = parsed;
        this.cachedConfigTenantId = tenantId;
        // Refrescar en background (no bloquear)
        apiFetch<ReceiptConfig>('/settings/receipt')
          .then(config => {
            if (config) {
              const merged = this.applyLocalPrinter({ ...this.getDefaultConfig(), ...config }, tenantId);
              this.cachedConfig = merged;
              localStorage.setItem(`receipt_cfg_${tenantId}`, JSON.stringify({ ...this.getDefaultConfig(), ...config }));
            }
          })
          .catch(() => {});
        return parsed;
      }
    } catch {}

    try {
      const config = await apiFetch<ReceiptConfig>('/settings/receipt');
      const base = config ? { ...this.getDefaultConfig(), ...config } : this.getDefaultConfig();
      const merged = this.applyLocalPrinter(base, tenantId);
      this.cachedConfig = merged;
      this.cachedConfigTenantId = tenantId;
      try { localStorage.setItem(`receipt_cfg_${tenantId}`, JSON.stringify(base)); } catch {}
      return merged;
    } catch {
      return this.applyLocalPrinter(this.getDefaultConfig(), tenantId);
    }
  }

  clearConfigCache() {
    this.cachedConfig = null;
    this.cachedConfigTenantId = null;
  }

  getDefaultConfig(): ReceiptConfig {
    return {
      paperWidth: 80,
      showLogo: false,
      showStoreName: true,
      showStoreAddress: true,
      showStorePhone: true,
      showCashierName: false,
      showInvoiceNumber: true,
      showDateTime: true,
      showCustomerInfo: true,
      footerMessage: '¡GRACIAS POR SU COMPRA!',
      printerType: 'browser',
      autoprint: false,
      printCopies: 1,
      paymentMethods: ['cash', 'card', 'sinpe', 'credit', 'mixed'],
      doubleInvoiceMethods: ['credit'],
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Reconecta en SILENCIO las impresoras Bluetooth ya autorizadas (sin abrir el
   * selector). Útil al entrar al POS / Distribución para que la primera
   * impresión del día sea instantánea, incluso tras el borrado de cache.
   */
  /** Estado de la impresora Bluetooth configurada: si hay una y si está conectada. */
  async bluetoothStatus(tenantId: string): Promise<{ configured: boolean; connected: boolean }> {
    try {
      const cfg = await this.loadReceiptConfig(tenantId);
      const stations = (cfg.printers ?? []).filter((p: any) => p.is_active && p.connection === 'bluetooth');
      // Configurada si hay estaciones BT (aunque printerType se haya perdido).
      if (stations.length === 0 && cfg.printerType !== 'bluetooth') return { configured: false, connected: true };
      if (stations.length === 0) return { configured: false, connected: true };
      const { btIsConnectedFor } = await import('./bluetoothPrinterService');
      const connected = stations.every((st: any) => btIsConnectedFor(st.id));
      return { configured: true, connected };
    } catch { return { configured: false, connected: true }; }
  }

  async reconnectBluetooth(tenantId: string): Promise<void> {
    try {
      const cfg = await this.loadReceiptConfig(tenantId);
      const stations = (cfg.printers ?? []).filter(
        (p: any) => p.is_active && p.connection === 'bluetooth',
      );
      if (stations.length === 0) return;   // no hay impresora BT configurada
      const { btReconnectFor, btIsConnectedFor } = await import('./bluetoothPrinterService');
      for (const st of stations) {
        if (btIsConnectedFor(st.id)) continue;
        try { await btReconnectFor(st.id, (st as any).bt_mode ?? 'ble', (st as any).bt_device_id); }
        catch { /* sin permiso aún: se conectará a mano al imprimir */ }
      }
    } catch { /* config no disponible */ }
  }

  /**
   * Rellena los datos del negocio (nombre, cédula, dirección, etc.) desde
   * la configuración (settings_general) si el ticket no los trae. Así los
   * tickets de distribución/repartidor también muestran los datos del local.
   */
  private async fillStoreInfo(receiptData: ReceiptData, tenantId: string): Promise<void> {
    // ── Con Facturación Electrónica activa, el ticket usa los datos del EMISOR
    //    de FE (nombre, cédula, dirección, teléfono), no los de Settings General.
    let fe: any = null;
    try {
      const cached = localStorage.getItem(`novapos_cache_${tenantId}_settings_electronic-invoice`);
      if (cached) { const p = JSON.parse(cached); fe = p?.data?.config ?? p?.config ?? p?.data ?? p; }
    } catch { /* ignore */ }
    if (!fe) {
      try { const r = await apiFetch<any>('/settings/electronic-invoice').catch(() => null); fe = r?.config ?? r; }
      catch { /* ignore */ }
    }
    const feOn = !!(fe && fe.emisor_name);

    if (feOn) {
      receiptData.storeName = fe.emisor_name;
      receiptData.storeRuc = fe.emisor_identification || undefined;
      receiptData.storeCedula = undefined;
      if (fe.emisor_address) receiptData.storeAddress = fe.emisor_address;
      if (fe.emisor_phone) receiptData.storePhone = fe.emisor_phone;
    } else if (receiptData.storeName || receiptData.storeAddress || receiptData.storeRuc) {
      // Sin FE y el ticket ya trae datos propios (ej. distribución) → no tocar.
      return;
    }

    // Completar lo que falte desde Settings General (ciudad, o todo si no hay FE).
    let general: any = null;
    try {
      const cached = localStorage.getItem(`novapos_cache_${tenantId}_settings_general`);
      if (cached) { const parsed = JSON.parse(cached); general = parsed?.data ?? parsed; }
    } catch { /* ignore */ }
    if (!general) {
      try { const r = await apiFetch<any>('/settings/general').catch(() => null); general = r?.config ?? r; }
      catch { /* ignore */ }
    }
    if (!general) return;
    receiptData.storeName ??= general.businessName;
    receiptData.storeRuc ??= general.ruc;
    receiptData.storeCedula ??= general.cedula;
    receiptData.storeAddress ??= general.address;
    receiptData.storeCity ??= general.city;
    receiptData.storePhone ??= general.phone;
  }

  async printAuto(receiptData: ReceiptData, tenantId: string): Promise<void> {
    // Always reload config so we pick up latest settings changes
    const cfg = await this.loadReceiptConfig(tenantId);
    await this.fillStoreInfo(receiptData, tenantId);

    // Copias configuradas (1 o 2). Los comprobantes que ya traen su propia copia
    // (ej. crédito ORIGINAL/COPIA) no se duplican de nuevo.
    const copies = receiptData.copyLabel ? 1 : Math.max(1, Math.min(2, Number(cfg.printCopies ?? 1)));

    // A4 (hoja): impresora normal → HTML por navegador, no ESC/POS térmico.
    if ((cfg.paperWidth as any) === 'a4') {
      for (let i = 0; i < copies; i++) await this.printBrowser(receiptData, cfg);
      return;
    }

    // El TIPO configurado manda. Si es QZ Tray / térmica, imprimimos por QZ
    // ANTES de mirar Bluetooth — así una cuenta QZ que tenga una estación
    // Bluetooth vieja en la config NO se desvía al flujo Bluetooth (bug: aparecía
    // el mensaje de Bluetooth y no imprimía en cuentas de QZ).
    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      for (let i = 0; i < copies; i++) await this.printQZTray(receiptData, cfg);
      return;
    }

    // Bluetooth: enviar bytes ESC/POS a las estaciones de recibo (caja principal).
    // También entramos por acá si hay estaciones Bluetooth configuradas y el tipo
    // NO es QZ/térmica (evita caer al diálogo de Chrome si se perdió el tipo).
    const btStations = (cfg.printers ?? []).filter(
      (p: any) => p.type === 'receipt' && p.is_active && p.connection === 'bluetooth',
    );
    if (cfg.printerType === 'bluetooth' || btStations.length > 0) {
      const bytes = this.generateESCPOS(receiptData, cfg);
      const { btPrint, btPrintTo, btReconnectFor, btIsConnectedFor } =
        await import('./bluetoothPrinterService');
      const receiptStations = btStations;
      if (receiptStations.length > 0) {
        for (const st of receiptStations) {
          // Reconexión SILENCIOSA (sin selector): el permiso del dispositivo
          // sobrevive aunque se borre el cache de la app; solo se pierde la
          // conexión en memoria al recargar. getDevices() reusa el ya autorizado.
          if (!btIsConnectedFor(st.id)) {
            try { await btReconnectFor(st.id, (st as any).bt_mode ?? 'ble', (st as any).bt_device_id); }
            catch { /* si no se puede en silencio, btPrintTo dará el error y el modal ofrece Conectar */ }
          }
          for (let i = 0; i < copies; i++) await btPrintTo(st.id, bytes);
        }
      } else {
        for (let i = 0; i < copies; i++) await btPrint(bytes);   // modo simple (una sola impresora)
      }
      return;
    }

    for (let i = 0; i < copies; i++) await this.printBrowser(receiptData, cfg);
  }

  async printTest(tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);
    const now = new Date();
    const testData: ReceiptData = {
      invoiceNumber: 'TEST-001',
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items: [
        { name: 'Producto de prueba', quantity: 2, unitPrice: 1500, subtotal: 3000 },
        { name: 'Otro artículo', quantity: 1, unitPrice: 2000, subtotal: 2000 },
      ],
      subtotal: 5000,
      tax: 650,
      total: 5650,
      paymentMethod: 'Efectivo',
      storeName: cfg.showStoreName ? 'MI NEGOCIO' : undefined,
      storeAddress: cfg.showStoreAddress ? 'Calle Principal 123' : undefined,
      storePhone: cfg.showStorePhone ? '2234-5678' : undefined,
      cashierName: cfg.showCashierName ? 'Cajero Prueba' : undefined,
      footerMessage: cfg.footerMessage,
    };

    // Bluetooth: enviar bytes ESC/POS por Web Bluetooth (igual que printAuto).
    if (cfg.printerType === 'bluetooth') {
      const { btPrint } = await import('./bluetoothPrinterService');
      await btPrint(this.generateESCPOS(testData, cfg));
      return;
    }

    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      try {
        await this.printQZTray(testData, cfg);
        return;
      } catch {
        // fall through to browser
      }
    }
    await this.printBrowser(testData, cfg);
  }

  /** Imprime un ticket de prueba SIEMPRE por Bluetooth/Serial/USB, sin importar
   *  el tipo de impresora guardado. Lo usa el botón "Imprimir prueba" del panel
   *  Bluetooth para garantizar que vaya a la impresora conectada y NO al
   *  diálogo del navegador. */
  async printTestBluetooth(tenantId: string, printerId?: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);
    const now = new Date();
    const testData: ReceiptData = {
      invoiceNumber: 'TEST-001',
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items: [
        { name: 'Producto de prueba', quantity: 2, unitPrice: 1500, subtotal: 3000 },
        { name: 'Otro artículo', quantity: 1, unitPrice: 2000, subtotal: 2000 },
      ],
      subtotal: 5000, tax: 650, total: 5650,
      paymentMethod: 'Efectivo',
      storeName: cfg.showStoreName ? 'MI NEGOCIO' : undefined,
      footerMessage: cfg.footerMessage,
    };
    const bytes = this.generateESCPOS(testData, cfg);
    const { btPrint, btPrintTo } = await import('./bluetoothPrinterService');
    if (printerId) await btPrintTo(printerId, bytes);
    else await btPrint(bytes);
  }

  // ─── QZ Tray ─────────────────────────────────────────────────────────────────

  async printQZTray(receiptData: ReceiptData, cfg?: ReceiptConfig): Promise<void> {
    const config = cfg ?? this.getDefaultConfig();
    if (!(await qzIsAvailable())) throw new Error('QZ Tray no está instalado o no está corriendo');

    await qzConnect();

    // ── Modo RAW ESC/POS para Xprinter (Cancela GB18030 + CP437) ──────────
    // Antes mandábamos HTML, que requería que la impresora tuviera un driver
    // que renderice HTML (no aplica a térmicas). Ahora generamos los bytes
    // ESC/POS directos — incluye `FS .` para cancelar modo chino, ESC t 0
    // para CP437, encoder single-byte y corte automático al final.
    const escposBytes = this.generateESCPOS(receiptData, config);
    const receiptPrinters = (config.printers ?? []).filter(
      p => p.type === 'receipt' && p.is_active,
    );

    if (receiptPrinters.length > 0) {
      // Manda bytes raw vía qzPrintToPrinter (usa base64 internamente — el fix
      // del sandbox de antes). Funciona tanto USB como network (TCP:9100).
      for (const printer of receiptPrinters) {
        await qzPrintToPrinter(printer, escposBytes);
      }
    } else {
      // Sin printers configurados en la config del tenant → imprimir RAW a la
      // impresora por defecto del sistema vía QZ (NO abrir el diálogo de Chrome).
      await qzPrintDefault(escposBytes);
    }
  }

  // ─── Cash Close Report print ──────────────────────────────────────────────────

  async printCashClose(report: {
    session_id: string;
    opened_at: string;
    closed_at: string;
    cashier_name?: string;
    opening_amount: number;
    // Ventas registradas por el sistema, por método
    system_cash?: number;
    system_card?: number;
    system_sinpe?: number;
    system_other?: number;
    // Montos contados por el cajero
    cash_total: number;
    card_total: number;
    sinpe_total: number;
    closing_amount: number;
    expected_amount: number;     // efectivo esperado = fondo + ventas efvo + entradas - salidas
    difference: number;          // efectivo contado - esperado (faltante/sobrante)
    invoices_count: number;
    invoices_total: number;
    voids_count?: number;
    voids_total?: number;
    // Delivery: NO cuenta en el cierre; se muestra aparte.
    delivery_count?: number;
    delivery_total?: number;
    delivery_net?: number;
    cash_movements?: Array<{ type: 'in' | 'out'; amount: number; reason: string }>;
    // Dólares en efectivo: apertura + recibidos − vuelto = esperado, vs contado.
    opening_usd?: number;
    usd_received?: number;
    usd_change_out?: number;
    expected_usd?: number;
    closing_usd?: number;
  }, tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);

    // Datos del local desde cache
    let general: any = null;
    try {
      const cached = localStorage.getItem(`novapos_cache_${tenantId}_settings_general`);
      if (cached) {
        const parsed = JSON.parse(cached);
        general = parsed?.data ?? parsed;
      }
    } catch {}

    // A4 → documento de página entera (tipo PDF).
    if ((cfg.paperWidth as any) === 'a4') {
      const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
      const dt = (s: string) => { try { return new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };
      const diffLabel = report.difference === 0 ? 'CUADRADO' : report.difference > 0 ? 'SOBRANTE' : 'FALTANTE';
      // Diferencia venta vs sistema por método (Contado - Sistema).
      const a4CashIn = (report.cash_movements ?? []).filter((m: any) => m.type === 'in').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
      const a4CashOut = (report.cash_movements ?? []).filter((m: any) => m.type === 'out').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
      const a4ExpCash = Number(report.opening_amount ?? 0) + Number(report.system_cash ?? 0) + a4CashIn - a4CashOut;
      const a4dCash = Number(report.cash_total ?? 0) - a4ExpCash;
      const a4dCard = Number(report.card_total ?? 0) - Number(report.system_card ?? 0);
      const a4dSinpe = Number(report.sinpe_total ?? 0) - Number(report.system_sinpe ?? 0);
      const sMoney = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${money(Math.abs(n))}`;
      const lines: Array<{ t: string; a?: string; b?: string }> = [
        { t: 'title', a: 'CIERRE DE CAJA' },
        ...(general?.businessName ? [{ t: 'center' as const, a: general.businessName }] : []),
        ...(report.cashier_name ? [{ t: 'center' as const, a: `Cajero: ${report.cashier_name}` }] : []),
        { t: 'center', a: `Abrió ${dt(report.opened_at)} · Cerró ${dt(report.closed_at)}` },
        { t: 'sep' }, { t: 'title', a: 'VENTAS (SISTEMA)' },
        { t: 'row', a: 'Efectivo', b: money(report.system_cash ?? 0) },
        { t: 'row', a: 'Tarjeta', b: money(report.system_card ?? 0) },
        { t: 'row', a: 'SINPE', b: money(report.system_sinpe ?? 0) },
        { t: 'row', a: 'Otros', b: money(report.system_other ?? 0) },
        { t: 'row', a: 'Facturas', b: `${report.invoices_count} · ${money(report.invoices_total)}` },
        ...(((report.voids_count ?? 0) > 0) ? [
          { t: 'row' as const, a: 'Anulaciones', b: `${report.voids_count} · ${money(report.voids_total ?? 0)}` },
        ] : []),
        ...(((report.delivery_count ?? 0) > 0) ? [
          { t: 'sep' as const }, { t: 'title' as const, a: 'DELIVERY (aparte, no en caja)' },
          { t: 'row' as const, a: 'Ventas delivery', b: `${report.delivery_count} · ${money(report.delivery_total ?? 0)}` },
          { t: 'row' as const, a: 'Neto delivery', b: money(report.delivery_net ?? 0) },
        ] : []),
        { t: 'sep' }, { t: 'title', a: 'ARQUEO DE EFECTIVO' },
        { t: 'row', a: 'Fondo inicial', b: money(report.opening_amount) },
        { t: 'row', a: 'Efectivo esperado', b: money(report.expected_amount) },
        { t: 'row', a: 'Efectivo contado', b: money(report.closing_amount) },
        { t: 'row', a: `Diferencia (${diffLabel})`, b: money(report.difference) },
        { t: 'row', a: 'Tarjeta contada', b: money(report.card_total) },
        { t: 'row', a: 'SINPE contado', b: money(report.sinpe_total) },
        ...(((report.opening_usd ?? 0) > 0 || (report.closing_usd ?? 0) > 0 || (report.usd_received ?? 0) > 0) ? [
          { t: 'sep' as const }, { t: 'title' as const, a: 'DÓLARES EN EFECTIVO' },
          { t: 'row' as const, a: 'Apertura', b: `$${Number(report.opening_usd ?? 0).toFixed(2)}` },
          { t: 'row' as const, a: 'Recibido en ventas', b: `$${Number(report.usd_received ?? 0).toFixed(2)}` },
          { t: 'row' as const, a: 'Vuelto en $', b: `$${Number(report.usd_change_out ?? 0).toFixed(2)}` },
          { t: 'row' as const, a: 'Esperado', b: `$${Number(report.expected_usd ?? 0).toFixed(2)}` },
          { t: 'row' as const, a: 'Contado', b: `$${Number(report.closing_usd ?? 0).toFixed(2)}` },
          { t: 'row' as const, a: 'Diferencia', b: `$${(Number(report.closing_usd ?? 0) - Number(report.expected_usd ?? 0)).toFixed(2)}` },
        ] : []),
        { t: 'sep' }, { t: 'title', a: 'DIFERENCIA VENTA vs SISTEMA' },
        { t: 'row', a: 'Efectivo', b: sMoney(a4dCash) },
        { t: 'row', a: 'Tarjeta', b: sMoney(a4dCard) },
        { t: 'row', a: 'SINPE', b: sMoney(a4dSinpe) },
      ];
      if ((report.cash_movements ?? []).length > 0) {
        lines.push({ t: 'sep' }, { t: 'title', a: 'MOVIMIENTOS DE CAJA' });
        for (const m of report.cash_movements!) lines.push({ t: 'row', a: `${m.type === 'in' ? '↓ Entrada' : '↑ Salida'} · ${m.reason || '-'}`, b: money(m.amount) });
      }
      await this.printHTMLContent(this.renderA4FromLines(lines));
      return;
    }

    // Mismo ruteo que el cobro (printAuto): Bluetooth / QZ raw / navegador.
    if (cfg.printerType === 'bluetooth') {
      try {
        const { btPrint } = await import('./bluetoothPrinterService');
        await btPrint(this.generateCashCloseESCPOS(report, cfg, general));
        return;
      } catch (err) {
        console.warn('[print] Bluetooth cierre falló, usando navegador:', err);
      }
    }

    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      const escposBytes = this.generateCashCloseESCPOS(report, cfg, general);
      if (!(await qzIsAvailable())) throw new Error('QZ Tray no está instalado o no está corriendo');
      await qzConnect();
      const receiptPrinters = (cfg.printers ?? []).filter(p => p.type === 'receipt' && p.is_active);
      if (receiptPrinters.length > 0) {
        for (const printer of receiptPrinters) await qzPrintToPrinter(printer, escposBytes);
      } else {
        await qzPrintDefault(escposBytes);
      }
      return;
    }

    // Navegador: HTML como respaldo.
    await this.printHTMLContent(this.generateCashCloseHTML(report, cfg, general));
  }

  // ─── Cierre de RUTA (Distribución): ventas por método + sobrante de inventario ──
  async printRouteClose(summary: {
    truck?: string; route_date?: string;
    sales_count: number; sales_total: number; voids_count: number;
    by_method?: { cash: number; card: number; sinpe: number; credit: number };
    returned?: Array<{ name: string; quantity: number }>;
    ar_payments?: { by_method: { cash: number; card: number; sinpe: number }; total: number; list: Array<{ customer: string; amount: number; method: string }> };
    expenses?: { total: number; list: Array<{ description: string; amount: number; payment_method?: string }> };
  }, tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);

    // A4 → documento de página entera (tipo PDF).
    if ((cfg.paperWidth as any) === 'a4') {
      const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
      const bm = summary.by_method ?? { cash: 0, card: 0, sinpe: 0, credit: 0 };
      const lines: Array<{ t: string; a?: string; b?: string }> = [
        { t: 'title', a: 'CIERRE DE RUTA' },
        ...(summary.truck ? [{ t: 'center' as const, a: summary.truck }] : []),
        { t: 'center', a: `${summary.route_date ?? ''} · ${new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` },
        { t: 'sep' },
        { t: 'row', a: 'Ventas', b: String(summary.sales_count ?? 0) },
        { t: 'row', a: 'Total vendido', b: money(summary.sales_total) },
        { t: 'row', a: 'Anulaciones', b: String(summary.voids_count ?? 0) },
        { t: 'sep' },
        { t: 'row', a: 'Efectivo', b: money(bm.cash) },
        { t: 'row', a: 'Tarjeta', b: money(bm.card) },
        { t: 'row', a: 'SINPE', b: money(bm.sinpe) },
        { t: 'row', a: 'Crédito', b: money(bm.credit) },
      ];
      if (summary.ar_payments && summary.ar_payments.total > 0) {
        lines.push({ t: 'sep' }, { t: 'title', a: 'ABONOS CxC' });
        lines.push({ t: 'row', a: 'Efectivo', b: money(summary.ar_payments.by_method.cash) });
        lines.push({ t: 'row', a: 'Tarjeta', b: money(summary.ar_payments.by_method.card) });
        lines.push({ t: 'row', a: 'SINPE', b: money(summary.ar_payments.by_method.sinpe) });
        for (const a of summary.ar_payments.list) lines.push({ t: 'row', a: `${a.customer} · ${a.method}`, b: money(a.amount) });
        lines.push({ t: 'row', a: 'Total abonos', b: money(summary.ar_payments.total) });
      }
      if (summary.expenses && summary.expenses.total > 0) {
        lines.push({ t: 'sep' }, { t: 'title', a: 'GASTOS DEL DÍA' });
        for (const g of summary.expenses.list) lines.push({ t: 'row', a: g.description, b: money(g.amount) });
        lines.push({ t: 'row', a: 'Total gastos', b: money(summary.expenses.total) });
      }
      lines.push({ t: 'sep' }, { t: 'title', a: 'INVENTARIO DEVUELTO' });
      const ret = [...(summary.returned ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
      if (ret.length === 0) lines.push({ t: 'center', a: '(sin sobrante)' });
      else for (const r of ret) lines.push({ t: 'row', a: r.name, b: `x${r.quantity}` });
      await this.printHTMLContent(this.renderA4FromLines(lines));
      return;
    }

    const bytes = this.generateRouteCloseESCPOS(summary, cfg);

    if (cfg.printerType === 'bluetooth') {
      // Igual que printAuto: reconectar en silencio y mandar a cada estación de
      // recibo configurada (no al modo simple, que fallaba en rutas seguidas).
      const { btPrint, btPrintTo, btReconnectFor, btIsConnectedFor } =
        await import('./bluetoothPrinterService');
      const receiptStations = (cfg.printers ?? []).filter(
        (p: any) => p.type === 'receipt' && p.is_active && p.connection === 'bluetooth',
      );
      if (receiptStations.length > 0) {
        for (const st of receiptStations) {
          if (!btIsConnectedFor(st.id)) {
            try { await btReconnectFor(st.id, (st as any).bt_mode ?? 'ble', (st as any).bt_device_id); }
            catch { /* btPrintTo dará el error y el modal ofrece Conectar */ }
          }
          await btPrintTo(st.id, bytes);
        }
      } else {
        await btPrint(bytes);   // modo simple (una sola impresora)
      }
      return;
    }
    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      if (!(await qzIsAvailable())) throw new Error('QZ Tray no está instalado o no está corriendo');
      await qzConnect();
      const receiptPrinters = (cfg.printers ?? []).filter(p => p.type === 'receipt' && p.is_active);
      if (receiptPrinters.length > 0) { for (const printer of receiptPrinters) await qzPrintToPrinter(printer, bytes); }
      else await qzPrintDefault(bytes);
      return;
    }
    // Navegador: imprime el raw a la default igual.
    await qzPrintDefault(bytes).catch(() => { throw new Error('Configurá una impresora para el cierre'); });
  }

  /** Envía bytes ESC/POS a las estaciones configuradas (BT / QZ / default). */
  private async sendBytes(bytes: Uint8Array, cfg: ReceiptConfig): Promise<void> {
    const btStations = (cfg.printers ?? []).filter(
      (p: any) => p.type === 'receipt' && p.is_active && p.connection === 'bluetooth',
    );
    if (cfg.printerType === 'bluetooth') {
      const { btPrint, btPrintTo, btReconnectFor, btIsConnectedFor } = await import('./bluetoothPrinterService');
      if (btStations.length > 0) {
        for (const st of btStations) {
          if (!btIsConnectedFor(st.id)) {
            try { await btReconnectFor(st.id, (st as any).bt_mode ?? 'ble', (st as any).bt_device_id); } catch { /* el print dará el error */ }
          }
          await btPrintTo(st.id, bytes);
        }
      } else { await btPrint(bytes); }
      return;
    }
    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      if (!(await qzIsAvailable())) throw new Error('QZ Tray no está instalado o no está corriendo');
      await qzConnect();
      const receiptPrinters = (cfg.printers ?? []).filter(p => p.type === 'receipt' && p.is_active);
      if (receiptPrinters.length > 0) { for (const printer of receiptPrinters) await qzPrintToPrinter(printer, bytes); }
      else await qzPrintDefault(bytes);
      return;
    }
    await qzPrintDefault(bytes).catch(() => { throw new Error('Configurá una impresora'); });
  }

  /** Renderiza un documento A4 (página entera, tipo PDF) a partir de líneas. */
  private renderA4FromLines(lines: Array<{ t: string; a?: string; b?: string }>): string {
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const body = lines.map(ln => {
      if (ln.t === 'sep') return '<hr>';
      if (ln.t === 'title') return `<div class="ttl">${esc(ln.a ?? '')}</div>`;
      if (ln.t === 'center') return `<div class="ctr">${esc(ln.a ?? '')}</div>`;
      if (ln.t === 'row') return `<div class="row"><span>${esc(ln.a ?? '')}</span><span>${esc(ln.b ?? '')}</span></div>`;
      return `<div class="txt">${esc(ln.a ?? '')}</div>`;
    }).join('');
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; }
      .doc { max-width: 720px; margin: 0 auto; font-size: 13px; }
      .ttl { text-align: center; font-weight: 900; font-size: 18px; margin: 4px 0; letter-spacing: .5px; }
      .ctr { text-align: center; color: #6b7280; }
      .txt { color: #6b7280; font-size: 12px; padding-left: 8px; }
      .row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
      .row span:last-child { font-weight: bold; white-space: nowrap; }
      hr { border: none; border-top: 1.5px solid #cbd5e1; margin: 8px 0; }
    </style></head><body><div class="doc">${body}</div></body></html>`;
  }

  /** Imprime un documento genérico (comprobantes de CxC, históricos, listas). */
  async printDoc(lines: Array<{ t: 'title' | 'center' | 'row' | 'text' | 'sep'; a?: string; b?: string }>, tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);
    const w = (typeof cfg.paperWidth === 'number' ? cfg.paperWidth : 48);
    const cmds: number[] = [];
    const push = (...b: number[]) => cmds.push(...b);
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    const sep = () => { for (let i = 0; i < w; i++) push(0x2D); nl(); };
    const center = (s: string) => { text(String(s).padStart((w + s.length) / 2, ' ')); nl(); };
    const row = (l: string, v: string) => { const sp = Math.max(1, w - l.length - v.length); text(l + ' '.repeat(sp) + v); nl(); };

    // A4 → HTML tamaño hoja; navegador (no A4) → HTML angosto (tiquete);
    // bluetooth/qz/térmica → ESC/POS.
    const isA4 = (cfg.paperWidth as any) === 'a4';
    const useEscpos = !isA4 && (cfg.printerType === 'bluetooth' || cfg.printerType === 'qztray' || cfg.printerType === 'thermal');

    if (!useEscpos) {
      const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
      if (isA4) { await this.printHTMLContent(this.renderA4FromLines(lines)); return; }
      // Angosto (como antes del A4).
      const body = lines.map(ln => {
        if (ln.t === 'sep') return '<hr style="border:none;border-top:1px dashed #999;margin:4px 0">';
        if (ln.t === 'title') return `<div style="text-align:center;font-weight:900;font-size:14px;margin:2px 0">${esc(ln.a ?? '')}</div>`;
        if (ln.t === 'center') return `<div style="text-align:center">${esc(ln.a ?? '')}</div>`;
        if (ln.t === 'row') return `<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(ln.a ?? '')}</span><span>${esc(ln.b ?? '')}</span></div>`;
        return `<div>${esc(ln.a ?? '')}</div>`;
      }).join('');
      await this.printHTMLContent(`<div style="font-family:monospace;font-size:12px;width:280px;margin:0 auto">${body}</div>`);
      return;
    }

    push(0x1B, 0x40); push(0x1C, 0x2E); push(0x1B, 0x52, 0x00); push(0x1B, 0x74, 0x00); push(0x1B, 0x21, 0x00);
    for (const ln of lines) {
      if (ln.t === 'sep') sep();
      else if (ln.t === 'title') { push(0x1B, 0x21, 0x08); center(ln.a ?? ''); push(0x1B, 0x21, 0x00); }
      else if (ln.t === 'center') center(ln.a ?? '');
      else if (ln.t === 'row') row(ln.a ?? '', ln.b ?? '');
      else text((ln.a ?? '')), nl();
    }
    nl(); nl(); push(0x1D, 0x56, 0x00);
    await this.sendBytes(new Uint8Array(cmds), cfg);
  }

  private generateRouteCloseESCPOS(summary: any, cfg: ReceiptConfig): Uint8Array {
    const charWidth = (typeof cfg.paperWidth === 'number' ? cfg.paperWidth : 48);
    const cmds: number[] = [];
    const push = (...b: number[]) => cmds.push(...b);
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0x2D); nl(); };
    const center = (s: string) => { text(s.padStart((charWidth + s.length) / 2, ' ')); nl(); };
    const row = (l: string, v: string) => { const sp = Math.max(1, charWidth - l.length - v.length); text(l + ' '.repeat(sp) + v); nl(); };
    const money = (n: number) => `${Number(n || 0).toLocaleString('es-CR')}`;
    const now = new Date();

    push(0x1B, 0x40); push(0x1C, 0x2E); push(0x1B, 0x52, 0x00); push(0x1B, 0x74, 0x00); push(0x1B, 0x21, 0x00);
    center('=== CIERRE DE RUTA ===');
    if (summary.truck) center(summary.truck);
    center(`${now.toLocaleDateString('es-CR')} ${now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`);
    sep();
    center('VENTAS');
    const bm = summary.by_method ?? { cash: 0, card: 0, sinpe: 0, credit: 0 };
    row('Efectivo:', money(bm.cash));
    row('Tarjeta:', money(bm.card));
    row('SINPE:', money(bm.sinpe));
    row('Credito:', money(bm.credit));
    sep();
    row('Ventas:', String(summary.sales_count ?? 0));
    row('Anulaciones:', String(summary.voids_count ?? 0));
    center(`*** TOTAL: ${money(summary.sales_total)} ***`);
    sep();

    // Abonos de CxC del día (efectivo/tarjeta/SINPE por aparte + detalle).
    const ap = summary.ar_payments;
    if (ap && ap.total > 0) {
      center('ABONOS CREDITO (CxC)');
      row('Efectivo:', money(ap.by_method.cash));
      row('Tarjeta:', money(ap.by_method.card));
      row('SINPE:', money(ap.by_method.sinpe));
      for (const a of (ap.list ?? [])) {
        const lbl = a.method === 'card' ? 'T' : a.method === 'sinpe' ? 'S' : 'E';
        row(`${String(a.customer).substring(0, charWidth - 12)} (${lbl})`, money(a.amount));
      }
      row('Total abonos:', money(ap.total));
      sep();
    }

    // Gastos del día del repartidor.
    const ex = summary.expenses;
    if (ex && ex.total > 0) {
      center('GASTOS DEL DIA');
      for (const g of (ex.list ?? [])) row(String(g.description).substring(0, charWidth - 10), money(g.amount));
      row('Total gastos:', money(ex.total));
      sep();
    }

    center('INVENTARIO DEVUELTO');
    const ret = [...(summary.returned ?? [])].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'es'));
    if (ret.length === 0) { center('(sin sobrante)'); }
    else { for (const r of ret) row(String(r.name).substring(0, charWidth - 6), `x${r.quantity}`); }
    sep(); nl(); nl();
    push(0x1D, 0x56, 0x00);
    return new Uint8Array(cmds);
  }

  // ESC/POS raw para el cierre de caja — mismo motor que el ticket de venta.
  private generateCashCloseESCPOS(report: any, cfg: ReceiptConfig, general?: any): Uint8Array {
    const charWidth = (typeof cfg.paperWidth === 'number' ? cfg.paperWidth : 48);
    const cmds: number[] = [];
    const push = (...bytes: number[]) => cmds.push(...bytes);
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0x2D); nl(); };
    const centerText = (s: string) => { text(s.padStart((charWidth + s.length) / 2, ' ')); nl(); };
    const row = (label: string, val: string) => {
      const sp = Math.max(1, charWidth - label.length - val.length);
      text(label + ' '.repeat(sp) + val); nl();
    };
    const fmt = (n: number) => `${Number(n || 0).toLocaleString('es-CR')}`;
    const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

    const sCash = Number(report.system_cash ?? 0);
    const sCard = Number(report.system_card ?? 0);
    const sSinpe = Number(report.system_sinpe ?? 0);
    const sOther = Number(report.system_other ?? 0);
    const systemTotal = sCash + sCard + sSinpe + sOther;

    // Init (igual que el ticket de venta)
    push(0x1B, 0x40);               // ESC @ reset
    push(0x1C, 0x2E);               // FS . cancelar modo chino
    push(0x1B, 0x52, 0x00);         // charset USA
    push(0x1B, 0x74, 0x00);         // CP437
    push(0x1B, 0x21, 0x00);         // modo normal

    centerText('=== CIERRE DE CAJA ===');
    if (general?.businessName) centerText(general.businessName);
    sep();
    row('Apertura:', fmtDateTime(report.opened_at));
    row('Cierre:', fmtDateTime(report.closed_at));
    if (report.cashier_name) row('Cajero:', String(report.cashier_name));
    sep();

    // Ventas del sistema por método
    centerText('VENTAS DEL SISTEMA');
    row('Efectivo:', fmt(sCash));
    row('Datafono:', fmt(sCard));
    row('SINPE:', fmt(sSinpe));
    if (sOther > 0) row('Otros:', fmt(sOther));
    sep();
    row('Total ventas:', fmt(systemTotal));
    row('Facturas:', String(report.invoices_count ?? 0));
    if ((report.voids_count ?? 0) > 0) row('Anulaciones:', `${report.voids_count} · ${fmt(report.voids_total ?? 0)}`);
    if ((report.delivery_count ?? 0) > 0) {
      sep();
      centerText('DELIVERY (aparte)');
      row('Ventas:', `${report.delivery_count} · ${fmt(report.delivery_total ?? 0)}`);
      row('Neto:', fmt(report.delivery_net ?? 0));
    }
    sep();

    // Movimientos de efectivo
    const movs = (report.cash_movements ?? []) as Array<{ type: 'in' | 'out'; amount: number; reason: string }>;
    if (movs.length > 0) {
      centerText('MOVIMIENTOS DE EFECTIVO');
      for (const m of movs) {
        row(m.type === 'in' ? '+ Entrada:' : '- Salida:', fmt(m.amount));
        if (m.reason) { text(`  ${m.reason}`.substring(0, charWidth)); nl(); }
      }
      sep();
    }

    // Arqueo (sobre el total: fondo + ventas del día)
    centerText('ARQUEO');
    row('Fondo de caja:', fmt(report.opening_amount));
    row('+ Total ventas:', fmt(systemTotal));
    if (report.cash_movements?.some((m: any) => m.type === 'in')) row('+ Entradas:', fmt(movs.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0)));
    if (report.cash_movements?.some((m: any) => m.type === 'out')) row('- Salidas:', fmt(movs.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0)));
    row('ESPERADO:', fmt(report.expected_amount));
    sep();

    // Contado por método
    centerText('CONTADO');
    row('Efectivo:', fmt(report.cash_total));
    row('Datafono:', fmt(report.card_total));
    row('SINPE:', fmt(report.sinpe_total));
    row('TOTAL CONTADO:', fmt(report.closing_amount));
    if ((report.opening_usd ?? 0) > 0 || (report.closing_usd ?? 0) > 0 || (report.usd_received ?? 0) > 0) {
      sep();
      centerText('DOLARES EN EFECTIVO');
      row('Apertura:', `$${Number(report.opening_usd ?? 0).toFixed(2)}`);
      row('Recibido ventas:', `$${Number(report.usd_received ?? 0).toFixed(2)}`);
      row('Vuelto en $:', `$${Number(report.usd_change_out ?? 0).toFixed(2)}`);
      row('Esperado:', `$${Number(report.expected_usd ?? 0).toFixed(2)}`);
      row('Contado:', `$${Number(report.closing_usd ?? 0).toFixed(2)}`);
      row('Diferencia:', `$${(Number(report.closing_usd ?? 0) - Number(report.expected_usd ?? 0)).toFixed(2)}`);
    }
    sep();

    // Diferencia venta vs sistema, por método (Contado - Sistema).
    // Efectivo compara contra el esperado (fondo + ventas efectivo + movimientos).
    const cashIn = movs.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0);
    const cashOut = movs.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0);
    const expectedCash = Number(report.opening_amount ?? 0) + sCash + cashIn - cashOut;
    const dCash = Number(report.cash_total ?? 0) - expectedCash;
    const dCard = Number(report.card_total ?? 0) - sCard;
    const dSinpe = Number(report.sinpe_total ?? 0) - sSinpe;
    const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
    centerText('DIFERENCIA VENTA VS SISTEMA');
    row('Efectivo:', signed(dCash));
    row('Datafono:', signed(dCard));
    row('SINPE:', signed(dSinpe));
    sep();

    // Faltante / sobrante (sobre el total)
    push(0x1B, 0x21, 0x10);         // ESC ! — doble alto
    const diff = Number(report.difference ?? 0);
    const diffLabel = diff === 0 ? 'CUADRADO' : diff > 0 ? 'SOBRANTE' : 'FALTANTE';
    centerText(`${diffLabel}: ${fmt(Math.abs(diff))}`);
    push(0x1B, 0x21, 0x00);         // modo normal
    sep();

    nl();
    centerText('FIRMA');
    nl(); nl();
    centerText('____________________');
    nl();

    // Feed + corte (SIN cajón — el cierre no abre caja)
    nl(); nl();
    push(0x1D, 0x56, 0x00);         // GS V 0 — full cut

    return new Uint8Array(cmds);
  }

  private generateCashCloseHTML(report: any, cfg: ReceiptConfig, general?: any): string {
    const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
    const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
    const widthMM = PAPER_WIDTH_MM[cfg.paperWidth as number] ?? '80mm';

    const storeName = general?.businessName || 'CIERRE DE CAJA';
    const diffColor = report.difference === 0 ? '#000' : report.difference > 0 ? '#16a34a' : '#dc2626';
    const diffLabel = report.difference === 0 ? 'CUADRADO' : report.difference > 0 ? 'SOBRANTE' : 'FALTANTE';

    const movementsRows = (report.cash_movements ?? [])
      .map((m: any) => `
        <tr>
          <td style="font-weight:800;">${m.type === 'in' ? '↓ Entrada' : '↑ Salida'}</td>
          <td style="text-align:right;font-weight:900;color:${m.type === 'in' ? '#16a34a' : '#dc2626'}">${fmt(m.amount)}</td>
        </tr>
        <tr><td colspan="2" style="font-size:11px;padding-bottom:4px;">${m.reason || '-'}</td></tr>
      `).join('');

    // Diferencia venta vs sistema por método (Contado - Sistema).
    const cashIn = (report.cash_movements ?? []).filter((m: any) => m.type === 'in').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
    const cashOut = (report.cash_movements ?? []).filter((m: any) => m.type === 'out').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
    const expCash = Number(report.opening_amount ?? 0) + Number(report.system_cash ?? 0) + cashIn - cashOut;
    const dCash = Number(report.cash_total ?? 0) - expCash;
    const dCard = Number(report.card_total ?? 0) - Number(report.system_card ?? 0);
    const dSinpe = Number(report.sinpe_total ?? 0) - Number(report.system_sinpe ?? 0);
    const diffCell = (n: number) => `<td style="text-align:right;color:${n === 0 ? '#000' : n > 0 ? '#16a34a' : '#dc2626'}">${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}</td>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cierre de Caja</title>
  <style>
    @page { size: ${widthMM} auto; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.7;
      color: #000; background: #fff; width: ${widthMM}; font-weight: 700; }
    .receipt { width: 100%; padding: 3mm 3mm 6mm; }
    .title { font-size: 18px; font-weight: 900; text-align: center; letter-spacing: 2px;
      padding: 4px 0; margin-bottom: 6px; border-top: 4px solid #000; border-bottom: 4px solid #000; }
    .store-name { font-size: 14px; font-weight: 900; text-align: center; margin-bottom: 6px; }
    .meta { font-size: 13px; font-weight: 800; margin: 2px 0; }
    .section { font-weight: 900; font-size: 13px; border-top: 3px solid #000; border-bottom: 3px solid #000;
      margin: 5px 0 3px; padding: 2px 0; letter-spacing: 1px; text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; font-size: 13px; font-weight: 800; }
    .total-line { font-size: 18px; font-weight: 900; text-align: center; margin: 6px 0;
      padding: 4px 0; border-top: 4px solid #000; border-bottom: 4px solid #000; letter-spacing: 1px; }
    .diff-line { font-size: 20px; font-weight: 900; text-align: center; margin: 8px 0;
      padding: 6px 0; border: 4px solid; letter-spacing: 2px; }
    .feed { padding-bottom: 15mm; }
  </style>
</head>
<body>
<div class="receipt">

  <div class="title">CIERRE DE CAJA</div>
  <div class="store-name">${storeName}</div>

  <div class="meta"><strong>Apertura:</strong> ${fmtDateTime(report.opened_at)}</div>
  <div class="meta"><strong>Cierre:</strong> ${fmtDateTime(report.closed_at)}</div>
  ${report.cashier_name ? `<div class="meta"><strong>Cajero:</strong> ${report.cashier_name}</div>` : ''}

  <div class="section">VENTAS DEL SISTEMA</div>
  <table>
    <tr><td>Efectivo:</td><td style="text-align:right">${fmt(report.system_cash ?? 0)}</td></tr>
    <tr><td>Datáfono:</td><td style="text-align:right">${fmt(report.system_card ?? 0)}</td></tr>
    <tr><td>SINPE:</td><td style="text-align:right">${fmt(report.system_sinpe ?? 0)}</td></tr>
    ${(report.system_other ?? 0) > 0 ? `<tr><td>Otros:</td><td style="text-align:right">${fmt(report.system_other)}</td></tr>` : ''}
    <tr><td><strong>Total ventas:</strong></td><td style="text-align:right"><strong>${fmt((report.system_cash ?? 0) + (report.system_card ?? 0) + (report.system_sinpe ?? 0) + (report.system_other ?? 0))}</strong></td></tr>
    <tr><td>Facturas:</td><td style="text-align:right">${report.invoices_count}</td></tr>
    ${(report.voids_count ?? 0) > 0 ? `<tr><td>Anulaciones:</td><td style="text-align:right">${report.voids_count} · ${fmt(report.voids_total ?? 0)}</td></tr>` : ''}
  </table>

  ${report.cash_movements && report.cash_movements.length > 0 ? `
    <div class="section">MOVIMIENTOS DE EFECTIVO</div>
    <table>${movementsRows}</table>
  ` : ''}

  <div class="section">ARQUEO</div>
  <table>
    <tr><td>Fondo de caja:</td><td style="text-align:right">${fmt(report.opening_amount)}</td></tr>
    <tr><td>+ Total ventas:</td><td style="text-align:right">${fmt((report.system_cash ?? 0) + (report.system_card ?? 0) + (report.system_sinpe ?? 0) + (report.system_other ?? 0))}</td></tr>
    <tr><td><strong>Esperado:</strong></td><td style="text-align:right"><strong>${fmt(report.expected_amount)}</strong></td></tr>
  </table>

  <div class="section">CONTADO</div>
  <table>
    <tr><td>Efectivo:</td><td style="text-align:right">${fmt(report.cash_total)}</td></tr>
    <tr><td>Datáfono:</td><td style="text-align:right">${fmt(report.card_total)}</td></tr>
    <tr><td>SINPE:</td><td style="text-align:right">${fmt(report.sinpe_total)}</td></tr>
    <tr><td><strong>Total contado:</strong></td><td style="text-align:right"><strong>${fmt(report.closing_amount)}</strong></td></tr>
  </table>

  ${((report.opening_usd ?? 0) > 0 || (report.closing_usd ?? 0) > 0 || (report.usd_received ?? 0) > 0) ? `
  <div class="section">DÓLARES EN EFECTIVO</div>
  <table>
    <tr><td>Apertura:</td><td style="text-align:right">$${Number(report.opening_usd ?? 0).toFixed(2)}</td></tr>
    <tr><td>Recibido en ventas:</td><td style="text-align:right">$${Number(report.usd_received ?? 0).toFixed(2)}</td></tr>
    <tr><td>Vuelto en $:</td><td style="text-align:right">$${Number(report.usd_change_out ?? 0).toFixed(2)}</td></tr>
    <tr><td><strong>Esperado:</strong></td><td style="text-align:right"><strong>$${Number(report.expected_usd ?? 0).toFixed(2)}</strong></td></tr>
    <tr><td>Contado:</td><td style="text-align:right">$${Number(report.closing_usd ?? 0).toFixed(2)}</td></tr>
    <tr><td>Diferencia:</td><td style="text-align:right">$${(Number(report.closing_usd ?? 0) - Number(report.expected_usd ?? 0)).toFixed(2)}</td></tr>
  </table>` : ''}

  <div class="section">DIFERENCIA VENTA vs SISTEMA</div>
  <table>
    <tr><td>Efectivo:</td>${diffCell(dCash)}</tr>
    <tr><td>Datáfono:</td>${diffCell(dCard)}</tr>
    <tr><td>SINPE:</td>${diffCell(dSinpe)}</tr>
  </table>

  <div class="diff-line" style="color:${diffColor};border-color:${diffColor};">
    ${diffLabel}<br>${fmt(Math.abs(report.difference))}
  </div>

  <div class="section">FIRMA</div>
  <div style="text-align:center;margin-top:14px;font-size:16px;font-weight:900;letter-spacing:3px;">
    _______________________
  </div>

  <div class="feed">&nbsp;</div>
</div>
</body>
</html>`;
  }

  // ─── Purchase Order print ─────────────────────────────────────────────────────

  async printPurchaseOrder(order: {
    purchase_number: string;
    purchase_date: string;
    expected_delivery_date?: string | null;
    supplier_name: string;
    supplier_phone?: string | null;
    items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>;
    total_amount: number;
    notes?: string | null;
    tenant_name?: string;
  }, tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);

    // Cargar datos del local (igual que para ticket de venta)
    let general: any = null;
    try {
      const cached = localStorage.getItem(`novapos_cache_${tenantId}_settings_general`);
      if (cached) {
        const parsed = JSON.parse(cached);
        general = parsed?.data ?? parsed;
      }
      if (!general) {
        general = await apiFetch<any>('/settings/general').catch(() => null);
        general = general?.config ?? general;
      }
    } catch {}

    // Modo ESC/POS raw para impresoras térmicas — igual que el ticket de venta.
    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      try {
        if (!(await qzIsAvailable())) throw new Error('QZ Tray no disponible');
        await qzConnect();
        const receiptPrinters = (cfg.printers ?? []).filter(p => p.type === 'receipt' && p.is_active);
        if (receiptPrinters.length > 0) {
          const escposBytes = this.generatePurchaseOrderESCPOS(order, cfg, general);
          for (const printer of receiptPrinters) {
            await qzPrintToPrinter(printer, escposBytes);
          }
          return;
        }
      } catch {
        // fall through to browser
      }
    }

    // Fallback: navegador (HTML)
    const html = this.generatePurchaseOrderHTML(order, cfg, general);
    await this.printHTMLContent(html);
  }

  private generatePurchaseOrderHTML(order: {
    purchase_number: string;
    purchase_date: string;
    expected_delivery_date?: string | null;
    supplier_name: string;
    supplier_phone?: string | null;
    items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>;
    total_amount: number;
    notes?: string | null;
    tenant_name?: string;
  }, cfg: ReceiptConfig, _general?: any): string {
    const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
    const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' });
    const widthMM = PAPER_WIDTH_MM[cfg.paperWidth as number] ?? '80mm';

    const rows = order.items.map(i => `
      <tr>
        <td class="item-name">${i.product_name}</td>
        <td class="item-qty">${i.quantity}</td>
        <td class="item-price">${fmt(i.unit_price)}</td>
        <td class="item-price">${fmt(i.subtotal)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Orden ${order.purchase_number}</title>
  <style>
    @page { size: ${widthMM} auto; margin: 0; }
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.7;
      color: #000;
      background: #fff;
      width: ${widthMM};
      font-weight: 700;
    }
    .receipt { width: 100%; padding: 3mm 3mm 6mm; }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .divider { border: none; border-top: 3px solid #000; margin: 4px 0; }
    .title {
      font-size: 18px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 2px;
      margin-bottom: 6px;
      padding: 4px 0;
      border-top: 4px solid #000;
      border-bottom: 4px solid #000;
    }
    .meta { font-size: 13px; font-weight: 800; margin: 2px 0; }
    .section-label {
      font-weight: 900;
      font-size: 13px;
      border-top: 3px solid #000;
      border-bottom: 3px solid #000;
      margin: 5px 0 3px;
      padding: 2px 0;
      letter-spacing: 1px;
      text-align: center;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      font-size: 12px;
      font-weight: 900;
      border-bottom: 2px solid #000;
      padding: 3px 0;
    }
    td { padding: 2px 0; font-size: 13px; font-weight: 800; }
    th.right, td.right { text-align: right; }
    .item-name { width: 40%; }
    .item-qty { width: 12%; text-align: center; font-weight: 900; font-size: 14px; }
    .item-price { width: 24%; text-align: right; font-weight: 900; }
    .total-line {
      font-size: 20px;
      font-weight: 900;
      text-align: center;
      margin: 6px 0;
      padding: 4px 0;
      border-top: 4px solid #000;
      border-bottom: 4px solid #000;
      letter-spacing: 2px;
    }
    .notes-block {
      font-size: 12px;
      font-weight: 700;
      margin: 4px 0;
      padding: 4px 0;
    }
    .sign-label {
      font-size: 16px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 1px;
      margin-top: 20px;
    }
    .sign-line {
      text-align: center;
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 4px;
      margin-top: 24px;
      padding-top: 10px;
    }
    .feed { padding-bottom: 25mm; }
  </style>
</head>
<body>
<div class="receipt">

  <div class="title">ORDEN DE COMPRA</div>

  <div class="meta"><strong>N°:</strong> ${order.purchase_number}</div>
  <div class="meta"><strong>Fecha:</strong> ${fmtDate(order.purchase_date)}</div>
  ${order.expected_delivery_date ? `<div class="meta"><strong>Entrega:</strong> ${fmtDate(order.expected_delivery_date)}</div>` : ''}

  <div class="section-label">PROVEEDOR</div>
  <div class="meta bold">${order.supplier_name}</div>
  ${order.supplier_phone ? `<div class="meta"><strong>Tel:</strong> ${order.supplier_phone}</div>` : ''}

  <div class="section-label">PRODUCTOS</div>
  <table>
    <thead>
      <tr>
        <th class="item-name">Producto</th>
        <th class="item-qty">Cant</th>
        <th class="item-price right">Precio</th>
        <th class="item-price right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total-line">TOTAL: ${fmt(order.total_amount)}</div>

  ${order.notes ? `
    <div class="section-label">NOTAS</div>
    <div class="notes-block">${order.notes}</div>
  ` : ''}

  <hr class="divider">

  <div class="sign-label">FIRMA DE RECEPCIÓN</div>
  <div class="sign-line">_______________________</div>

  <div class="sign-label" style="margin-top:30px;">FECHA</div>
  <div class="sign-line">_______________________</div>

  <div class="feed">&nbsp;</div>

</div>
</body>
</html>`;
  }

  // ESC/POS raw para orden de compra — mismo motor que el ticket de venta,
  // pero SIN comando de cajón (es una compra, no una venta).
  private generatePurchaseOrderESCPOS(order: {
    purchase_number: string;
    purchase_date: string;
    expected_delivery_date?: string | null;
    supplier_name: string;
    supplier_phone?: string | null;
    items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>;
    total_amount: number;
    notes?: string | null;
  }, cfg: ReceiptConfig, general?: any): Uint8Array {
    const charWidth = (typeof cfg.paperWidth === 'number' ? cfg.paperWidth : 48);
    const cmds: number[] = [];
    const push = (...bytes: number[]) => cmds.push(...bytes);
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0x2D); nl(); };
    const centerText = (s: string) => { text(s.padStart((charWidth + s.length) / 2, ' ')); nl(); };
    const rightAlign = (label: string, val: string) => {
      const sp = Math.max(1, charWidth - label.length - val.length);
      text(label + ' '.repeat(sp) + val); nl();
    };
    const fmt = (n: number) => `${n.toLocaleString('es-CR')}`;
    const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('es-CR'); } catch { return s; } };

    // Init (igual que el ticket de venta)
    push(0x1B, 0x40);               // ESC @ reset
    push(0x1C, 0x2E);               // FS . cancelar modo chino
    push(0x1B, 0x52, 0x00);         // charset USA
    push(0x1B, 0x74, 0x00);         // CP437
    push(0x1B, 0x21, 0x00);         // modo normal

    centerText('=== ORDEN DE COMPRA ===');
    centerText(`#${order.purchase_number}`);
    centerText(`${fmtDate(order.purchase_date)}`);
    if (order.expected_delivery_date) centerText(`Entrega: ${fmtDate(order.expected_delivery_date)}`);
    sep();

    if (general?.businessName) centerText(general.businessName);

    sep();
    text('PROVEEDOR:'); nl();
    centerText(order.supplier_name);
    if (order.supplier_phone) centerText(`Tel: ${order.supplier_phone}`);

    sep();
    text('PRODUCTOS:'); nl();
    for (const it of order.items) {
      const price = fmt(it.subtotal);
      const name = it.product_name.substring(0, charWidth - price.length - 1);
      const spaces = charWidth - name.length - price.length;
      text(name + ' '.repeat(Math.max(1, spaces)) + price); nl();
      text(`  ${it.quantity} x ${fmt(it.unit_price)}`); nl();
    }

    sep();
    rightAlign('TOTAL:', fmt(order.total_amount));
    sep();

    if (order.notes) {
      text('NOTAS:'); nl();
      text(order.notes); nl();
      sep();
    }

    nl();
    centerText('FIRMA DE RECEPCION');
    nl(); nl();
    centerText('____________________');
    nl();

    // Feed + corte (SIN comando de cajón)
    nl(); nl();
    push(0x1D, 0x56, 0x00);         // GS V 0 — full cut

    return new Uint8Array(cmds);
  }

  private async printHTMLContent(html: string): Promise<void> {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error('No se pudo crear el documento de impresión');
    doc.open(); doc.write(html); doc.close();

    // Esperar a que todas las imágenes carguen (logo, etc.)
    await this.waitForImages(doc);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        finally { setTimeout(() => { document.body.removeChild(iframe); resolve(); }, 500); }
      }, 200);
    });
  }

  private async waitForImages(doc: Document, timeoutMs = 800): Promise<void> {
    const images = Array.from(doc.querySelectorAll('img'));
    if (images.length === 0) return;

    // Si todas las imágenes son data URLs, no hace falta esperar (son instantáneas)
    const allDataUrls = images.every(img => img.src.startsWith('data:'));
    if (allDataUrls) {
      // Solo asegurar que estén "complete"
      const notReady = images.filter(img => !img.complete);
      if (notReady.length === 0) return;
    }

    const promises = images.map(img => {
      if (img.complete && img.naturalHeight > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, timeoutMs);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Print a comanda (kitchen/bar ticket) to all active comanda printers.
   * Fire-and-forget safe — caller should catch errors separately.
   */
  async printComandas(
    invoiceNumber: string,
    items: ComandaItem[],
    tenantId: string,
    customerName?: string,
  ): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);
    const comandaPrinters = (cfg.printers ?? []).filter(
      p => p.type === 'comanda' && p.is_active,
    );
    if (comandaPrinters.length === 0) return;

    const now = new Date();
    const time = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    const buildData = (printer: any) =>
      formatComanda({ invoiceNumber, time, label: printer.label, items, customerName }, 42);

    // Bluetooth: enviar a cada estación de comanda conectada por BT.
    if (cfg.printerType === 'bluetooth') {
      const { btPrintTo } = await import('./bluetoothPrinterService');
      const btStations = comandaPrinters.filter((p: any) => p.connection === 'bluetooth');
      for (const printer of btStations) {
        try { await btPrintTo(printer.id, buildData(printer)); }
        catch (e) { console.warn('[comanda BT] falló:', e); }
      }
      return;
    }

    // QZ Tray / térmica.
    if (!(await qzIsAvailable())) return;
    await qzConnect();
    await Promise.all(comandaPrinters.map(printer => qzPrintToPrinter(printer, buildData(printer))));
  }

  // ─── Browser print ────────────────────────────────────────────────────────────

  async printBrowser(receiptData: ReceiptData, cfg?: ReceiptConfig): Promise<void> {
    const config = cfg ?? this.getDefaultConfig();
    const html = this.generateHTML(receiptData, config);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error('No se pudo crear el documento de impresión');

    doc.open();
    doc.write(html);
    doc.close();

    // Esperar a que el logo y otras imágenes carguen
    await this.waitForImages(doc);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            document.body.removeChild(iframe);
            resolve();
          }, 500);
        }
      }, 200);
    });
  }

  // ─── QZ Tray helpers ──────────────────────────────────────────────────────────

  static async getQZPrinters(): Promise<string[]> {
    const qz = (window as any).qz;
    if (!qz) return [];
    try {
      if (!qz.websocket.isActive()) await qz.websocket.connect();
      const printers: string[] = await qz.printers.find();
      return Array.isArray(printers) ? printers : [];
    } catch {
      return [];
    }
  }

  static isQZAvailable(): boolean {
    return !!(window as any).qz;
  }

  // ─── Documento A4 (página entera, tipo PDF, desglosado) ────────────────────────
  private generateA4HTML(r: ReceiptData, cfg: ReceiptConfig): string {
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const money = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const logo = (cfg.showLogo && r.logoUrl) ? r.logoUrl : '';
    const tipoLabel = r.feTipoLabel ?? (r.feClave ? 'COMPROBANTE ELECTRÓNICO' : 'FACTURA');

    const rows = r.items.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td class="r">${Number(it.quantity)}</td>
        <td class="r">${money(it.unitPrice)}</td>
        <td class="r">${money(it.subtotal)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${esc(tipoLabel)} ${esc(r.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
  .logo { max-height: 80px; max-width: 220px; object-fit: contain; }
  .brand { font-weight: 900; font-size: 20px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16px; margin: 0 0 4px; color: #2563eb; letter-spacing: .5px; }
  .doc .num { font-size: 13px; font-weight: bold; }
  .doc .meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .parties { display: flex; gap: 16px; margin: 16px 0; }
  .party { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
  .party-title { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; font-weight: bold; margin-bottom: 4px; }
  .party-name { font-weight: bold; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f3f4f6; text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; color: #374151; }
  td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
  td.r, th.r { text-align: right; } td.c, th.c { text-align: center; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 2px solid #111827; margin-top: 4px; padding-top: 6px; font-size: 16px; font-weight: 900; }
  .fe { margin-top: 18px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 11px; }
  .fe .clave { font-family: monospace; word-break: break-all; }
  .foot { margin-top: 20px; text-align: center; font-size: 11px; color: #6b7280; }
</style></head><body>
  <div class="head">
    <div>${logo ? `<img class="logo" src="${esc(logo)}" alt="logo"/>` : `<div class="brand">${esc(r.storeName ?? '')}</div>`}
      <div style="font-size:11px;color:#6b7280;margin-top:4px">
        ${r.storeRuc ? `Céd. Jurídica: ${esc(r.storeRuc)}<br>` : ''}${r.storeCedula ? `Cédula: ${esc(r.storeCedula)}<br>` : ''}
        ${r.storeAddress ? esc(r.storeAddress) + '<br>' : ''}${r.storePhone ? 'Tel: ' + esc(r.storePhone) : ''}
      </div>
    </div>
    <div class="doc">
      <h1>${esc(tipoLabel)}</h1>
      <div class="num">N° ${esc(r.invoiceNumber)}</div>
      <div class="meta">${esc(r.date)} ${esc(r.time)}</div>
      ${r.feConsecutivo ? `<div class="meta">Consecutivo: ${esc(r.feConsecutivo)}</div>` : ''}
    </div>
  </div>

  ${(r.customerName || r.customerEmail) ? `
  <div class="parties"><div class="party">
    <div class="party-title">Cliente</div>
    <div class="party-name">${esc(r.customerName ?? 'Cliente General')}</div>
    ${r.customerPhone ? `<div>Tel: ${esc(r.customerPhone)}</div>` : ''}
    ${r.customerEmail ? `<div>${esc(r.customerEmail)}</div>` : ''}
  </div></div>` : ''}
  ${r.bipper ? `<div style="text-align:center;font-weight:bold;font-size:1.2em;margin:6px 0;border:1px dashed #000;padding:4px;">BIPPER: ${esc(r.bipper)}</div>` : ''}

  <table>
    <thead><tr><th class="c">#</th><th>Descripción</th><th class="r">Cant.</th><th class="r">P. Unit</th><th class="r">Subtotal</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">Sin líneas</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(r.subtotal)}</span></div>
    ${Number(r.tax) > 0 ? `<div><span>Impuesto (IVA)</span><span>${money(r.tax)}</span></div>` : ''}
    ${Number(r.discount) ? `<div><span>${r.discountLabel || 'Combos / Descuentos'}</span><span>${Number(r.discount) >= 0 ? '-' : '+'}${money(Math.abs(Number(r.discount)))}</span></div>` : ''}
    ${Number(r.rounding) ? `<div><span>Redondeo</span><span>${Number(r.rounding) >= 0 ? '+' : '-'}${money(Math.abs(Number(r.rounding)))}</span></div>` : ''}
    <div class="grand"><span>TOTAL</span><span>${money(r.total)}</span></div>
  </div>

  <div style="margin-top:10px;font-size:11px;color:#374151"><b>Forma de pago:</b> ${esc(r.paymentMethod)}</div>

  ${r.feClave ? `<div class="fe">
    <div><b>Clave numérica:</b></div>
    <div class="clave">${esc(r.feClave)}</div>
    ${r.feQrDataUrl ? `<div style="text-align:center;margin-top:8px"><img src="${esc(r.feQrDataUrl)}" style="width:120px;height:120px"/></div>` : ''}
  </div>` : ''}

  <div class="foot">${esc(r.footerMessage ?? '¡Gracias por su compra!')}</div>
</body></html>`;
  }

  // ─── HTML receipt ─────────────────────────────────────────────────────────────

  generateHTML(receiptData: ReceiptData, cfg: ReceiptConfig): string {
    const isA4 = (cfg.paperWidth as any) === 'a4';
    if (isA4) return this.generateA4HTML(receiptData, cfg);
    const widthMM = (PAPER_WIDTH_MM[cfg.paperWidth as number] ?? '80mm');

    const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    // Precios CON IMPUESTOS (precio final): línea y unitario con IVA incluido.
    const effRateH = receiptData.subtotal > 0 ? receiptData.tax / receiptData.subtotal : 0;
    const wTax = (n: number) => Math.round(n * (1 + effRateH));
    const itemsHTML = receiptData.items.map(item => `
      <tr>
        <td class="item-name">${item.name}</td>
        <td class="item-qty">${item.quantity}</td>
        <td class="item-price">₡${fmt(wTax(item.subtotal))}</td>
      </tr>
      <tr class="item-detail">
        <td colspan="3">&nbsp;&nbsp;${item.quantity} × ₡${fmt(wTax(item.unitPrice))}</td>
      </tr>
    `).join('');

    const hasStoreInfo = (
      (cfg.showStoreName && receiptData.storeName) ||
      receiptData.storeRuc ||
      receiptData.storeCedula ||
      (cfg.showStoreAddress && receiptData.storeAddress) ||
      receiptData.storeCity ||
      (cfg.showStorePhone && receiptData.storePhone)
    );
    const storeBlock = hasStoreInfo ? `
      <div class="store-block">
        ${cfg.showStoreName && receiptData.storeName ? `<div class="store-name">${receiptData.storeName}</div>` : ''}
        ${receiptData.storeRuc ? `<div class="store-line"><strong>Céd. Jurídica:</strong> ${receiptData.storeRuc}</div>` : ''}
        ${receiptData.storeCedula ? `<div class="store-line"><strong>Cédula:</strong> ${receiptData.storeCedula}</div>` : ''}
        ${cfg.showStoreAddress && receiptData.storeAddress ? `<div class="store-line">${receiptData.storeAddress}</div>` : ''}
        ${receiptData.storeCity ? `<div class="store-line">${receiptData.storeCity}</div>` : ''}
        ${cfg.showStorePhone && receiptData.storePhone ? `<div class="store-line"><strong>Tel:</strong> ${receiptData.storePhone}</div>` : ''}
      </div>
    ` : '';

    const customerBlock = (receiptData.customerName || receiptData.customerPhone || receiptData.customerEmail)
      ? `<div style="text-align:center;font-size:11px;margin:2px 0;">
           <span style="font-weight:bold;">Cliente:</span> ${receiptData.customerName ?? ''}
           ${receiptData.customerPhone ? `<br>Tel: ${receiptData.customerPhone}` : ''}
           ${receiptData.customerEmail ? `<br>Correo: ${receiptData.customerEmail}` : ''}
         </div>
         <hr class="divider">`
      : '';

    const bipperBlock = receiptData.bipper
      ? `<div style="text-align:center;font-weight:bold;font-size:15px;margin:4px 0;border:1px dashed #000;padding:3px;">🔔 BIPPER: ${receiptData.bipper}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket #${receiptData.invoiceNumber}</title>
  <style>
    @page {
      size: ${isA4 ? 'A4' : `${widthMM} auto`};
      margin: ${isA4 ? '15mm' : '0'};
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    ${isA4 ? '' : `@media print {
      /* Forzar threshold térmico en impresión (solo térmica, no A4) */
      img {
        filter: url(#logoThermalThreshold) grayscale(1) contrast(5) brightness(0.4) saturate(0) !important;
        image-rendering: crisp-edges !important;
        image-rendering: -webkit-optimize-contrast !important;
        image-rendering: pixelated !important;
      }
    }`}
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.7;
      color: #000;
      background: #fff;
      width: ${widthMM};
      margin: 0 auto;   /* centrado: evita que se corra a la derecha en papel más ancho */
      font-weight: 700;
    }
    .receipt {
      width: 100%;
      padding: 3mm 3mm 6mm;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .large { font-size: 18px; font-weight: 900; text-align: center; }
    .divider {
      border: none;
      border-top: 1px solid #000;
      margin: 4px 0;
    }
    .header { text-align: center; margin-bottom: 5px; }
    .title { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
    .subtitle { font-size: 13px; color: #000; font-weight: 900; margin: 2px 0; }
    .store-block { text-align: center; margin: 4px 0; }
    .store-name { font-size: 16px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
    .store-line { font-size: 12px; font-weight: 700; margin: 1px 0; }
    .customer-block { font-size: 12px; margin: 3px 0 5px; font-weight: 800; }
    .section-label {
      font-weight: 900;
      font-size: 13px;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      margin: 5px 0 3px;
      padding: 2px 0;
      letter-spacing: 1px;
    }
    table { width: 100%; border-collapse: collapse; }
    .item-name { width: 55%; font-weight: 800; font-size: 13px; }
    .item-qty { width: 10%; text-align: right; font-weight: 900; font-size: 13px; }
    .item-price { width: 35%; text-align: right; font-weight: 900; font-size: 13px; }
    .item-detail { font-size: 12px; color: #000; font-weight: 700; margin: 1px 0; }
    .totals { font-size: 13px; font-weight: 800; }
    .totals tr { border-bottom: 1px solid #000; }
    .totals td { padding: 2px 0; }
    .totals td:last-child { text-align: right; }
    .total-line {
      font-size: 20px;
      font-weight: 900;
      text-align: center;
      margin: 6px 0;
      padding: 4px 0;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      letter-spacing: 2px;
    }
    .payment-block { font-size: 14px; margin: 4px 0; font-weight: 900; }
    .footer { text-align: center; font-size: 14px; font-weight: 900; margin-top: 8px; letter-spacing: 0.5px; }
    .cashier { text-align: center; font-size: 12px; color: #000; margin: 3px 0; font-weight: 800; }
  </style>
</head>
<body>
<div class="receipt">

  <div class="header">
    ${(() => {
      const logo = receiptData.logoUrl || cfg.logoUrl;
      if (!logo) return '';
      // Filtro térmico optimizado para impresión 1-bit:
      // - Matriz luminance (Rec. 709): 0.21R + 0.72G + 0.07B (percepción visual real)
      // - Threshold agresivo: corte 10/16 (62.5%) en vez de 8/16 (50%)
      //   → más pixels van a negro, preservando detalles oscuros (líneas, bordes, letras)
      // - Sin dithering en thermal: la impresora ya no inventa grises raros
      return `
        <svg width="0" height="0" style="position:absolute">
          <filter id="logoThermalThreshold">
            <feColorMatrix type="matrix" values="
              0.21 0.72 0.07 0 0
              0.21 0.72 0.07 0 0
              0.21 0.72 0.07 0 0
              0    0    0    1 0"/>
            <feComponentTransfer>
              <feFuncR type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1"/>
              <feFuncG type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1"/>
              <feFuncB type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1"/>
            </feComponentTransfer>
          </filter>
        </svg>
        <div style="text-align:center;margin-bottom:8px;padding:4px;">
          <img src="${logo}"
               alt="Logo"
               style="max-height:160px;
                      max-width:100%;
                      width:auto;
                      object-fit:contain;
                      display:inline-block;
                      filter:url(#logoThermalThreshold) grayscale(1) contrast(5) brightness(0.4) saturate(0);
                      image-rendering:crisp-edges;
                      image-rendering:-webkit-optimize-contrast;
                      image-rendering:pixelated;
                      -webkit-print-color-adjust:exact;
                      print-color-adjust:exact;
                      color-adjust:exact;">
        </div>
      `;
    })()}
    <div class="title">TICKET DE VENTA</div>
    ${cfg.showInvoiceNumber ? `<div class="subtitle">Factura #${receiptData.invoiceNumber}</div>` : ''}
    ${receiptData.feClave ? `
      <div class="subtitle" style="font-weight:900;">${receiptData.feTipoLabel ?? 'COMPROBANTE ELECTR&Oacute;NICO'}</div>
      ${receiptData.feConsecutivo ? `<div style="font-size:10px;">Consecutivo: <span style="font-family:monospace;font-weight:bold;">${receiptData.feConsecutivo}</span></div>` : ''}
      <div style="font-size:9px;font-family:monospace;word-break:break-all;line-height:1.2;">Clave: ${receiptData.feClave}</div>
    ` : ''}
    ${cfg.showDateTime ? `<div class="subtitle">${receiptData.date} ${receiptData.time}</div>` : ''}
  </div>

  ${storeBlock}

  <hr class="divider">

  ${customerBlock}
  ${bipperBlock}

  <div class="section-label">ARTÍCULOS</div>
  <table>
    ${itemsHTML}
  </table>

  <hr class="divider">

  ${(receiptData.tax > 0 || Number(receiptData.discount) || Number(receiptData.rounding)) ? `
  <table class="totals">
    ${receiptData.tax > 0 ? `<tr><td>IVA incluido:</td><td>₡${fmt(receiptData.tax)}</td></tr>` : ''}
    ${Number(receiptData.discount) ? `<tr><td>${receiptData.discountLabel || 'Combos/Desc.'}:</td><td>${Number(receiptData.discount) >= 0 ? '-' : '+'}₡${fmt(Math.abs(Number(receiptData.discount)))}</td></tr>` : ''}
    ${Number(receiptData.rounding) ? `<tr><td>Redondeo:</td><td>${Number(receiptData.rounding) >= 0 ? '+' : '-'}₡${fmt(Math.abs(Number(receiptData.rounding)))}</td></tr>` : ''}
  </table>

  <hr class="divider">
  ` : ''}

  <div class="total-line">TOTAL: ₡${fmt(receiptData.total)}</div>

  <hr class="divider">

  <div class="section-label">MÉTODO DE PAGO</div>
  ${receiptData.payments && receiptData.payments.length > 1
    ? `<div class="payment-block">${receiptData.payments.map(p => {
         const label = p.method === 'cash' ? 'Efectivo' : p.method === 'card' ? 'Tarjeta' : 'SINPE';
         const v = p.voucher_number ? ` <span style="font-size:10px;color:#666">#${p.voucher_number}</span>` : '';
         return `${label}: ₡${Number(p.amount).toLocaleString('es-CR')}${v}`;
       }).join('<br>')}</div>`
    : `<div class="payment-block">${receiptData.paymentMethod}</div>`}
${receiptData.isDelivery ? `
  <hr class="divider">
  <div class="section-label">DELIVERY</div>
  <div class="payment-block">
    Venta por delivery (no se cobra en caja)<br>
    ${receiptData.deliveryPlatform ? `Plataforma: ${receiptData.deliveryPlatform}<br>` : ''}
    Vendido: &#8353;${fmt(receiptData.total)}
    ${Number(receiptData.deliveryCommissionPct) > 0 ? `<br>Comisión: ${receiptData.deliveryCommissionPct}%<br>Neto: &#8353;${fmt(Number(receiptData.deliveryNet ?? 0))}` : ''}
  </div>` : ''}
${receiptData.currency === 'USD' && receiptData.exchangeRate ? `
  <hr class="divider">
  <div class="section-label">PAGO EN DÓLARES</div>
  <div class="payment-block">
    Tipo de cambio: &#8353;${fmt(receiptData.exchangeRate)} / $1<br>
    Total: $${(receiptData.total / receiptData.exchangeRate).toFixed(2)}
    ${receiptData.amountReceived ? `<br>Recibido: $${(receiptData.amountReceived / receiptData.exchangeRate).toFixed(2)}` : ''}
    ${Number(receiptData.change) > 0 ? `<br>Vuelto: ${receiptData.changeCurrency === 'USD' ? `$${(Number(receiptData.change) / receiptData.exchangeRate).toFixed(2)}` : `&#8353;${fmt(Number(receiptData.change))}`}` : ''}
  </div>` : ''}
${receiptData.simplificadoFooter && !receiptData.feClave ? `
  <hr class="divider">
  <div style="text-align:center;font-size:11px;font-weight:bold;margin-top:4px;">
    Autorizado mediante oficio 1197<br>r&eacute;gimen simplificado
  </div>` : ''}

  ${receiptData.feClave ? `
  <hr class="divider">
  <div style="text-align:center;font-size:11px;">
    ${receiptData.feQrDataUrl ? `<div style="margin-bottom:6px;"><img src="${receiptData.feQrDataUrl}" style="width:130px;height:130px;" alt="QR"/></div>` : ''}
    <div style="font-weight:bold;">${FE_RESOLUTION_FOOTER}</div>
  </div>
  ` : ''}

  ${cfg.showCashierName && receiptData.cashierName ? `<div class="cashier">Atendido por: ${receiptData.cashierName}</div>` : ''}

  <hr class="divider">

  <div class="footer">
    ${receiptData.footerMessage ?? cfg.footerMessage}<br>
    <span style="font-weight:normal;font-size:10px;">Vuelva pronto</span>
  </div>

</div>
</body>
</html>`;
  }

  // ─── ESC/POS commands ─────────────────────────────────────────────────────────

  private generateESCPOS(receiptData: ReceiptData, cfg: ReceiptConfig): Uint8Array {
    const charWidth = (typeof cfg.paperWidth === 'number' ? cfg.paperWidth : 48);
    const cmds: number[] = [];

    const push = (...bytes: number[]) => cmds.push(...bytes);
    // Encoder CP437 single-byte (NO UTF-8) — soporta acentos, ñ, ¡¿ correctamente.
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    // Separador con guion ASCII (0x2D). Antes usábamos 0xC4 (CP437 '─') pero
    // algunas impresoras (ej. MTP-4B) no respetan el code page y lo imprimían
    // como carácter chino. El '-' es universal y seguro.
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0x2D); nl(); };
    const centerText = (s: string) => { text(s.padStart((charWidth + s.length) / 2, ' ')); nl(); };
    const rightAlign = (label: string, val: string) => {
      const sp = Math.max(1, charWidth - label.length - val.length);
      text(label + ' '.repeat(sp) + val); nl();
    };

    // ── Init: preset "Xprinter chino que cancela GB18030 + CP437" ────────
    push(0x1B, 0x40);               // ESC @ — reset
    push(0x1C, 0x2E);               // FS . — CANCELAR modo chino (Xprinter)
    push(0x1B, 0x52, 0x00);         // ESC R 0 — charset internacional: USA
    push(0x1B, 0x74, 0x00);         // ESC t 0 — code page: CP437
    push(0x1B, 0x21, 0x00);         // ESC ! 0 — modo normal (sin negrita ni doble)

    // ── Comprobante de ANULACIÓN: solo el aviso + número + monto ──────────
    if (receiptData.voidNotice) {
      push(0x1B, 0x21, 0x30);       // doble alto + ancho
      centerText('FACTURA ANULADA');
      push(0x1B, 0x21, 0x00);       // normal
      if (cfg.showInvoiceNumber && receiptData.invoiceNumber) centerText(`#${receiptData.invoiceNumber}`);
      if (cfg.showDateTime) centerText(`${receiptData.date} ${receiptData.time}`);
      sep();
      push(0x1B, 0x21, 0x10);       // doble alto
      centerText(`TOTAL: ${receiptData.total.toLocaleString('es-CR')}`);
      push(0x1B, 0x21, 0x00);       // normal
      nl(); nl(); nl();
      push(0x1D, 0x56, 0x00);       // GS V 0 — corte (sin cajón ni "vuelva pronto")
      return new Uint8Array(cmds);
    }

    // Header
    centerText('=== TICKET DE VENTA ===');
    if (receiptData.copyLabel) { centerText(`** ${receiptData.copyLabel} **`); }
    if (cfg.showInvoiceNumber) { centerText(`#${receiptData.invoiceNumber}`); }
    // Comprobante electrónico: tipo + consecutivo + clave, junto al nº de factura.
    if (receiptData.feClave) {
      push(0x1B, 0x45, 0x01);        // negrita ON
      centerText(receiptData.feTipoLabel ?? 'COMPROBANTE ELECTRONICO');
      push(0x1B, 0x45, 0x00);        // negrita OFF
      if (receiptData.feConsecutivo) centerText(`Consecutivo: ${receiptData.feConsecutivo}`);
      text('Clave:'); nl(); text(receiptData.feClave); nl();
    }
    if (cfg.showDateTime) { centerText(`${receiptData.date} ${receiptData.time}`); }
    sep();

    // Store
    if (cfg.showStoreName && receiptData.storeName) { centerText(receiptData.storeName); }
    if (receiptData.storeRuc) { centerText(`Ced. Juridica: ${receiptData.storeRuc}`); }
    if (receiptData.storeCedula) { centerText(`Cedula: ${receiptData.storeCedula}`); }
    if (cfg.showStoreAddress && receiptData.storeAddress) { centerText(receiptData.storeAddress); }
    if (receiptData.storeCity) { centerText(receiptData.storeCity); }
    if (cfg.showStorePhone && receiptData.storePhone) { centerText(`Tel: ${receiptData.storePhone}`); }

    // Customer
    if (receiptData.customerName || receiptData.customerPhone || receiptData.customerEmail) {
      sep();
      text('CLIENTE:'); nl();
      if (receiptData.customerName) { centerText(receiptData.customerName); }
      if (receiptData.customerPhone) { centerText(`Tel: ${receiptData.customerPhone}`); }
      if (receiptData.customerEmail) { centerText(receiptData.customerEmail); }
    }

    // Bipper / localizador — DESTACADO (doble tamaño) para verlo de lejos.
    if (receiptData.bipper) {
      sep();
      push(0x1B, 0x21, 0x30);       // doble alto + ancho
      centerText(`BIPPER: ${receiptData.bipper}`);
      push(0x1B, 0x21, 0x00);       // normal
    }

    sep();
    text('ARTICULOS:'); nl();

    // Precios CON IMPUESTOS (precio final): la línea y el unitario se muestran con
    // el IVA incluido. Se usa la tasa efectiva del ticket (IVA total / base total).
    const effRate = receiptData.subtotal > 0 ? receiptData.tax / receiptData.subtotal : 0;
    const withTax = (n: number) => Math.round(n * (1 + effRate));
    for (const item of receiptData.items) {
      const price = `${withTax(item.subtotal).toLocaleString('es-CR')}`;
      const name = item.name.substring(0, charWidth - price.length - 1);
      const spaces = charWidth - name.length - price.length;
      text(name + ' '.repeat(Math.max(1, spaces)) + price); nl();
      text(`  ${item.quantity} x ${withTax(item.unitPrice).toLocaleString('es-CR')}`); nl();
    }

    sep();
    const fmt = (n: number) => `${n.toLocaleString('es-CR')}`;
    // Precios ya vienen CON IMPUESTOS; solo se informa el IVA incluido.
    if (receiptData.tax > 0) { rightAlign('IVA incluido:', fmt(receiptData.tax)); }
    if (Number(receiptData.discount)) { rightAlign(`${receiptData.discountLabel || 'Combos/Desc.'}:`, `${Number(receiptData.discount) >= 0 ? '-' : '+'}${fmt(Math.abs(Number(receiptData.discount)))}`); }
    if (Number(receiptData.rounding)) { rightAlign('Redondeo:', `${Number(receiptData.rounding) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(receiptData.rounding)))}`); }
    sep();

    centerText(`*** TOTAL: ${fmt(receiptData.total)} ***`);

    sep();
    text('PAGO:'); nl();
    if (receiptData.payments && receiptData.payments.length > 1) {
      for (const p of receiptData.payments) {
        const label = p.method === 'cash' ? 'Efectivo' : p.method === 'card' ? 'Tarjeta' : 'SINPE';
        rightAlign(label + ':', fmt(p.amount));
        if (p.voucher_number) centerText(`Ref: ${p.voucher_number}`);
      }
    } else {
      centerText(receiptData.paymentMethod);
    }
    // Delivery: informativo, no se contabiliza en caja.
    if (receiptData.isDelivery) {
      sep();
      centerText('DELIVERY');
      centerText('No se cobra en caja');
      if (receiptData.deliveryPlatform) rightAlign('Plataforma:', receiptData.deliveryPlatform);
      rightAlign('Vendido:', fmt(receiptData.total));
      if (Number(receiptData.deliveryCommissionPct) > 0) {
        rightAlign('Comision:', `${receiptData.deliveryCommissionPct}%`);
        rightAlign('Neto:', fmt(Number(receiptData.deliveryNet ?? 0)));
      }
    }
    // Pago en dólares: tipo de cambio + total/recibido/vuelto en $.
    if (receiptData.currency === 'USD' && receiptData.exchangeRate) {
      const r = receiptData.exchangeRate;
      sep();
      centerText('PAGO EN DOLARES');
      rightAlign('T.Cambio:', `${fmt(r)}/$1`);
      rightAlign('Total $:', (receiptData.total / r).toFixed(2));
      if (receiptData.amountReceived) rightAlign('Recibido $:', (receiptData.amountReceived / r).toFixed(2));
      if (Number(receiptData.change) > 0) {
        rightAlign('Vuelto:', receiptData.changeCurrency === 'USD'
          ? `$${(Number(receiptData.change) / r).toFixed(2)}`
          : fmt(Number(receiptData.change)));
      }
    }
    sep();
    // Régimen simplificado — solo si NO es comprobante electrónico (ese lleva
    // su propia leyenda de resolución, no el oficio 1197).
    if (receiptData.simplificadoFooter && !receiptData.feClave) {
      nl();
      centerText('Autorizado mediante oficio 1197');
      centerText('regimen simplificado');
      sep();
    }

    // ── Comprobante Electrónico (Hacienda): QR + leyenda (clave/consecutivo van arriba) ──
    if (receiptData.feClave) {
      const center = (on: boolean) => push(0x1B, 0x61, on ? 0x01 : 0x00); // ESC a
      center(true);

      // QR nativo ESC/POS (GS ( k, modelo 2). Los printers sin soporte lo ignoran.
      const qr = receiptData.feQrContent;
      if (qr) {
        const d: number[] = [];
        for (let i = 0; i < qr.length; i++) d.push(qr.charCodeAt(i) & 0xff);
        const len = d.length + 3;
        push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);       // modelo 2
        push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);             // tamaño módulo 6
        push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30);             // corrección L
        push(0x1D, 0x28, 0x6B, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...d); // datos
        push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);             // imprimir
        nl();
      }
      // Leyenda de resolución (envuelta al ancho del papel).
      const words = FE_RESOLUTION_FOOTER.split(' ');
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > charWidth) { centerText(line.trim()); line = w; }
        else line = (line + ' ' + w).trim();
      }
      if (line) centerText(line.trim());
      center(false);
      sep();
    }
    if (cfg.showCashierName && receiptData.cashierName) {
      centerText(`Atendido por: ${receiptData.cashierName}`);
    }

    sep();
    if (cfg.footerMessage) centerText(cfg.footerMessage);
    if (!receiptData.hideThanks) centerText('Vuelva pronto');

    // Abrir cajón de dinero — ANTES del corte. Algunas impresoras descartan los
    // comandos que llegan DESPUÉS de GS V (corte), por eso a veces no abría en
    // ciertos pagos (p. ej. efectivo). Mandándolo antes del corte abre siempre.
    // ESC p m t1 t2 — m=0 (pin 2), t1=25, t2=250 (duración del pulso).
    // Se omite si el negocio desactivó la apertura de cajón (cfg.openDrawer === false).
    if ((cfg as any).openDrawer !== false) {
      push(0x1B, 0x70, 0x00, 0x19, 0xFA);
    }

    // Feed antes del corte (lo justo para despegar, sin gastar papel).
    nl(); nl(); nl();
    push(0x1D, 0x56, 0x00);         // GS V 0 — full cut

    return new Uint8Array(cmds);
  }

  /** Envía solo el pulso de apertura de cajón por Bluetooth (botón manual en POS). */
  async openCashDrawer(tenantId: string): Promise<void> {
    const cfg = await this.loadReceiptConfig(tenantId);
    const bytes = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    const { btPrint, btPrintTo } = await import('./bluetoothPrinterService');
    const stations = (cfg.printers ?? []).filter(
      (p: any) => p.type === 'receipt' && p.is_active && p.connection === 'bluetooth',
    );
    if (stations.length > 0) {
      for (const st of stations) await btPrintTo(st.id, bytes);
    } else {
      await btPrint(bytes);
    }
  }
}

export const posPrinterService = new POSPrinterService({ width: 80 });
export default POSPrinterService;
