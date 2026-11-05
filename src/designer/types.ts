import type { MaterialCategory } from '../shared/library'
import type { DrawScale } from './measures'

export type View = 'front' | 'back' | 'side'

export const VIEWS: { id: View; label: string }[] = [
  { id: 'front', label: 'Delantero' },
  { id: 'back', label: 'Espalda' },
  { id: 'side', label: 'Lateral' },
]

/**
 * Un elemento del dibujo técnico, en orden de dibujo (lo primero queda detrás).
 * - fill: pieza de tela con su color y material, y contorno
 * - shade: interior de una pieza (capucha por dentro, cuello por detrás): su color más oscuro
 * - hardware: fornitura (cremallera, cordones, remates) con su color
 * - line: costura o línea de construcción (solo trazo)
 * - stitch: pespunte (trazo discontinuo, color según la pieza para que se vea)
 * - rib: costillas del canalé (trazo fino)
 */
export interface Shape {
  kind: 'fill' | 'shade' | 'hardware' | 'line' | 'stitch' | 'rib'
  d: string
  /** Pieza a la que pertenece (para su color y material). */
  piece?: string
  /**
   * Fornitura que se pinta con su estilo (ver details.tsx): `button` es un botón (su caja da el centro y el tamaño)
   * y `zip` una cremallera vertical (su caja da el ancho de la cinta y el largo).
   */
  role?: 'button' | 'zip'
  /** Cuerpo de un bolsillo de parche de la prenda base: su forma se puede cambiar (ver pocketShape.ts). */
  pocket?: boolean
}

export interface PieceDef {
  id: string
  label: string
  defaultColor: string
  /** Qué materiales de la Biblioteca tienen sentido para esta pieza. */
  materials: MaterialCategory[]
}

export interface ChoiceOption {
  id: string
  label: string
  group: OptionGroup
  type: 'choice'
  choices: { id: string; label: string }[]
  default: string
}

export interface ToggleOption {
  id: string
  label: string
  group: OptionGroup
  type: 'toggle'
  default: boolean
}

export type OptionDef = ChoiceOption | ToggleOption
export type OptionGroup = 'corte' | 'detalles' | 'acabados'

export const OPTION_GROUPS: { id: OptionGroup; label: string }[] = [
  { id: 'corte', label: 'Corte y largos' },
  { id: 'detalles', label: 'Detalles' },
  { id: 'acabados', label: 'Costuras y acabados' },
]

export type Options = Record<string, string | boolean>

/** Prenda base del catálogo. */
export interface GarmentTemplate {
  id: string
  /** Prenda de torso (sudadera, camisa, chaqueta…), pantalón o de cabeza (gorro, gorra): decide medidas, cotas, ficha y vista 3D. */
  family: 'top' | 'pants' | 'head'
  /** Unidades del lienzo por cm (las prendas de cabeza se dibujan más grandes; por defecto, las de la ropa). */
  unitsPerCm?: number
  name: string
  description: string
  pieces: PieceDef[]
  options: OptionDef[]
  /** Piezas que existen con estas opciones (p. ej. sin capucha no hay pieza «capucha»). */
  activePieces: (o: Options) => string[]
  /** Dibujo técnico de una vista (estirado según las medidas propias del diseño, si se pasan). */
  draw: (view: View, o: Options, s?: DrawScale) => Shape[]
  /** Posiciones habituales de estampado en cada vista (centro y ancho, en unidades del lienzo). */
  printZones: Partial<Record<View, PrintZone[]>>
}

export interface PrintZone {
  id: string
  label: string
  x: number
  y: number
  w: number
}

export const isPants = (t: Pick<GarmentTemplate, 'family'>) => t.family === 'pants'
export const isHead = (t: Pick<GarmentTemplate, 'family'>) => t.family === 'head'

/** Valor de una opción, con su valor por defecto si no está puesta. */
export function opt<T extends string | boolean>(t: GarmentTemplate, o: Options, id: string): T {
  const def = t.options.find((x) => x.id === id)
  return (o[id] ?? def?.default) as T
}
