import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CashierDesk } from '@/modules/agents/CashierDesk';
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/caja']}>
    <Routes><Route path="/caja" element={<div style={{ position: 'fixed', inset: 0 }}><CashierDesk /></div>} /></Routes>
  </MemoryRouter>);
