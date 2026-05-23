import { apiFetch } from '@/lib/api';
import {
  qzConnect, qzIsAvailable, qzPrintToPrinter,
  type PrinterEntry,
} from './qzTrayService';
import { formatComanda, type ComandaItem } from './comandaFormatter';

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
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  cashierName?: string;
  footerMessage?: string;
  logoUrl?: string;
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
  printerType: 'thermal' | 'browser' | 'qztray';
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

  async loadReceiptConfig(tenantId: string): Promise<ReceiptConfig> {
    try {
      const config = await apiFetch<ReceiptConfig>('/settings/receipt');
      if (!config) return this.getDefaultConfig();
      return { ...this.getDefaultConfig(), ...config };
    } catch {
      return this.getDefaultConfig();
    }
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

    // For Xprinter XP-80C and similar models that don't support ESC/POS,
    // use HTML printing directly via QZ Tray (no dialog)
    const html = this.generateHTML(receiptData, config);
    const receiptPrinters = (config.printers ?? []).filter(
      p => p.type === 'receipt' && p.is_active,
    );

    if (receiptPrinters.length > 0) {
      // Send HTML directly to each printer without dialog
      const qz = (window as any).qz;
      for (const printer of receiptPrinters) {
        const printerConfig = printer.connection === 'network'
          ? qz.configs.create({ host: printer.ip, port: printer.port ?? 9100 })
          : qz.configs.create(printer.printer_name);
        await qz.print(printerConfig, [{ type: 'html', format: 'plain', data: html }]);
      }
    } else {
      // Fallback: use browser print
      await this.printHTMLContent(html);
    }
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
    const html = this.generatePurchaseOrderHTML(order, cfg);

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
  }, cfg: ReceiptConfig): string {
    const fmt = (n: number) => `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
    const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' });
    const widthMM = cfg.paperWidth >= 80 ? '80mm' : cfg.paperWidth >= 58 ? '58mm' : '80mm';

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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.4; color: #000; background: #fff; width: ${widthMM}; }
    .receipt { width: 100%; padding: 3mm 3mm 6mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: 13px; font-weight: bold; text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 3px 0; }
    .section { font-weight: bold; font-size: 10px; border-bottom: 1px dashed #000; margin: 4px 0 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 1px 0; }
    th.right, td.right { text-align: right; }
    .item-name { width: 40%; }
    .item-qty  { width: 10%; text-align: center; }
    .item-price { width: 25%; text-align: right; }
    .total-row { font-size: 13px; font-weight: bold; border-top: 1px solid #000; padding-top: 2px; }
    .footer { text-align: center; font-size: 10px; margin-top: 4px; }
  </style>
</head>
<body>
<div class="receipt">
  <div class="center bold" style="font-size:15px; margin-bottom:2px;">ORDEN DE COMPRA</div>
  ${order.tenant_name ? `<div class="center" style="font-size:10px;">${order.tenant_name}</div>` : ''}
  <hr class="divider">
  <div class="bold">N°: ${order.purchase_number}</div>
  <div>Fecha: ${fmtDate(order.purchase_date)}</div>
  ${order.expected_delivery_date ? `<div>Entrega esperada: ${fmtDate(order.expected_delivery_date)}</div>` : ''}
  <hr class="divider">
  <div class="section">PROVEEDOR</div>
  <div class="bold">${order.supplier_name}</div>
  ${order.supplier_phone ? `<div>Tel: ${order.supplier_phone}</div>` : ''}
  <hr class="divider">
  <div class="section">PRODUCTOS</div>
  <table>
    <thead>
      <tr>
        <th class="item-name">Producto</th>
        <th class="item-qty" style="text-align:center">Cant</th>
        <th class="item-price right">Precio</th>
        <th class="item-price right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="divider">
  <table>
    <tr class="total-row">
      <td class="bold">TOTAL:</td>
      <td class="right" style="font-size:13px; font-weight:bold; text-align:right">${fmt(order.total_amount)}</td>
    </tr>
  </table>
  ${order.notes ? `<hr class="divider"><div class="section">NOTAS</div><div style="font-size:10px;">${order.notes}</div>` : ''}
  <hr class="divider">
  <div class="footer">Firma de recepción: ___________________</div>
  <div class="footer" style="margin-top:3px;">Fecha: _______________</div>
</div>
</body>
</html>`;
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

  private async waitForImages(doc: Document, timeoutMs = 3000): Promise<void> {
    const images = Array.from(doc.querySelectorAll('img'));
    if (images.length === 0) return;

    const promises = images.map(img => {
      if (img.complete && img.naturalHeight > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, timeoutMs); // Fallback
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

    const storeBlock = (
      (cfg.showStoreName && receiptData.storeName) ||
      (cfg.showStoreAddress && receiptData.storeAddress) ||
      (cfg.showStorePhone && receiptData.storePhone)
    ) ? `
      <div class="store-block">
        ${cfg.showStoreName && receiptData.storeName ? `<div class="bold">${receiptData.storeName}</div>` : ''}
        ${cfg.showStoreAddress && receiptData.storeAddress ? `<div>${receiptData.storeAddress}</div>` : ''}
        ${cfg.showStorePhone && receiptData.storePhone ? `<div>Tel: ${receiptData.storePhone}</div>` : ''}
      </div>
    ` : '';

    const customerBlock = cfg.showCustomerInfo && (receiptData.customerName || receiptData.customerPhone) ? `
      <div class="section-label">CLIENTE</div>
      <div class="customer-block">
        ${receiptData.customerName ? `<div>${receiptData.customerName}</div>` : ''}
        ${receiptData.customerPhone ? `<div>Tel: ${receiptData.customerPhone}</div>` : ''}
      </div>
    ` : '';

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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
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
      border-top: 3px solid #000;
      margin: 4px 0;
    }
    .header { text-align: center; margin-bottom: 5px; }
    .title { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
    .subtitle { font-size: 13px; color: #000; font-weight: 900; margin: 2px 0; }
    .store-block { text-align: center; font-size: 13px; margin: 4px 0; font-weight: 800; }
    .customer-block { font-size: 12px; margin: 3px 0 5px; font-weight: 800; }
    .section-label {
      font-weight: 900;
      font-size: 13px;
      border-top: 3px solid #000;
      border-bottom: 3px solid #000;
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
      border-top: 4px solid #000;
      border-bottom: 4px solid #000;
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
    ${receiptData.logoUrl ? `<div style="text-align:center;margin-bottom:6px;"><img src="${receiptData.logoUrl}" alt="Logo" style="max-height:80px;max-width:90%;object-fit:contain;display:inline-block;" crossorigin="anonymous"></div>` : ''}
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

  <table class="totals">
    <tr><td>Subtotal:</td><td>₡${fmt(receiptData.subtotal)}</td></tr>
    ${receiptData.tax > 0 ? `<tr><td>Impuesto:</td><td>₡${fmt(receiptData.tax)}</td></tr>` : ''}
  </table>

  <hr class="divider">

  <div class="total-line">TOTAL: ₡${fmt(receiptData.total)}</div>

  <hr class="divider">

  <div class="section-label">MÉTODO DE PAGO</div>
  <div class="payment-block">${receiptData.paymentMethod}</div>

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
    const text = (s: string) => {
      // Xprinter: only ASCII, no UTF-8
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        cmds.push(code > 127 ? 63 : code); // Replace non-ASCII with '?'
      }
    };
    const nl = () => push(0x0a);
    const sep = () => { text('-'.repeat(charWidth)); nl(); };
    const centerText = (s: string) => { text(s.padStart((charWidth + s.length) / 2, ' ')); nl(); };
    const rightAlign = (label: string, val: string) => {
      const sp = Math.max(1, charWidth - label.length - val.length);
      text(label + ' '.repeat(sp) + val); nl();
    };

    // Change codepage to ASCII/CP437 (Xprinter fix for GB18030 issue)
    push(0x1b, 0x74, 0x00); // ESC t 0 — CP437

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
    centerText(receiptData.paymentMethod);

    if (cfg.showCashierName && receiptData.cashierName) {
      centerText(`Cajero: ${receiptData.cashierName}`);
    }

    sep();
    centerText(cfg.footerMessage);
    centerText('Vuelva pronto');

    // Feed (sin comando de corte por ahora)
    nl(); nl(); nl(); nl();

    return new Uint8Array(cmds);
  }
}

export const posPrinterService = new POSPrinterService({ width: 80 });
export default POSPrinterService;
