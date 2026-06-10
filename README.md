# NovaPOS / ColónClick

Sistema **multi-empresa de Punto de Venta y ERP ligero** para pymes de Costa Rica.
Cubre punto de venta, inventario, compras, gastos, promociones, recetas, facturación electrónica
ante Hacienda CR, multi-sucursal y administración SaaS por planes.

---

## Stack

**Frontend** — React 19 + Vite 8 + TypeScript + Tailwind 4 + react-router 7
**Backend** — Hono + Supabase (Postgres + Auth + RLS) + Service-role para operaciones server-side
**Tests** — Playwright (e2e) + tests de API HTTP en el backend
**Offline** — IndexedDB + cola de operaciones que se sincroniza al volver online
**Impresión** — ESC/POS directo (Xprinter, etc.) + fallback HTML/browser print

---

## Para qué sirve

NovaPOS es la **app del negocio** (lo que ve el dueño de un negocio: vende, controla inventario,
ve reportes). ColónClick es el **mismo producto** vendido como SaaS, con un panel de administración
adicional para gestionar los negocios suscritos.

### Módulos del producto

| Módulo | Descripción | Ruta |
|---|---|---|
| **POS** | Punto de venta táctil/escritorio, multi-tab, cash sessions, anulación, impresión térmica | `/pos` |
| **Inventario** | Productos, categorías, unidades, stock mixto, stock por bodega, ajustes, CABYS, IVA por producto | `/inventory` |
| **Clientes** | CRUD de clientes con identificación, dirección, contacto | `/customers` |
| **Compras** | Órdenes de compra a proveedores, recepción, cuentas por pagar | `/purchases` |
| **Gastos** | Gastos puntuales y recurrentes, categorías, alertas de vencimiento | `/expenses` |
| **Cuentas por Pagar** | Pagos a proveedores con seguimiento | `/accounts-payable` |
| **Promociones** | Descuentos, ofertas, condiciones por producto/categoría | `/promotions` |
| **Reportes** | Ventas, productos, cajas, gastos, compras, stock | `/reports` |
| **Recetas** | Productos compuestos (insumos → producto final) | `/recipes` |
| **Mapa de Mesas** | Canvas drag-and-drop para restaurantes | `/tables` |
| **Cobro por Mesas** | Cuentas abiertas por mesa, dividir cuenta | `/billing` |
| **Sucursales y Bodegas** | Branches y warehouses dentro de un mismo tenant | `/branches` |
| **Transferencias** | Entre bodegas del mismo tenant + cross-sucursal del grupo | `/transfers` |
| **Usuarios** | Gestión de usuarios, roles, permisos por rol, actividad, equipos, turnos, PIN | `/users` |
| **Configuración** | Negocio, impresoras, facturación electrónica, kiosk, vista del POS | `/settings` |
| **Panel Admin (SaaS)** | Gestión de tenants, grupos, planes, comprobantes, FE/Kiosk por sucursal | `/create-owner` |

---

## Arquitectura multi-empresa

NovaPOS soporta **grupos de empresas**: un dueño puede tener varias sucursales como tenants
independientes (con su propio plan FE, su propio inventario) y administrarlas como un grupo.

```
┌─────────────────────────────────────────┐
│        Grupo "Cafetería Demo"           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │  Demo   │ │ Sucur 1 │ │ Sucur 2 │    │  ← tenants independientes
│  │ (matriz)│ │         │ │         │    │
│  └─────────┘ └─────────┘ └─────────┘    │
│       ▲           ▲           ▲         │
│       └───────────┴───────────┘         │
│              owner = mismo user         │  ← via tabla user_tenants
└─────────────────────────────────────────┘
```

### Tablas clave

