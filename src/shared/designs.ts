/**
 * Diseños de prendas, compartidos por la web (src/) y la API (worker/).
 */
import type { Technique } from './artworks'

/** Color y material de una pieza de la prenda. */
export interface PieceStyle {
  color: string
  /** Material de la Biblioteca (o null si aún no se ha elegido). */
  materialId: string | null
  /** Nombre del color (p. ej. «Negro carbón») y su código (de la carta de colores o un Pantone). */
  colorName?: string
  colorCode?: string
}

/** Variante de color (colorway) del mismo diseño: color y material de cada pieza. */
export interface Colorway {
  id: string
  name: string
  pieces: Record<string, PieceStyle>
}

/** Nota sobre el dibujo técnico: un punto señalado (x, y) y su texto, colocado en (lx, ly). En unidades del lienzo. */
export interface Callout {
  id: string
  view: 'front' | 'back' | 'side'
  x: number
  y: number
  lx: number
  ly: number
  text: string
  hidden?: boolean
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
  /** Capa oculta (no se dibuja) o bloqueada (no se puede mover). */
  hidden?: boolean
  locked?: boolean
}

/** Trazo dibujado a mano sobre el plano (costuras, cortes, detalles). Puntos en unidades del lienzo: x0, y0, x1, y1… */
export interface Drawing {
  id: string
  view: 'front' | 'back' | 'side'
  /** Lápiz libre, línea recta, rectángulo o elipse (estos tres con dos puntos: esquina a esquina). */
  kind: 'free' | 'line' | 'rect' | 'ellipse'
  points: number[]
  color: string
  width: number
  /** Trazo discontinuo, como un pespunte. */
  dash: boolean
  hidden?: boolean
  locked?: boolean
}

/** Boceto (foto de un dibujo a mano) puesto encima del plano para calcarlo. Centro (x, y) y ancho en unidades del lienzo. */
export interface Tracing {
  id: string
  view: 'front' | 'back' | 'side'
  file: string
  /** Alto / ancho de la imagen. */
  aspect: number
  x: number
  y: number
  w: number
  opacity: number
  hidden?: boolean
  locked?: boolean
}

export interface DesignData {
  /** Opciones de la prenda base (corte, largos, detalles…), por id de opción. */
  options: Record<string, string | boolean>
  /** Color y material de cada pieza, por id de pieza (los de la variante de color activa). */
  pieces: Record<string, PieceStyle>
  /**
   * Variantes de color. La activa (`activeColorway`) es siempre la que está en `pieces`; el resto se guarda aquí.
   * Si no hay, el diseño tiene una sola variante («Principal»).
   */
  colorways?: Colorway[]
  activeColorway?: string
  /** Estampados y logos colocados sobre la prenda (de abajo arriba). */
  prints?: Print[]
  /** Notas con flecha sobre el dibujo técnico. */
  callouts?: Callout[]
  /** Medidas propias de la prenda acabada (cm), por punto de medida; las que no estén salen del corte y el cuerpo. */
  measures?: Record<string, number>
  /** Trazos dibujados a mano sobre el plano. */
  drawings?: Drawing[]
  /** Bocetos para calcar (como mucho uno por vista). */
  tracings?: Tracing[]
  /** Plantilla de la marca: aparece al crear un diseño nuevo, como punto de partida. */
  brandTemplate?: boolean
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
  /** Proyecto al que pertenece (o null). */
  projectId: string | null
  projectName?: string
  data: DesignData
  createdAt: string
  updatedAt: string
}

export type DesignInput = Pick<Design, 'name' | 'template' | 'clientId' | 'projectId' | 'data'>
