import type { FabricId } from './data/fabrics'

/** Medidas del cuerpo, en centímetros. */
export interface Measurements {
  height: number
  chest: number
  waist: number
  hips: number
}

export type GarmentType = 'sudadera' | 'camiseta' | 'manga-larga' | 'vestido' | 'pantalon'
export type Fit = 'ajustado' | 'normal' | 'holgado'

export interface Design {
  garment: GarmentType
  fit: Fit
  fabric: FabricId
  color: string
  /** Opciones de patrón (de momento las usa la sudadera). */
  hood: boolean
  pocket: boolean
  /** Largo total del cuerpo, del hombro al bajo, en cm. */
  bodyLength: number
  /** Largo de manga, de la costura del hombro al final del puño, en cm. */
  sleeveLength: number
}
