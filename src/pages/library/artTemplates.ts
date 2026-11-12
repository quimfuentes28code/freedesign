import type { ArtLayer, ShapeKind } from '../../shared/artworks'
import type { BrandColor } from '../../shared/users'

/**
 * Plantillas de logo del creador: capas listas para editar (lienzo de 600 × 600). Usan los dos primeros colores de
 * la marca (si los hay) y un claro de fondo, así cada cuenta las ve ya con sus colores.
 */

export interface TemplatePalette {
  main: string
  accent: string
  light: string
}

export const templatePalette = (brand: BrandColor[]): TemplatePalette => ({
  main: brand[0]?.hex ?? '#1f2a44',
  accent: brand[1]?.hex ?? '#b3261e',
  light: '#f2efe8',
})

type TextLayer = Extract<ArtLayer, { type: 'text' }>
type ShapeLayer = Extract<ArtLayer, { type: 'shape' }>

export interface LogoTemplate {
  id: string
  label: string
  build: (c: TemplatePalette, id: () => string) => ArtLayer[]
}

const text = (id: string, t: Partial<TextLayer> & Pick<TextLayer, 'text' | 'x' | 'y'>): TextLayer => ({
  id,
  type: 'text',
  font: "'Anton', sans-serif",
  size: 48,
  color: '#1d1d1f',
  bold: false,
  italic: false,
  letterSpacing: 0,
  stroke: '',
  strokeWidth: 4,
  arc: 0,
  rotation: 0,
  ...t,
})

const shape = (id: string, kind: ShapeKind, s: Partial<ShapeLayer> & Pick<ShapeLayer, 'x' | 'y' | 'w' | 'h'>): ShapeLayer => ({
  id,
  type: 'shape',
  shape: kind,
  fill: '#1d1d1f',
  stroke: '',
  strokeWidth: 6,
  rotation: 0,
  ...s,
})

const COLLEGE = "'Graduate', serif"
const SLAB = "'Alfa Slab One', serif"
const WESTERN = "'Rye', serif"

