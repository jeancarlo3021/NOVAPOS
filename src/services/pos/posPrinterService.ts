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
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
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
}

export interface ReceiptConfig {
  paperWidth: 32 | 40 | 48 | 56 | 80;
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

  async loadReceiptConfig(tenantId: string): Promise<ReceiptConfig> {
    // Cache en memoria — evita API call en cada cobro
    if (this.cachedConfig && this.cachedConfigTenantId === tenantId) {
      return this.cachedConfig;
    }

    // Cache en localStorage como fallback rápido
    try {
      const cached = localStorage.getItem(`receipt_cfg_${tenantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.cachedConfig = parsed;
        this.cachedConfigTenantId = tenantId;
        // Refrescar en background (no bloquear)
        apiFetch<ReceiptConfig>('/settings/receipt')
          .then(config => {
            if (config) {
              const merged = { ...this.getDefaultConfig(), ...config };
              this.cachedConfig = merged;
              localStorage.setItem(`receipt_cfg_${tenantId}`, JSON.stringify(merged));
            }
          })
          .catch(() => {});
        return parsed;
      }
    } catch {}

    try {
      const config = await apiFetch<ReceiptConfig>('/settings/receipt');
      const merged = config ? { ...this.getDefaultConfig(), ...config } : this.getDefaultConfig();
      this.cachedConfig = merged;
      this.cachedConfigTenantId = tenantId;
      try { localStorage.setItem(`receipt_cfg_${tenantId}`, JSON.stringify(merged)); } catch {}
      return merged;
    } catch {
      return this.getDefaultConfig();
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
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  async printAuto(receiptData: ReceiptData, tenantId: string): Promise<void> {
    // Always reload config so we pick up latest settings changes
    const cfg = await this.loadReceiptConfig(tenantId);

    // Bluetooth: enviar bytes ESC/POS por Web Bluetooth.
    if (cfg.printerType === 'bluetooth') {
      try {
        const { btPrint } = await import('./bluetoothPrinterService');
        await btPrint(this.generateESCPOS(receiptData, cfg));
        return;
      } catch (err) {
        // Si falla la impresión BT, caemos al navegador como respaldo.
        console.warn('[print] Bluetooth falló, usando navegador:', err);
      }
    }

    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      try {
        await this.printQZTray(receiptData, cfg);
        return;
      } catch (err) {
      }
    }

    await this.printBrowser(receiptData, cfg);
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
    cash_total: number;
    card_total: number;
    sinpe_total: number;
    closing_amount: number;
    expected_amount: number;     // = opening + ventas en efectivo
    difference: number;
    invoices_count: number;
    invoices_total: number;
    cash_movements?: Array<{ type: 'in' | 'out'; amount: number; reason: string }>;
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

    const html = this.generateCashCloseHTML(report, cfg, general);

    if (cfg.printerType === 'qztray' || cfg.printerType === 'thermal') {
      try {
        if (!(await qzIsAvailable())) throw new Error('QZ Tray no disponible');
        await qzConnect();
        const receiptPrinters = (cfg.printers ?? []).filter(p => p.type === 'receipt' && p.is_active);
        if (receiptPrinters.length > 0) {
          const qz = (window as any).qz;
          for (const printer of receiptPrinters) {
            const printerCfg = printer.connection === 'network'
              ? qz.configs.create({ host: printer.ip, port: printer.port ?? 9100 })
              : qz.configs.create(printer.printer_name);
            await qz.print(printerCfg, [{ type: 'html', format: 'plain', data: html }]);
          }
          return;
        }
      } catch {
        // fall through to browser
      }
    }
    await this.printHTMLContent(html);
  }

  private generateCashCloseHTML(report: any, cfg: ReceiptConfig, general?: any): string {
    const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
    const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
    const widthMM = PAPER_WIDTH_MM[cfg.paperWidth] ?? '80mm';

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

  <div class="section">RESUMEN DE VENTAS</div>
  <table>
    <tr><td>Facturas emitidas:</td><td style="text-align:right">${report.invoices_count}</td></tr>
    <tr><td>Total ventas:</td><td style="text-align:right">${fmt(report.invoices_total)}</td></tr>
  </table>

  <div class="section">DESGLOSE</div>
  <table>
    <tr><td>Fondo inicial:</td><td style="text-align:right">${fmt(report.opening_amount)}</td></tr>
    <tr><td>Efectivo contado:</td><td style="text-align:right">${fmt(report.cash_total)}</td></tr>
    <tr><td>Tarjeta:</td><td style="text-align:right">${fmt(report.card_total)}</td></tr>
    <tr><td>SINPE:</td><td style="text-align:right">${fmt(report.sinpe_total)}</td></tr>
  </table>

  ${report.cash_movements && report.cash_movements.length > 0 ? `
    <div class="section">MOVIMIENTOS DE EFECTIVO</div>
    <table>${movementsRows}</table>
  ` : ''}

  <div class="total-line">CONTADO: ${fmt(report.closing_amount)}</div>
  <div class="meta" style="text-align:center"><strong>Esperado:</strong> ${fmt(report.expected_amount)}</div>

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
    const widthMM = PAPER_WIDTH_MM[cfg.paperWidth] ?? '80mm';

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
    const charWidth = cfg.paperWidth;
    const cmds: number[] = [];
    const push = (...bytes: number[]) => cmds.push(...bytes);
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0xC4); nl(); };
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
    nl(); nl(); nl(); nl();
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
    if (!(await qzIsAvailable())) return;

    const cfg = await this.loadReceiptConfig(tenantId);
    const comandaPrinters = (cfg.printers ?? []).filter(
      p => p.type === 'comanda' && p.is_active,
    );
    if (comandaPrinters.length === 0) return;

    await qzConnect();

    const now = new Date();
    const time = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

    await Promise.all(
      comandaPrinters.map(printer => {
        const data = formatComanda(
          { invoiceNumber, time, label: printer.label, items, customerName },
          42,
        );
        return qzPrintToPrinter(printer, data);
      }),
    );
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

  // ─── HTML receipt ─────────────────────────────────────────────────────────────

  generateHTML(receiptData: ReceiptData, cfg: ReceiptConfig): string {
    const widthMM = PAPER_WIDTH_MM[cfg.paperWidth] ?? '80mm';

    const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const itemsHTML = receiptData.items.map(item => `
      <tr>
        <td class="item-name">${item.name}</td>
        <td class="item-qty">${item.quantity}</td>
        <td class="item-price">₡${fmt(item.subtotal)}</td>
      </tr>
      <tr class="item-detail">
        <td colspan="3">&nbsp;&nbsp;${item.quantity} × ₡${fmt(item.unitPrice)}</td>
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

    const customerBlock = '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket #${receiptData.invoiceNumber}</title>
  <style>
    @page {
      size: ${widthMM} auto;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    @media print {
      /* Forzar threshold térmico en impresión */
      img {
        filter: url(#logoThermalThreshold) grayscale(1) contrast(5) brightness(0.4) saturate(0) !important;
        image-rendering: crisp-edges !important;
        image-rendering: -webkit-optimize-contrast !important;
        image-rendering: pixelated !important;
      }
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
    ${cfg.showDateTime ? `<div class="subtitle">${receiptData.date} ${receiptData.time}</div>` : ''}
  </div>

  ${storeBlock}

  <hr class="divider">

  ${customerBlock}

  <div class="section-label">ARTÍCULOS</div>
  <table>
    ${itemsHTML}
  </table>

  <hr class="divider">

  ${receiptData.tax > 0 ? `
  <table class="totals">
    <tr><td>Subtotal:</td><td>₡${fmt(receiptData.subtotal)}</td></tr>
    <tr><td>Impuesto:</td><td>₡${fmt(receiptData.tax)}</td></tr>
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
<hr class="divider">
  <div style="text-align:center;font-size:11px;font-weight:bold;margin-top:4px;">
    ${receiptData.simplificadoFooter
      ? 'Autorizado mediante oficio 1197<br>r&eacute;gimen simplificado'
      : 'R&eacute;gimen Tradicional'}
  </div>

  ${cfg.showCashierName && receiptData.cashierName ? `<div class="cashier">Cajero: ${receiptData.cashierName}</div>` : ''}

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
    const charWidth = cfg.paperWidth;
    const cmds: number[] = [];

    const push = (...bytes: number[]) => cmds.push(...bytes);
    // Encoder CP437 single-byte (NO UTF-8) — soporta acentos, ñ, ¡¿ correctamente.
    const text = (s: string) => { for (const b of encodeCP437(s)) cmds.push(b); };
    const nl = () => push(0x0a);
    // Línea separadora: byte 0xC4 de CP437 = '─' (línea horizontal continua,
    // 1px de grosor). Más fina y limpia que el guión ASCII '-'.
    const sep = () => { for (let i = 0; i < charWidth; i++) push(0xC4); nl(); };
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

    // Header
    centerText('=== TICKET DE VENTA ===');
    if (cfg.showInvoiceNumber) { centerText(`#${receiptData.invoiceNumber}`); }
    if (cfg.showDateTime) { centerText(`${receiptData.date} ${receiptData.time}`); }
    sep();

    // Store
    if (cfg.showStoreName && receiptData.storeName) { centerText(receiptData.storeName); }
    if (cfg.showStoreAddress && receiptData.storeAddress) { centerText(receiptData.storeAddress); }
    if (cfg.showStorePhone && receiptData.storePhone) { centerText(`Tel: ${receiptData.storePhone}`); }

    // Customer
    if (cfg.showCustomerInfo && (receiptData.customerName || receiptData.customerPhone)) {
      sep();
      text('CLIENTE:'); nl();
      if (receiptData.customerName) { centerText(receiptData.customerName); }
      if (receiptData.customerPhone) { centerText(`Tel: ${receiptData.customerPhone}`); }
    }

    sep();
    text('ARTICULOS:'); nl();

    for (const item of receiptData.items) {
      const price = `${item.subtotal.toLocaleString('es-CR')}`;
      const name = item.name.substring(0, charWidth - price.length - 1);
      const spaces = charWidth - name.length - price.length;
      text(name + ' '.repeat(Math.max(1, spaces)) + price); nl();
      text(`  ${item.quantity} x ${item.unitPrice.toLocaleString('es-CR')}`); nl();
    }

    sep();
    const fmt = (n: number) => `${n.toLocaleString('es-CR')}`;
    rightAlign('Subtotal:', fmt(receiptData.subtotal));
    if (receiptData.tax > 0) { rightAlign('Impuesto:', fmt(receiptData.tax)); }
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
    sep();
    // Régimen fiscal — justo debajo del método de pago.
    nl();
    if (receiptData.simplificadoFooter) {
      centerText('Autorizado mediante oficio 1197');
      centerText('regimen simplificado');
    } else {
      centerText('Regimen Tradicional');
    }
    sep();
    if (cfg.showCashierName && receiptData.cashierName) {
      centerText(`Cajero: ${receiptData.cashierName}`);
    }

    sep();
    centerText(cfg.footerMessage);
    centerText('Vuelva pronto');

    // Feed extra antes del corte (más papel para despegar cómodo)
    nl(); nl(); nl(); nl(); nl(); nl(); nl(); nl();
    push(0x1D, 0x56, 0x00);         // GS V 0 — full cut

    // Abrir cajón de dinero DESPUÉS de cortar (pulso al pin 2 del conector RJ11).
    // ESC p m t1 t2 — m=0 (pin 2), t1=25, t2=250 (duración del pulso).
    push(0x1B, 0x70, 0x00, 0x19, 0xFA);

    return new Uint8Array(cmds);
  }
}

export const posPrinterService = new POSPrinterService({ width: 80 });
export default POSPrinterService;
