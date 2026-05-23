// Servidor HTTP local para controlar el LCD POS
// Recibe peticiones desde el navegador y las envía al puerto COM
// Uso: npm start [-- --port=COM1 --baud=9600 --protocol=cd5220_dual]

const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');

// ─── Parsear argumentos de línea de comandos ───────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v;
  return acc;
}, {});

const CONFIG = {
  httpPort: parseInt(args.http || '8888', 10),
  comPort: args.port || 'COM1',
  baudRate: parseInt(args.baud || '9600', 10),
  protocol: args.protocol || 'cd5220_dual',
};

// ─── Protocolos soportados ─────────────────────────────────────────────────────
const PROTOCOLS = {
  cd5220_simple: (text) => {
    const buf = [0x0C]; // Clear
    for (const c of text) buf.push(c.charCodeAt(0));
    buf.push(0x0D);
    return Buffer.from(buf);
  },
  cd5220_dual: (text) => {
    const buf = [];
    const line1 = 'TOTAL:'.padEnd(20, ' ');
    const line2 = text.padEnd(20, ' ');
    buf.push(0x0C);
    buf.push(0x1B, 0x51, 0x41);
    for (const c of line1) buf.push(c.charCodeAt(0));
    buf.push(0x0D);
    buf.push(0x1B, 0x51, 0x42);
    for (const c of line2) buf.push(c.charCodeAt(0));
    buf.push(0x0D);
    return Buffer.from(buf);
  },
  esc_pos: (text) => {
    const buf = [0x1F, 0x40, 0x1F, 0x43, 0x00];
    for (const c of text) buf.push(c.charCodeAt(0));
    return Buffer.from(buf);
  },
  plain_text: (text) => Buffer.from(text + '\r\n'),
  epson_dm: (text) => {
    const buf = [0x0B];
    for (const c of text) buf.push(c.charCodeAt(0));
    return Buffer.from(buf);
  },
};

// ─── SerialPort ────────────────────────────────────────────────────────────────
let serialPort = null;
let lastError = null;

function openPort() {
  return new Promise((resolve, reject) => {
    if (serialPort?.isOpen) {
      resolve();
      return;
    }

    serialPort = new SerialPort({
      path: CONFIG.comPort,
      baudRate: CONFIG.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });

    serialPort.open((err) => {
      if (err) {
        lastError = err.message;
        console.error(`❌ Error abriendo ${CONFIG.comPort}:`, err.message);
        reject(err);
      } else {
        lastError = null;
        console.log(`✅ Puerto ${CONFIG.comPort} abierto a ${CONFIG.baudRate} baud`);
        resolve();
      }
    });

    serialPort.on('error', (err) => {
      lastError = err.message;
      console.error('⚠️ Error en puerto:', err.message);
    });
  });
}

async function writeToDisplay(text, protocolName) {
  await openPort();
  const protocol = PROTOCOLS[protocolName || CONFIG.protocol];
  if (!protocol) throw new Error(`Protocolo desconocido: ${protocolName}`);

  return new Promise((resolve, reject) => {
    const data = protocol(text);
    serialPort.write(data, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// ─── HTTP Server ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Status endpoint
app.get('/status', (_req, res) => {
  res.json({
    running: true,
    config: CONFIG,
    portOpen: serialPort?.isOpen ?? false,
    lastError,
    version: '1.0.0',
  });
});

// List available COM ports
app.get('/ports', async (_req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json({ ports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Write to display
app.post('/display', async (req, res) => {
  try {
    const { text, protocol } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Falta el campo "text"' });
    }
    await writeToDisplay(String(text), protocol);
    res.json({ success: true, displayed: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Show total
app.post('/total', async (req, res) => {
  try {
    const { amount } = req.body;
    const formatted = Number(amount || 0).toFixed(2);
    await writeToDisplay(formatted);
    res.json({ success: true, total: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear display
app.post('/clear', async (_req, res) => {
  try {
    await writeToDisplay('0.00');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test display
app.post('/test', async (req, res) => {
  try {
    const protocol = req.body?.protocol || CONFIG.protocol;
    await writeToDisplay('12345.67', protocol);
    res.json({ success: true, message: 'Mira el LCD - debería mostrar 12345.67' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconfigure (change port/baud/protocol on the fly)
app.post('/config', async (req, res) => {
  try {
    const { port, baud, protocol } = req.body;
    if (serialPort?.isOpen) {
      await new Promise(r => serialPort.close(() => r()));
    }
    if (port) CONFIG.comPort = port;
    if (baud) CONFIG.baudRate = parseInt(baud, 10);
    if (protocol) CONFIG.protocol = protocol;
    await openPort();
    res.json({ success: true, config: CONFIG });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Iniciar servidor ──────────────────────────────────────────────────────────
console.log('╔════════════════════════════════════════════════════╗');
console.log('║   🖥️  NovaPOS Display Server                       ║');
console.log('║   Servidor local para LCD integrado               ║');
console.log('╚════════════════════════════════════════════════════╝\n');

console.log('⚙️  Configuración:');
console.log(`   HTTP Port: ${CONFIG.httpPort}`);
console.log(`   COM Port:  ${CONFIG.comPort}`);
console.log(`   Baud Rate: ${CONFIG.baudRate}`);
console.log(`   Protocol:  ${CONFIG.protocol}\n`);

openPort()
  .then(() => {
    console.log('✅ Puerto serial listo\n');
  })
  .catch(() => {
    console.log('⚠️  Servidor iniciará pero puerto no está abierto\n');
    console.log('   Endpoints aún disponibles para reconfigurar:\n');
  });

app.listen(CONFIG.httpPort, '127.0.0.1', () => {
  console.log(`🚀 Servidor HTTP escuchando en http://localhost:${CONFIG.httpPort}\n`);
  console.log('📋 Endpoints disponibles:\n');
  console.log(`   GET  http://localhost:${CONFIG.httpPort}/status`);
  console.log(`   GET  http://localhost:${CONFIG.httpPort}/ports`);
  console.log(`   POST http://localhost:${CONFIG.httpPort}/display     {text: "..."}`);
  console.log(`   POST http://localhost:${CONFIG.httpPort}/total       {amount: 123.45}`);
  console.log(`   POST http://localhost:${CONFIG.httpPort}/test        {protocol: "..."}`);
  console.log(`   POST http://localhost:${CONFIG.httpPort}/clear`);
  console.log(`   POST http://localhost:${CONFIG.httpPort}/config      {port, baud, protocol}\n`);
  console.log('💡 Para probar desde el navegador, abre el POS y verás el total automáticamente\n');
});
