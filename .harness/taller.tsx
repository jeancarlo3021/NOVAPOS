import { createRoot } from 'react-dom/client';
import { Taller3D } from '@/modules/taller3d/Taller3D';
createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'fixed', inset: 0 }}><Taller3D /></div>);
