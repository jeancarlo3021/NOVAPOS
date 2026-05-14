import { supabase } from '@/lib/supabase';
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
  qz_certificate?: string;
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
      const { data: rows, error } = await supabase
        .from('settings')
        .select('config')
        .eq('tenant_id', tenantId)
        .eq('type', 'receipt')
        .order('created_at', { ascending: false })
        .limit(1);

      const data = rows?.[0] ?? null;
      if (error || !data) return this.getDefaultConfig();
      return { ...this.getDefaultConfig(), ...(data.config as Partial<ReceiptConfig>) };
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
        console.warn('QZ Tray no disponible, usando impresora del navegador:', err);
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
    if (!qzIsAvailable()) throw new Error('QZ Tray no está instalado o no está corriendo');

    await qzConnect(config.qz_certificate);

    const escpos = this.generateESCPOS(receiptData, config);
    const receiptPrinters = (config.printers ?? []).filter(
      p => p.type === 'receipt' && p.is_active,
    );

    if (receiptPrinters.length > 0) {
      await Promise.all(receiptPrinters.map(p => qzPrintToPrinter(p, escpos)));
    } else {
      // Fallback: legacy single-printer config
      const qz = (window as any).qz;
      const printerConfig = qz.configs.create(config.printerName ?? null);
      await qz.print(printerConfig, [{ type: 'raw', format: 'command', data: escpos }]);
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
        if (!qzIsAvailable()) throw new Error('QZ Tray no disponible');
        await qzConnect(cfg.qz_certificate);
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
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        finally { setTimeout(() => { document.body.removeChild(iframe); resolve(); }, 500); }
      }, 400);
    });
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
    if (!qzIsAvailable()) return;

    const cfg = await this.loadReceiptConfig(tenantId);
    const comandaPrinters = (cfg.printers ?? []).filter(
      p => p.type === 'comanda' && p.is_active,
    );
    if (comandaPrinters.length === 0) return;

    await qzConnect(cfg.qz_certificate);

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

    await new Promise<void>((resolve) => {
      // Give the browser time to render fonts and images
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
      }, 400);
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
      font-size: 11px;
      line-height: 1.45;
      color: #000;
      background: #fff;
      width: ${widthMM};
    }
    .receipt {
      width: 100%;
      padding: 3mm 3mm 6mm;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 15px; font-weight: bold; text-align: center; }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 3px 0;
    }
    .header { text-align: center; margin-bottom: 4px; }
    .title { font-size: 13px; font-weight: bold; }
    .subtitle { font-size: 10px; color: #333; }
    .store-block { text-align: center; font-size: 10px; margin: 3px 0; }
    .customer-block { font-size: 10px; margin: 2px 0 4px; }
    .section-label {
      font-weight: bold;
      font-size: 10px;
      border-bottom: 1px dashed #000;
      margin: 4px 0 2px;
    }
    table { width: 100%; border-collapse: collapse; }
    .item-name { width: 55%; }
    .item-qty { width: 10%; text-align: right; }
    .item-price { width: 35%; text-align: right; }
    .item-detail { font-size: 10px; color: #444; }
    .totals { font-size: 11px; }
    .totals td:last-child { text-align: right; }
    .total-line { font-size: 14px; font-weight: bold; text-align: center; margin: 4px 0; }
    .payment-block { font-size: 11px; margin: 3px 0; }
    .footer { text-align: center; font-size: 11px; font-weight: bold; margin-top: 6px; }
    .cashier { text-align: center; font-size: 10px; color: #555; margin: 2px 0; }
  </style>
</head>
<body>
<div class="receipt">

  <div class="header">
    ${cfg.showLogo && receiptData.logoUrl ? `<img src="${receiptData.logoUrl}" alt="Logo" style="max-height:40px;margin-bottom:4px;">` : ''}
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
    const enc = new TextEncoder();

    const push = (...bytes: number[]) => cmds.push(...bytes);
    const text = (s: string) => cmds.push(...enc.encode(s));
    const nl = () => push(0x0a);
    const sep = () => { text('-'.repeat(charWidth)); nl(); };
    const bold = (on: boolean) => push(0x1b, 0x45, on ? 1 : 0);
    const align = (a: 'left' | 'center' | 'right') =>
      push(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
    const doubleHeight = (on: boolean) => push(0x1b, 0x21, on ? 0x10 : 0x00);

    // Init
    push(0x1b, 0x40); // ESC @ — initialize
    push(0x1b, 0x74, 0x00); // ESC t 0 — CP437 (safest for special chars)

    // Header
    align('center');
    bold(true);
    doubleHeight(true);
    text('TICKET DE VENTA'); nl();
    doubleHeight(false);
    bold(false);

    if (cfg.showInvoiceNumber) { text(`#${receiptData.invoiceNumber}`); nl(); }
    if (cfg.showDateTime) { text(`${receiptData.date} ${receiptData.time}`); nl(); }

    align('left');
    sep();

    // Store
    if (cfg.showStoreName && receiptData.storeName) { align('center'); text(receiptData.storeName); nl(); align('left'); }
    if (cfg.showStoreAddress && receiptData.storeAddress) { align('center'); text(receiptData.storeAddress); nl(); align('left'); }
    if (cfg.showStorePhone && receiptData.storePhone) { align('center'); text(`Tel: ${receiptData.storePhone}`); nl(); align('left'); }

    // Customer
    if (cfg.showCustomerInfo && (receiptData.customerName || receiptData.customerPhone)) {
      sep();
      bold(true); text('CLIENTE:'); bold(false); nl();
      if (receiptData.customerName) { text(receiptData.customerName); nl(); }
      if (receiptData.customerPhone) { text(`Tel: ${receiptData.customerPhone}`); nl(); }
    }

    sep();
    bold(true); text('ARTICULOS:'); bold(false); nl();

    for (const item of receiptData.items) {
      const price = `${item.subtotal.toLocaleString('es-CR')}`;
      const name = item.name.substring(0, charWidth - price.length - 1);
      const spaces = charWidth - name.length - price.length;
      text(name + ' '.repeat(Math.max(1, spaces)) + price); nl();
      text(`  ${item.quantity} x ${item.unitPrice.toLocaleString('es-CR')}`); nl();
    }

    sep();
    const fmt = (n: number) => `${n.toLocaleString('es-CR')}`;
    const totalLine = (label: string, val: string) => {
      const sp = charWidth - label.length - val.length;
      text(label + ' '.repeat(Math.max(1, sp)) + val); nl();
    };
    totalLine('Subtotal:', fmt(receiptData.subtotal));
    if (receiptData.tax > 0) { totalLine('Impuesto:', fmt(receiptData.tax)); }
    sep();

    align('center');
    bold(true);
    doubleHeight(true);
    text(`TOTAL: ${fmt(receiptData.total)}`); nl();
    doubleHeight(false);
    bold(false);
    align('left');

    sep();
    bold(true); text('PAGO:'); bold(false); nl();
    text(receiptData.paymentMethod); nl();

    if (cfg.showCashierName && receiptData.cashierName) {
      text(`Cajero: ${receiptData.cashierName}`); nl();
    }

    sep();
    align('center');
    bold(true);
    text(cfg.footerMessage); nl();
    bold(false);
    text('Vuelva pronto'); nl();
    align('left');

    // Feed & cut
    push(0x0a, 0x0a, 0x0a);
    push(0x1d, 0x56, 0x42, 0x00); // GS V B 0 — partial cut

    return new Uint8Array(cmds);
  }
}

export const posPrinterService = new POSPrinterService({ width: 80 });
export default POSPrinterService;
