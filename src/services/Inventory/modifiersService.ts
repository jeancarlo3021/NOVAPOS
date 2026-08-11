/**
 * Compatibilidad: este módulo era una SEGUNDA copia del servicio de
 * modificadores.
 *
 * Existían dos implementaciones del mismo API —esta y `@/services/modifiers/
 * modifiersService`— con tipos parecidos pero no iguales. Eso ya había empezado
 * a costar: al agregarle el ingrediente a las opciones hubo que tocar las dos, y
 * la que se olvidara habría dejado media aplicación guardando extras sin costo.
 *
 * La implementación real vive ahora en `@/services/modifiers/modifiersService`.
 * Este archivo solo reexporta, para no tener que reescribir los imports de golpe.
 * En código nuevo, importá directamente del otro.
 */
export {
  modifiersService,
  indexByProduct,
  modifiersLabel,
  type ModifierGroup,
  type ModifierIngredient,
  type SelectedModifier,
} from '@/services/modifiers/modifiersService';

// El nombre viejo de la opción en esta copia. Se mantiene para los archivos que
// todavía lo importan así.
export type { Modifier as ProductModifier } from '@/services/modifiers/modifiersService';
