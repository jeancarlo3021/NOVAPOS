# QZ Tray - Guía de Instalación e Integración

## ¿Qué es QZ Tray?

QZ Tray es una aplicación de escritorio que se ejecuta localmente en la máquina del usuario y expone una API WebSocket. Permite que aplicaciones web impriman directamente en impresoras locales (USB o de red) sin diálogos del navegador.

**Sitio oficial:** https://qz.io

---

## Propósito en NovaPOS

En NovaPOS, QZ Tray se usa para:
- ✅ Imprimir recibos térmicos directamente a impresoras POS
- ✅ Imprimir comandas de cocina en impresoras de red
- ✅ Imprimir órdenes de compra
- ✅ Soportar múltiples impresoras (USB y de red)

---

## Instalación de QZ Tray

### Paso 1: Descargar QZ Tray

1. Ve a https://qz.io/download
2. Descarga la versión para tu sistema operativo:
   - **Windows:** Descargable `.exe`
   - **macOS:** `.dmg`
   - **Linux:** `.deb` o `.rpm`

### Paso 2: Instalar

**Windows:**
```bash
# Ejecutar el instalador descargado
# Seguir las instrucciones del asistente
```

**macOS:**
```bash
# Abrir el .dmg y arrastrar QZ Tray.app a /Applications
# O ejecutar:
sudo installer -pkg QZ\ Tray.pkg -target /
```

**Linux (Debian/Ubuntu):**
```bash
sudo dpkg -i qz-tray_*.deb
```

### Paso 3: Iniciar QZ Tray

- QZ Tray se inicia automáticamente con el sistema (por defecto)
- Aparecerá un ícono en la bandeja del sistema
- Puerto por defecto: **8383** (WebSocket)

---

## Verificar Instalación

### En el Navegador

1. Abre la consola del navegador (F12)
2. Ejecuta:
```javascript
// Debería mostrar el objeto QZ
console.log(window.qz);
```

3. O intenta conectar:
```javascript
window.qz.websocket.connect().then(() => {
  console.log('✅ QZ Tray conectado');
}).catch(() => {
  console.log('❌ QZ Tray no disponible');
});
```

---

## Funciones Principales en NovaPOS

### 1. **qzIsAvailable()**
Verifica si QZ Tray está instalado y disponible.

```typescript
import { qzIsAvailable } from '@/services/pos/qzTrayService';

if (qzIsAvailable()) {
  console.log('✅ QZ Tray disponible');
} else {
  console.log('❌ QZ Tray no instalado');
}
```

### 2. **qzConnect(certificate?)**
Conecta a QZ Tray via WebSocket.

```typescript
import { qzConnect } from '@/services/pos/qzTrayService';

await qzConnect(); // Sin certificado (sitio en allow-list)
// O con certificado:
await qzConnect(publicCertificateString);
```

### 3. **qzDisconnect()**
Desconecta de QZ Tray.

```typescript
import { qzDisconnect } from '@/services/pos/qzTrayService';

await qzDisconnect();
```

### 4. **qzGetPrinters()**
Obtiene lista de impresoras disponibles.

```typescript
import { qzGetPrinters } from '@/services/pos/qzTrayService';

const printers = await qzGetPrinters();
console.log(printers); // ["Thermal Printer", "Network Printer", ...]
```

### 5. **qzPrintUSB(printerName, data)**
Imprime datos ESC/POS a una impresora USB.

```typescript
import { qzPrintUSB } from '@/services/pos/qzTrayService';

const escposData = new Uint8Array([...bytes...]);
await qzPrintUSB("Thermal Printer", escposData);
```

### 6. **qzPrintNetwork(ip, port, data)**
Imprime a una impresora de red via TCP socket.

```typescript
import { qzPrintNetwork } from '@/services/pos/qzTrayService';

await qzPrintNetwork("192.168.1.100", 9100, escposData);
```

### 7. **qzPrintToPrinter(printer, data)**
Imprime a cualquier impresora (USB o red) automáticamente.

```typescript
import { qzPrintToPrinter } from '@/services/pos/qzTrayService';

const printer = {
  id: 'printer-1',
  label: 'Cocina',
  type: 'comanda',
  connection: 'network',
  ip: '192.168.1.100',
  port: 9100,
  is_active: true,
};

await qzPrintToPrinter(printer, escposData);
```

