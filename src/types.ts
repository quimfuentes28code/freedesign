import type { FabricId, FabricLook } from './data/fabrics'

/** Medidas del cuerpo, en centímetros. */
/** Calzado del maniquí (ver three/Shoes.tsx). */
export type ShoeStyle = 'baloncesto' | 'bota' | 'skate' | 'deportiva'

/** Acabados de una prenda de arriba con patrón (ver three/cloth/hoodie.ts). */
export interface TopShape {
  /** Bajo: canalé, dobladillo o pretina (banda de la misma tela). */
  hem: 'canale' | 'dobladillo' | 'pretina'
  /** Final de la manga: canalé, dobladillo o puño de camisa. */
  cuff: 'canale' | 'dobladillo' | 'puno'
  /** Cuello cuando no lleva capucha: tira de canalé, cuello alto (cisne, chaqueta) o de camisa (de momento, una tira recta). */
  neck: 'canale' | 'alto' | 'camisa'
  /** Cuello alto: pegado al cuello o separado de él, y su alto (cm; si no, el de cada tipo). */
  neckFit?: 'cenido' | 'holgado'
  neckHeight?: number
  /** Acolchada (puffer): más separada del cuerpo, con más cuerpo y el cuello más alto. */
  padded?: boolean
  /** Sin mangas (chaleco): la sisa queda abierta, con su ribete. */
  sleeveless?: boolean
  /** Canales del acolchado en 3D: su forma (índice en QUILT_SHAPES del Diseñador) y su separación (cm). */
  quilt?: { shape: number; step: number }
  /** Cierre delante: el delantero va en dos piezas unidas por botones o cremallera (ver TopClosure). */
  closure?: TopClosure
  /** Bolsillo de pecho de parche (camisa, polo, cazadora): uno a la izquierda o uno a cada lado. */
  chestPocket?: 'uno' | 'dos'
  /** Pretina recta (cazadora): del ancho del cuerpo, sin fruncir, más baja. */
  flatBand?: boolean
  /** Bolsillos bajos de chaqueta: de ojal (un vivo inclinado) o de parche con solapa; y el de la manga (bomber). */
  pockets?: 'ojal' | 'solapa'
  sleevePocket?: boolean
}

/** Gorro de punto o gorra (ver three/Headwear.tsx). */
export interface HatShape {
  kind: 'gorro' | 'gorra'
  /** Gorro: normal (más alto, cubre media oreja) o corto de pescador; vuelta y pompón. */
  tall?: boolean
  cuff?: boolean
  pompom?: boolean
  /** Gorra: paneles, visera, trasera de malla y cierre de atrás. */
  panels?: 5 | 6
  brim?: 'curva' | 'plana'
  mesh?: boolean
  closure?: 'snapback' | 'hebilla' | 'velcro' | 'cerrada'
}

/** Cierre delantero de una prenda de arriba. */
export interface TopClosure {
  kind: 'botones' | 'cremallera'
  /** Abierta de arriba abajo (chaquetas, camisa); si no, solo los cm de `length` desde el escote (polo, media cremallera). */
  full: boolean
  length?: number
  /** Número de botones y su diámetro (cm). */
  buttons?: number
  buttonSize?: number
  /** Tapeta: tira de tela doblada a lo largo de la abertura (camisa, polo, cazadora). */
  placket?: boolean
}

/** Top de mujer con patrón. */
export interface FemTopShape {
  kind: 'tirantes' | 'bandeau' | 'halter' | 'cruzado' | 'corse'
  neckline: 'recto' | 'pico' | 'redondo' | 'corazon'
  straps: 'finos' | 'anchos'
  fit: 'ajustado' | 'regular' | 'holgado'
}

/** Corte y acabados de un pantalón con patrón. */
export interface PantsShape {
  /** Corte de la pierna: de ceñido a muy ancho. */
  leg: 'slim' | 'regular' | 'ancho' | 'baggy'
  /** Bajo: recto, vuelto o con puño de canalé (jogger). */
  cuff: 'recto' | 'vuelto' | 'puno'
  /** Cinturilla elástica o de la misma tela (con trabillas). */
  waist: 'elastica' | 'trabillas'
  /** Bolsillos laterales (abertura inclinada), traseros de parche, cargo con solapa; cordón y banda lateral. */
  sidePockets?: boolean
  backPockets?: boolean
  cargo?: boolean
  cord?: boolean
  stripe?: boolean
}

export interface Measurements {
  height: number
  chest: number
  waist: number
  hips: number
  /** Cuerpo de mujer: el maniquí lleva pecho, cintura más estrecha y más cadera. */
  female?: boolean
  /** Bajo pecho: con el busto (`chest`) da el tamaño del pecho del maniquí de mujer. */
  underbust?: number
  /** Contorno de cuello, ancho de espalda y talle de espalda. */
  neck?: number
  backWidth?: number
  backLength?: number
}

export type GarmentType = 'sudadera' | 'camiseta' | 'manga-larga' | 'chaleco' | 'top' | 'vestido' | 'pantalon'
export type Fit = 'ajustado' | 'normal' | 'holgado'

/**
 * Zonas de la prenda 3D que pueden llevar su propio color y material.
 * El orden es el índice de material de la malla (no cambiarlo sin cambiar también dress.ts).
 */
