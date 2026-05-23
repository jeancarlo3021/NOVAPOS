# Configuración del Mini Display/Monitor Integrado

Esta guía explica cómo configurar y probar el mini monitor numérico integrado en tu computadora POS.

## 🔌 Conexión del Monitor

El monitor integrado en tu computadora POS generalmente se conecta a través de uno de estos puertos:

### Opción 1: USB (Recomendado)
1. El monitor debería estar conectado internamente a la placa madre vía USB
2. El sistema detectará automáticamente la conexión
3. No se requiere configuración adicional

### Opción 2: Puerto Serie (COM)
1. Verifica que el puerto serie esté habilitado en BIOS
2. Por defecto usa velocidad de 9600 bauds
3. El sistema intentará conectar automáticamente

## 📊 Uso del Monitor

El monitor se **sincroniza automáticamente** con el carrito del POS:

- **Carrito vacío**: Muestra `0000`
- **Con productos**: Muestra el **total de la venta** en formato `₡12500`
- **Sin conexión**: Muestra `OFFLINE`

El monitor se actualiza en tiempo real cada vez que:
- Agregas un producto al carrito
- Cambias la cantidad de productos
- Aplicas descuentos o promociones
- Quitas un producto del carrito

## 🧪 Prueba del Monitor

### Opción 1: Desde el POS (Recomendado)
1. Abre el módulo POS (`/pos`)
2. Presiona **Ctrl + D** para abrir el panel de prueba
3. El panel de prueba te permite:
   - **Conectar**: Intenta conectar al display (USB primero, luego serie)
   - **Mostrar Total**: Muestra `₡12500` como ejemplo
   - **Mostrar Mensaje**: Muestra un mensaje personalizado (máx 16 caracteres)
   - **Limpiar**: Limpia la pantalla

### Opción 2: Prueba Manual
```javascript
// En la consola del navegador (F12 > Consola):

// Importar el servicio
import { displayService } from '@/services/pos/displayService';

// Conectar
await displayService.initialize({ type: 'usb' });

// Mostrar un total
await displayService.showTotal(5650);

// Mostrar un mensaje
await displayService.showMessage('PRUEBA');

// Limpiar
await displayService.clear();
```

## 🔧 Configuración Avanzada

### Si el USB no funciona, probar puerto serie:

```javascript
import { displayService } from '@/services/pos/displayService';

await displayService.initialize({ 
  type: 'serial',
  baudrate: 9600,
  port: 'COM3' // Cambiar según tu puerto
});
```

## ⚡ Solución de Problemas

| Problema | Solución |
|----------|----------|
| El display no se conecta | 1. Verifica que esté conectado correctamente<br>2. Intenta Ctrl+D y usa el botón "Conectar"<br>3. Revisa que los drivers USB estén instalados |
| Muestra caracteres raros | Los caracteres deben ser ASCII (0-127)<br>Evita caracteres especiales |
| No se sincroniza automáticamente | Recarga la página del POS<br>Verifica la conexión con Ctrl+D |
| Solo muestra números | Esto es normal en algunos displays de 7 segmentos<br>El sistema envía solo números con formato |

## 📋 Especificaciones del Display

- **Conexión**: USB o Serie (9600 baud)
- **Caracteres soportados**: ASCII (0-255)
- **Ancho**: Típicamente 16 caracteres
- **Actualización**: Cada cambio del carrito
- **Formato**: Texto o números con padding a la izquierda

## 🎯 Qué se muestra

```
Ejemplo de pantalla en diferentes estados:

Estado           | Mostrado
================|=============
Carrito vacío    | 0000
1 producto       | ₡1500
2 productos      | ₡3500
Con descuento    | ₡2975
Sin conexión     | OFFLINE
Mensaje custom   | PRUEBA (16 chars)
```

## 💡 Tips

- La primera conexión puede tomar unos segundos
- Si cambias puertos USB, desconecta y reconecta (Ctrl+D)
- El display se sincroniza silenciosamente en tiempo real
- No es necesario hacer nada especial - ¡funciona automáticamente!

## 📞 Support

Si tienes problemas:
1. Abre Ctrl+D en el POS
2. Intenta "Conectar" manualmente
3. Revisa la consola del navegador (F12) para mensajes de error
4. Verifica que el monitor esté correctamente conectado a la computadora

---

**Nota**: El sistema está diseñado para trabajar automáticamente. Simplemente abre el POS y el monitor se sincronizará automáticamente si está conectado correctamente.