- `tenants` — un negocio (cada sucursal del grupo es un tenant distinto, con su propio schema_name)
- `tenant_groups` — agrupa tenants bajo un dueño común
- `tenant_group_members` — N tenants por grupo, marca cuál es la matriz
- `user_tenants` — qué usuarios tienen acceso a qué tenant (rol: owner / staff)
- `tenant_fe_plans` — plan de Facturación Electrónica por tenant (cuota mensual, monto)
- `fe_plans` — catálogo (FE_100, FE_500, FE_2000, FE_10000)

### TenantSwitcher

El usuario logueado ve todos los tenants donde está en `user_tenants` y puede saltar entre ellos
desde el header sin re-loguearse. La RPC `my_tenants()` resuelve la lista. En el dashboard de un
owner aparece el panel **"Mis Sucursales"** con stats agregadas (usuarios, facturas/mes,
ventas/mes, bodegas).

---

## Planes SaaS y features

Cada tenant tiene un `plan_id` que apunta a `subscription_plans.features` — un JSON con
toggles por módulo. La UI evalúa cada feature en `planFeatures` (cargado en `AuthContext`)
para renderizar o esconder los menús.

### Features representativas

| Feature | Qué habilita |
|---|---|
| `pos`, `inventory`, `reports`, `expenses`, ... | Módulos principales |
| `pos_card`, `pos_sinpe`, `pos_discount`, `pos_void_invoice` | Capacidades del POS |
| `multi_branch`, `multi_branch_transfers` | Sucursales y bodegas |
| `electronic_invoice` | Tab de FE en Settings + dropdown de tipo doc en POS |
| `pos_kiosk` | Modo Kiosk con PIN en el POS |
| `users_roles`, `users_teams`, `users_shifts`, `users_activity` | Sub-tabs de Usuarios |
| `inventory_products_only`, `inventory_mixed_stock`, `inventory_categories`, ... | Granularidad de inventario |
| `admin_dashboard` | Plan Admin del SaaS (panel `/create-owner`) |

---

## Roles y permisos

### Roles disponibles

```
owner  → propietario del negocio
admin  → gestión completa
gerente → supervisa operaciones
asistente_1..3 → operativos jerárquicos
cajero → POS y cobros
mesero → toma órdenes
cocinero → recibe comandas
almacenero → inventario y compras
contador → solo-lectura financiera
```

### Sistema de permisos por rol

Tabla `role_permissions` (`tenant_id`, `role`, `module`, `can_access`, `can_create`,
`can_edit`, `can_delete`). El owner del grupo configura desde `/users → tab Roles` una
matriz por rol, y se **replica automáticamente a todas las sucursales del grupo** al guardar.

El hook `useRolePermissions` carga la matriz del usuario actual y:
- El **Sidebar** filtra módulos por `canAccess(module)`.
- El **Dashboard** oculta tiles por `canAccess(module)`.
- **UsersList / Inventario / Compras / Gastos / Promociones** ocultan botones de crear/editar/eliminar por `canDo(module, action)`.

### Restricciones de configuración por rol

| Acción | Quién puede |
|---|---|
| Modificar Settings → General | Owner / Admin / Gerente |
| Ver Settings → Facturación Electrónica | Owner / Admin / Gerente (y el plan debe incluir FE) |
| Configurar límite máximo de descuento | Owner / Admin / Gerente |
| Aplicar descuento por encima del tope | Owner / Admin / Gerente (siempre); otros roles → solicitan override (en roadmap) |
| Anular factura | Quien tenga `can_delete` en el módulo `pos` |

---

## Modo Kiosk con PIN

El POS puede operar como **terminal compartido**: el dispositivo queda logueado con un user base,
y los cajeros entran/salen con su PIN (4-8 dígitos) sin re-loguearse.

**Cómo funciona**
- Cada usuario tiene un `pos_pin` único por tenant (en `users.pos_pin`).
- El user base se loguea una vez.
- Modal de PIN al entrar al POS (`forced`) o al click "Cambiar cajero" (`switch`).
- El `activeCashier` se persiste en localStorage y se atribuye a cada factura/anulación.
- Todos los cajeros ven **lo mismo** (los `role_permissions` no se re-evalúan en kiosk — el user
  base manda la sesión).

