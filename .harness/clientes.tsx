import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CustomersList } from '@/modules/customers/CustomersList';
createRoot(document.getElementById('root')!).render(
  <MemoryRouter><CustomersList /></MemoryRouter>);
