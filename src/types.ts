import type { FabricId, FabricLook } from './data/fabrics'

/** Medidas del cuerpo, en centímetros. */
export interface Measurements {
  height: number
  chest: number
  waist: number
  hips: number
}

export type GarmentType = 'sudadera' | 'camiseta' | 'manga-larga' | 'vestido' | 'pantalon'
export type Fit = 'ajustado' | 'normal' | 'holgado'

/**
 * Zonas de la prenda 3D que pueden llevar su propio color y material.
 * El orden es el índice de material de la malla (no cambiarlo sin cambiar también dress.ts).
 */
export const GARMENT_SLOTS = ['cuerpo', 'mangas', 'capucha', 'cuello', 'bolsillo', 'punos', 'bajo', 'cordones', 'ojales'] as const
export type GarmentSlot = (typeof GARMENT_SLOTS)[number]
export const slotIndex = (s: GarmentSlot) => GARMENT_SLOTS.indexOf(s)

/** Zonas que son de canalé en la sudadera (si no se elige material, se ven como canalé). */
export const RIB_SLOTS: GarmentSlot[] = ['cuello', 'punos', 'bajo']

export interface SlotStyle {
  color: string
  look: FabricLook
}

export interface Design {
  garment: GarmentType
  fit: Fit
  fabric: FabricId
  color: string
  /** Opciones de patrón (de momento las usa la sudadera). */
  hood: boolean
  pocket: boolean
  /** Cordones de la capucha (por defecto, sí). */
  cords?: boolean
  /** Capucha puesta sobre la cabeza (si no, bajada sobre la espalda). */
  hoodUp?: boolean
  /** Largo total del cuerpo, del hombro al bajo, en cm. */
  bodyLength: number
  /** Largo de manga, de la costura del hombro al final del puño, en cm. */
  sleeveLength: number
  /** Ancho del cuerpo respecto al que toca por el corte (1 = el del corte), desde las medidas del Diseñador. */
  chestScale?: number
  /** Pantalón: parte de la pierna que cubre, de la entrepierna (0) al tobillo (1). Para los cortos. */
  legLength?: number
  /**
   * Color y material de cada zona (desde el Diseñador). Las que falten usan `color` y `fabric`
   * (y las de canalé, canalé del mismo color).
   */
  pieces?: Partial<Record<GarmentSlot, SlotStyle>>
  /**
   * Estampados (desde el Diseñador): una imagen por lado que abarca el cuerpo de la prenda, de costado a costado
   * y del punto más alto del hombro al bajo (ver src/designer/printLayers.ts). La prenda la proyecta sobre su cuerpo.
   */
  prints?: { front: HTMLCanvasElement | null; back: HTMLCanvasElement | null }
}
