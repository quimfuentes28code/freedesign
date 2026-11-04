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

/** Tipos de detalle que se colocan sobre la prenda. */
export const DETAIL_KINDS = [
  { id: 'boton', label: 'Botón' },
  { id: 'cremallera', label: 'Cremallera' },
  { id: 'ojal', label: 'Ojal metálico' },
  { id: 'remache', label: 'Remache' },
  { id: 'herrete', label: 'Herrete' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'parche', label: 'Parche' },
] as const

export type DetailKind = (typeof DETAIL_KINDS)[number]['id']

/** Estilos de botón: de 2 o 4 agujeros, automático (corchete), de pie, de trenca o con la forma de un gráfico. */
export const BUTTON_STYLES = [
  { id: '2', label: '2 agujeros' },
  { id: '4', label: '4 agujeros' },
  { id: 'automatico', label: 'Automático' },
  { id: 'pie', label: 'De pie' },
  { id: 'trenca', label: 'Trenca' },
  { id: 'logo', label: 'Con logo' },
] as const
export type ButtonStyle = (typeof BUTTON_STYLES)[number]['id']

/** Cremalleras: dientes de metal, espiral de nylon, de plástico (Vislon) o invisible. */
export const ZIP_STYLES = [
  { id: 'metal', label: 'Metal' },
  { id: 'nylon', label: 'Nylon (espiral)' },
  { id: 'vislon', label: 'Plástico (Vislon)' },
  { id: 'invisible', label: 'Invisible' },
] as const
export type ZipStyle = (typeof ZIP_STYLES)[number]['id']

/** Tiradores de cremallera. `logo`: con la forma de un gráfico de la Biblioteca. */
export const PULLER_STYLES = [
  { id: 'clasico', label: 'Clásico' },
  { id: 'aro', label: 'Aro' },
  { id: 'cordon', label: 'Cordón' },
  { id: 'logo', label: 'Con logo' },
] as const
export type PullerStyle = (typeof PULLER_STYLES)[number]['id']

/** Formas de parche y de etiqueta. */
export const PATCH_SHAPES = [
  { id: 'rect', label: 'Rectangular' },
  { id: 'redondo', label: 'Redondo' },
  { id: 'escudo', label: 'Escudo' },
] as const
export type PatchShape = (typeof PATCH_SHAPES)[number]['id']

/** Gráfico usado en un detalle (botón, tirador o parche con logo). */
export interface DetailArt {
  artworkId: string | null
  file: string
  /** Alto / ancho. */
  aspect: number
}

/**
 * Detalle colocado sobre una vista: botón, cremallera, ojal, remache, herrete, etiqueta o parche.
 * Centro (x, y), ancho `w` y giro en unidades del lienzo; la cremallera además tiene su largo.
 */
export interface Detail {
  id: string
  view: 'front' | 'back' | 'side'
  kind: DetailKind
  /** Estilo según el tipo (ButtonStyle, ZipStyle o PatchShape). */
  style: string
  /** Tirador (solo cremalleras). */
  puller?: PullerStyle
  x: number
  y: number
  w: number
  /** Largo de la cremallera. */
  length?: number
  rotation: number
  /** Color principal y de contraste (cinta de la cremallera, borde del parche…). */
  color: string
  color2: string
  /** Texto (etiqueta o parche). */
  text?: string
  art?: DetailArt | null
  /** Bordado o en relieve (parches y etiquetas): se ve con volumen en 2D y en 3D. */
  relief?: boolean
  hidden?: boolean
  locked?: boolean
}

/** Estilo de las fornituras que trae la prenda base (botones de la tapeta, cremallera y su tirador). */
export interface HardwareStyle {
  buttons?: ButtonStyle
  buttonArt?: DetailArt | null
  zip?: ZipStyle
  puller?: PullerStyle
  pullerArt?: DetailArt | null
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
  /** Detalles colocados a mano (botones, cremalleras, parches…). */
  details?: Detail[]
  /** Estilo de los botones y la cremallera que trae la prenda base. */
  hardware?: HardwareStyle
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
