import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BillingDashboard } from '@/modules/billing/BillingDashboard';
import { TablesDashboard } from '@/modules/tables/TablesDashboard';
import { MESAS } from './mesas';
try { localStorage.setItem('novapos_tables_map_t-demo', JSON.stringify(MESAS)); } catch {}
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[window.location.hash.slice(1) || '/billing']}>
    <Routes>
      <Route path="/billing" element={<div style={{ position: 'fixed', inset: 0 }}><BillingDashboard /></div>} />
      <Route path="/tables" element={<div style={{ position: 'fixed', inset: 0 }}><TablesDashboard /></div>} />
      <Route path="/pos" element={<div>POS</div>} />
    </Routes>
  </MemoryRouter>);
