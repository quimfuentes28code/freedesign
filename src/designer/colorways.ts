import type { Colorway, DesignData } from '../shared/designs'

/**
 * Variantes de color (colorways) de un diseño. La activa vive siempre en `data.pieces`
 * (así el dibujo, la vista 3D y la ficha técnica la usan sin saber nada de variantes);
 * `data.colorways` guarda todas, y la activa se actualiza desde `pieces` al cambiar de una a otra.
 */

const MAIN = 'principal'

/** Todas las variantes, con la activa al día. Un diseño sin variantes tiene una: «Principal». */
export function colorwaysOf(data: DesignData): Colorway[] {
  const list = data.colorways?.length ? data.colorways : [{ id: MAIN, name: 'Principal', pieces: data.pieces }]
  const active = activeColorwayId(data)
  return list.map((c) => (c.id === active ? { ...c, pieces: data.pieces } : c))
}

export const activeColorwayId = (data: DesignData) => data.activeColorway ?? data.colorways?.[0]?.id ?? MAIN

/** Pasa a otra variante: guarda la actual y carga sus piezas. */
export function switchColorway(data: DesignData, id: string): DesignData {
  const list = colorwaysOf(data)
  const target = list.find((c) => c.id === id)
  if (!target) return data
  return { ...data, colorways: list, activeColorway: id, pieces: target.pieces }
}

/** Nueva variante a partir de la actual (copia sus colores y materiales) y pasa a ella. */
export function addColorway(data: DesignData, name: string): DesignData {
  const list = colorwaysOf(data)
  const c: Colorway = { id: crypto.randomUUID(), name, pieces: structuredClone(data.pieces) }
  return { ...data, colorways: [...list, c], activeColorway: c.id, pieces: c.pieces }
}

export function renameColorway(data: DesignData, id: string, name: string): DesignData {
  return { ...data, colorways: colorwaysOf(data).map((c) => (c.id === id ? { ...c, name } : c)), activeColorway: activeColorwayId(data) }
}

/** Quita una variante (siempre queda al menos una). Si era la activa, pasa a la primera. */
export function removeColorway(data: DesignData, id: string): DesignData {
  const list = colorwaysOf(data).filter((c) => c.id !== id)
  if (!list.length) return data
  const active = activeColorwayId(data) === id ? list[0] : list.find((c) => c.id === activeColorwayId(data))!
  return { ...data, colorways: list, activeColorway: active.id, pieces: active.pieces }
}

/** Datos del diseño con otra variante puesta (para dibujarla sin cambiar la activa). */
export const withColorway = (data: DesignData, c: Colorway): DesignData => ({ ...data, pieces: c.pieces })
