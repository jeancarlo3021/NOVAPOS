# 🧹 Guía de Limpieza - NovaPOS

Scripts para limpiar el localhost, IndexedDB, localStorage y operaciones pendientes.

## Opción 1: Limpieza Rápida (Shell)

```bash
./cleanup.sh
```

**Qué hace:**
- Detiene backend y frontend
- Libera puertos (3000, 3001, 5173)
- Proporciona comandos para limpiar el navegador

## Opción 2: Limpieza Completa (Node.js)

```bash
# Solo procesos y caché local
node cleanup-db.js

# Con limpieza de base de datos (si tienes .env.local)
node cleanup-db.js --db

# Limpieza completa (elimina TODAS las facturas y órdenes)
node cleanup-db.js --reset
```

**Qué hace:**
- Detiene servidores
- Libera puertos
- Opcionalmente limpia la base de datos Supabase
- Proporciona comandos para limpiar caché del navegador

## Pasos Completos de Limpieza

### 1. Ejecutar el script

```bash
node cleanup-db.js
```

### 2. Limpiar el navegador

Abre el navegador en `http://localhost:5173` (o donde sea) y ejecuta en la consola (F12 → Console):

```javascript
// Limpiar todo (IndexedDB, localStorage, sessionStorage, cookies):
(() => {
  indexedDB.databases().then(dbs => { 
    dbs.forEach(db => indexedDB.deleteDatabase(db.name)) 
  })
  localStorage.clear()
  sessionStorage.clear()
  document.cookie.split(';').forEach(c => {
    const eqPos = c.indexOf('=')
    const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim()
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;'
  })
  alert('✓ Caché del navegador limpiado. Recarga la página.')
})()
```

### 3. Recarga la página

```
Ctrl+R (Windows/Linux) o Cmd+R (Mac)
```

### 4. Reinicia los servidores

```bash
npm run dev
```

### 5. Inicia sesión

Usa tus credenciales normales.

---

## Qué se Limpia en Cada Opción

| Componente | `cleanup.sh` | `cleanup-db.js` | `--db` | `--reset` |
|---|---|---|---|---|
| Procesos Node.js | ✓ | ✓ | ✓ | ✓ |
| Puertos ocupados | ✓ | ✓ | ✓ | ✓ |
| IndexedDB | Manual | Manual | Manual | Manual |
| localStorage | Manual | Manual | Manual | Manual |
| sessionStorage | Manual | Manual | Manual | Manual |
| Cookies | Manual | Manual | Manual | Manual |
| Facturas (BD) | ✗ | ✗ | ✓ | ✓ |
| Órdenes de Compra (BD) | ✗ | ✗ | ✓ | ✓ |

---

## Solución de Problemas

### "Puerto 3001 ya está en uso"

```bash
# Matar procesos manualmente
lsof -i :3001 | grep -v COMMAND | awk '{print $2}' | xargs kill -9
```

### IndexedDB no se elimina completamente

Algunos datos pueden estar en múltiples bases de datos:
- `novapos_purchases`
- `novapos_pos`
- Otros prefijos de caché

El script intenta limpiar todas, pero si persisten:

```javascript
// En la consola del navegador
Object.keys(localStorage).forEach(key => {
  if (key.includes('novapos') || key.includes('cache')) {
    localStorage.removeItem(key)
  }
})
```

### "Token inválido" después de limpiar

Es normal. Simplemente inicia sesión nuevamente.

### La base de datos tiene datos pero `--db` no limpia

- Asegúrate de tener `.env.local` en la raíz del proyecto
- Verifica que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estén configurados
- Algunos registros pueden estar protegidos por RLS (Row Level Security)

---

## Casos de Uso

### Limpieza Completa (Recomendada)

Para empezar desde cero:

```bash
node cleanup-db.js --reset
# Luego abre el navegador y ejecuta el bloque de JavaScript
npm run dev
```

### Limpieza Rápida (Durante desarrollo)

Solo para resetear el estado local:

```bash
./cleanup.sh
# Rápida limpieza del navegador
npm run dev
```

### Depuración

Si algo está roto y necesitas empezar limpio:

```bash
node cleanup-db.js
# Luego abre DevTools y ejecuta la limpieza del navegador
# Recarga y reinicia
npm run dev
```

---

## Variables de Entorno Requeridas

Para que `--db` funcione, necesitas en `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Estas se cargan automáticamente desde `.env.local` o `.env.production.local`.
