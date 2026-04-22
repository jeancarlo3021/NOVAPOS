/**
 * Servicio de Impresión POS - Versión 2.0
 * Integrado con configuración de factura desde Supabase
 * Soporta impresoras térmicas ESC/POS
 * Compatible con: Epson, Star, Bixolon, Zebra
 */

import { supabase } from '@/lib/supabase';

export interface PrinterConfig {
  width?: number; // Ancho en caracteres (32, 40, 48, 56, 80)
  name?: string; // Nombre de la impresora
  encoding?: string; // Codificación (UTF-8, CP1252, etc)
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
  // Formato
  paperWidth: 32 | 40 | 48 | 56 | 80;
  showLogo: boolean;
  logoUrl?: string;

  // Contenido
  showStoreName: boolean;
  showStoreAddress: boolean;
  showStorePhone: boolean;
  showCashierName: boolean;
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCustomerInfo: boolean;
  footerMessage: string;

  // Impresora
  printerName?: string;
  printerType: 'thermal' | 'browser' | 'qztray';
  autoprint: boolean;
}

class POSPrinterService {
  private config: PrinterConfig;
  private width: number;
  private receiptConfig: ReceiptConfig | null = null;

  constructor(config: PrinterConfig = {}) {
    this.config = {
      width: 80,
      encoding: 'UTF-8',
      ...config,
    };
    this.width = this.config.width || 80;
  }

  /**
   * Carga la configuración de factura desde Supabase
   */
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
      if (error || !data) {
        console.warn('No se encontró configuración de factura, usando valores por defecto');
        return this.getDefaultConfig();
      }

