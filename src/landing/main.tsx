import React from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing';

/**
 * Punto de entrada de la PÁGINA PÚBLICA.
 *
 * Deliberadamente separado del de la aplicación: no importa el router, ni el
 * contexto de sesión, ni el cliente de Supabase, ni el service worker. Todo
 * eso es peso que un visitante no necesita para leer tres párrafos y dejar su
 * teléfono.
 *
 * La regla para mantenerlo así: si algo de acá necesita importar de
 * `src/modules` o de `src/context`, casi seguro está mal — es señal de que se
 * está arrastrando la aplicación adentro de la página de presentación.
 */
const raiz = document.getElementById('landing');
if (raiz) createRoot(raiz).render(<Landing />);
