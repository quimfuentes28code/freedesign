/**
 * Gráficos (logos, ilustraciones, textos) y estampados sobre las prendas.
 * Compartido por la web (src/) y la API (worker/).
 */

/** Lo que comparten todas las capas del creador: ocultarla, bloquearla y agruparla con otras. */
export interface ArtLayerMeta {
  /** Oculta: no se ve ni se exporta. */
  hidden?: boolean
  /** Bloqueada: no se puede seleccionar ni mover en el lienzo. */
  locked?: boolean
  /** Grupo: las capas del mismo grupo se seleccionan y se mueven juntas. */
  group?: string
}

/** Capas del creador de estampados. Posiciones en el lienzo del creador (600 × 600), (x, y) = centro. */
export type ArtLayer = ArtLayerMeta & (
  | {
      id: string
      type: 'text'
      text: string
      font: string
      size: number
      color: string
      bold: boolean
      italic: boolean
      letterSpacing: number
      /** Contorno del texto (vacío = sin contorno). */
      stroke: string
      strokeWidth: number
      /** Curvatura: 0 = recto, positivo = en arco hacia arriba, negativo = hacia abajo (−100…100). */
      arc: number
      x: number
      y: number
      rotation: number
    }
  | {
      id: string
      type: 'image'
      file: string
      /** Alto / ancho de la imagen. */
      aspect: number
      x: number
      y: number
      w: number
      rotation: number
    }
  | {
      id: string
      type: 'shape'
      shape: 'rect' | 'circle' | 'star'
      fill: string
      stroke: string
      strokeWidth: number
      x: number
      y: number
      w: number
      h: number
      rotation: number
    }
)

export interface ArtworkData {
  layers: ArtLayer[]
}

export interface Artwork {
  id: string
  name: string
  /** Imagen en el almacén de archivos. */
  file: string
  width: number
  height: number
  /** Capas del creador; null si es una imagen subida. */
  data: ArtworkData | null
  tags: string
  createdAt: string
  updatedAt: string
}

export type ArtworkInput = Pick<Artwork, 'name' | 'file' | 'width' | 'height' | 'data' | 'tags'>

/** Técnicas de estampación (se reflejan en la ficha técnica). */
export const TECHNIQUES = [
  { id: 'serigrafia', label: 'Serigrafía' },
  { id: 'bordado', label: 'Bordado' },
  { id: 'dtg', label: 'Impresión directa (DTG)' },
  { id: 'transfer', label: 'Transfer / vinilo' },
  { id: 'sublimacion', label: 'Sublimación' },
  { id: 'parche', label: 'Parche' },
] as const

export type Technique = (typeof TECHNIQUES)[number]['id']

/**
 * Tipografías disponibles. Son fuentes del sistema: así el gráfico se ve igual al usarlo como imagen
 * en las prendas y en las fichas técnicas.
 */
export const FONTS = [
  { id: 'Arial Black, Arial, sans-serif', label: 'Arial Black' },
  { id: 'Impact, Haettenschweiler, sans-serif', label: 'Impact' },
  { id: 'Helvetica, Arial, sans-serif', label: 'Helvetica / Arial' },
  { id: 'Verdana, sans-serif', label: 'Verdana' },
  { id: 'Trebuchet MS, sans-serif', label: 'Trebuchet' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: 'Times New Roman, serif', label: 'Times' },
  { id: 'Courier New, monospace', label: 'Courier' },
  { id: 'Brush Script MT, cursive', label: 'Brush Script' },
] as const
