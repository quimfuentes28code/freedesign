import type { ArtLayer } from '../../shared/artworks'

/**
 * Generador de graffiti del creador: de un texto salen capas editables (lienzo de 600 × 600) con el estilo elegido:
 * burbuja (throw-up), wildstyle, blockbuster, 3D, tag o cromado; y sus efectos: degradado, contorno doble, volumen,
 * gotas que chorrean, brillos, flechas, estrellas y un fondo de nube, cuadros o estrellas.
 */

export type GraffitiStyle = 'burbuja' | 'wild' | 'bloque' | '3d' | 'tag' | 'cromado'
export type GraffitiBackground = 'ninguno' | 'nube' | 'cuadros' | 'estrellas'

export interface GraffitiOptions {
  text: string
  style: GraffitiStyle
  /** Relleno (y segundo color del degradado), contorno, contorno de fuera y fondo. */
  fill: string
  fill2: string
  outline: string
  outer: string
  back: string
  background: GraffitiBackground
  drips: boolean
  shine: boolean
  volume: boolean
  doubleOutline: boolean
  arrows: boolean
  stars: boolean
  /** Inclinación (grados). */
  tilt: number
}

export const GRAFFITI_STYLES: { id: GraffitiStyle; label: string }[] = [
  { id: 'burbuja', label: 'Burbuja (throw-up)' },
  { id: 'wild', label: 'Wildstyle' },
  { id: 'bloque', label: 'Blockbuster' },
  { id: '3d', label: '3D' },
  { id: 'tag', label: 'Tag' },
  { id: 'cromado', label: 'Cromado' },
]

/** Lo de partida de cada estilo (al elegirlo se ponen estos efectos; luego se pueden cambiar). */
export const GRAFFITI_PRESETS: Record<GraffitiStyle, Partial<GraffitiOptions>> = {
  burbuja: { fill: '#ff5a1f', fill2: '#ff9a3c', outline: '#111111', outer: '#ffffff', drips: true, shine: true, volume: true, doubleOutline: true, arrows: false, stars: false, tilt: 0, background: 'ninguno' },
  wild: { fill: '#ff3fa4', fill2: '#ff9ad2', outline: '#111111', outer: '#f2c230', back: '#3a8dde', drips: false, shine: true, volume: true, doubleOutline: true, arrows: true, stars: true, tilt: -6, background: 'cuadros' },
  bloque: { fill: '#f2c230', fill2: '#f28c1d', outline: '#111111', outer: '#ffffff', drips: false, shine: false, volume: true, doubleOutline: true, arrows: false, stars: false, tilt: 0, background: 'nube' },
  '3d': { fill: '#3ddc84', fill2: '#1f9e5a', outline: '#111111', outer: '#ffffff', drips: false, shine: true, volume: true, doubleOutline: false, arrows: false, stars: false, tilt: -4, background: 'ninguno' },
  tag: { fill: '#111111', fill2: '#111111', outline: '#111111', outer: '#ffffff', drips: true, shine: false, volume: false, doubleOutline: false, arrows: false, stars: false, tilt: -8, background: 'ninguno' },
  cromado: { fill: '#ffffff', fill2: '#8a94a6', outline: '#111111', outer: '#d4256b', drips: false, shine: true, volume: true, doubleOutline: true, arrows: false, stars: true, tilt: -3, background: 'estrellas' },
}

export const DEFAULT_GRAFFITI: GraffitiOptions = { text: 'FREE', style: 'burbuja', back: '#7a3fd1', ...(GRAFFITI_PRESETS.burbuja as Omit<GraffitiOptions, 'text' | 'style' | 'back'>) }

/** Fuente, deformación y espaciado de cada estilo. */
const LOOK: Record<GraffitiStyle, { font: string; warp?: 'abombado' | 'onda' | 'perspectiva'; warpAmount?: number; spacing: number; italic?: boolean }> = {
  burbuja: { font: "'Rubik Bubbles', sans-serif", warp: 'abombado', warpAmount: 35, spacing: -4 },
  wild: { font: "'Rubik Beastly', sans-serif", warp: 'onda', warpAmount: 30, spacing: -8 },
  bloque: { font: "'Bungee', sans-serif", warp: 'perspectiva', warpAmount: 20, spacing: -2 },
  '3d': { font: "'Titan One', sans-serif", spacing: 0 },
  tag: { font: "'Sedgwick Ave Display', cursive", spacing: -2, italic: false },
  cromado: { font: "'Bungee', sans-serif", warp: 'abombado', warpAmount: 20, spacing: 0 },
}

/** Fuentes que usa el generador (para cargarlas antes de pintar). */
export const GRAFFITI_FONTS = [...new Set(Object.values(LOOK).map((l) => l.font))]

