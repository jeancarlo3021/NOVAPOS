// Script de detección automática del display LCD POS
// Prueba todos los puertos COM con múltiples protocolos
// Uso: npm run detect

const { SerialPort } = require('serialport');

const BAUD_RATES = [9600, 19200, 38400, 115200, 2400, 4800];
const TEST_AMOUNT = '12345.67';

// Protocolos a probar
const PROTOCOLS = {
  cd5220_simple: {
    name: 'CD5220 Simple',
    build: (text) => {
      const buf = [];
      buf.push(0x0C); // Clear
      for (const c of text) buf.push(c.charCodeAt(0));
      buf.push(0x0D); // CR
      return Buffer.from(buf);
    },
  },
  cd5220_dual: {
    name: 'CD5220 Doble Línea',
    build: (text) => {
      const buf = [];
      const line1 = 'TOTAL:'.padEnd(20, ' ');
      const line2 = text.padEnd(20, ' ');
      buf.push(0x0C);
      buf.push(0x1B, 0x51, 0x41); // ESC Q A - Línea 1
      for (const c of line1) buf.push(c.charCodeAt(0));
      buf.push(0x0D);
      buf.push(0x1B, 0x51, 0x42); // ESC Q B - Línea 2
      for (const c of line2) buf.push(c.charCodeAt(0));
      buf.push(0x0D);
      return Buffer.from(buf);
    },
  },
  esc_pos: {
    name: 'ESC/POS',
    build: (text) => {
      const buf = [];
      buf.push(0x1F, 0x40); // Initialize
      buf.push(0x1F, 0x43, 0x00); // Cursor off
      for (const c of text) buf.push(c.charCodeAt(0));
      return Buffer.from(buf);
    },
  },
  plain_text: {
    name: 'Texto Plano',
    build: (text) => Buffer.from(text + '\r\n'),
  },
  epson_dm: {
    name: 'Epson DM-D',
    build: (text) => {
      const buf = [];
      buf.push(0x0B); // Cursor to home
      for (const c of text) buf.push(c.charCodeAt(0));
      return Buffer.from(buf);
    },
  },
};

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (err) {
    console.error('❌ Error listando puertos:', err.message);
    return [];
  }
}

async function testPort(portPath, baudRate, protocol) {
  return new Promise((resolve) => {
    const port = new SerialPort({
      path: portPath,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });

    const timeout = setTimeout(() => {
      try { port.close(); } catch {}
      resolve(false);
    }, 2000);

    port.open((err) => {
      if (err) {
        clearTimeout(timeout);
        resolve(false);
        return;
      }

      try {
        const data = protocol.build(TEST_AMOUNT);
        port.write(data, (writeErr) => {
          clearTimeout(timeout);
          if (writeErr) {
            try { port.close(); } catch {}
            resolve(false);
          } else {
            setTimeout(() => {
              try { port.close(); } catch {}
              resolve(true);
            }, 500);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        try { port.close(); } catch {}
        resolve(false);
      }
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   🔍 Detección Automática de Display LCD POS      ║');
  console.log('║   Eyab Jwk / CD5220 / ESC-POS                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const ports = await listPorts();

  if (ports.length === 0) {
    console.log('❌ No se encontraron puertos COM disponibles\n');
    console.log('💡 Soluciones:');
    console.log('   1. Instala drivers del fabricante de la máquina POS');
    console.log('   2. Drivers genéricos comunes:');
    console.log('      • Prolific PL2303: https://www.prolific.com.tw/');
    console.log('      • Silicon Labs CP210x: https://www.silabs.com/');
    console.log('      • FTDI VCP: https://ftdichip.com/drivers/');
    console.log('   3. Verifica el Administrador de Dispositivos en Windows');
    return;
  }

  console.log(`✅ Puertos COM encontrados: ${ports.length}\n`);

  ports.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.path}`);
    if (p.manufacturer) console.log(`     Fabricante: ${p.manufacturer}`);
    if (p.vendorId) console.log(`     Vendor ID: 0x${p.vendorId}`);
    if (p.productId) console.log(`     Product ID: 0x${p.productId}`);
    console.log('');
  });

  console.log('🧪 Iniciando pruebas...\n');
  console.log('⚠️  IMPORTANTE: Mira tu LCD durante las pruebas\n');
  console.log('   Si ves "12345.67" en algún momento → ¡Ese protocolo funciona!\n');

  const results = [];

  for (const portInfo of ports) {
    console.log(`📍 Probando puerto: ${portInfo.path}`);
    console.log('─'.repeat(50));

    for (const baudRate of BAUD_RATES) {
      for (const [protoKey, protocol] of Object.entries(PROTOCOLS)) {
        process.stdout.write(`   ${protocol.name.padEnd(20)} @ ${baudRate.toString().padEnd(6)} baud → `);

        const success = await testPort(portInfo.path, baudRate, protocol);

        if (success) {
          console.log('✅ Enviado');
          results.push({
            port: portInfo.path,
            baudRate,
            protocol: protoKey,
            protocolName: protocol.name,
          });
        } else {
          console.log('❌ Falló');
        }

        // Pausa entre pruebas
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    console.log('');
  }

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                  📊 RESULTADOS                    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  if (results.length === 0) {
    console.log('❌ Ningún protocolo respondió exitosamente.\n');
    console.log('💡 Esto puede significar:');
    console.log('   • El display no usa puerto COM');
    console.log('   • Está conectado por GPIO o protocolo propietario');
    console.log('   • Necesita un driver específico del fabricante\n');
    return;
  }

  console.log('✅ Protocolos que escribieron al puerto:\n');
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.protocolName}`);
    console.log(`     Puerto: ${r.port}`);
    console.log(`     Baud:   ${r.baudRate}`);
    console.log(`     Comando: npm run start -- --port=${r.port} --baud=${r.baudRate} --protocol=${r.protocol}`);
    console.log('');
  });

  console.log('💡 Identificar el correcto:');
  console.log('   1. ¿Cuál mostró "12345.67" en el LCD?');
  console.log('   2. Anota: puerto, baud rate y protocolo');
  console.log('   3. Inicia el servidor con esa configuración');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