export const LOGO_TEMPLATES: LogoTemplate[] = [
  {
    id: 'college',
    label: 'Escudo college',
    build: (c, id) => [
      text(id(), { text: 'FREEDESIGN', font: COLLEGE, size: 50, color: c.main, letterSpacing: 4, warp: 'arco', arc: 28, x: 300, y: 112 }),
      shape(id(), 'shield', { fill: c.main, stroke: c.accent, strokeWidth: 12, x: 300, y: 318, w: 270, h: 320 }),
      text(id(), { text: 'EST. 2026', font: COLLEGE, size: 22, color: c.light, letterSpacing: 4, x: 300, y: 205 }),
      text(id(), { text: 'F', font: SLAB, size: 190, color: c.light, stroke: c.accent, strokeWidth: 8, x: 300, y: 310 }),
      shape(id(), 'ribbon', { fill: c.accent, x: 300, y: 488, w: 420, h: 130 }),
      text(id(), { text: 'ATHLETIC DEPT.', font: COLLEGE, size: 30, color: c.light, letterSpacing: 2, x: 300, y: 476 }),
    ],
  },
  {
    id: 'sello',
    label: 'Sello circular',
    build: (c, id) => [
      shape(id(), 'circle', { fill: c.light, stroke: c.main, strokeWidth: 10, x: 300, y: 300, w: 470, h: 470 }),
      shape(id(), 'circle', { fill: '', stroke: c.main, strokeWidth: 3, x: 300, y: 300, w: 300, h: 300 }),
      text(id(), { text: 'FREEDESIGN STUDIO', font: "'Bebas Neue', sans-serif", size: 50, color: c.main, letterSpacing: 6, warp: 'arco', arc: 62, x: 300, y: 140 }),
      text(id(), { text: 'HECHO A MANO', font: "'Bebas Neue', sans-serif", size: 44, color: c.main, letterSpacing: 6, warp: 'arco', arc: -52, x: 300, y: 462 }),
      shape(id(), 'star', { fill: c.accent, x: 108, y: 300, w: 34, h: 34 }),
      shape(id(), 'star', { fill: c.accent, x: 492, y: 300, w: 34, h: 34 }),
      text(id(), { text: 'FD', font: "'Bebas Neue', sans-serif", size: 150, color: c.accent, letterSpacing: 2, x: 300, y: 288 }),
      text(id(), { text: 'EST. 2026', font: "'Bebas Neue', sans-serif", size: 26, color: c.main, letterSpacing: 6, x: 300, y: 380 }),
    ],
  },
  {
    id: 'vintage',
    label: 'Badge vintage',
    build: (c, id) => [
      shape(id(), 'badge', { fill: c.main, points: 18, x: 300, y: 300, w: 500, h: 500 }),
      shape(id(), 'circle', { fill: c.light, stroke: c.main, strokeWidth: 4, x: 300, y: 300, w: 400, h: 400 }),
      shape(id(), 'laurel', { fill: c.main, points: 9, x: 300, y: 318, w: 330, h: 300 }),
      text(id(), { text: 'ORIGINAL GOODS', font: WESTERN, size: 30, color: c.main, letterSpacing: 3, warp: 'arco', arc: 50, x: 300, y: 168 }),
      text(id(), { text: '1994', font: WESTERN, size: 74, color: c.main, x: 300, y: 292 }),
      shape(id(), 'ribbon', { fill: c.accent, x: 300, y: 414, w: 380, h: 118 }),
      text(id(), { text: 'QUALITY', font: WESTERN, size: 30, color: c.light, letterSpacing: 3, x: 300, y: 404 }),
    ],
  },
  {
    id: 'varsity',
    label: 'Número varsity',
    build: (c, id) => [
      text(id(), { text: 'FREEDESIGN', font: COLLEGE, size: 58, color: c.main, stroke: c.light, strokeWidth: 3, letterSpacing: 4, warp: 'arco', arc: 34, x: 300, y: 130 }),
      text(id(), { text: '23', font: COLLEGE, size: 280, color: c.light, stroke: c.main, strokeWidth: 12, stroke2: c.accent, stroke2Width: 12, x: 300, y: 330 }),
      text(id(), { text: 'ATHLETICS', font: COLLEGE, size: 30, color: c.accent, letterSpacing: 14, x: 300, y: 500 }),
    ],
  },
  {
    id: 'monograma',
    label: 'Monograma',
    build: (c, id) => [
      shape(id(), 'circle', { fill: '', stroke: c.main, strokeWidth: 4, x: 300, y: 270, w: 340, h: 340 }),
      shape(id(), 'circle', { fill: '', stroke: c.main, strokeWidth: 1.5, x: 300, y: 270, w: 318, h: 318 }),
      text(id(), { text: 'F', font: "'Playfair Display', serif", size: 220, color: c.main, italic: true, x: 262, y: 262 }),
      text(id(), { text: 'D', font: "'Playfair Display', serif", size: 220, color: c.accent, italic: true, x: 340, y: 282 }),
      shape(id(), 'line', { fill: c.main, x: 118, y: 490, w: 60, h: 3 }),
      text(id(), { text: 'FREEDESIGN', font: "'Cinzel', serif", size: 26, color: c.main, letterSpacing: 10, x: 300, y: 490 }),
      shape(id(), 'line', { fill: c.main, x: 482, y: 490, w: 60, h: 3 }),
    ],
  },
  {
    id: 'street',
    label: 'Streetwear',
    build: (c, id) => [
      text(id(), { text: 'FREE\nDESIGN', font: "'Anton', sans-serif", size: 150, color: c.main, lineHeight: 0.92, letterSpacing: 2, shadow: c.accent, shadowX: 9, shadowY: 9, x: 290, y: 300 }),
      shape(id(), 'burst', { fill: c.accent, points: 16, rotation: 14, x: 470, y: 150, w: 150, h: 150 }),
      text(id(), { text: 'NEW', font: "'Anton', sans-serif", size: 40, color: c.light, letterSpacing: 2, rotation: 14, x: 470, y: 150 }),
      text(id(), { text: '— TALLER DE PRENDAS —', font: "'Space Mono', monospace", size: 18, color: c.main, letterSpacing: 4, x: 300, y: 495 }),
    ],
  },
]

/**
 * Logos tipográficos (los estilos de la hoja de referencia, con textos inventados: nunca marcas reales). Usan el color
 * principal y el de acento; se cambian el texto, la fuente y los colores en el creador.
 */
