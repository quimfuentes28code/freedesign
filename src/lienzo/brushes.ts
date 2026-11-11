/**
 * Pinceles del lienzo. Cada trazo se pinta estampando la punta del pincel a lo largo del recorrido (como Procreate):
 * su tamaño y opacidad siguen la presión del lápiz, el estabilizador quita el temblor y el grano del papel da textura.
 * El trazo se pinta en un canvas aparte y se funde con la capa al soltar (así un rotulador no se acumula en sí mismo).
 */

import { textureGrain } from './textures'

export type BrushGroup = 'Bocetar' | 'Entintar' | 'Pintar' | 'Aerógrafo' | 'Luces y sombras' | 'Texturas' | 'Costuras' | 'Fornituras' | 'Tejidos' | 'Desgaste' | 'Mis pinceles'

/** Formas que se dibujan en cada estampado en vez de la punta (costuras, cremallera, fornituras, desgaste). */
export type StampShape =
  | 'dash'
  | 'zigzag'
  | 'overlock'
  | 'chain'
  | 'cross'
  | 'zip'
  | 'rib'
  | 'button4'
  | 'jeansbutton'
  | 'rivet'
  | 'eyelet'
  | 'ring'
  | 'puller'
  | 'rip'
  | 'fray'
  | 'whisker'

export interface BrushPreset {
  id: string
  name: string
  group: BrushGroup
  /** Tamaño por defecto (px del lienzo) y opacidad por defecto. */
  size: number
  opacity: number
  /** Lo que pinta cada estampado (0–1): bajo = se va acumulando (aerógrafo). */
  flow: number
  /** Distancia entre estampados, en fracción del tamaño. */
  spacing: number
  /** Dureza del borde: 1 nítido, 0 muy difuminado. */
  hardness: number
  /** Grano del papel (0–1): la textura que se queda fija en el papel, como el lápiz sobre papel con grano. */
  grain: number
  /** Cuánto cambia el tamaño con la presión (0 nada, 1 de 0 al tamaño). */
  pressureSize: number
  /** Cuánto cambia la opacidad con la presión. */
  pressureOpacity: number
  /** Afinado al empezar y al acabar el trazo (en px de recorrido). */
  taper: number
  /** Estabilizador por defecto (0–1). */
  streamline: number
  /** Punta: redonda, plana (de pincel o rotulador biselado, girada según la dirección) o una imagen (pinceles propios). */
  tip: 'round' | 'flat' | 'image'
  /** Dispersión de los estampados (para tizas y salpicados), en fracción del tamaño. */
  scatter: number
  /** Forma dibujada en cada estampado (costuras, cremallera, fornituras, desgaste), girada según el trazo. */
  shape?: StampShape
  /** Copias paralelas al trazo, en fracción del tamaño (pespunte doble o triple). */
  rows?: number[]
  /** Grano con el dibujo de una tela (id de las texturas) en vez del papel. */
  grainTexture?: string
  /** Difuminar: arrastra lo que ya hay pintado en la capa. */
  smudge?: boolean
  /** Pincel con punta de imagen: la punta gira con el trazo. */
  orient?: boolean
  /**
   * Pincel de sombra o de luz: pinta en su capa (Sombras a mano o Luces a mano, que se crea sola), con el color de la
   * pieza que se toca oscurecido o aclarado, y sin salirse de la prenda.
   */
  shade?: 'sombra' | 'luz'
  /** Pinceles propios: imágenes de la punta y del grano (subidas a la cuenta). */
  tipFile?: string
  grainFile?: string
}

const STITCH = { opacity: 1, flow: 1, hardness: 1, grain: 0, pressureSize: 0, pressureOpacity: 0, taper: 0, streamline: 0.55, tip: 'round', scatter: 0 } as const
const STAMP = { opacity: 1, flow: 1, hardness: 1, grain: 0, pressureSize: 0, pressureOpacity: 0, taper: 0, streamline: 0.3, tip: 'round', scatter: 0 } as const
const FABRIC = { opacity: 1, flow: 1, spacing: 0.05, hardness: 0.85, grain: 0.95, pressureSize: 0.2, pressureOpacity: 0.2, taper: 0, streamline: 0.2, tip: 'round', scatter: 0 } as const