---

## Uso en NovaPOS

### Imprimir Recibo Térmico

```typescript
import { posPrinterService } from '@/services/pos/posPrinterService';

const receiptData = {
  invoiceNumber: 'FAC-001',
  date: '22/05/2026',
  time: '14:30',
  items: [
    { name: 'Café', quantity: 2, unitPrice: 2500, subtotal: 5000 },
  ],
  subtotal: 5000,
  tax: 650,
  total: 5650,
  paymentMethod: 'Efectivo',
};

await posPrinterService.printAuto(receiptData, tenantId);
```

### Imprimir Comanda de Cocina

```typescript
import { posPrinterService } from '@/services/pos/posPrinterService';

const items = [
  { product: { name: 'Hamburguesa' }, quantity: 2 },
  { product: { name: 'Papas Fritas' }, quantity: 2 },
];

await posPrinterService.printComandas('FAC-001', items, tenantId, customerName);
```

### Probar Impresión

```typescript
await posPrinterService.printTest(tenantId);
```

---

## Configuración en Interfaz

### Ruta en Settings

**Configuración → Recibos → Tipo de Impresora**

Opciones:
- **Browser:** Imprime con diálogo del navegador
- **QZ Tray:** Imprime directamente via QZ Tray
- **Thermal:** Alias para QZ Tray

### Configurar Impresoras

En **Configuración → Impresoras**, puedes:
1. Agregar impresoras USB o de red
2. Establecer tipo (Recibo/Comanda)
3. Activar/desactivar por tipo

```typescript
interface PrinterEntry {
  id: string;
  label: string;           // "Principal", "Cocina", "Barra"
  type: 'receipt' | 'comanda';
  connection: 'usb' | 'network';
  printer_name?: string;   // USB: "Thermal Printer"
  ip?: string;             // Network: "192.168.1.100"
  port?: number;           // Network: 9100 (default)
  is_active: boolean;
}
```

---

## Seguridad: Certificado Digital

QZ Tray requiere **autenticación digital** si:
- Tu sitio NO está en la lista blanca de QZ (`https://qz.io/whitelist`)
- Necesitas seguridad adicional

### Generar Certificado

1. Ve a https://qz.io/account
2. Inicia sesión o crea cuenta
3. Genera par de claves (público + privado)
4. Guarda la **llave privada** en localStorage:

```typescript
const privateKey = "-----BEGIN PRIVATE KEY-----\n..."; // Tu llave privada
localStorage.setItem('qz_private_key', privateKey);
```

### Usar Certificado en Código

```typescript
const publicCert = "-----BEGIN CERTIFICATE-----\n...";
await qzConnect(publicCert);
```

---

## Troubleshooting

### ❌ "QZ Tray no está disponible"

**Solución:**
1. Verifica que QZ Tray esté instalado
2. Inicia QZ Tray desde el menú de inicio
3. Recarga la página del navegador
4. Verifica que `window.qz` exista en consola

### ❌ "No se puede conectar a QZ Tray"

**Solución:**
1. Verifica que QZ Tray esté corriendo (ícono en bandeja)
2. Reinicia QZ Tray
3. Verifica firewall (puerto 8383)
4. Revisa logs de QZ Tray

### ❌ Impresora no aparece en la lista

**Solución:**
1. Verifica que la impresora esté conectada/online
2. En Windows: Configuración → Dispositivos → Impresoras
3. En macOS: Sistema → Impresoras y Escáneres
4. Reinicia QZ Tray

### ❌ Impresión falla sin error

**Solución:**
1. Verifica que la impresora sea térmica (ESC/POS compatible)
2. Prueba con `printTest()` primero
3. Revisa conexión USB/red
4. Verifica papel en la impresora

---

## Referencia Rápida de Archivos

| Archivo | Propósito |
|---------|-----------|
| `src/services/pos/qzTrayService.ts` | API principal de QZ Tray |
| `src/services/pos/posPrinterService.ts` | Servicio de impresión (usa QZ Tray) |
| `src/modules/settings/components/Receipt/PrinterSettings.tsx` | Interfaz de configuración |
| `src/services/pos/comandaFormatter.ts` | Formatea comandas para impresora |

---

## Más Información

- **Documentación oficial:** https://qz.io/docs
- **API Reference:** https://qz.io/api
- **Community:** https://github.com/qzind
