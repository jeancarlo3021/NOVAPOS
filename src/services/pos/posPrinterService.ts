/**
 * Servicio de Impresión POS
 * Soporta impresoras térmicas ESC/POS
 * Compatible con: Epson, Star, Bixolon, Zebra
 */

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
  cashierName?: string;
}

class POSPrinterService {
  private config: PrinterConfig;
  private width: number;

  constructor(config: PrinterConfig = {}) {
    this.config = {
      width: 80,
      encoding: 'UTF-8',
      ...config,
    };
    this.width = this.config.width || 80;
  }

  /**
   * Genera comandos ESC/POS para imprimir
   */
  private generateESCPOS(receiptData: ReceiptData): Uint8Array {
    const commands: number[] = [];

    // Inicializar impresora
    commands.push(...this.ESC('M')); // Reset
    commands.push(...this.ESC('@')); // Initialize

    // Configurar codificación
    commands.push(...this.ESC('t', 33)); // UTF-8

    // Encabezado
    commands.push(...this.centerText('🛒 TICKET DE VENTA'));
    commands.push(...this.newLine());
    commands.push(...this.centerText(`Factura #${receiptData.invoiceNumber}`));
    commands.push(...this.newLine());
    commands.push(...this.centerText(`${receiptData.date} ${receiptData.time}`));
    commands.push(...this.newLine());
    commands.push(...this.separator());

    // Datos del cliente
    if (receiptData.customerName || receiptData.customerPhone) {
      commands.push(...this.newLine());
      commands.push(...this.boldText('CLIENTE:'));
      if (receiptData.customerName) {
        commands.push(...this.text(receiptData.customerName));
      }
      if (receiptData.customerPhone) {
        commands.push(...this.text(`Tel: ${receiptData.customerPhone}`));
      }
      commands.push(...this.newLine());
    }

    // Artículos
    commands.push(...this.boldText('ARTÍCULOS:'));
    commands.push(...this.newLine());

    receiptData.items.forEach((item) => {
      commands.push(...this.itemLine(item.name, item.subtotal));
      commands.push(...this.text(`${item.quantity}x ₡${item.unitPrice.toLocaleString()}`));
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

    // Pie de página
    commands.push(...this.separator());
    commands.push(...this.centerText('¡GRACIAS POR SU COMPRA!'));
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
      const blob = new Blob([escpos], { type: 'application/octet-stream' });

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
      const config = qz.configs.create(this.config.name || 'default');

      // Imprimir
      await qz.print(config, [escpos]);

      console.log('Impresión enviada a QZ Tray');
    } catch (error) {
      console.error('Error en impresión QZ Tray:', error);
      throw new Error(`Error de impresión: ${error}`);
    }
  }

  /**
   * Imprime usando la API de impresión del navegador
   */
  async printBrowser(receiptData: ReceiptData): Promise<void> {
    try {
      const html = this.generateHTML(receiptData);

      const printWindow = window.open('', '', 'height=600,width=800');
      if (!printWindow) {
        throw new Error('No se pudo abrir la ventana de impresión');
      }

      printWindow.document.write(html);
      printWindow.document.close();

      // Esperar a que cargue y luego imprimir
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error('Error en impresión del navegador:', error);
      throw new Error('No se pudo imprimir');
    }
  }

  /**
   * Genera HTML para impresión
   */
  private generateHTML(receiptData: ReceiptData): string {
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket #${receiptData.invoiceNumber}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .receipt { width: 80mm; }
          }
          body {
            font-family: 'Courier New', monospace;
            margin: 0;
            padding: 10px;
          }
          .receipt {
            width: 80mm;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
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
          .section-title {
            font-weight: bold;
            margin-top: 10px;
            margin-bottom: 5px;
            border-bottom: 1px dashed #000;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
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
          }
          .total-amount {
            font-size: 18px;
            font-weight: bold;
            margin: 10px 0;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="title">🛒 TICKET DE VENTA</div>
            <div class="invoice-number">Factura #${receiptData.invoiceNumber}</div>
            <div class="invoice-number">${receiptData.date} ${receiptData.time}</div>
          </div>

          ${
            receiptData.customerName || receiptData.customerPhone
              ? `
            <div class="section-title">CLIENTE:</div>
            <div>${receiptData.customerName || ''}</div>
            <div>${receiptData.customerPhone ? 'Tel: ' + receiptData.customerPhone : ''}</div>
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
          <div>${receiptData.paymentMethod}</div>

          <div class="footer">
            <div style="margin-top: 20px;">¡GRACIAS POR SU COMPRA!</div>
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