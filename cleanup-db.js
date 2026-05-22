#!/usr/bin/env node

/**
 * Script de limpieza para NovaPOS
 * Limpia: procesos, puertos, caché local, y opcionalmente la base de datos
 *
 * Uso:
 *   node cleanup-db.js                 # Solo procesos y caché local
 *   node cleanup-db.js --db            # También limpiar base de datos (requiere .env)
 *   node cleanup-db.js --reset         # Limpieza completa (elimina todas las compras y facturas)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const shouldCleanDB = args.includes('--db');
const shouldReset = args.includes('--reset');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, text) {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function exec(cmd, silent = false) {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
    return output.trim();
  } catch (err) {
    if (!silent) {
      console.error(err.message);
    }
    return null;
  }
}

async function cleanup() {
  log('blue', '\n🧹 Iniciando limpieza de NovaPOS...\n');

  // 1. Matar procesos
  log('blue', '1️⃣  Deteniendo servidores...');
  exec('pkill -f "node.*backend"', true);
  log('green', '   ✓ Backend detenido');

  exec('pkill -f "vite"', true);
  log('green', '   ✓ Frontend detenido');

  // 2. Liberar puertos
  log('blue', '\n2️⃣  Liberando puertos...');
  const ports = [3000, 3001, 5173];
  for (const port of ports) {
    exec(`lsof -i :${port} 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs -r kill -9`, true);
    log('green', `   ✓ Puerto ${port} liberado`);
  }

  // 3. Mostrar instrucciones de limpieza local
  log('blue', '\n3️⃣  Limpieza del navegador (Manual)');
  log('yellow', '   Ejecuta esto en la consola del navegador (F12 → Console):');
  log('cyan', `
   // Limpiar todo (IndexedDB, localStorage, sessionStorage, cookies):
   (() => {
     indexedDB.databases().then(dbs => { dbs.forEach(db => indexedDB.deleteDatabase(db.name)) })
     localStorage.clear()
     sessionStorage.clear()
     document.cookie.split(';').forEach(c => {
       const eqPos = c.indexOf('=')
       const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim()
       document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;'
     })
     alert('✓ Caché del navegador limpiado. Recarga la página.')
   })()
   `);

  // 4. Limpieza de base de datos (opcional)
  if (shouldCleanDB || shouldReset) {
    log('blue', '\n4️⃣  Limpieza de base de datos...');
    await cleanDatabase(shouldReset);
  }

  // 5. Resumen
  log('green', '\n✅ Limpieza completada');
  log('yellow', '\nPróximos pasos:');
  log('cyan', '  1. Abre http://localhost:5173');
  log('cyan', '  2. Abre la consola (F12 → Console)');
  log('cyan', '  3. Copia y ejecuta el bloque de código anterior');
  log('cyan', '  4. Recarga la página (Ctrl+R)');
  log('cyan', '  5. Inicia sesión');
  log('cyan', '  6. Ejecuta: npm run dev\n');
}

async function cleanDatabase(reset = false) {
  try {
    // Cargar variables de entorno
    if (!fs.existsSync('.env.local')) {
      log('yellow', '   ⚠️  .env.local no encontrado, omitiendo limpieza de BD\n');
      return;
    }

    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const envLines = envContent.split('\n');
    const env = {};
    envLines.forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });

    const supabaseUrl = env['VITE_SUPABASE_URL'];
    const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

    if (!supabaseUrl || !supabaseKey) {
      log('yellow', '   ⚠️  Credenciales de Supabase no encontradas\n');
      return;
    }

    log('cyan', '   Conectando a Supabase...');

    // Crear cliente Supabase simple con fetch
    const cleanOps = async (table, label) => {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          log('green', `   ✓ Tabla '${label}' limpiada`);
        } else {
          log('yellow', `   ⚠️  Error limpiando '${label}': ${response.status}`);
        }
      } catch (err) {
        log('yellow', `   ⚠️  Error: ${err.message}`);
      }
    };

    // Importar fetch si es necesario (Node 18+)
    if (typeof fetch === 'undefined') {
      log('yellow', '   ⚠️  fetch no disponible, omitiendo limpieza de BD');
      return;
    }

    if (reset) {
      log('cyan', '   Eliminando datos...');
      await cleanOps('invoices', 'Facturas');
      await cleanOps('purchase_items', 'Items de Compra');
      await cleanOps('purchases', 'Órdenes de Compra');
    } else {
      log('cyan', '   Solo registros de prueba serían eliminados');
    }

  } catch (err) {
    log('yellow', `   ⚠️  Error accediendo a la BD: ${err.message}`);
  }
}

// Ejecutar
cleanup().catch(err => {
  log('red', `❌ Error: ${err.message}`);
  process.exit(1);
});
