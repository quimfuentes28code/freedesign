/**
 * Gráficos (logos, ilustraciones, textos) y estampados sobre las prendas.
 * Compartido por la web (src/) y la API (worker/).
 */

/** Formas del texto en el creador. */
export const TEXT_WARPS = [
  { id: 'recta', label: 'Recto' },
  { id: 'arco', label: 'Arco' },
  { id: 'circulo', label: 'Círculo' },
  { id: 'onda', label: 'Onda' },
  { id: 'bandera', label: 'Bandera' },
  { id: 'abombado', label: 'Abombado' },
  { id: 'perspectiva', label: 'Perspectiva' },
  { id: 'vertical', label: 'Vertical' },
] as const
export type TextWarp = (typeof TEXT_WARPS)[number]['id']

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
      /** Forma del texto (sin poner: recto, o en arco si `arc` no es 0) y su intensidad (−100…100). */
      warp?: TextWarp
      warpAmount?: number
      /** Varias líneas (el texto lleva saltos de línea): alineación e interlineado (× el tamaño). */
      align?: 'left' | 'center' | 'right'
      lineHeight?: number
      /** Segundo contorno, por fuera del primero. */
      stroke2?: string
      stroke2Width?: number
      /** Degradado: el relleno va del color al segundo color, con este ángulo (grados). */
      gradient?: string
      gradientAngle?: number
      /** Sombra: color, desplazamiento y desenfoque. */
      shadow?: string
      shadowX?: number
      shadowY?: number
      shadowBlur?: number
      /** Relleno con una imagen (máscara): el texto se ve como una ventana a la foto. */
      fillImage?: { file: string; aspect: number } | null
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
      shape: ShapeKind
      fill: string
      stroke: string
      strokeWidth: number
      x: number
      y: number
      w: number
      h: number
      rotation: number
      /** Puntas de la estrella o lados del polígono. */
      points?: number
      /** Estrella: lo hundidas que van las puntas (0,2–0,9 del radio). */
      inner?: number
      /** Esquinas redondeadas del rectángulo (0–1). */
      radius?: number
    } & FillStyle
  | ({
      id: string
      /** Trazo hecho con la pluma o el lápiz: puntos (relativos al centro) con sus asas de curva. */
      type: 'path'
      nodes: PathNode[]
      closed: boolean
      /** Relleno (vacío = sin relleno) y trazo. */
      fill: string
      stroke: string
      strokeWidth: number
      x: number
      y: number
      rotation: number
    } & FillStyle)
)

/** Formas del creador. */
export const SHAPE_KINDS = [
  { id: 'rect', label: 'Rectángulo' },
  { id: 'circle', label: 'Círculo' },
  { id: 'star', label: 'Estrella' },
  { id: 'polygon', label: 'Polígono' },
  { id: 'line', label: 'Línea' },
  { id: 'arrow', label: 'Flecha' },
  { id: 'heart', label: 'Corazón' },
  { id: 'shield', label: 'Escudo' },
  { id: 'ribbon', label: 'Banderola' },
  { id: 'badge', label: 'Sello' },
  { id: 'burst', label: 'Estallido' },
  { id: 'laurel', label: 'Laurel' },
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]['id']

/** Punto de un trazo; (hx, hy) es su asa de curva (la del otro lado es la simétrica). */
export interface PathNode {
  x: number
  y: number
  hx?: number
  hy?: number
}

/** Relleno de formas y trazos: liso, en degradado (hasta `fill2`) o con textura (rayas, puntos, cuadros). */
export interface FillStyle {
  fill2?: string
  fillAngle?: number
  pattern?: 'rayas' | 'puntos' | 'cuadros'
  patternColor?: string
  patternSize?: number
}

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
