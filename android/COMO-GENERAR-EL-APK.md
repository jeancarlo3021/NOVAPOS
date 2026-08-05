# Cómo generar el APK de ColónClick

Todo se hace desde `/home/jk/NovaPOS`. **Nunca** desde `/home/jk/Documents/NovaPOS`:
esa es una copia vieja sin Capacitor, y da el error
`android platform has not been added yet`.

```bash
cd /home/jk/NovaPOS
ls android        # si dice "No existe", estás en la carpeta equivocada
```

---

## 1. Subir la versión

En [`android/app/build.gradle`](app/build.gradle):

```gradle
versionCode 1        // ← +1 en CADA publicación
versionName "1.0"    // ← lo que ve el usuario: "1.1", "2.0"…
```

`versionCode` tiene que subir sí o sí. Si no, los teléfonos que ya tienen la app
**no ofrecen la actualización** — Android la considera la misma versión y la
instalación falla en silencio.

## 2. Compilar

```bash
npm run android:apk
```

Ese comando hace los tres pasos de una: `vite build` → `cap sync android` →
`gradlew assembleRelease`. Tarda 1–2 minutos la primera vez.

El archivo queda en:

```
android/app/build/outputs/apk/release/app-release.apk
```

Si sale `app-release-unsigned.apk` en vez de `app-release.apk`, falta
`android/keystore.properties` (ver «Si cambiás de computadora»).

Para probar algo rápido en tu propio teléfono sirve la versión de depuración,
que compila más rápido:

```bash
npm run android:apk:dev
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## 3. Publicarlo

Dos opciones. La segunda es mejor.

**a) Dentro del sitio** — hay que redesplegar en cada versión y el archivo
engorda el repositorio:

```bash
cp android/app/build/outputs/apk/release/app-release.apk public/app/colonclick.apk
```

y desplegá el sitio como siempre. Después hay que apuntar el módulo a
`/app/colonclick.apk` con el botón «Cambiar enlace de descarga».

**b) En Supabase Storage (es la que está en uso)** — el módulo ya apunta por
defecto a:

```
https://hdmxpjscmkgfettmqcyl.supabase.co/storage/v1/object/public/app/app-release.apk
```

Publicar una versión nueva es **reemplazar ese archivo en el bucket `app`**. No
hace falta redesplegar el sitio ni tocar código. Mantené el mismo nombre de
archivo (`app-release.apk`) o el enlace deja de servir.

## 4. Instalarlo en el teléfono

1. Abrí el módulo **App de Android** en el POS y escaneá el código QR (o abrí el
   enlace directamente desde el teléfono).
2. Descargá y tocá **Abrir**.
3. Android avisa que no viene de Play Store → **Configuración** → activar
   **Permitir de esta fuente** → atrás → **Instalar**.

La primera vez que se use, la app va a pedir dos permisos:

- **Bluetooth** — para imprimir tiquetes térmicos.
- **Ubicación** — para el rastreo de camiones. Android **nunca** ofrece
  «Permitir todo el tiempo» en el primer diálogo: hay que entrar a
  **Ajustes → Permisos → Ubicación → Permitir todo el tiempo**. El POS muestra un
  aviso con un botón que lleva directo ahí.

---

## Si algo falla

| Error | Qué pasa |
|---|---|
| `android platform has not been added yet` | Estás en la carpeta equivocada. `cd /home/jk/NovaPOS`. |
| `invalid source release: 21` | Gradle está usando un JDK viejo. Ya está fijado el 21 en [`gradle.properties`](gradle.properties); si cambiás de máquina, ajustá ahí la ruta. |
| Sale `app-release-unsigned.apk` | Falta `android/keystore.properties` (ver abajo). |
| «Aplicación no instalada» en el teléfono | El APK no está firmado, o el `versionCode` no subió, o hay una versión firmada con OTRA llave ya instalada. |

## Si cambiás de computadora

`android/keystore.properties` y `android/colonclick-release.jks` **no están en el
repositorio** a propósito: con esa llave cualquiera puede publicar una app que
Android acepta como si fuera la nuestra. Copiá los dos archivos a mano a
`android/` en la máquina nueva.

> **La llave no se puede perder.** Android solo acepta actualizaciones firmadas
> con la misma llave. Sin ella habría que publicar la app como otra aplicación
> distinta y que cada negocio la desinstale y la vuelva a instalar. Guardá una
> copia del `.jks` y de su contraseña fuera de la computadora.