**Activación**
1. El plan debe incluir `pos_kiosk`.
2. Settings → Vista del POS → toggle "Modo Kiosk con PIN" (o el Panel Admin lo activa por tenant).
3. Cada cajero tiene su PIN configurado en Usuarios → Editar → "🔐 PIN del POS".

**Atribución en facturas**
Las facturas tienen `cashier_id` y `cashier_name` (snapshot). Si kiosk OFF → es el user del JWT.
Si kiosk ON → es el cajero del PIN activo.

---

## Facturación Electrónica (Hacienda CR)

Settings → tab **"Facturación Electrónica"** (visible solo con plan + rol manager):

- Activar emisión a Hacienda + ambiente sandbox/producción
- Credenciales ATV (usuario, contraseña, PIN del certificado, archivo .p12)
- Datos del emisor (cédula jurídica, razón social, provincia, cantón, distrito, dirección)
- Documento por defecto en el POS (tiquete corriente / tiquete electrónico / factura electrónica)
- Actividad económica (código CAEC)

### Régimen simplificado

Para negocios que **NO** emiten FE — alternativa fiscal de Hacienda CR. Imprime al pie de cada
tiquete: *"Autorizado mediante oficio 1197 régimen simplificado"*.

Se configura en **2 lugares** (cualquiera vale):
- Panel Admin → FE & Kiosk → toggle "Régimen simplificado" (solo aparece si FE está OFF)
- Settings → General → checkbox "Régimen Simplificado" (solo aparece si el plan NO tiene FE)

Son **mutuamente excluyentes** con FE (no podés tener ambos activos).

### Productos

Cada producto tiene 2 campos relevantes para FE:
- `cabys_code` — código CABYS de Hacienda (opcional)
- `iva_rate` — IVA por producto (default 13%, alternativas: 4% / 2% / 1% / 0% exento)

---

## Offline-first

El POS funciona sin conexión: las ventas se guardan en IndexedDB (`pos_offline_invoices`) y se
sincronizan automáticamente al volver online. Lo mismo para promociones y otras operaciones de
escritura (cola `offlineQueue` con retry).

**Lectura offline** — el `globalCacheService` pre-cachea al login: productos, categorías, unidades,
clientes, promociones, suppliers, etc., todos namespaced por tenant.

---

## Estructura del repo

```
NovaPOS/
├── src/
│   ├── App.tsx                     # rutas top-level
│   ├── context/AuthContext.tsx     # session + tenant + planFeatures
│   ├── hooks/                      # useAuth, useTenantId, useRolePermissions, useOfflineSync, ...
│   ├── modules/
│   │   ├── pos/                    # POSMain, POSCart, POSDesktopBar, POSPinLockModal, ...
│   │   ├── inventory/              # productos, categorías, unidades, suppliers, compras
│   │   ├── customers/              # CRUD clientes
│   │   ├── promotions/             # CRUD + tipos de promo
│   │   ├── expenses/               # gastos + recurrentes
│   │   ├── purchases/              # órdenes de compra
│   │   ├── accountsPayable/        # cuentas por pagar
│   │   ├── reports/                # reportes paramétricos
│   │   ├── branches/               # sucursales + bodegas + transferencias
│   │   ├── recipes/                # productos compuestos
│   │   ├── tables/                 # mapa de mesas (Konva)
│   │   ├── billing/                # cobro por mesa
│   │   ├── users/                  # usuarios, roles, actividad, equipos, turnos, planes
│   │   ├── dashboard/              # KPIs + GroupBranchesPanel
│   │   ├── settings/               # general, payments, receipt, FE, POSView, notifications
│   │   ├── auth/                   # Login, CreateOwner (Panel Admin)
│   │   └── hr/                     # recursos humanos
│   ├── components/layout/          # Sidebar, Header, TenantSwitcher, MainLayout
│   ├── services/                   # API clients por módulo
│   ├── types/                      # Types_* (tipos compartidos)
│   └── lib/api.ts                  # apiFetch + offline queue
├── e2e/                            # tests Playwright
│   ├── login.spec.ts
│   ├── smoke.spec.ts
│   ├── seo.spec.ts
│   ├── auth.setup.ts               # storage state (login una vez)
│   └── authed/                     # tests autenticados
├── public/                         # static
└── playwright.config.ts
```

