# NovaPOS Deployment Guide

This guide covers deploying NovaPOS to Vercel with both frontend (Vite React) and backend (Hono API).

## Prerequisites

- Vercel account and CLI
- Supabase project with tables created
- Environment variables configured

## Deployment Steps

### 1. Run SQL Migrations in Supabase

Open your Supabase project's SQL Editor and run the migrations in order:

#### Migration 1: Admin Functions (`backend/migrations/01_admin_functions.sql`)

Creates two SECURITY DEFINER functions used by the admin panel:
- `admin_get_owners()` - Returns all tenants with plan and subscription info
- `admin_renew_subscription(p_tenant_id, p_plan_id, p_ends_at)` - Creates new subscription

Copy and paste the entire SQL from `01_admin_functions.sql` and run it.

#### Migration 2: Category Data (`backend/migrations/02_migrate_categories.sql`)

Migrates existing categories from the `categories` table to `product_categories` table.

Copy and paste the entire SQL from `02_migrate_categories.sql` and run it.

### 2. Set Environment Variables on Vercel

Set these environment variables in your Vercel project settings:

```
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
FRONTEND_URL=<your-vercel-deployment-url>
```

### 3. Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy
vercel --prod
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

### 4. Verify Deployment

Check the API is working:

```bash
curl https://<your-vercel-url>/api/health
```

Response should be:
```json
{
  "ok": true,
  "ts": "2026-05-16T...",
  "env": {
    "supabase_url": true,
    "service_key": true,
    "anon_key": true,
    "frontend_url": "..."
  }
}
```

## API Endpoints

All API endpoints are now available at `https://<your-vercel-url>/api/*`

### Protected Endpoints (require authentication)

- `GET /api/products` - List products
- `GET /api/cash-sessions/active` - Get active cash session
- `POST /api/invoices` - Create invoice
- `GET /api/reports/sales` - Sales reports
- etc.

### Public Endpoints

- `GET /api/health` - Health check (no auth required)

## Local Development

```bash
# Start the frontend dev server (Vite)
npm run dev

# In another terminal, start the backend dev server
cd backend && npm run dev
```

Frontend will proxy API calls to `http://localhost:3001/api` based on `.env` configuration.

## Troubleshooting

### "admin_get_owners is not defined"
- Run Migration 1 (01_admin_functions.sql) in Supabase SQL Editor
- Verify the function appears in Supabase → Database → Functions

### Foreign key constraint error on products
- Run Migration 2 (02_migrate_categories.sql) in Supabase SQL Editor
- Verify data migrated: `SELECT COUNT(*) FROM product_categories;`

### 404 errors from API
- Verify `FRONTEND_URL` environment variable is set correctly
- Check CORS configuration in `backend/src/app.ts`
- Ensure backend build succeeded: check Vercel build logs

### TypeScript errors during build
- Ensure all `package.json` scripts are installed:
  ```bash
  npm install
  cd backend && npm install
  ```
- Clear build cache: `vercel build --cache=none`
