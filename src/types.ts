import type { FabricId } from './data/fabrics'

/** Medidas del cuerpo, en centímetros. */
export interface Measurements {
  height: number
  chest: number
  waist: number
  hips: number
}

export type GarmentType = 'camiseta' | 'manga-larga' | 'vestido' | 'pantalon'
export type Fit = 'ajustado' | 'normal' | 'holgado'

export interface Design {
  garment: GarmentType
  fit: Fit
  fabric: FabricId
  color: string
}