El backend vive en un repo aparte (`../NovaPos-Backend/NovaPOS-BACKEND`) — Hono mounteado en `/api`.

---

## Desarrollo

### Requisitos
- Node 22+
- Cuenta Supabase con las migraciones del repo backend aplicadas
- (opcional) Impresora térmica ESC/POS para probar impresión real

### Arrancar dev

```bash
# Frontend
npm install
npm run dev          # → http://localhost:5173

# Backend (en otra terminal)
cd ../NovaPos-Backend/NovaPOS-BACKEND
npm install
npm run dev          # → http://localhost:3001
```

Crea un `.env.local` con:

```
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...

# Para e2e (gitignored)
E2E_USER=tu-email-de-test
E2E_PASS=tu-password-de-test
E2E_BASE_URL=http://localhost:5173
```

### Tests

```bash
npm run test:e2e             # headless
npm run test:e2e:ui          # interactivo
npm run test:e2e:head        # ves el browser
npm run test:e2e:install     # primera vez: baja chromium
```

> En **Fedora**, las deps de Chromium tienen que instalarse a mano:
> ```bash
> sudo dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
>   libxkbcommon libXcomposite libXdamage libXfixes libXrandr \
>   mesa-libgbm libxshmfence alsa-lib pango cairo
> ```

Cobertura actual:
- **23 públicos** — login, SEO, manifest, redirects
- **15 autenticados** — navegación a 12 rutas, sidebar, logout, POS, permisos, multi-tenant
- **CRUD reales** — clientes (crear / editar / eliminar / buscar)

### Build

```bash
npm run build              # build frontend + backend
npm run lint
```

---

## Comandos útiles

```bash
npm run dev                # vite dev server
npm run build              # full build
npm run lint               # eslint
npm run test:e2e           # playwright
npm run clean              # ./cleanup.sh (limpia node_modules + dist)
npm run clean:db           # limpia datos de BD (DEV ONLY)
```

---

## Decisiones de diseño relevantes

- **Multi-tenant por schema** — `tenants.schema_name = "tenant_<uuid>"`. Cada tenant tiene su
  propio schema en Postgres para aislamiento real.
- **RLS estricto** — todas las tablas críticas chequean `user_tenants` vía Postgres policies.
  El backend usa service-role para operaciones cross-tenant.
- **Offline-first del POS** — toda venta se guarda local primero, sync en background. Nunca se
  pierde una factura por caída de red.
- **PostgREST joins** evitados en favor de queries separadas + merge en JS — más estable cuando
  las FKs tienen nombres no convencionales.
- **Cache namespaced por tenant** — `novapos_cache_<tenantId>_<resource>` evita que datos de un
  tenant aparezcan al cambiar de sucursal.
- **Permisos en 2 capas** — features del **plan** (qué puede comprar el negocio) + permisos del
  **rol** (qué puede hacer el usuario dentro del negocio).

---

## Roadmap conocido

- [ ] Override de descuento con PIN del manager cuando un cajero excede el tope
- [ ] Reporte de ventas por cajero (groupBy `cashier_id`)
- [ ] Subida real del certificado .p12 al backend
- [ ] Integración con el firmador de Hacienda CR
- [ ] Workflow CI con GitHub Actions
- [ ] Cleanup automático de datos E2E entre runs

---

## Soporte

Para reportar bugs o sugerir features, abrí un issue en el repo o contactá al equipo de NovaPOS.
