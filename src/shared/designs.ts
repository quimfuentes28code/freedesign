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
  /** Estampado por toda la pieza (rayas, cuadros, camuflaje…), sobre el color de la pieza. */
  surface?: Surface
  /** Forma de los bolsillos de esta pieza (fondo, pico, esquinas, alto), ver pocketShape.ts. */
  shape?: Record<string, number>
  /** Lavado o efecto de la tela. */
  wash?: Wash
}

export const SURFACE_KINDS = [
  { id: 'liso', label: 'Liso' },
  { id: 'rayas', label: 'Rayas' },
  { id: 'cuadros', label: 'Cuadros' },
  { id: 'lunares', label: 'Lunares' },
  { id: 'camuflaje', label: 'Camuflaje' },
  { id: 'tiedye', label: 'Tie-dye' },
  { id: 'logo', label: 'Logo repetido' },
  { id: 'degradado', label: 'Degradado' },
] as const
export type SurfaceKind = (typeof SURFACE_KINDS)[number]['id']

/** Estampado por toda la pieza. `size`: tamaño del dibujo que se repite, en cm; `angle` en grados. */
export interface Surface {
  kind: SurfaceKind
  color2: string
  /** Tercer color (camuflaje, tie-dye). */
  color3: string
  size: number
  angle: number
  /** Gráfico que se repite (kind = logo). */
  art?: DetailArt | null
}

export const WASH_KINDS = [
  { id: 'ninguno', label: 'Ninguno' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'desgastado', label: 'Desgastado' },
  { id: 'acido', label: 'Ácido' },
  { id: 'decolorado', label: 'Decolorado' },
] as const
export type WashKind = (typeof WASH_KINDS)[number]['id']

export interface Wash {
  kind: WashKind
  /** Intensidad, de 0 a 1. */
  amount: number
}

/**
 * Bloque de color: una pieza dividida por una línea recta (de x1, y1 a x2, y2, en unidades del lienzo de esa vista);
 * el lado `side` (1 o −1) toma otro color.
 */
export interface ColorBlock {
  id: string
  view: 'front' | 'back' | 'side'
  piece: string
  x1: number
  y1: number
  x2: number
  y2: number
  side: 1 | -1
  color: string
  colorName?: string
}

/** Para quién es el diseño: decide el patrón (entallado de mujer), las tallas y el maniquí. Unisex usa el de hombre. */
export const GENDERS = [
  { id: 'hombre', label: 'Hombre' },
  { id: 'mujer', label: 'Mujer' },
  { id: 'unisex', label: 'Unisex' },
] as const
export type Gender = (typeof GENDERS)[number]['id']

/** Género de un diseño (se guarda en sus opciones, `genero`; los antiguos son de hombre). */
export const genderOf = (data: { options: Record<string, string | boolean> }): Gender => {
  const g = data.options.genero
  return g === 'mujer' || g === 'unisex' ? g : 'hombre'
}

/** Cuerpo con el que se patrona: el de mujer solo en los diseños de mujer. */
export const bodyKind = (data: { options: Record<string, string | boolean> }): 'hombre' | 'mujer' => (genderOf(data) === 'mujer' ? 'mujer' : 'hombre')

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
  /** Efectos del texto: cursiva, espaciado entre letras (unidades del lienzo), arco (−100…100, positivo hacia arriba), vertical. */
  italic?: boolean
  letterSpacing?: number
  arc?: number
  vertical?: boolean
  /** Contorno (color y grosor) y sombra (color y distancia), vacíos = sin ellos. */
  stroke?: string
  strokeWidth?: number
  shadow?: string
  shadowOffset?: number
}