      const cfg = this.getDefaultConfig();
      this.receiptConfig = (data?.config as ReceiptConfig) || cfg;
      this.width = this.receiptConfig.paperWidth;
      return this.receiptConfig;
    } catch (error) {
      console.error('Error cargando configuración de factura:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Obtiene la configuración por defecto
   */
  private getDefaultConfig(): ReceiptConfig {
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

  /**
   * Genera comandos ESC/POS para imprimir
   */
  private generateESCPOS(receiptData: ReceiptData): Uint8Array {
    const config = this.receiptConfig || this.getDefaultConfig();
    const commands: number[] = [];

    // Inicializar impresora
    commands.push(...this.ESC('M')); // Reset
    commands.push(...this.ESC('@')); // Initialize

    // Configurar codificación
    commands.push(...this.ESC('t', 33)); // UTF-8

    // Logo
    if (config.showLogo && receiptData.logoUrl) {
      commands.push(...this.centerText('🏪'));
      commands.push(...this.newLine());
    }

    // Encabezado
    commands.push(...this.centerText('🛒 TICKET DE VENTA'));
    commands.push(...this.newLine());

    // Número de Factura
    if (config.showInvoiceNumber) {
      commands.push(...this.centerText(`Factura #${receiptData.invoiceNumber}`));
      commands.push(...this.newLine());
    }

    // Fecha y Hora
    if (config.showDateTime) {
      commands.push(...this.centerText(`${receiptData.date} ${receiptData.time}`));
      commands.push(...this.newLine());
    }

    commands.push(...this.separator());

    // Datos del Negocio
    if (config.showStoreName && receiptData.storeName) {
      commands.push(...this.centerText(receiptData.storeName));
      commands.push(...this.newLine());
    }

    if (config.showStoreAddress && receiptData.storeAddress) {
      commands.push(...this.centerText(receiptData.storeAddress));
      commands.push(...this.newLine());
    }

    if (config.showStorePhone && receiptData.storePhone) {
      commands.push(...this.centerText(`Tel: ${receiptData.storePhone}`));
      commands.push(...this.newLine());
    }

    // Datos del cliente
    if (config.showCustomerInfo && (receiptData.customerName || receiptData.customerPhone)) {
      commands.push(...this.newLine());
      commands.push(...this.boldText('CLIENTE:'));
      if (receiptData.customerName) {
        commands.push(...this.text(receiptData.customerName));
        commands.push(...this.newLine());
      }
      if (receiptData.customerPhone) {
        commands.push(...this.text(`Tel: ${receiptData.customerPhone}`));
        commands.push(...this.newLine());
      }
    }

    commands.push(...this.separator());

    // Artículos
    commands.push(...this.boldText('ARTÍCULOS:'));

    receiptData.items.forEach((item) => {
      commands.push(...this.itemLine(item.name, item.subtotal));
      commands.push(...this.text(`  ${item.quantity}x ₡${item.unitPrice.toLocaleString()}`));
      commands.push(...this.newLine());
    });

    commands.push(...this.separator());

    // Totales
    commands.push(...this.totalLine('Subtotal:', receiptData.subtotal));
    commands.push(...this.totalLine('Impuesto (13%):', receiptData.tax));
    commands.push(...this.newLine());
    commands.push(...this.boldText('TOTAL:'));
    commands.push(...this.largeText(`₡${receiptData.total.toLocaleString()}`));
    commands.push(...this.newLine());

    // Método de pago
    commands.push(...this.separator());
    commands.push(...this.boldText('MÉTODO DE PAGO:'));
    commands.push(...this.text(receiptData.paymentMethod));
    commands.push(...this.newLine());

    // Nombre del Cajero
    if (config.showCashierName && receiptData.cashierName) {
      commands.push(...this.text(`Cajero: ${receiptData.cashierName}`));
      commands.push(...this.newLine());
    }

    // Pie de página
    commands.push(...this.separator());
    commands.push(...this.centerText(config.footerMessage));
    commands.push(...this.newLine());
    commands.push(...this.centerText('Vuelva pronto'));
    commands.push(...this.newLine());
    commands.push(...this.newLine());
    commands.push(...this.newLine());

    // Cortar papel
    commands.push(...this.cutPaper());

    return new Uint8Array(commands);
  }

  /**
   * Imprime usando la API Web Print
   */
  async printWebPrint(receiptData: ReceiptData): Promise<void> {
    try {
      const escpos = this.generateESCPOS(receiptData);

      // Crear blob con los comandos
      const blob = new Blob([escpos.buffer as ArrayBuffer], {
        type: 'application/octet-stream',
      });

      // Crear URL para descargar
      const url = URL.createObjectURL(blob);

      // Crear iframe para imprimir
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);

      // Esperar a que cargue y luego imprimir
      iframe.onload = () => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 1000);
      };
    } catch (error) {
      console.error('Error en impresión Web Print:', error);
      throw new Error('No se pudo imprimir con Web Print');
    }
  }

  /**
   * Imprime usando QZ Tray (Recomendado para POS)
   * Requiere: https://qz.io/
   */
  async printQZTray(receiptData: ReceiptData): Promise<void> {
    try {
      // Verificar si QZ Tray está disponible
      if (!(window as any).qz) {
        throw new Error('QZ Tray no está instalado. Descárgalo desde https://qz.io/');
      }

      const qz = (window as any).qz;

      // Conectar a QZ Tray
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect();
      }

      // Generar comandos ESC/POS
      const escpos = this.generateESCPOS(receiptData);

      // Configurar impresora
      const config = qz.configs.create(this.receiptConfig?.printerName || 'default');

      // Imprimir
      await qz.print(config, [escpos]);

      console.log('✅ Impresión enviada a QZ Tray');
    } catch (error) {
      console.error('Error en impresión QZ Tray:', error);
      throw new Error(`Error de impresión: ${error}`);
    }
  }

  /**
   * Imprime usando un iframe oculto dentro de la página actual
   * (no requiere popup, no es bloqueado por el navegador)
   */
  async printBrowser(receiptData: ReceiptData): Promise<void> {
    try {
      const html = this.generateHTML(receiptData);

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) throw new Error('No se pudo crear el documento de impresión');

      doc.open();
      doc.write(html);
      doc.close();

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            resolve();
          }, 1000);
        }, 300);
      });
    } catch (error) {
      console.error('Error en impresión del navegador:', error);
      throw new Error('No se pudo imprimir');
    }
  }

  /**
   * Imprime automáticamente según la configuración
   */
  async printAuto(receiptData: ReceiptData, tenantId: string): Promise<void> {
    try {
      // Cargar configuración si no está cargada
      if (!this.receiptConfig) {
        await this.loadReceiptConfig(tenantId);
      }

      const config = this.receiptConfig || this.getDefaultConfig();

      // Imprimir según el tipo configurado
      switch (config.printerType) {
        case 'thermal':
          await this.printQZTray(receiptData);
          break;
        case 'qztray':
          await this.printQZTray(receiptData);
          break;
        case 'browser':
          await this.printBrowser(receiptData);
          break;
        default:
          await this.printBrowser(receiptData);
      }

      console.log(`✅ Impresión completada (${config.printerType})`);
    } catch (error) {
      console.error('Error en impresión automática:', error);
      throw error;
    }
  }

  /**
   * Genera HTML para impresión
   */
  private generateHTML(receiptData: ReceiptData): string {
    const config = this.receiptConfig || this.getDefaultConfig();

    const itemsHTML = receiptData.items
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align: right;">${item.quantity}</td>
        <td style="text-align: right;">₡${item.unitPrice.toLocaleString()}</td>
        <td style="text-align: right;">₡${item.subtotal.toLocaleString()}</td>
      </tr>
    `
      )
      .join('');

    const widthMM = {
      32: '58mm',
      40: '80mm',
      48: '80mm',
      56: '80mm',
      80: '210mm',
    }[config.paperWidth] || '80mm';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket #${receiptData.invoiceNumber}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .receipt { width: ${widthMM}; }
          }
          body {
            font-family: 'Courier New', monospace;
            margin: 0;
            padding: 10px;
            background-color: #f5f5f5;
          }
          .receipt {
            width: ${widthMM};
            margin: 0 auto;
            background-color: white;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .logo {
            font-size: 32px;
            margin-bottom: 5px;
          }
          .title {
            font-size: 16px;
            font-weight: bold;
            margin: 5px 0;
          }
          .invoice-number {
            font-size: 12px;
            color: #666;
          }
          .store-info {
            text-align: center;
            font-size: 11px;
            margin: 5px 0;
            line-height: 1.4;
          }
          .section-title {
            font-weight: bold;
            margin-top: 10px;
            margin-bottom: 5px;
            border-bottom: 1px dashed #000;
            font-size: 12px;
          }
          .customer-info {
            font-size: 11px;
            margin: 5px 0;
            line-height: 1.4;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin: 5px 0;
          }
          td {
            padding: 3px;
          }
          .total-section {
            border-top: 2px dashed #000;
            border-bottom: 2px dashed #000;
            padding: 10px 0;
            margin: 10px 0;
            text-align: right;
            font-size: 12px;
          }
          .total-amount {
            font-size: 18px;
            font-weight: bold;
            margin: 10px 0;
            text-align: center;
          }
          .payment-method {
            font-size: 11px;
            margin: 5px 0;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            font-size: 12px;
            font-weight: bold;
          }
          .footer-message {
            margin: 10px 0;
          }
          .cashier-info {
            font-size: 10px;
            color: #666;
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            ${config.showLogo ? '<div class="logo">🏪</div>' : ''}
            <div class="title">🛒 TICKET DE VENTA</div>
            ${config.showInvoiceNumber ? `<div class="invoice-number">Factura #${receiptData.invoiceNumber}</div>` : ''}
            ${config.showDateTime ? `<div class="invoice-number">${receiptData.date} ${receiptData.time}</div>` : ''}
          </div>

          ${
            (config.showStoreName && receiptData.storeName) ||
            (config.showStoreAddress && receiptData.storeAddress) ||
            (config.showStorePhone && receiptData.storePhone)
              ? `
            <div class="store-info">
              ${config.showStoreName && receiptData.storeName ? `<div><strong>${receiptData.storeName}</strong></div>` : ''}
              ${config.showStoreAddress && receiptData.storeAddress ? `<div>${receiptData.storeAddress}</div>` : ''}
              ${config.showStorePhone && receiptData.storePhone ? `<div>Tel: ${receiptData.storePhone}</div>` : ''}
            </div>
          `
              : ''
          }

          ${
            config.showCustomerInfo && (receiptData.customerName || receiptData.customerPhone)
              ? `
            <div class="section-title">CLIENTE:</div>
            <div class="customer-info">
              ${receiptData.customerName ? `<div>${receiptData.customerName}</div>` : ''}
              ${receiptData.customerPhone ? `<div>Tel: ${receiptData.customerPhone}</div>` : ''}
            </div>
          `
              : ''
          }

          <div class="section-title">ARTÍCULOS:</div>
          <table>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">Producto</th>
              <th style="text-align: right;">Cant</th>
              <th style="text-align: right;">Precio</th>
              <th style="text-align: right;">Total</th>
            </tr>
            ${itemsHTML}
          </table>

          <div class="total-section">
            <div>Subtotal: ₡${receiptData.subtotal.toLocaleString()}</div>
            <div>Impuesto (13%): ₡${receiptData.tax.toLocaleString()}</div>
          </div>

          <div class="total-amount">TOTAL: ₡${receiptData.total.toLocaleString()}</div>

          <div class="section-title">MÉTODO DE PAGO:</div>
          <div class="payment-method">${receiptData.paymentMethod}</div>

          ${config.showCashierName && receiptData.cashierName ? `<div class="cashier-info">Cajero: ${receiptData.cashierName}</div>` : ''}

          <div class="footer">
            <div class="footer-message">${config.footerMessage}</div>
            <div>Vuelva pronto</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // ============ Comandos ESC/POS ============

  private ESC(...args: any[]): number[] {
    return [0x1b, ...args];
  }

  private newLine(): number[] {
    return [0x0a];
  }

  private text(str: string): number[] {
    return Array.from(new TextEncoder().encode(str));
  }

  private boldText(str: string): number[] {
    return [
      ...this.ESC('E', 1), // Bold on
      ...this.text(str),
      ...this.ESC('E', 0), // Bold off
      ...this.newLine(),
    ];
  }

  private largeText(str: string): number[] {
    return [
      ...this.ESC('!', 0x30), // Tamaño 2x
      ...this.text(str),
      ...this.ESC('!', 0x00), // Tamaño normal
      ...this.newLine(),
    ];
  }

  private centerText(str: string): number[] {
    return [
      ...this.ESC('a', 1), // Center
      ...this.text(str),
      ...this.newLine(),
      ...this.ESC('a', 0), // Left align
    ];
  }

  private itemLine(name: string, price: number): number[] {
    const priceStr = `₡${price.toLocaleString()}`;
    const padding = this.width - name.length - priceStr.length;
    const line = name + ' '.repeat(Math.max(1, padding)) + priceStr;
    return [...this.text(line), ...this.newLine()];
  }

  private totalLine(label: string, amount: number): number[] {
    const amountStr = `₡${amount.toLocaleString()}`;
    const padding = this.width - label.length - amountStr.length;
    const line = label + ' '.repeat(Math.max(1, padding)) + amountStr;
    return [...this.text(line), ...this.newLine()];
  }

  private separator(): number[] {
    return [...this.text('='.repeat(this.width)), ...this.newLine()];
  }

  private cutPaper(): number[] {
    return this.ESC('m'); // Full cut
  }
}

export const posPrinterService = new POSPrinterService({
  width: 80,
  encoding: 'UTF-8',
});

export default POSPrinterService;