import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PortalCliente } from '@/modules/portalCliente/PortalCliente';
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/cliente/token-de-prueba-largo-123456']}>
    <Routes>
      <Route path="/cliente/:token" element={<PortalCliente />} />
    </Routes>
  </MemoryRouter>);