/** Tipos de detalle que se colocan sobre la prenda. */
export const DETAIL_KINDS = [
  { id: 'boton', label: 'Botón' },
  { id: 'cremallera', label: 'Cremallera' },
  { id: 'ojal', label: 'Ojete metálico' },
  { id: 'remache', label: 'Remache' },
  { id: 'herrete', label: 'Herrete' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'parche', label: 'Parche' },
  { id: 'bolsillo', label: 'Bolsillo' },
  { id: 'trabilla', label: 'Trabilla' },
  { id: 'cordon', label: 'Cordón con topes' },
  { id: 'cinta', label: 'Cinta o banda' },
  { id: 'velcro', label: 'Velcro' },
  { id: 'hebilla', label: 'Hebilla' },
  { id: 'costura', label: 'Costura decorativa' },
  { id: 'pinza', label: 'Pinza' },
  { id: 'roto', label: 'Roto' },
  { id: 'deshilachado', label: 'Deshilachado' },
  { id: 'desgaste', label: 'Desgaste' },
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

/** Bolsillos que se colocan donde se quiera. */
export const POCKET_STYLES = [
  { id: 'parche', label: 'De parche' },
  { id: 'vivo', label: 'De vivo (ojal)' },
  { id: 'cargo', label: 'Cargo con fuelle y tapeta' },
  { id: 'cremallera', label: 'Con cremallera' },
] as const

/** Cintas y bandas (laterales, de mangas, de cintura…). */
export const TAPE_STYLES = [
  { id: 'lisa', label: 'Lisa' },
  { id: 'rayas', label: 'Con rayas' },
  { id: 'reflectante', label: 'Reflectante' },
] as const

export const BUCKLE_STYLES = [
  { id: 'cuadrada', label: 'Metálica' },
  { id: 'clip', label: 'Clip de plástico' },
  { id: 'anillas', label: 'Anillas (D)' },
] as const

/** Puntadas de las costuras decorativas. */
export const STITCH_STYLES = [
  { id: 'simple', label: 'Pespunte' },
  { id: 'doble', label: 'Pespunte doble' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'cadeneta', label: 'Cadeneta' },
] as const

/** Remates del cordón. */
export const CORD_STYLES = [
  { id: 'tope', label: 'Con tope' },
  { id: 'herrete', label: 'Con herretes' },
  { id: 'nudo', label: 'Con nudo' },
] as const

/** Rotos: rasgado con los hilos de la trama a la vista, agujero con el borde deshilachado o cortes en escalera. */
export const RIP_STYLES = [
  { id: 'rasgado', label: 'Rasgado (hilos a la vista)' },
  { id: 'agujero', label: 'Agujero' },
  { id: 'cortes', label: 'Cortes en escalera' },
] as const

/** Bordes deshilachados: flecos largos, bajo sin coser o desflecado. */
export const FRAY_STYLES = [
  { id: 'flecos', label: 'Flecos' },
  { id: 'sin-coser', label: 'Bajo sin coser' },
  { id: 'desflecado', label: 'Desflecado' },
] as const

/** Desgaste en una zona: aclarado, bigotes (como en las caderas de un vaquero) o roce. */
export const WEAR_STYLES = [
  { id: 'zona', label: 'Zona aclarada' },
  { id: 'bigotes', label: 'Bigotes' },
  { id: 'roce', label: 'Roce' },
] as const

/** Estilos que se pueden elegir en cada tipo de detalle. */
export const DETAIL_STYLES: Partial<Record<DetailKind, readonly { id: string; label: string }[]>> = {
  boton: BUTTON_STYLES,
  cremallera: ZIP_STYLES,
  parche: PATCH_SHAPES,
  bolsillo: POCKET_STYLES,
  cinta: TAPE_STYLES,
  hebilla: BUCKLE_STYLES,
  costura: STITCH_STYLES,
  cordon: CORD_STYLES,
  roto: RIP_STYLES,
  deshilachado: FRAY_STYLES,
  desgaste: WEAR_STYLES,
}

/** Detalles alargados: además del ancho tienen su largo (`Detail.length`). */
export const LONG_DETAILS: readonly DetailKind[] = ['cremallera', 'cordon', 'cinta', 'costura', 'pinza', 'deshilachado']

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
  /** Largo de los detalles alargados (cremallera, cordón, cinta, costura, pinza). */
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
  /** Forma propia del detalle (alto, esquinas, fondo, cantidad de hilos…), ver `SHAPE_PARAMS` en details.tsx. */
  shape?: Record<string, number>
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
  /** Bloques de color (piezas divididas con una línea). */
  blocks?: ColorBlock[]
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
