// Ajustes del lienzo (lo que se recuerda en el navegador), herramientas y paneles.

import { type CanvasDoc, type SurfaceKind } from '../shared/designs'
import { type Symmetry } from './brushes'
import { type LightFrom, type ShadeStyle } from './shading'

/** Puntero de los trazos que llegan del móvil que hace de tableta (no choca con los del navegador). */
export const REMOTE_POINTER = 987654

export type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'move' | 'text' | 'select' | 'wand' | 'shaper' | 'curve' | 'pen' | 'vpencil' | 'direct' | 'vshape'
export type Panel = 'brushes' | 'layers' | 'color' | 'ajustes' | 'acciones' | 'biblioteca' | 'opciones' | 'ia' | 'luces' | null

export interface Settings {
  brush: string
  eraser: string
  color: string
  recent: string[]
  /** Tamaño y opacidad elegidos para cada pincel. */
  sizes: Record<string, number>
  opacities: Record<string, number>
  streamline: Record<string, number>
  symmetry: Symmetry
  grid: boolean
  gridSize: number
  /** Pintar solo dentro de las prendas (mockups). */
  inside: boolean
  /** Bote: pinta la pieza de la prenda que se toca o rellena la zona cerrada de lo pintado. */
  fillMode: 'pieza' | 'zona'
  /** Con qué rellena el bote: color liso o un estampado (con su segundo color, tamaño en cm y, si es imagen, el archivo). */
  fillPattern: { kind: SurfaceKind; color2: string; size: number; angle: number; file?: string }
  /** Pincel de estampado: segundo y tercer color y tamaño del dibujo (cm; 0 = el de siempre). */
  patternColors?: [string, string]
  patternSize?: number
  /** Con lápiz, el dedo solo mueve el lienzo (si no, un dedo pinta y dos acercan y mueven). */
  penOnly?: boolean
  /** Botón flotante del menú rápido: dónde está (fracción del ancho y alto del lienzo). */
  fab?: [number, number]
  /** Guía de perspectiva: sin, de 1 o de 2 puntos de fuga (en fracción del lienzo). */
  perspective: 0 | 1 | 2
  vps: [number, number][]
  /** Copias de la simetría radial y giratoria. */
  symmetryCount: number
  /** Centro de la simetría (en fracción del lienzo). */
  axis: [number, number]
  /** Asistencia de dibujo: el trazo sigue la guía (cuadrícula o perspectiva). */
  assist: boolean
  gridKind: 'cuadrada' | 'isometrica'
  /** Luces y sombras automáticas: estilo y de dónde viene la luz. */
  shadeStyle: ShadeStyle
  lightFrom: LightFrom
}
export const DEFAULTS: Settings = { brush: 'tecnica', eraser: 'aeroduro', color: '#1d1c1a', recent: [], sizes: {}, opacities: {}, streamline: {}, symmetry: 'none', grid: false, gridSize: 50, inside: false, fillMode: 'pieza', fillPattern: { kind: 'liso', color2: '#ffffff', size: 3, angle: 0 }, perspective: 0, vps: [[0.5, 0.42], [0.08, 0.42], [0.92, 0.42]], symmetryCount: 6, axis: [0.5, 0.5], assist: false, gridKind: 'cuadrada', shadeStyle: 'suave', lightFrom: 'izquierda' }
export const KEY = 'fd:lienzo'
export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export const uid = () => crypto.randomUUID()

/** Lienzo nuevo: delante y detrás de la prenda en línea, para pintar encima, y una capa de pintura. */
export function defaultDoc(): CanvasDoc {
  return {
    w: 2000,
    h: 1400,
    paper: '#ffffff',
    layers: [
      { id: uid(), kind: 'mockup', name: 'Prenda · Delantero', view: 'front', x: 140, y: 120, w: 820, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' },
      { id: uid(), kind: 'mockup', name: 'Prenda · Espalda', view: 'back', x: 1040, y: 120, w: 820, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' },
      { id: uid(), kind: 'paint', name: 'Capa 1', file: null, visible: true, locked: false, opacity: 1, blend: 'normal' },
    ],
  }
}
