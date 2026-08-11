'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MenuRender } from './MenuRender';
import { themeOf, type MenuSection, type MenuHeader, type MenuConfig } from './menuThemes';

/**
 * La carta que abre el cliente al escanear el QR de la mesa.
 *
 * SIN sesión: se monta fuera del guard de autenticación. Va contra el endpoint
 * público, que devuelve solo lo que el negocio decidió publicar — no el producto
 * entero filtrado en pantalla, porque eso dejaría costos y márgenes al alcance
 * de cualquiera que abra las herramientas del navegador.
 */

interface Payload {
  slug: string; theme: string;
  header: MenuHeader; config: MenuConfig; sections: MenuSection[];
}

/**
 * Base del API para la página pública.
 *
 * No se puede usar `VITE_API_URL` a ciegas como en el resto de la app. Esa
 * variable se congela al compilar y su valor por defecto es `localhost:3001`:
 * en la caja del negocio funciona, pero en el TELÉFONO DEL CLIENTE `localhost`
 * es el propio teléfono, así que la carta nunca carga. Y es el único lugar de la
 * aplicación que se abre desde un aparato ajeno.
 *
 * Regla: si la página no se está sirviendo desde localhost, una base apuntando a
 * localhost es imposible por definición — se usa el mismo origen, que es el que
 * el cliente sí puede alcanzar.
 */
function apiBase(): string {
  const configured = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
  const localApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  const localPage = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!configured || (localApi && !localPage)) return window.location.origin;
  return configured;
}

export const PublicMenu: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');

  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!slug) { setState('missing'); return; }
    let alive = true;
    const url = `${apiBase()}/public-menu/${encodeURIComponent(slug)}`;
    fetch(url)
      .then(async r => {
        if (r.status === 404) { if (alive) setState('missing'); return null; }
        if (!r.ok) {
          // El motivo REAL, no un «algo salió mal». Sin esto, un backend sin
          // desplegar y una migración sin correr se ven exactamente igual, y no
          // hay forma de saber cuál de los dos arreglar.
          const body = await r.text().catch(() => '');
          throw new Error(`El servidor respondió ${r.status}. ${body.slice(0, 160)}`);
        }
        return r.json();
      })
      .then(json => {
        if (!alive || !json) return;
        const payload = json?.data ?? json;
        if (!payload?.sections) throw new Error('La respuesta no tiene el formato esperado.');
        setData(payload);
        setState('ok');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Un fallo de red acá casi siempre es la dirección del servidor: la
        // página pública no puede apuntar a localhost ni a un backend viejo.
        setDetail(/fetch|network|load failed/i.test(msg)
          ? `No se pudo contactar al servidor (${url}). Si dice «localhost», falta `
            + 'definir VITE_API_URL con la dirección pública del backend al compilar.'
          : msg);
        setState('error');
      });
    return () => { alive = false; };
  }, [slug]);

  // El menú se ve en el teléfono del cliente: el color de la barra del navegador
  // acompaña al tema para que no quede una franja blanca sobre un menú oscuro.
  useEffect(() => {
    if (!data) return;
    const t = themeOf(data.theme);
    document.title = data.header?.name ? `${data.header.name} · Menú` : 'Menú';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', t.page);
  }, [data]);

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FBF9F4', color: '#7A6E5F' }}>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>Cargando el menú…</p>
      </div>
    );
  }

  if (state !== 'ok' || !data) {
    // Un menú sin publicar y uno inexistente dan el mismo mensaje: decir «existe
    // pero está oculto» ya es contarle algo del negocio a un desconocido.
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#FBF9F4', color: '#1F1A14', padding: 24, textAlign: 'center',
      }}>
        <div>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 22, margin: '0 0 8px' }}>
            Este menú no está disponible
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14, color: '#7A6E5F', margin: 0 }}>
            {state === 'error'
              ? 'Hubo un problema al cargarlo. Probá de nuevo en un momento.'
              : 'Puede que el enlace haya cambiado. Consultá con el personal del local.'}
          </p>
          {/* El detalle técnico va abajo y en chiquito: al cliente no le sirve,
              pero es lo único que le permite al negocio saber qué arreglar. */}
          {detail ? (
            <p style={{
              fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#B0A79A',
              margin: '18px auto 0', maxWidth: 420, wordBreak: 'break-word',
            }}>
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: themeOf(data.theme).page }}>
      <MenuRender
        theme={data.theme}
        header={data.header ?? {}}
        config={data.config ?? {}}
        sections={data.sections ?? []}
      />
    </div>
  );
};

export default PublicMenu;
