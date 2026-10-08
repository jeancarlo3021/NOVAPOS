/**
 * Tipos de `qz-lna` (ayudante de Local Network Access de QZ).
 *
 * El paquete trae sus propios tipos en `dist/index.d.ts`, pero su `exports` del
 * package.json no los declara, así que con `moduleResolution: "bundler"`
 * TypeScript no los encuentra y el import queda implícitamente `any`. Se
 * declara acá SOLO lo que usamos: el cliente de QZ es el que consume el resto.
 */
declare module 'qz-lna' {
  export class LnaError extends Error {
    denied: boolean | undefined;
    permission?: PermissionStatus;
  }
  export function detectLna<R>(
    resource: string | URL | Request,
    callback: (url: string | URL) => R,
    options?: {
      defaultAddressSpace?: 'loopback' | 'local' | 'public';
      isWebSocket?: boolean;
    },
  ): Promise<Awaited<R>>;
}
