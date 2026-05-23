# 🖥️ NovaPOS Display Server

Servidor local para controlar el LCD integrado de la máquina POS **Eyab Jwk**.

## 📋 Tu Configuración Detectada

Tu máquina tiene: **COM1, COM2, LPT1**

El LCD probablemente está en **COM1 o COM2** (LPT1 es para impresoras paralelas antiguas).

---

## 🚀 Instalación (5 minutos)

### **PASO 1: Instalar Node.js** (si no lo tienes)

1. Descarga desde: https://nodejs.org (versión LTS)
2. Instala con opciones por defecto
3. Verifica abriendo CMD: `node --version`

### **PASO 2: Instalar dependencias**

Abre CMD en esta carpeta (`display-server`) y ejecuta:

```bash
npm install
```

Esto instalará `express`, `cors` y `serialport`.

> ⚠️ Si falla `serialport`: instala primero las herramientas de compilación:
> ```bash
> npm install --global windows-build-tools
> ```

---

## 🧪 PASO 3: Encontrar la configuración correcta

### **Opción A: Prueba Interactiva (RECOMENDADO)** ⭐

```bash
npm test
```

Esto te preguntará:
1. ¿Qué puerto usar? → Elige COM1 o COM2
2. Probará cada combinación de baud rate y protocolo
3. **MIRA EL LCD durante cada prueba**
4. Cuando veas "12345.67" aparecer → presiona "s"
5. Te dará el comando exacto para iniciar el servidor

### **Opción B: Detección Automática**

```bash
npm run detect
```

Esto prueba TODAS las combinaciones automáticamente. Anota cuál mostró "12345.67".

---

## 🎯 PASO 4: Iniciar el servidor

Una vez identificaste la configuración correcta:

```bash
# Ejemplo (ajusta según lo que encontraste):
npm start -- --port=COM1 --baud=9600 --protocol=cd5220_dual
```

### Parámetros disponibles:

| Parámetro | Valores | Default |
|-----------|---------|---------|
| `--port` | COM1, COM2, COM3... | COM1 |
| `--baud` | 9600, 19200, 38400, 2400 | 9600 |
| `--protocol` | cd5220_simple, cd5220_dual, esc_pos, plain_text, epson_dm | cd5220_dual |
| `--http` | Puerto HTTP del servidor | 8888 |

---

## 🔄 PASO 5: Que se inicie automáticamente con Windows

### Opción A: Acceso directo en Inicio
1. Crea archivo `start-display.bat` con:
   ```batch
   @echo off
   cd /d "C:\ruta\a\display-server"
   npm start -- --port=COM1 --baud=9600 --protocol=cd5220_dual
   ```
2. Copia el .bat a: `C:\Users\TuUsuario\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

### Opción B: PM2 (servicio Windows)
```bash
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start server.js --name "display-server" -- --port=COM1 --baud=9600 --protocol=cd5220_dual
pm2 save
```

---

## ✅ Verificar que funciona

Abre el navegador en: http://localhost:8888/status

Deberías ver:
```json
{
  "running": true,
  "config": {
    "comPort": "COM1",
    "baudRate": 9600,
    "protocol": "cd5220_dual"
  },
  "portOpen": true
}
```

### Prueba manual:
```bash
# Mostrar un total en el LCD:
curl -X POST http://localhost:8888/total -H "Content-Type: application/json" -d "{\"amount\":99.99}"
```

---

## 🐛 Solución de Problemas

| Problema | Solución |
|----------|----------|
| `Error: Access denied` | Otra app está usando el puerto. Cierra software POS antiguo |
| `Port not found` | Verifica en Administrador de dispositivos > Puertos COM y LPT |
| LCD no muestra nada | Prueba con otro protocolo. CD5220 es el más común |
| LCD muestra basura | Cambia el baud rate (prueba 2400 o 19200) |
| `npm install` falla | Instala Visual Studio Build Tools |

---

## 📡 Endpoints HTTP disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Estado del servidor |
| GET | `/ports` | Lista de puertos COM |
| POST | `/display` | Enviar texto: `{text: "..."}` |
| POST | `/total` | Mostrar total: `{amount: 123.45}` |
| POST | `/clear` | Limpiar display |
| POST | `/test` | Mostrar "12345.67" de prueba |
| POST | `/config` | Cambiar config sin reiniciar |

---

## 🔗 Integración con NovaPOS

Una vez el servidor esté funcionando, el frontend de NovaPOS detectará automáticamente el servidor en `localhost:8888` y enviará el total cada vez que cambies el carrito.

No requiere configuración adicional en el navegador.
