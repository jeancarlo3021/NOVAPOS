# Tests E2E con Playwright

Esta carpeta contiene los tests end-to-end del **frontend** (Vite + React).
Para los tests del backend, mirá `../NovaPos-Backend/NovaPOS-BACKEND/tests/api/`.

---

## Instalación (1 sola vez)

```bash
# Desde la raíz del proyecto NovaPOS
npm install
npm run test:e2e:install     # baja el binario de Chromium
```

> ⚠️ **Fedora/Linux no-Debian**: el flag `--with-deps` falla porque Playwright
> asume Ubuntu/Debian con `apt-get`. Tenés que instalar las deps del sistema
> manualmente:
>
> ```bash
> sudo dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
>   libxkbcommon libXcomposite libXdamage libXfixes libXrandr \
>   mesa-libgbm libxshmfence alsa-lib pango cairo
> ```
>
> En Arch usá `pacman -S` con paquetes equivalentes. En Ubuntu/Debian podés
> usar `npm run test:e2e:install -- --with-deps` (con guión doble).

## Correr los tests

```bash
# Headless (rápido, sin UI) — para CI o checks rápidos
npm run test:e2e

# Interactivo (recomendado para escribir/debuggear tests)
npm run test:e2e:ui

# Headed (ves el browser real ejecutándose)
npm run test:e2e:head

# Correr un archivo específico
npx playwright test e2e/login.spec.ts

# Correr un test específico por nombre
npx playwright test --grep "renderiza con título"
```

## Reportes

Después de correr, podés ver el HTML report:

```bash
npx playwright show-report
```

## Estructura de tests

| Archivo | Cubre |
|---|---|
| `smoke.spec.ts` | App arranca, manifest, sitemap, robots, redirect al login |
| `login.spec.ts` | Form de login, validaciones, toggle password, redirects |
| `seo.spec.ts`   | meta tags, canonical, og tags, PWA manifest, favicon |

## CI

En CI (GitHub Actions u otro):

```yaml
- name: Install
  run: npm ci

- name: Install Playwright
  run: npx playwright install chromium --with-deps

- name: Run E2E
  run: npm run test:e2e

- name: Upload report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

## Tips

1. **El dev server arranca solo**: la config de `playwright.config.ts` lo levanta
   con `npm run dev`. Si ya está corriendo en otro terminal, lo detecta
   (`reuseExistingServer: true`).

2. **Para tests autenticados** mockeá Supabase o usá `page.context().addCookies()`
   con un token de prueba. NO uses credenciales reales en CI.

3. **Variable de entorno opcional**: `E2E_BASE_URL` para apuntar a otra URL
   (ej. preview de Vercel en lugar de localhost).

   ```bash
   E2E_BASE_URL=https://preview-xyz.vercel.app npm run test:e2e
   ```