LOGO_TEMPLATES.push(
  {
    id: 'contorno',
    label: 'Contorno condensado',
    build: (c, id) => [text(id(), { text: 'NIGHT SHIFT', font: "'Anton', sans-serif", size: 110, color: c.light, stroke: c.main, strokeWidth: 5, letterSpacing: 2, x: 300, y: 300 })],
  },
  {
    id: 'ovalo',
    label: 'Óvalo',
    build: (c, id) => [
      shape(id(), 'circle', { fill: c.main, stroke: '', x: 300, y: 300, w: 540, h: 260 }),
      shape(id(), 'circle', { fill: '', stroke: c.light, strokeWidth: 5, x: 300, y: 300, w: 500, h: 222 }),
      text(id(), { text: 'ROUGH CUT', font: "'Shrikhand', cursive", size: 78, color: c.light, warp: 'abombado', warpAmount: 40, x: 300, y: 300 }),
    ],
  },
  {
    id: 'script',
    label: 'Script con fuerza',
    build: (c, id) => [
      text(id(), { text: 'You\ngot\nthis!', font: "'Shrikhand', cursive", size: 110, color: c.main, lineHeight: 0.85, rotation: -8, x: 300, y: 300 }),
    ],
  },
  {
    id: 'elegante',
    label: 'Serif elegante',
    build: (c, id) => [
      text(id(), { text: 'Velvet', font: "'Playfair Display', serif", size: 120, color: c.main, italic: true, x: 270, y: 270 }),
      text(id(), { text: 'Riot', font: "'Playfair Display', serif", size: 120, color: c.main, italic: true, x: 350, y: 370 }),
      text(id(), { text: 'STUDIO GOODS', font: "'Space Mono', monospace", size: 18, color: c.accent, letterSpacing: 6, x: 300, y: 450 }),
    ],
  },
  {
    id: 'circular',
    label: 'Dentro de un círculo',
    build: (c, id) => [
      shape(id(), 'circle', { fill: '', stroke: c.main, strokeWidth: 8, x: 300, y: 300, w: 440, h: 440 }),
      text(id(), { text: 'WILD\nMINDS', font: "'Archivo Black', sans-serif", size: 110, color: c.main, lineHeight: 0.9, warp: 'abombado', warpAmount: 60, x: 300, y: 300 }),
    ],
  },
  {
    id: 'corporativo',
    label: 'Corporativo ™',
    build: (c, id) => [
      text(id(), { text: 'OVERTHINK™', font: "'Archivo Black', sans-serif", size: 70, color: c.main, letterSpacing: 1, x: 300, y: 270 }),
      text(id(), { text: 'AN OFFBEAT EXPERIMENT\nEST. 2026', font: "'Space Mono', monospace", size: 15, color: c.main, align: 'left', lineHeight: 1.3, x: 190, y: 330 }),
      text(id(), { text: '41.38° N  2.17° E\nBARCELONA', font: "'Space Mono', monospace", size: 15, color: c.main, align: 'right', lineHeight: 1.3, x: 420, y: 330 }),
    ],
  },
  {
    id: 'estirado',
    label: 'Estirado',
    build: (c, id) => [
      text(id(), { text: 'STRETCH', font: "'Bebas Neue', sans-serif", size: 120, color: c.main, warp: 'perspectiva', warpAmount: 50, letterSpacing: 4, x: 300, y: 250 }),
      text(id(), { text: 'FORM', font: "'Bebas Neue', sans-serif", size: 160, color: c.accent, warp: 'bandera', warpAmount: 40, letterSpacing: 10, x: 300, y: 380 }),
    ],
  },
  {
    id: 'redondeado',
    label: 'Redondo con firma',
    build: (c, id) => [
      text(id(), { text: 'GLOWING', font: "'Rubik Mono One', sans-serif", size: 66, color: c.main, warp: 'arco', arc: 18, x: 300, y: 285 }),
      text(id(), { text: 'clothing.co', font: "'Space Mono', monospace", size: 20, color: c.main, letterSpacing: 4, x: 300, y: 350 }),
    ],
  },
  {
    id: 'repetido',
    label: 'Palabra repetida',
    build: (c, id) =>
      [0, 1, 2, 3].map((i) =>
        text(id(), { text: 'RESTLESS', font: "'Anton', sans-serif", size: 78, color: i === 0 ? c.main : c.light, stroke: c.main, strokeWidth: i === 0 ? 0 : 3, italic: true, letterSpacing: 2, x: 300, y: 190 + i * 72 }),
      ),
  },
  {
    id: 'gotico',
    label: 'Gótico',
    build: (c, id) => [
      text(id(), { text: 'OLD', font: "'Alfa Slab One', serif", size: 110, color: c.main, letterSpacing: 6, x: 300, y: 240 }),
      text(id(), { text: 'Soul', font: "'UnifrakturMaguntia', cursive", size: 140, color: c.accent, x: 300, y: 375 }),
    ],
  },
  {
    id: 'retro',
    label: 'Retro',
    build: (c, id) => [
      text(id(), { text: 'Lazy\nSunday', font: "'Lobster', cursive", size: 100, color: c.light, stroke: c.main, strokeWidth: 8, shadow: c.accent, shadowX: 8, shadowY: 8, lineHeight: 0.95, rotation: -6, x: 300, y: 300 }),
    ],
  },
  {
    id: 'flor',
    label: 'Con flor',
    build: (c, id) => [
      shape(id(), 'star', { fill: c.accent, points: 14, inner: 0.55, x: 300, y: 230, w: 230, h: 230 }),
      shape(id(), 'circle', { fill: c.main, x: 300, y: 230, w: 90, h: 90 }),
      text(id(), { text: 'MARIGOLD', font: "'Archivo Black', sans-serif", size: 66, color: c.main, letterSpacing: 2, x: 300, y: 420 }),
    ],
  },
)

/** Capas de una plantilla con ids nuevos (para el lienzo) o fijos (para las miniaturas). */
export function buildTemplate(t: LogoTemplate, c: TemplatePalette, prefix?: string) {
  let n = 0
  return t.build(c, () => (prefix ? `${prefix}-${n++}` : crypto.randomUUID()))
}
