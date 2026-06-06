import React from 'react';

interface Props extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Caja registradora — icono principal de ColònClick.
 * Estilo línea, hereda color con currentColor (igual que lucide-react).
 */
export const CashRegisterIcon: React.FC<Props> = ({ size = 24, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {/* Pantalla superior */}
    <rect x="5" y="2" width="14" height="5" rx="1" />
    {/* Cuerpo de la caja */}
    <rect x="3" y="9" width="18" height="11" rx="1" />
    {/* Teclas (puntos) */}
    <circle cx="8"  cy="13" r="0.6" fill="currentColor" />
    <circle cx="12" cy="13" r="0.6" fill="currentColor" />
    <circle cx="16" cy="13" r="0.6" fill="currentColor" />
    <circle cx="8"  cy="17" r="0.6" fill="currentColor" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    <circle cx="16" cy="17" r="0.6" fill="currentColor" />
    {/* Línea del cajón */}
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

export default CashRegisterIcon;