export const BRUSHES: BrushPreset[] = [
  { id: 'hb', name: 'Lápiz HB', group: 'Bocetar', size: 3, opacity: 0.85, flow: 0.7, spacing: 0.12, hardness: 0.7, grain: 0.55, pressureSize: 0.5, pressureOpacity: 0.8, taper: 0, streamline: 0.15, tip: 'round', scatter: 0 },
  { id: '6b', name: 'Lápiz 6B', group: 'Bocetar', size: 9, opacity: 0.9, flow: 0.6, spacing: 0.1, hardness: 0.55, grain: 0.75, pressureSize: 0.45, pressureOpacity: 0.85, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'tecnica', name: 'Plumilla técnica', group: 'Entintar', size: 3, opacity: 1, flow: 1, spacing: 0.05, hardness: 1, grain: 0, pressureSize: 0, pressureOpacity: 0, taper: 0, streamline: 0.55, tip: 'round', scatter: 0 },
  { id: 'tinta', name: 'Tinta de estudio', group: 'Entintar', size: 8, opacity: 1, flow: 1, spacing: 0.04, hardness: 0.95, grain: 0, pressureSize: 0.9, pressureOpacity: 0, taper: 40, streamline: 0.5, tip: 'round', scatter: 0 },
  { id: 'gel', name: 'Bolígrafo de gel', group: 'Entintar', size: 4, opacity: 1, flow: 1, spacing: 0.05, hardness: 0.9, grain: 0.1, pressureSize: 0.3, pressureOpacity: 0, taper: 12, streamline: 0.4, tip: 'round', scatter: 0 },
  { id: 'rotulador', name: 'Rotulador', group: 'Pintar', size: 18, opacity: 0.75, flow: 1, spacing: 0.06, hardness: 0.92, grain: 0, pressureSize: 0.15, pressureOpacity: 0, taper: 0, streamline: 0.3, tip: 'flat', scatter: 0 },
  { id: 'gouache', name: 'Gouache', group: 'Pintar', size: 30, opacity: 1, flow: 0.9, spacing: 0.06, hardness: 0.8, grain: 0.3, pressureSize: 0.5, pressureOpacity: 0.3, taper: 0, streamline: 0.2, tip: 'flat', scatter: 0 },
  { id: 'redondo', name: 'Pincel redondo', group: 'Pintar', size: 22, opacity: 1, flow: 0.85, spacing: 0.05, hardness: 0.75, grain: 0.15, pressureSize: 0.75, pressureOpacity: 0.2, taper: 20, streamline: 0.25, tip: 'round', scatter: 0 },
  { id: 'aero', name: 'Aerógrafo suave', group: 'Aerógrafo', size: 90, opacity: 1, flow: 0.06, spacing: 0.08, hardness: 0, grain: 0, pressureSize: 0, pressureOpacity: 1, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'aeroduro', name: 'Aerógrafo medio', group: 'Aerógrafo', size: 40, opacity: 1, flow: 0.15, spacing: 0.08, hardness: 0.45, grain: 0, pressureSize: 0, pressureOpacity: 1, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'sombra', name: 'Sombra de tela', group: 'Aerógrafo', size: 60, opacity: 0.5, flow: 0.08, spacing: 0.08, hardness: 0.1, grain: 0.2, pressureSize: 0.3, pressureOpacity: 1, taper: 0, streamline: 0.3, tip: 'round', scatter: 0 },
  { id: 'carbon', name: 'Carboncillo', group: 'Texturas', size: 22, opacity: 0.9, flow: 0.5, spacing: 0.1, hardness: 0.5, grain: 0.85, pressureSize: 0.4, pressureOpacity: 0.6, taper: 0, streamline: 0.1, tip: 'flat', scatter: 0.05 },
  { id: 'desgaste', name: 'Desgaste', group: 'Texturas', size: 50, opacity: 0.8, flow: 0.35, spacing: 0.15, hardness: 0.6, grain: 0.95, pressureSize: 0.2, pressureOpacity: 0.7, taper: 0, streamline: 0, tip: 'round', scatter: 0.35 },
  { id: 'salpicado', name: 'Salpicado', group: 'Texturas', size: 40, opacity: 1, flow: 0.9, spacing: 0.6, hardness: 0.9, grain: 0, pressureSize: 0.3, pressureOpacity: 0, taper: 0, streamline: 0, tip: 'round', scatter: 1.2 },
  { id: 'difuminar', name: 'Difuminar', group: 'Pintar', size: 40, opacity: 1, flow: 0.7, spacing: 0.08, hardness: 0.2, grain: 0, pressureSize: 0.3, pressureOpacity: 0.6, taper: 0, streamline: 0.2, tip: 'round', scatter: 0, smudge: true },
  { id: 'acuarela', name: 'Acuarela', group: 'Pintar', size: 50, opacity: 0.8, flow: 0.14, spacing: 0.08, hardness: 0.25, grain: 0.6, pressureSize: 0.5, pressureOpacity: 0.6, taper: 0, streamline: 0.2, tip: 'round', scatter: 0.04, grainTexture: 'papel' },
  // Luces y sombras: el color sale solo de la pieza
  { id: 'sombrasuave', name: 'Sombra suave', group: 'Luces y sombras', size: 90, opacity: 0.85, flow: 0.07, spacing: 0.08, hardness: 0, grain: 0, pressureSize: 0.2, pressureOpacity: 1, taper: 0, streamline: 0.3, tip: 'round', scatter: 0, shade: 'sombra' },
  { id: 'sombramarcada', name: 'Sombra marcada', group: 'Luces y sombras', size: 30, opacity: 0.75, flow: 0.6, spacing: 0.05, hardness: 0.6, grain: 0, pressureSize: 0.6, pressureOpacity: 0.4, taper: 25, streamline: 0.4, tip: 'round', scatter: 0, shade: 'sombra' },
  { id: 'luzsuave', name: 'Luz suave', group: 'Luces y sombras', size: 90, opacity: 0.8, flow: 0.07, spacing: 0.08, hardness: 0, grain: 0, pressureSize: 0.2, pressureOpacity: 1, taper: 0, streamline: 0.3, tip: 'round', scatter: 0, shade: 'luz' },
  { id: 'brillo', name: 'Brillo', group: 'Luces y sombras', size: 12, opacity: 0.9, flow: 0.9, spacing: 0.05, hardness: 0.8, grain: 0, pressureSize: 0.8, pressureOpacity: 0.3, taper: 30, streamline: 0.5, tip: 'round', scatter: 0, shade: 'luz' },
  // Costuras (el color es el del hilo)
  { ...STITCH, id: 'pespunte', name: 'Pespunte', group: 'Costuras', size: 5, spacing: 2.2, shape: 'dash' },
  { ...STITCH, id: 'pespunte2', name: 'Pespunte doble', group: 'Costuras', size: 5, spacing: 2.2, shape: 'dash', rows: [-1.5, 1.5] },
  { ...STITCH, id: 'pespunte3', name: 'Pespunte triple', group: 'Costuras', size: 5, spacing: 2.2, shape: 'dash', rows: [-2.6, 0, 2.6] },
  { ...STITCH, id: 'denimgrueso', name: 'Pespunte de denim', group: 'Costuras', size: 8, spacing: 2.4, shape: 'dash', rows: [-1.6, 1.6] },
  { ...STITCH, id: 'zigzag', name: 'Zigzag', group: 'Costuras', size: 5, spacing: 1.6, shape: 'zigzag' },
  { ...STITCH, id: 'overlock', name: 'Overlock', group: 'Costuras', size: 7, spacing: 1, shape: 'overlock' },
  { ...STITCH, id: 'cadeneta', name: 'Cadeneta', group: 'Costuras', size: 6, spacing: 1.6, shape: 'chain' },
  { ...STITCH, id: 'cruz', name: 'Punto de cruz', group: 'Costuras', size: 10, spacing: 1.4, shape: 'cross' },
  // Fornituras: al arrastrar sale una fila; con un toque, una sola
  { ...STAMP, id: 'cremallera', name: 'Cremallera', group: 'Fornituras', size: 22, spacing: 0.42, shape: 'zip' },
  { ...STAMP, id: 'cremallerafina', name: 'Cremallera fina', group: 'Fornituras', size: 12, spacing: 0.42, shape: 'zip' },
  { ...STAMP, id: 'botones', name: 'Botones', group: 'Fornituras', size: 40, spacing: 2.4, shape: 'button4' },
  { ...STAMP, id: 'botonjeans', name: 'Botón jeans', group: 'Fornituras', size: 36, spacing: 2.4, shape: 'jeansbutton' },
  { ...STAMP, id: 'remaches', name: 'Remaches', group: 'Fornituras', size: 16, spacing: 2.6, shape: 'rivet' },
  { ...STAMP, id: 'ojetes', name: 'Ojetes', group: 'Fornituras', size: 18, spacing: 2.2, shape: 'eyelet' },
  { ...STAMP, id: 'anillas', name: 'Anillas', group: 'Fornituras', size: 30, spacing: 2.2, shape: 'ring' },
  { ...STAMP, id: 'tiradores', name: 'Tiradores', group: 'Fornituras', size: 40, spacing: 3, shape: 'puller' },
  // Tejidos: el trazo sale con el dibujo de la tela
  { ...FABRIC, id: 'tej-denim', name: 'Denim', group: 'Tejidos', size: 60, grainTexture: 'denim' },
  { ...FABRIC, id: 'tej-punto', name: 'Punto', group: 'Tejidos', size: 60, grainTexture: 'punto' },
  { ...FABRIC, id: 'tej-felpa', name: 'Felpa', group: 'Tejidos', size: 60, grainTexture: 'felpa' },
  { ...FABRIC, id: 'tej-malla', name: 'Malla', group: 'Tejidos', size: 60, grainTexture: 'malla2' },
  { ...FABRIC, id: 'tej-canale', name: 'Canalé', group: 'Tejidos', size: 60, grainTexture: 'canale' },
  { ...FABRIC, id: 'tej-pana', name: 'Pana', group: 'Tejidos', size: 60, grainTexture: 'pana' },
  { ...STITCH, id: 'puno', name: 'Puño de canalé', group: 'Tejidos', size: 40, spacing: 0.22, shape: 'rib', streamline: 0.4 },
  // Desgaste
  { id: 'desgaste3d', name: 'Desgaste 3D', group: 'Desgaste', size: 70, opacity: 0.8, flow: 0.25, spacing: 0.1, hardness: 0.3, grain: 0.9, pressureSize: 0.3, pressureOpacity: 0.8, taper: 0, streamline: 0.1, tip: 'round', scatter: 0.15, grainTexture: 'denim-stone' },
  { ...STAMP, id: 'rotos', name: 'Rotos (hilos)', group: 'Desgaste', size: 50, spacing: 0.5, shape: 'rip', scatter: 0.15, streamline: 0.1 },
  { ...STAMP, id: 'deshilachado', name: 'Deshilachado', group: 'Desgaste', size: 30, spacing: 0.35, shape: 'fray', streamline: 0.1 },
  { id: 'bigotes', name: 'Sombra de jean (bigotes)', group: 'Desgaste', size: 40, opacity: 0.7, flow: 0.3, spacing: 0.15, hardness: 0, grain: 0.3, pressureSize: 0.5, pressureOpacity: 0.6, taper: 30, streamline: 0.4, tip: 'round', scatter: 0, shape: 'whisker', grainTexture: 'denim' },
]

