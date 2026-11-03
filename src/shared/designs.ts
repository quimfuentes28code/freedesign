/**
 * Diseños de prendas, compartidos por la web (src/) y la API (worker/).
 */
import type { Technique } from './artworks'

/** Color y material de una pieza de la prenda. */
export interface PieceStyle {
  color: string
  /** Material de la Biblioteca (o null si aún no se ha elegido). */
  materialId: string | null
}

/**
 * Estampado colocado sobre una vista de la prenda: un gráfico de la Biblioteca o un texto.
 * Posición en unidades del lienzo del dibujo técnico ((x, y) = centro; 1 unidad ≈ 0,5 cm).
 */
export interface Print {
  id: string
  view: 'front' | 'back' | 'side'
  kind: 'artwork' | 'text'
  /** Gráfico de la Biblioteca (kind = artwork). Se copia su imagen para dibujarlo sin consultarlo. */
  artworkId: string | null
  file: string
  /** Alto / ancho del gráfico. */
  aspect: number
  /** Ancho del gráfico. */
  w: number
  /** Texto (kind = text). */
  text: string
  font: string
  size: number
  color: string
  bold: boolean
  x: number
  y: number
  rotation: number
  technique: Technique
  /** Recortar el estampado al contorno de la prenda. */
  clip: boolean
}

export interface DesignData {
  /** Opciones de la prenda base (corte, largos, detalles…), por id de opción. */
  options: Record<string, string | boolean>
  /** Color y material de cada pieza, por id de pieza. */
  pieces: Record<string, PieceStyle>
  /** Estampados y logos colocados sobre la prenda (de abajo arriba). */
  prints?: Print[]
  notes: string
}

export interface Design {
  id: string
  name: string
  /** Prenda base del catálogo. */
  template: string
  clientId: string | null
  /** Nombre del cliente (solo lectura, lo añade la API). */
  clientName?: string
  data: DesignData
  createdAt: string
  updatedAt: string
}

export type DesignInput = Pick<Design, 'name' | 'template' | 'clientId' | 'data'>