export const GARMENT_SLOTS = ['cuerpo', 'mangas', 'capucha', 'cuello', 'bolsillo', 'punos', 'bajo', 'cordones', 'ojales', 'botones', 'banda'] as const
export type GarmentSlot = (typeof GARMENT_SLOTS)[number]
export const slotIndex = (s: GarmentSlot) => GARMENT_SLOTS.indexOf(s)

/**
 * Prendas que se construyen con patrón de costura (piezas cosidas y asentadas sobre el cuerpo): la sudadera, las de
 * arriba con sus acabados (`top`), los pantalones (`pants`) y el top de mujer (`femTop`). El resto son tubos.
 */
export const isPatternDesign = (d: Design) =>
  d.garment === 'sudadera' ||
  (!!d.top && (d.garment === 'camiseta' || d.garment === 'manga-larga' || d.garment === 'chaleco')) ||
  (!!d.pants && d.garment === 'pantalon') ||
  (!!d.femTop && d.garment === 'top')

/** Zonas que son de canalé en la sudadera (si no se elige material, se ven como canalé). */
export const RIB_SLOTS: GarmentSlot[] = ['cuello', 'punos', 'bajo']

export interface SlotStyle {
  color: string
  look: FabricLook
  /**
   * Superficie y lavado (desde el Diseñador): azulejo que se repite como textura de la tela, con el color ya dentro.
   * `cm` es el lado del azulejo en cm reales; `stretch`, que no se repite (degradado de arriba abajo).
   */
  tile?: { canvas: HTMLCanvasElement; cm: number; key: string; angle: number; stretch: boolean }
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
  /** Capucha cruzada (un lado monta sobre el otro delante) y cuello alto cosido por dentro de la capucha. */
  hoodCross?: boolean
  hoodCollar?: boolean
  /**
   * Prendas de arriba con patrón (sudadera, camiseta, polo, camisa, chaquetas): cómo acaban mangas, bajo y cuello.
   * Sin ella, las de una sudadera (canalé en puños, bajo y cuello).
   */
  top?: TopShape
  /** Pantalones con patrón: corte de la pierna, bajo y cintura (ver three/cloth/pants.ts). */
  pants?: PantsShape
  /** Top de mujer con patrón: tipo, escote, tirantes y corte (ver three/cloth/femtop.ts). */
  femTop?: FemTopShape
  /** Largo total del cuerpo, del hombro al bajo, en cm. */
  bodyLength: number
  /** Largo de manga, de la costura del hombro al final del puño, en cm. */
  sleeveLength: number
  /** Ancho del cuerpo respecto al que toca por el corte (1 = el del corte), desde las medidas del Diseñador. */
  chestScale?: number
  /** Pantalón: parte de la pierna que cubre, de la entrepierna (0) al tobillo (1). Para los cortos. */
  legLength?: number
  /** Va debajo de otra prenda (el pantalón con una sudadera o camiseta): se ciñe a la cintura para no atravesarla. */
  under?: boolean
  /** Gorro o gorra: se pone en la cabeza (no es una prenda de cuerpo). */
  hat?: HatShape
  /** Prenda abierta por delante (solo las que tienen el cierre de arriba abajo). */
  open?: boolean
  /** Holgura de pecho en cm (la de la ficha técnica según el corte); sin ella, la de `fit`. Negativa = ceñida. */
  ease?: number
  /**
   * Calidad del cálculo de la tela: «alta» usa una malla mucho más fina y más pasadas (pliegues finos, como un
   * programa de patronaje 3D) a cambio de tardar unos segundos. Por defecto, la rápida.
   */
  quality?: 'alta'
  /**
   * Capa de la prenda en un conjunto (0 = la de más adentro, p. ej. el pantalón; luego la camiseta y la chaqueta) y
   * capas de patrón que tiene debajo: se calcula después de ellas y se asienta sobre su tela.
   */
  layer?: number
  below?: number[]
  /**
   * Largo (cm, del hombro al bajo) de la prenda que va encima. Lo que esa prenda tapa no se construye: la tela de
   * arriba se asienta contra el cuerpo y no contra esta, y la de debajo asomaba a manchas.
   */
  coveredBy?: number
  /** La prenda de encima es de patrón y se asienta sobre esta: no hace falta recortar lo que tapa. */
  overPattern?: boolean
  /**
   * Lo que abulta (cm de contorno en la cadera) la prenda que va debajo: el bajo de esta se hace a la medida de la cadera
   * con el pantalón puesto, como en la realidad (si se ciñera a la cadera, el pantalón ancho asomaría a través de él).
   */
  overBulk?: number
  /**
   * Color y material de cada zona (desde el Diseñador). Las que falten usan `color` y `fabric`
   * (y las de canalé, canalé del mismo color).
   */
  pieces?: Partial<Record<GarmentSlot, SlotStyle>>
  /**
   * Estampados (desde el Diseñador): una imagen por lado que abarca el cuerpo de la prenda, de costado a costado
   * y del punto más alto del hombro al bajo (ver src/designer/printLayers.ts). La prenda la proyecta sobre su cuerpo.
   */
  prints?: {
    front: HTMLCanvasElement | null
    back: HTMLCanvasElement | null
    /** Mapa de relieve (blanco donde hay bordado, parche o fornitura), con el mismo encuadre. */
    frontRelief?: HTMLCanvasElement | null
    backRelief?: HTMLCanvasElement | null
  }
}