/** Imágenes de la punta y el grano de los pinceles propios (se cargan al abrir el lienzo). */
const customTips = new Map<string, HTMLCanvasElement>()
const customGrains = new Map<string, HTMLCanvasElement>()
export function registerBrushImages(id: string, tip: HTMLCanvasElement | null, grain: HTMLCanvasElement | null) {
  if (tip) customTips.set(id, tip)
  else customTips.delete(id)
  if (grain) customGrains.set(id, grain)
  else customGrains.delete(id)
}

/** Grano de un pincel: el suyo propio, el de una tela o el del papel. */
export function grainFor(b: BrushPreset): HTMLCanvasElement {
  return (b.grainFile && customGrains.get(b.id)) || (b.grainTexture ? textureGrain(b.grainTexture) : paperGrain())
}

/** Puntas ya dibujadas (por dureza y forma), en blanco sobre transparente: se tiñen al estampar. */
const tips = new Map<string, HTMLCanvasElement>()
const TIP = 128
function tipCanvas(hardness: number, tip: 'round' | 'flat' | 'image', speck: boolean) {
  const key = `${Math.round(hardness * 20)}-${tip}-${speck}`
  let c = tips.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = TIP
  const g = c.getContext('2d')!
  const r = TIP / 2
  if (speck) {
    // Punta de salpicado: un puñado de gotitas
    g.fillStyle = '#fff'
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() ** 0.6 * r * 0.9
      g.beginPath()
      g.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, 2 + Math.random() * 7, 0, Math.PI * 2)
      g.fill()
    }
  } else {
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    const solid = Math.min(0.98, Math.max(0, hardness))
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(solid, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    if (tip === 'flat') {
      g.save()
      g.translate(r, r)
      g.scale(1, 0.32)
      g.translate(-r, -r)
      g.beginPath()
      g.arc(r, r, r, 0, Math.PI * 2)
      g.fill()
      g.restore()
    } else {
      g.beginPath()
      g.arc(r, r, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  tips.set(key, c)
  return c
}

/** Punta teñida de un color (se rehace al cambiar de color o de pincel). */
let tinted: { key: string; canvas: HTMLCanvasElement } | null = null
function tintedTip(b: BrushPreset, color: string) {
  const key = `${b.id}-${b.hardness}-${b.tip}-${color}-${customTips.has(b.id)}`
  if (tinted?.key === key) return tinted.canvas
  const src = (b.tip === 'image' && customTips.get(b.id)) || tipCanvas(b.hardness, b.tip, b.id === 'salpicado')
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  tinted = { key, canvas: c }
  return c
}

/** Grano del papel: ruido que se repite, fijo al lienzo (no se mueve con el trazo). */
let grainPattern: HTMLCanvasElement | null = null
export function paperGrain() {
  if (grainPattern) return grainPattern
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const img = g.createImageData(256, 256)
  // Ruido suave a dos escalas (grano de papel, no píxeles sueltos)
  const coarse = new Float32Array(32 * 32).map(() => Math.random())
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const cx = (x / 8) | 0
      const cy = (y / 8) | 0
      const fx = (x % 8) / 8
      const fy = (y % 8) / 8
      const at = (i: number, j: number) => coarse[((j & 31) * 32 + (i & 31)) | 0]
      const v = (at(cx, cy) * (1 - fx) + at(cx + 1, cy) * fx) * (1 - fy) + (at(cx, cy + 1) * (1 - fx) + at(cx + 1, cy + 1) * fx) * fy
      const n = v * 0.6 + Math.random() * 0.4
      const k = (y * 256 + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 0
      img.data[k + 3] = Math.round(n * 255)
    }
  g.putImageData(img, 0, 0)
  grainPattern = c
  return c
}

/**
 * Simetría del trazo: reflejo vertical u horizontal, cuatro lados, radial (como un caleidoscopio: giros y reflejos) o
 * giratoria (solo giros, como una flor).
 */
export type Symmetry = 'none' | 'vertical' | 'horizontal' | 'cuadrante' | 'radial' | 'giratoria'

/** Las copias de cada punto: matrices 2×2 [a, b, c, d] alrededor del eje (x' = a·x + b·y, y' = c·x + d·y). */
export function symmetryMatrices(symmetry: Symmetry, count = 6): [number, number, number, number][] {
  const I: [number, number, number, number] = [1, 0, 0, 1]
  if (symmetry === 'vertical') return [I, [-1, 0, 0, 1]]
  if (symmetry === 'horizontal') return [I, [1, 0, 0, -1]]
  if (symmetry === 'cuadrante') return [I, [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1]]
  if (symmetry === 'radial' || symmetry === 'giratoria') {
    const n = Math.max(2, Math.min(16, Math.round(count)))
    const out: [number, number, number, number][] = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      out.push([c, -s, s, c])
      // Radial: además, cada giro reflejado (como un caleidoscopio)
      if (symmetry === 'radial') out.push([-c, -s, -s, c])
    }
    return out
  }
  return [I]
}

export interface StrokeOptions {
  brush: BrushPreset
  color: string
  /** Tamaño y opacidad elegidos (los del pincel cambian con el deslizador). */
  size: number
  opacity: number
  streamline: number
  symmetry: Symmetry
  /** Copias en la simetría radial y giratoria. */
  symmetryCount?: number
  /** Centro de la simetría (se puede mover). */
  axis: { x: number; y: number }
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Un trazo en curso. Recibe los puntos del puntero (con su presión) y estampa en `target`. Lleva la cuenta de la zona
 * pintada (`dirty`) para fundir y deshacer solo esa parte.
 */
export class Stroke {
  private last: { x: number; y: number; p: number } | null = null
  private smooth: { x: number; y: number } | null = null
  private travelled = 0
  private leftover = 0
  dirty: Rect | null = null
  /** Zona pintada desde la última vez que se miró (para repintar solo eso en cada fotograma). */
  frame: Rect | null = null
  private readonly ctx: CanvasRenderingContext2D
  private readonly mats: [number, number, number, number][]
  /** Estampados hechos (las formas que alternan: zigzag, dientes de la cremallera). */
  private count = 0
  /** Difuminar: dónde estaba cada copia en el estampado anterior. */
  private prevs: ([number, number] | null)[] = []
  private smearTmp: HTMLCanvasElement | null = null
  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly o: StrokeOptions,
  ) {
    this.ctx = target.getContext('2d')!
    this.mats = symmetryMatrices(o.symmetry, o.symmetryCount)
  }

  /** Añade un punto del puntero (x, y en px del lienzo; presión 0–1). */
  add(x: number, y: number, pressure: number) {
    // Estabilizador: el punto pintado persigue al puntero con algo de retraso (quita el temblor)
    const k = 1 - Math.min(0.92, this.o.streamline * 0.92)
    if (!this.smooth) this.smooth = { x, y }
    else {
      this.smooth.x += (x - this.smooth.x) * k
      this.smooth.y += (y - this.smooth.y) * k
    }
    const p = { x: this.smooth.x, y: this.smooth.y, p: pressure }
    if (!this.last) {
      this.last = p
      this.stamp(p.x, p.y, p.p, 0)
      return
    }
    this.segment(this.last, p)
    this.last = p
  }

  /** Remata el trazo (el estabilizador deja el final un poco por detrás del puntero: se completa hasta él). */
  finish(x: number, y: number, pressure: number) {
    if (this.last && this.o.streamline > 0) this.segment(this.last, { x, y, p: pressure * 0.6 })
  }

  private segment(a: { x: number; y: number; p: number }, b: { x: number; y: number; p: number }) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.01) return
    const angle = Math.atan2(dy, dx)
    const step = Math.max(0.5, this.o.size * this.o.brush.spacing)
    let t = this.leftover
    while (t <= len) {
      const f = t / len
      this.stamp(a.x + dx * f, a.y + dy * f, a.p + (b.p - a.p) * f, angle)
      t += step
    }
    this.leftover = t - len
    this.travelled += len
  }

  private stamp(x: number, y: number, pressure: number, angle: number) {
    const b = this.o.brush
    const pr = Math.min(1, Math.max(0.02, pressure))
    // Afinado al empezar: el trazo crece en los primeros px
    const taper = b.taper ? Math.min(1, 0.25 + (this.travelled / b.taper) * 0.75) : 1
    const size = Math.max(0.6, this.o.size * (1 - b.pressureSize + b.pressureSize * pr) * taper)
    const alpha = b.flow * (1 - b.pressureOpacity + b.pressureOpacity * pr)
    const tip = b.shape || b.smudge ? null : tintedTip(b, this.o.color)
    const { axis } = this.o
    const step = Math.max(0.5, this.o.size * b.spacing)
    const index = this.count++
    const dx0 = x - axis.x
    const dy0 = y - axis.y
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const g = this.ctx
    g.globalAlpha = Math.min(1, alpha)
    for (let k = 0; k < this.mats.length; k++) {
      const [a, b2, c, d] = this.mats[k]
      let px = axis.x + a * dx0 + b2 * dy0
      let py = axis.y + c * dx0 + d * dy0
      if (b.scatter) {
        px += (Math.random() - 0.5) * size * b.scatter * 2
        py += (Math.random() - 0.5) * size * b.scatter * 2
      }
      const dir = Math.atan2(c * ca + d * sa, a * ca + b2 * sa)
      if (b.smudge) {
        this.smear(k, px, py, size, Math.min(1, alpha))
        this.grow(px - size, py - size, px + size, py + size)
        continue
      }
      if (b.shape) {
        // Formas (costuras, cremallera, fornituras…): giradas según el trazo y, si lleva, en varias filas paralelas
        const rows = b.rows ?? [0]
        g.save()
        g.translate(px, py)
        g.rotate(dir)
        for (const off of rows) {
          g.save()
          g.translate(0, off * size)
          drawShape(g, b.shape, size, this.o.color, step, index, dir)
          g.restore()
        }
        g.restore()
        const reach = size * (1.6 + Math.max(0, ...rows.map(Math.abs)))
        this.grow(px - reach, py - reach, px + reach, py + reach)
        continue
      }
      g.save()
      g.translate(px, py)
      if (b.tip === 'image' && b.orient) g.rotate(dir + Math.PI / 2)
      // La punta plana sigue al trazo copiado (girado o reflejado)
      if (b.tip === 'flat') g.rotate(Math.atan2(c * ca + d * sa, a * ca + b2 * sa) + Math.PI / 2 - 0.35)
      else if (b.id === 'salpicado') g.rotate(Math.random() * Math.PI * 2)
      g.drawImage(tip!, -size / 2, -size / 2, size, size)
      g.restore()
      this.grow(px - size, py - size, px + size, py + size)
    }
    g.globalAlpha = 1
  }

  /** Difuminar: un trozo redondo de lo que había donde estaba el pincel se arrastra hasta donde está ahora. */
  private smear(k: number, px: number, py: number, size: number, strength: number) {
    const prev = this.prevs[k]
    this.prevs[k] = [px, py]
    if (!prev) return
    const d = Math.max(2, Math.ceil(size))
    if (!this.smearTmp || this.smearTmp.width !== d) {
      this.smearTmp = document.createElement('canvas')
      this.smearTmp.width = this.smearTmp.height = d
    }
    const tg = this.smearTmp.getContext('2d')!
    tg.globalCompositeOperation = 'source-over'
    tg.clearRect(0, 0, d, d)
    tg.drawImage(this.target, prev[0] - d / 2, prev[1] - d / 2, d, d, 0, 0, d, d)
    tg.globalCompositeOperation = 'destination-in'
    tg.drawImage(tipCanvas(this.o.brush.hardness, 'round', false), 0, 0, d, d)
    const g = this.ctx
    g.save()
    g.globalAlpha = strength
    g.drawImage(this.smearTmp, px - d / 2, py - d / 2)
    g.restore()
  }

  private grow(x0: number, y0: number, x1: number, y1: number) {
    const d = this.dirty
    const w = this.target.width
    const h = this.target.height
    const r = { x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)), x1: Math.min(w, Math.ceil(x1)), y1: Math.min(h, Math.ceil(y1)) }
    this.dirty = d ? union(d, r) : r
    this.frame = this.frame ? union(this.frame, r) : r
  }

  /** Zona pintada desde la última llamada (y la olvida). */
  takeFrame() {
    const f = this.frame
    this.frame = null
    return f
  }
}

