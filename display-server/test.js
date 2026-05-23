// Script de prueba interactiva - prueba cada protocolo y baud rate
// con confirmación del usuario
// Uso: npm run test

const { SerialPort } = require('serialport');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise(r => rl.question(q, r));

const BAUD_RATES = [9600, 19200, 2400, 4800, 38400];

const PROTOCOLS = {
  '1': { name: 'CD5220 Simple', build: (text) => {
    const buf = [0x0C];
    for (const c of text) buf.push(c.charCodeAt(0));
    buf.push(0x0D);
    return Buffer.from(buf);
  }},
  '2': { name: 'CD5220 Doble Línea', build: (text) => {
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
  }},
  '3': { name: 'ESC/POS', build: (text) => {
    const buf = [0x1F, 0x40, 0x1F, 0x43, 0x00];
    for (const c of text) buf.push(c.charCodeAt(0));
    return Buffer.from(buf);
  }},
  '4': { name: 'Texto Plano', build: (text) => Buffer.from(text + '\r\n') },
  '5': { name: 'Epson DM-D', build: (text) => {
    const buf = [0x0B];
    for (const c of text) buf.push(c.charCodeAt(0));
    return Buffer.from(buf);
  }},
};

async function sendTest(portPath, baudRate, protocol, text) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    });

    port.open((err) => {
      if (err) { reject(err); return; }

      const data = protocol.build(text);
      port.write(data, (writeErr) => {
        if (writeErr) {
          port.close();
          reject(writeErr);
        } else {
          setTimeout(() => {
            port.close();
            resolve();
          }, 500);
        }
      });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   🧪 Prueba Interactiva de Display POS            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Listar puertos
  const ports = await SerialPort.list();
  console.log('📍 Puertos COM disponibles:');
  ports.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.path} ${p.manufacturer ? '(' + p.manufacturer + ')' : ''}`);
  });
  console.log('');

  // Pedir puerto
  const portIdx = await ask('Selecciona puerto (número): ');
  const portPath = ports[parseInt(portIdx) - 1]?.path;
  if (!portPath) {
    console.log('❌ Puerto inválido');
    rl.close();
    return;
  }

  console.log(`\n✅ Puerto seleccionado: ${portPath}\n`);

  // Probar cada combinación
  for (const baud of BAUD_RATES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Probando @ ${baud} baud`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (const [key, proto] of Object.entries(PROTOCOLS)) {
      console.log(`\n🔧 Protocolo ${key}: ${proto.name}`);
      console.log(`   Enviando "12345.67" a ${portPath} @ ${baud}...`);

      try {
        await sendTest(portPath, baud, proto, '12345.67');
        console.log(`   ✅ Enviado exitosamente\n`);

        const answer = await ask(`   👁️  ¿Apareció "12345.67" en el LCD? (s/n/q para salir): `);

        if (answer.toLowerCase() === 'q') {
          console.log('\n👋 Saliendo...');
          rl.close();
          return;
        }

        if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'si') {
          console.log('\n');
          console.log('╔════════════════════════════════════════════════════╗');
          console.log('║         🎉 ¡CONFIGURACIÓN ENCONTRADA!             ║');
          console.log('╚════════════════════════════════════════════════════╝\n');
          console.log(`   Puerto:    ${portPath}`);
          console.log(`   Baud Rate: ${baud}`);
          console.log(`   Protocolo: ${proto.name} (${key === '1' ? 'cd5220_simple' : key === '2' ? 'cd5220_dual' : key === '3' ? 'esc_pos' : key === '4' ? 'plain_text' : 'epson_dm'})`);
          console.log('\n📝 Inicia el servidor con:');
          const protoKey = key === '1' ? 'cd5220_simple' : key === '2' ? 'cd5220_dual' : key === '3' ? 'esc_pos' : key === '4' ? 'plain_text' : 'epson_dm';
          console.log(`   npm start -- --port=${portPath} --baud=${baud} --protocol=${protoKey}\n`);
          rl.close();
          return;
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}\n`);
      }
    }
  }

  console.log('\n\n❌ No se encontró configuración funcional');
  console.log('💡 Prueba con otro puerto COM\n');
  rl.close();
}

main().catch(err => {
  console.error('Error:', err);
  rl.close();
});