/** Oscurece un color (para el volumen). */
function darker(hex: string, f: number) {
  const v = parseInt(hex.slice(1), 16) || 0
  const ch = (s: number) => Math.round(((v >> s) & 255) * (1 - f))
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** Azar con semilla (el mismo texto da siempre el mismo graffiti). */
function seeded(text: string) {
  let a = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function graffitiLayers(o: GraffitiOptions, newId: () => string = () => crypto.randomUUID()): ArtLayer[] {
  const text = (o.text.trim() || 'FREE').toUpperCase().slice(0, 14)
  const look = LOOK[o.style]
  const len = Math.max(3, text.length)
  const size = Math.round(Math.min(190, Math.max(70, 960 / len)))
  const width = Math.min(560, size * 0.62 * len)
  const r = seeded(text + o.style)
  const cx = 300
  const cy = 300
  const out: ArtLayer[] = []
  const shape = (s: Partial<Extract<ArtLayer, { type: 'shape' }>> & Pick<Extract<ArtLayer, { type: 'shape' }>, 'shape' | 'x' | 'y' | 'w' | 'h'>): ArtLayer => ({
    id: newId(),
    type: 'shape',
    fill: o.back,
    stroke: '',
    strokeWidth: 0,
    rotation: 0,
    ...s,
  })
  const word = (t: Partial<Extract<ArtLayer, { type: 'text' }>>): ArtLayer => ({
    id: newId(),
    type: 'text',
    text,
    font: look.font,
    size,
    color: o.fill,
    bold: false,
    italic: !!look.italic,
    letterSpacing: look.spacing,
    stroke: '',
    strokeWidth: 0,
    arc: 0,
    rotation: o.tilt,
    x: cx,
    y: cy,
    ...(look.warp ? { warp: look.warp, warpAmount: look.warpAmount } : {}),
    ...t,
  })

  // Fondo
  if (o.background === 'nube') {
    // Nube de círculos detrás de las letras
    for (let i = 0; i < 11; i++) {
      const t = i / 10
      const d = 110 + r() * 70
      out.push(shape({ shape: 'circle', fill: o.back, x: cx - width / 2 + t * width, y: cy + (r() - 0.5) * size * 0.7, w: d, h: d * (0.85 + r() * 0.3), stroke: o.outline, strokeWidth: 0 }))
    }
  } else if (o.background === 'cuadros') {
    const cell = 46
    const cols = Math.ceil((width + 120) / cell)
    const rows = Math.ceil((size * 1.6) / cell)
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        if ((i + j) % 2 === 0 && r() > 0.12)
          out.push(shape({ shape: 'rect', fill: o.back, x: cx - (cols * cell) / 2 + (i + 0.5) * cell, y: cy - (rows * cell) / 2 + (j + 0.5) * cell, w: cell, h: cell, radius: 0.2 }))
  } else if (o.background === 'estrellas') {
    for (let i = 0; i < 9; i++) {
      const d = 30 + r() * 50
      out.push(shape({ shape: 'star', fill: o.back, points: 5, x: 40 + r() * 520, y: cy + (r() - 0.5) * 360, w: d, h: d, rotation: r() * 40 - 20 }))
    }
  }

  // Volumen: copias más oscuras desplazadas hacia abajo a la derecha
  if (o.volume) {
    const steps = o.style === '3d' || o.style === 'bloque' ? 12 : 7
    const shadow = darker(o.style === 'tag' ? '#555555' : o.fill2, 0.45)
    for (let i = steps; i >= 1; i--)
      out.push(word({ color: shadow, stroke: shadow, strokeWidth: size * 0.07, x: cx + i * 1.8, y: cy + i * 1.8 }))
  }

  // Gotas que chorrean desde la parte de abajo de las letras
  if (o.drips) {
    const n = Math.max(3, Math.round(len * 0.9))
    for (let i = 0; i < n; i++) {
      const x = cx - width / 2 + ((i + 0.5) / n) * width + (r() - 0.5) * 20
      const l = size * (0.25 + r() * 0.45)
      const w = size * (0.08 + r() * 0.05)
      const top = cy + size * 0.08
      out.push(shape({ shape: 'rect', fill: o.fill2, stroke: o.outline, strokeWidth: 3, radius: 1, x, y: top + l / 2, w, h: l }))
      out.push(shape({ shape: 'circle', fill: o.fill2, stroke: o.outline, strokeWidth: 3, x, y: top + l, w: w * 1.5, h: w * 1.7 }))
    }
  }

  // Las letras: relleno con degradado, contorno y (si se pide) contorno de fuera
  out.push(
    word({
      color: o.fill,
      ...(o.fill2 !== o.fill ? { gradient: o.fill2, gradientAngle: 90 } : {}),
      stroke: o.outline,
      strokeWidth: o.style === 'tag' ? 0 : Math.max(4, size * 0.06),
      ...(o.doubleOutline ? { stroke2: o.outer, stroke2Width: Math.max(4, size * 0.07) } : {}),
    }),
  )

  // Brillos: rayitas y puntos blancos en lo alto de las letras
  if (o.shine) {
    const n = Math.max(3, Math.round(len * 0.8))
    for (let i = 0; i < n; i++) {
      const x = cx - width / 2 + ((i + 0.3 + r() * 0.4) / n) * width
      const y = cy - size * (0.18 + r() * 0.1)
      out.push(shape({ shape: 'circle', fill: '#ffffff', x, y, w: size * 0.13, h: size * 0.07, rotation: -30 }))
      if (r() > 0.4) out.push(shape({ shape: 'circle', fill: '#ffffff', x: x + size * 0.1, y: y - size * 0.02, w: size * 0.04, h: size * 0.04 }))
    }
  }

  // Flechas que salen de las letras
  if (o.arrows) {
    out.push(shape({ shape: 'arrow', fill: o.fill, stroke: o.outline, strokeWidth: 5, x: cx + width / 2 + 10, y: cy - size * 0.55, w: 120, h: 46, rotation: -35 }))
    out.push(shape({ shape: 'arrow', fill: o.fill, stroke: o.outline, strokeWidth: 5, x: cx - width / 2 - 10, y: cy + size * 0.45, w: 110, h: 42, rotation: 160 }))
  }

  // Estrellas encima
  if (o.stars) {
    for (let i = 0; i < 4; i++) {
      const d = 26 + r() * 22
      out.push(shape({ shape: 'star', fill: '#ffd400', stroke: o.outline, strokeWidth: 3, points: 5, x: cx - width / 2 + r() * width, y: cy + (r() - 0.5) * size * 0.9, w: d, h: d }))
    }
  }
  return out
}