/** Rectángulo que abarca los dos. */
export function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

/** Color con transparencia a partir de un #rrggbb. */
function rgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h.slice(0, 6), 16) || 0
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * Dibuja una forma de estampado centrada en (0, 0), con el trazo hacia la derecha (+x). `s` es el tamaño del pincel,
 * `len` la distancia entre estampados e `i` el número de estampado (para las que alternan).
 */
function drawShape(g: CanvasRenderingContext2D, shape: StampShape, s: number, color: string, len: number, i: number, dir: number) {
  const r = s / 2
  const dark = 'rgba(0, 0, 0, 0.45)'
  const light = 'rgba(255, 255, 255, 0.4)'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = color
  g.fillStyle = color
  const line = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
  }
  const circle = (x: number, y: number, rad: number) => {
    g.beginPath()
    g.arc(x, y, Math.max(0.1, rad), 0, Math.PI * 2)
  }
  switch (shape) {
    case 'dash':
      line(-s * 0.55, 0, s * 0.55, 0, s * 0.3)
      break
    case 'zigzag': {
      const sg = i % 2 ? 1 : -1
      line(-len / 2, -sg * s * 0.6, len / 2, sg * s * 0.6, s * 0.25)
      break
    }
    case 'overlock':
      line(0, -s * 0.7, len * 0.9, s * 0.7, s * 0.16)
      line(-len / 2, s * 0.7, len / 2, s * 0.7, s * 0.16)
      break
    case 'chain':
      g.lineWidth = s * 0.2
      g.beginPath()
      g.ellipse(0, 0, len * 0.55, s * 0.35, 0, 0, Math.PI * 2)
      g.stroke()
      break
    case 'cross':
      line(-s * 0.4, -s * 0.4, s * 0.4, s * 0.4, s * 0.2)
      line(-s * 0.4, s * 0.4, s * 0.4, -s * 0.4, s * 0.2)
      break
    case 'zip': {
      // Un diente a cada lado, alternando, encajados en el centro
      const sg = i % 2 ? 1 : -1
      const w = len * 0.82
      const h = s * 0.5
      const y = sg * s * 0.17
      g.beginPath()
      g.roundRect(-w / 2, y - h / 2, w, h, Math.min(w, h) * 0.3)
      g.fill()
      g.lineWidth = Math.max(0.6, s * 0.05)
      g.strokeStyle = dark
      g.stroke()
      line(-w * 0.3, y - sg * h * 0.25, w * 0.3, y - sg * h * 0.25, Math.max(0.5, s * 0.04))
      g.strokeStyle = light
      g.stroke()
      break
    }
    case 'rib':
      line(0, -r, 0, r, s * 0.09)
      break
    case 'button4': {
      circle(0, 0, r)
      g.fill()
      g.lineWidth = s * 0.06
      g.strokeStyle = dark
      g.stroke()
      circle(0, 0, r * 0.72)
      g.lineWidth = s * 0.04
      g.strokeStyle = 'rgba(0, 0, 0, 0.25)'
      g.stroke()
      g.fillStyle = 'rgba(0, 0, 0, 0.6)'
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        circle(x * r * 0.22, y * r * 0.22, r * 0.11)
        g.fill()
      }
      g.beginPath()
      g.arc(0, 0, r * 0.85, Math.PI * 1.1, Math.PI * 1.5)
      g.lineWidth = s * 0.05
      g.strokeStyle = light
      g.stroke()
      break
    }
    case 'jeansbutton': {
      circle(0, 0, r)
      g.fill()
      g.lineWidth = s * 0.06
      g.strokeStyle = dark
      g.stroke()
      circle(0, 0, r * 0.55)
      g.lineWidth = s * 0.05
      g.stroke()
      g.fillStyle = 'rgba(0, 0, 0, 0.45)'
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        circle(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.05)
        g.fill()
      }
      circle(0, 0, r * 0.12)
      g.fill()
      g.beginPath()
      g.arc(0, 0, r * 0.9, Math.PI * 1.1, Math.PI * 1.5)
      g.lineWidth = s * 0.05
      g.strokeStyle = light
      g.stroke()
      break
    }
    case 'rivet': {
      const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.35, color)
      grad.addColorStop(1, rgba(color, 1))
      circle(0, 0, r)
      g.fillStyle = grad
      g.fill()
      g.lineWidth = s * 0.08
      g.strokeStyle = dark
      g.stroke()
      break
    }
    case 'eyelet':
      circle(0, 0, r)
      g.fill()
      g.lineWidth = s * 0.06
      g.strokeStyle = dark
      g.stroke()
      circle(0, 0, r * 0.5)
      g.fillStyle = 'rgba(20, 20, 20, 0.85)'
      g.fill()
      g.lineWidth = s * 0.05
      g.strokeStyle = light
      g.stroke()
      break
    case 'ring':
      circle(0, 0, r * 0.8)
      g.lineWidth = s * 0.2
      g.strokeStyle = dark
      g.stroke()
      g.lineWidth = s * 0.13
      g.strokeStyle = color
      g.stroke()
      break
    case 'puller': {
      // Tirador en gota, colgando hacia un lado del trazo
      g.rotate(Math.PI / 2)
      g.beginPath()
      g.moveTo(0, -r)
      g.bezierCurveTo(r * 0.75, -r, r * 0.55, r * 0.4, 0, r)
      g.bezierCurveTo(-r * 0.55, r * 0.4, -r * 0.75, -r, 0, -r)
      g.fill()
      g.lineWidth = s * 0.05
      g.strokeStyle = dark
      g.stroke()
      circle(0, -r * 0.55, r * 0.16)
      g.fillStyle = 'rgba(20, 20, 20, 0.85)'
      g.fill()
      break
    }
    case 'rip': {
      // Roto de vaquero: hilos blancos de la trama, siempre en horizontal (aunque el trazo vaya en otra dirección)
      g.rotate(-dir)
      for (let k = 0; k < 3; k++) {
        const y = (Math.random() - 0.5) * s
        const l = s * (0.35 + Math.random() * 0.6)
        const x = (Math.random() - 0.5) * s * 0.4
        line(x - l / 2, y + s * 0.05, x + l / 2, y + s * 0.05, Math.max(0.6, s * 0.06))
        g.strokeStyle = 'rgba(0, 0, 0, 0.3)'
        g.stroke()
        g.strokeStyle = color
        line(x - l / 2, y, x + l / 2, y, Math.max(0.6, s * 0.06))
      }
      break
    }
    case 'fray':
      for (let k = 0; k < 5; k++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.2 + (Math.random() < 0.5 ? Math.PI : 0)
        const l = r * (0.4 + Math.random() * 0.8)
        line(0, 0, Math.cos(a) * l, Math.sin(a) * l, Math.max(0.5, s * 0.035))
      }
      break
    case 'whisker': {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r)
      grad.addColorStop(0, rgba(color, 1))
      grad.addColorStop(1, rgba(color, 0))
      g.save()
      g.scale(1.8, 0.35)
      g.fillStyle = grad
      circle(0, 0, r)
      g.fill()
      g.restore()
      break
    }
  }
}
