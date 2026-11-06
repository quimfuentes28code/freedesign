import type { GarmentSlot } from '../../types'
import type { EdgeKind } from './Cloth'

/**
 * Pieza pequeña cosida encima de la tela (bolsillo de parche, solapa, vivo de un bolsillo de ojal, vista del bolsillo
 * lateral del pantalón): se describe en el patrón plano de la pieza sobre la que va (cm) y, una vez asentada la
 * prenda, se construye pegada a su superficie, con su forma exacta y sus pespuntes (ver `addPatches` en dress.ts).
 */
export interface Patch {
  /** Pieza del patrón sobre la que va. */
  panel: number
  /** Rejilla del parche y su forma: punto del patrón plano (cm) para cada (u, v) de 0 a 1. */
  nu: number
  nv: number
  shape: (u: number, v: number) => [number, number]
  /** Acabado de sus bordes: columna 0, última columna, fila 0 y última fila. */
  edges: [EdgeKind, EdgeKind, EdgeKind, EdgeKind]
  /** Separación de la tela (cm): lo que abulta. */
  lift: number
  slot: GarmentSlot
  /** Botón sobre el parche (en su u, v) y su diámetro (cm). */
  button?: { u: number; v: number; size: number }
}

/** Pieza suelta con forma de caja sobre un punto de la tela (trabillas): ancho, alto y grueso en cm. */
export interface Tab {
  vertex: number
  size: [number, number, number]
  slot: GarmentSlot
}

/** Rectángulo (girado `angle` grados) centrado en (cx, cy), de `w` × `h` cm. */
export const rectShape =
  (cx: number, cy: number, w: number, h: number, angle = 0, point = 0) =>
  (u: number, v: number): [number, number] => {
    // `point`: el borde de abajo acaba en pico (bolsillos de vaquero, solapas), cm que baja el centro
    const dy = point * (1 - Math.abs(u - 0.5) * 2) * (1 - v)
    const x = (u - 0.5) * w
    const y = (v - 0.5) * h - dy
    const a = (angle * Math.PI) / 180
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]
  }
