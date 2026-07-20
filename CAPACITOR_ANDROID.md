# App Android (Capacitor) — Rastreo de camiones

La app del **repartidor** se empaqueta como app Android con Capacitor para poder
rastrear la ubicación **con la app cerrada o el teléfono bloqueado** (algo que la
web/PWA no puede). La oficina sigue usando la web normal.

Ya está listo en el código:
- `capacitor.config.ts` — configuración (appId `cr.colonclick.pos`, webDir `dist`).
- `src/services/distribution/truckTrackingService.ts` — inicia/detiene el rastreo
  con `@capacitor-community/background-geolocation` y postea a `/routes/ping-location`.
- `RouteRun.tsx` — arranca el rastreo cuando la ruta está **abierta** y lo detiene
  al cerrarla o salir. En web es **no-op** (no hace nada).

## Requisitos (una vez, en la máquina de build)
- **Android Studio** + SDK.
- **JDK 17**.

## Generar el proyecto Android (una vez)
```bash
npm install
npm run build              # genera dist/
npm run android:add        # crea la carpeta android/ (cap add android)
npm run cap:sync           # compila web + sincroniza a android/
```

## Permisos (revisar en android/app/src/main/AndroidManifest.xml)
El plugin agrega la mayoría, pero confirmá que estén:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

## Abrir en Android Studio y generar el APK
```bash
npm run android:open       # build + sync + abre Android Studio
```
En Android Studio: **Build → Build APK(s)** → instalás el `.apk` en el teléfono del
repartidor (o lo distribuís). Para Google Play: **Build → Generate Signed Bundle**.

## Cada vez que cambia la web
```bash
npm run cap:sync           # recompila la web y la sincroniza al proyecto Android
```

## Notas
- En modo desarrollo, el `server.url` de `capacitor.config.ts` se puede apuntar a la
  URL del sitio; por defecto usa los assets locales (`dist`).
- El teléfono pedirá permiso de ubicación **"Todo el tiempo"** y mostrará una
  notificación fija mientras rastrea (requisito de Android; es por transparencia).
- El rastreo solo corre con la **ruta abierta**; al cerrarla se apaga (privacidad).
