import type { Knit } from '../three/cloth/textures'

/** Cómo se ve y cae un material en 3D (lo comparten las telas de la vista previa y el catálogo del Diseñador). */
export interface FabricLook {
  roughness: number
  sheen: number
  sheenRoughness: number
  clearcoat: number
  /** Brillo metálico (fornituras de metal). */
  metalness?: number
  /** Relieve del tejido y su intensidad. */
  knit: Knit
  knitDepth: number
  /** Rigidez a la flexión: 1 = tela de grosor medio; menos, más fluida; más, más tiesa. */
  stiffness: number
}

/** Propiedades visuales y de caída de cada tela. */
export interface Fabric extends FabricLook {
  name: string
  defaultColor: string
}

export const FABRICS = {
  felpa: {
    name: 'Felpa',
    defaultColor: '#c9b89f',
    roughness: 0.95,
    sheen: 0.6,
    sheenRoughness: 0.9,
    clearcoat: 0,
    knit: 'punto',
    knitDepth: 0.5,
    stiffness: 1.6,
  },
  algodon: {
    name: 'Algodón',
    defaultColor: '#f2efe8',
    roughness: 0.9,
    sheen: 0.3,
    sheenRoughness: 0.8,
    clearcoat: 0,
    knit: 'punto',
    knitDepth: 0.4,
    stiffness: 0.8,
  },
  lino: {
    name: 'Lino',
    defaultColor: '#d8cbb0',
    roughness: 1,
    sheen: 0.2,
    sheenRoughness: 1,
    clearcoat: 0,
    knit: 'liso',
    knitDepth: 0,
    stiffness: 1.2,
  },
  seda: {
    name: 'Seda',
    defaultColor: '#b8324a',
    roughness: 0.35,
    sheen: 1,
    sheenRoughness: 0.3,
    clearcoat: 0,
    knit: 'liso',
    knitDepth: 0,
    stiffness: 0.3,
  },
  denim: {
    name: 'Denim',
    defaultColor: '#3b5b8c',
    roughness: 1,
    sheen: 0.1,
    sheenRoughness: 1,
    clearcoat: 0,
    knit: 'sarga',
    knitDepth: 0.6,
    stiffness: 2.2,
  },
  lana: {
    name: 'Lana',
    defaultColor: '#7a6a58',
    roughness: 1,
    sheen: 0.7,
    sheenRoughness: 0.9,
    clearcoat: 0,
    knit: 'punto',
    knitDepth: 0.9,
    stiffness: 1.4,
  },
  cuero: {
    name: 'Cuero',
    defaultColor: '#2b211c',
    roughness: 0.45,
    sheen: 0,
    sheenRoughness: 1,
    clearcoat: 0.4,
    knit: 'liso',
    knitDepth: 0,
    stiffness: 3,
  },
} satisfies Record<string, Fabric>

export type FabricId = keyof typeof FABRICS
