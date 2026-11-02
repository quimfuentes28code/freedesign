/** Propiedades visuales de cada tela para MeshPhysicalMaterial de Three.js. */
export interface Fabric {
  name: string
  defaultColor: string
  roughness: number
  sheen: number
  sheenRoughness: number
  clearcoat: number
}

export const FABRICS = {
  algodon: { name: 'Algodón', defaultColor: '#f2efe8', roughness: 0.9, sheen: 0.3, sheenRoughness: 0.8, clearcoat: 0 },
  lino: { name: 'Lino', defaultColor: '#d8cbb0', roughness: 1, sheen: 0.2, sheenRoughness: 1, clearcoat: 0 },
  seda: { name: 'Seda', defaultColor: '#b8324a', roughness: 0.35, sheen: 1, sheenRoughness: 0.3, clearcoat: 0 },
  denim: { name: 'Denim', defaultColor: '#3b5b8c', roughness: 1, sheen: 0.1, sheenRoughness: 1, clearcoat: 0 },
  lana: { name: 'Lana', defaultColor: '#7a6a58', roughness: 1, sheen: 0.7, sheenRoughness: 0.9, clearcoat: 0 },
  cuero: { name: 'Cuero', defaultColor: '#2b211c', roughness: 0.45, sheen: 0, sheenRoughness: 1, clearcoat: 0.4 },
} satisfies Record<string, Fabric>

export type FabricId = keyof typeof FABRICS
