import type { FabricId, FabricLook } from './data/fabrics'

/** Medidas del cuerpo, en centímetros. */
/** Calzado del maniquí (ver three/Shoes.tsx). */
export type ShoeStyle = 'baloncesto' | 'bota' | 'skate'

/** Acabados de una prenda de arriba con patrón (ver three/cloth/hoodie.ts). */
export interface TopShape {
  /** Bajo: canalé, dobladillo o pretina (banda de la misma tela). */
  hem: 'canale' | 'dobladillo' | 'pretina'
  /** Final de la manga: canalé, dobladillo o puño de camisa. */
  cuff: 'canale' | 'dobladillo' | 'puno'
  /** Cuello cuando no lleva capucha: tira de canalé, cuello alto (cisne, chaqueta) o de camisa (de momento, una tira recta). */
  neck: 'canale' | 'alto' | 'camisa'
  /** Acolchada (puffer): más separada del cuerpo, con más cuerpo y el cuello más alto. */
  padded?: boolean
}

/** Corte y acabados de un pantalón con patrón. */
export interface PantsShape {
  /** Corte de la pierna: de ceñido a muy ancho. */
  leg: 'slim' | 'regular' | 'ancho' | 'baggy'
  /** Bajo: recto, vuelto o con puño de canalé (jogger). */
  cuff: 'recto' | 'vuelto' | 'puno'
  /** Cinturilla elástica o de la misma tela (con trabillas). */
  waist: 'elastica' | 'trabillas'
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
export const GARMENT_SLOTS = ['cuerpo', 'mangas', 'capucha', 'cuello', 'bolsillo', 'punos', 'bajo', 'cordones', 'ojales'] as const
export type GarmentSlot = (typeof GARMENT_SLOTS)[number]
export const slotIndex = (s: GarmentSlot) => GARMENT_SLOTS.indexOf(s)

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
  /**
   * Prendas de arriba con patrón (sudadera, camiseta, polo, camisa, chaquetas): cómo acaban mangas, bajo y cuello.
   * Sin ella, las de una sudadera (canalé en puños, bajo y cuello).
   */
  top?: TopShape
  /** Pantalones con patrón: corte de la pierna, bajo y cintura (ver three/cloth/pants.ts). */
  pants?: PantsShape
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
