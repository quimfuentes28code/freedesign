/**
 * Texturas del lienzo, hechas aquí mismo (sin descargar nada): telas (denim, punto, felpa, malla, pana…) y efectos
 * (grunge, papel, desgaste). Cada una es un azulejo de 512 px en grises que se repite sin cortes. Van alrededor del gris
 * medio: puestas en Superponer o Luz suave encima de un color, solo le añaden el relieve del tejido.
 */

export interface TextureDef {
  id: string
  name: string
  group: 'Telas' | 'Efectos'
  /** Fusión y opacidad con que se pone en el lienzo. */
  blend: 'overlay' | 'soft-light' | 'multiply'
  opacity: number
  /** Escala por defecto del azulejo en el lienzo (1 = 512 px). */
  scale: number
}

export const TEXTURES: TextureDef[] = [
  { id: 'denim', name: 'Denim', group: 'Telas', blend: 'overlay', opacity: 0.9, scale: 0.5 },
  { id: 'denim-lavado', name: 'Denim lavado', group: 'Telas', blend: 'overlay', opacity: 0.9, scale: 0.5 },
  { id: 'denim-stone', name: 'Denim stone', group: 'Telas', blend: 'overlay', opacity: 0.9, scale: 0.5 },
  { id: 'punto', name: 'Punto (jersey)', group: 'Telas', blend: 'overlay', opacity: 0.8, scale: 0.45 },
  { id: 'felpa', name: 'Felpa (french terry)', group: 'Telas', blend: 'overlay', opacity: 0.7, scale: 0.5 },
  { id: 'canale', name: 'Canalé', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.6 },
  { id: 'waffle', name: 'Waffle', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.6 },
  { id: 'malla1', name: 'Malla fina', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.5 },
  { id: 'malla2', name: 'Malla media', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.6 },
  { id: 'malla3', name: 'Malla gruesa', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.7 },
  { id: 'pana', name: 'Pana', group: 'Telas', blend: 'overlay', opacity: 0.85, scale: 0.7 },
  { id: 'nylon', name: 'Nylon ripstop', group: 'Telas', blend: 'overlay', opacity: 0.7, scale: 0.6 },
  { id: 'lona', name: 'Lona', group: 'Telas', blend: 'overlay', opacity: 0.8, scale: 0.5 },
  { id: 'piel', name: 'Piel', group: 'Telas', blend: 'overlay', opacity: 0.8, scale: 0.8 },
  { id: 'ante', name: 'Ante', group: 'Telas', blend: 'soft-light', opacity: 0.9, scale: 0.7 },
  { id: 'borreguito', name: 'Borreguito', group: 'Telas', blend: 'overlay', opacity: 0.9, scale: 0.6 },
  { id: 'grunge', name: 'Grunge', group: 'Efectos', blend: 'overlay', opacity: 0.7, scale: 1 },
  { id: 'ruido', name: 'Ruido', group: 'Efectos', blend: 'overlay', opacity: 0.5, scale: 0.6 },
  { id: 'papel', name: 'Papel', group: 'Efectos', blend: 'multiply', opacity: 0.6, scale: 1 },
  { id: 'desgaste', name: 'Desgaste', group: 'Efectos', blend: 'soft-light', opacity: 0.9, scale: 1 },
]

const N = 512
const cache = new Map<string, HTMLCanvasElement>()

/** El azulejo de una textura de la app (se hace la primera vez y se guarda). */
export function textureTile(id: string): HTMLCanvasElement {
  let c = cache.get(id)
  if (c) return c
  try {
    c = (MAKERS[id] ?? MAKERS.ruido)()
  } catch {
    // Si una textura falla, gris liso (nunca debe tumbar el lienzo)
    c = pixels(() => 0.5)
  }
  cache.set(id, c)
  return c
}

/**
 * La misma textura como grano de un pincel: transparente donde la tela es clara y opaco donde es oscura (al pintar,
 * se quita la pintura donde la tela tiene sus sombras: el trazo sale con el dibujo del tejido).
 */
const grains = new Map<string, HTMLCanvasElement>()
export function textureGrain(id: string): HTMLCanvasElement {
  let c = grains.get(id)
  if (c) return c
  c = toGrain(textureTile(id))
  grains.set(id, c)
  return c
}
/** Convierte una imagen en grano de pincel (lo oscuro quita pintura). */
export function toGrain(src: CanvasImageSource & { width: number; height: number }) {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0)
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
    d[i] = d[i + 1] = d[i + 2] = 0
    // Se estira el contraste: la textura va alrededor del gris medio
    d[i + 3] = Math.round(Math.min(1, Math.max(0, (0.62 - lum) * 2.2)) * 255 * (d[i + 3] / 255))
  }
  g.putImageData(img, 0, 0)
  return c
}

// --- Utilidades: azar con semilla y ruido que se repite sin cortes ---

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Ruido suave con `cx` × `cy` celdas en el azulejo (repetible). */
function noise(cx: number, cy: number, seed: number) {
  const r = rng(seed)
  const v = new Float32Array(cx * cy).map(() => r())
  return (x: number, y: number) => {
    const fx = (x / N) * cx
    const fy = (y / N) * cy
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (i: number, j: number) => v[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)]
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
    return a + (b - a) * sy
  }
}
/** Ruido a varias escalas (más natural). */
function fbm(cells: number, octaves: number, seed: number) {
  const layers = Array.from({ length: octaves }, (_, i) => noise(cells << i, cells << i, seed + i * 101))
  return (x: number, y: number) => {
    let s = 0
    let w = 0.5
    let t = 0
    for (const n of layers) {
      s += n(x, y) * w
      t += w
      w *= 0.5
    }
    return s / t
  }
}
/** Azulejo hecho píxel a píxel con `lum(x, y)` (0 negro, 1 blanco). */
function pixels(lum: (x: number, y: number) => number) {
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = Math.round(Math.min(1, Math.max(0, lum(x, y))) * 255)
      const k = (y * N + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return c
}
/** Pinta formas sueltas repetidas en los bordes (para que el azulejo no tenga cortes). */
function wrapped(base: HTMLCanvasElement, draw: (g: CanvasRenderingContext2D, x: number, y: number) => void, points: [number, number][]) {
  const g = base.getContext('2d')!
  for (const [x, y] of points)
    for (const dx of [-N, 0, N])
      for (const dy of [-N, 0, N]) {
        if (x + dx < -40 || x + dx > N + 40 || y + dy < -40 || y + dy > N + 40) continue
        draw(g, x + dx, y + dy)
      }
  return base
}
const TAU = Math.PI * 2

// --- Cada textura ---

const MAKERS: Record<string, () => HTMLCanvasElement> = {
  denim: () => denim(0),
  'denim-lavado': () => denim(1),
  'denim-stone': () => denim(2),
  punto: () => {
    const fine = noise(128, 128, 3)
    return pixels((x, y) => {
      // Columnas de puntos en V: cada punto son dos medias mallas inclinadas
      const u = x % 8
      const v = y % 8
      const half = u < 4 ? 1 : -1
      const lu = u % 4
      const slant = (v / 8 - 0.5) * half * 1.4
      const d = Math.abs(lu - 2 - slant) / 2
      const row = 1 - Math.abs(v - 4) / 4
      return (0.38 + 0.32 * (1 - d * d)) * (0.78 + 0.22 * row) + (fine(x, y) - 0.5) * 0.08
    })
  },
  felpa: () => {
    const fine = noise(64, 64, 5)
    return pixels((x, y) => {
      // Rizos de la felpa por dentro: anillos pequeños en filas alternas
      // (celdas de 8 px: 512 es múltiplo de 8 y el azulejo no tiene cortes)
      const row = Math.floor(y / 8)
      const ox = row % 2 ? 4 : 0
      const u = ((x + ox) % 8) - 4
      const v = (y % 8) - 4
      const r = Math.hypot(u, v)
      const loop = Math.exp(-((r - 2.4) ** 2) / 0.8)
      return 0.42 + 0.3 * loop + (fine(x, y) - 0.5) * 0.12
    })
  },
  canale: () => {
    const fine = noise(128, 256, 7)
    return pixels((x, y) => 0.5 + 0.24 * Math.cos((TAU * x) / 8) + 0.05 * Math.sin((TAU * y) / 4) * Math.cos((TAU * x) / 8) + (fine(x, y) - 0.5) * 0.08)
  },
  waffle: () => {
    const fine = noise(128, 128, 9)
    return pixels((x, y) => {
      const u = x % 16
      const v = y % 16
      const edge = Math.min(u, 15 - u, v, 15 - v)
      // Cuadritos hundidos y crestas claras
      const pocket = edge >= 2 ? 0.36 + Math.min(1, (edge - 2) / 5) * 0.08 : 0.72 - edge * 0.06
      return pocket + (fine(x, y) - 0.5) * 0.08
    })
  },
  malla1: () => mesh(8, 2.4),
  malla2: () => mesh(16, 5),
  malla3: () => mesh(32, 10),
  pana: () => {
    const fuzz = noise(256, 64, 11)
    return pixels((x, y) => {
      const t = (x % 16) / 16
      return 0.28 + 0.5 * Math.pow(Math.sin(Math.PI * t), 0.7) + (fuzz(x, y) - 0.5) * 0.12
    })
  },
  nylon: () => {
    const fine = noise(256, 256, 13)
    const sheen = fbm(4, 3, 14)
    return pixels((x, y) => {
      const grid = x % 32 < 2 || y % 32 < 2 ? 0.16 : 0
      return 0.5 + grid + (fine(x, y) - 0.5) * 0.06 + (sheen(x, y) - 0.5) * 0.12
    })
  },
  lona: () => {
    const slub = noise(16, 128, 15)
    const fine = noise(256, 256, 16)
    return pixels((x, y) => {
      // Tafetán: un hilo por encima y otro por debajo, como un damero
      const cx = Math.floor(x / 4)
      const cy = Math.floor(y / 4)
      const across = (cx + cy) % 2 === 0
      const p = across ? Math.sin((Math.PI * (y % 4)) / 4) : Math.sin((Math.PI * (x % 4)) / 4)
      return 0.36 + 0.3 * p + (slub(x, y) - 0.5) * 0.14 + (fine(x, y) - 0.5) * 0.06
    })
  },
  piel: () => {
    const a = fbm(8, 4, 17)
    const b = fbm(16, 3, 18)
    return pixels((x, y) => {
      // Arrugas: donde el ruido pasa por el medio (ridged), a dos escalas
      const ca = Math.exp(-((a(x, y) - 0.5) ** 2) / 0.0012)
      const cb = Math.exp(-((b(x, y) - 0.5) ** 2) / 0.0008)
      return 0.58 + (a(x, y) - 0.5) * 0.2 - ca * 0.3 - cb * 0.14
    })
  },
  ante: () => {
    const soft = fbm(8, 4, 19)
    const r = rng(20)
    return pixels((x, y) => 0.5 + (soft(x, y) - 0.5) * 0.35 + (r() - 0.5) * 0.08)
  },
  borreguito: () => {
    const base = pixels(() => 0.36)
    const r = rng(21)
    const pts: [number, number][] = Array.from({ length: 1700 }, () => [r() * N, r() * N])
    return wrapped(
      base,
      (g, x, y) => {
        // (x e y pueden ser negativos en las copias del borde: el resto se deja siempre positivo)
        const rad = 3 + ((((Math.floor(x * 7 + y * 13) % 4) + 4) % 4) as number)
        const grad = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad)
        grad.addColorStop(0, 'rgba(235,235,235,0.95)')
        grad.addColorStop(0.6, 'rgba(160,160,160,0.8)')
        grad.addColorStop(1, 'rgba(60,60,60,0)')
        g.fillStyle = grad
        g.beginPath()
        g.arc(x, y, rad, 0, TAU)
        g.fill()
      },
      pts,
    )
  },
  grunge: () => {
    const f = fbm(4, 6, 23)
    const r = rng(24)
    return pixels((x, y) => {
      const v = 0.5 + (f(x, y) - 0.5) * 1.8
      return r() < 0.012 ? v - 0.35 : v
    })
  },
  ruido: () => {
    const r = rng(25)
    const soft = noise(128, 128, 26)
    return pixels((x, y) => 0.5 + (r() - 0.5) * 0.3 + (soft(x, y) - 0.5) * 0.15)
  },
  papel: () => {
    const soft = fbm(6, 4, 27)
    const base = pixels((x, y) => 0.86 + (soft(x, y) - 0.5) * 0.12)
    const r = rng(28)
    const pts: [number, number][] = Array.from({ length: 420 }, () => [r() * N, r() * N])
    return wrapped(
      base,
      (g, x, y) => {
        // Fibras del papel
        const a = ((x * 31 + y * 17) % 628) / 100
        const l = 8 + ((((Math.floor(x + y) % 18) + 18) % 18) as number)
        g.strokeStyle = (x + y) % 3 ? 'rgba(120,120,120,0.18)' : 'rgba(255,255,255,0.4)'
        g.lineWidth = 0.7
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
        g.stroke()
      },
      pts,
    )
  },
  desgaste: () => {
    const blot = fbm(4, 5, 29)
    const streak = noise(96, 6, 30)
    return pixels((x, y) => {
      // Zonas gastadas (claras) y rayas verticales de roce
      const b = blot(x, y)
      const worn = Math.max(0, b - 0.52) * 2.4
      const s = Math.max(0, streak(x, y) - 0.62) * 1.6
      return 0.5 + worn * 0.45 + s * 0.35
    })
  },
}

/** Denim: sarga en diagonal, hilos de urdimbre con irregularidades y (lavado y stone) desteñido a manchas. */
function denim(kind: 0 | 1 | 2) {
  const slub = noise(64, 6, 31 + kind)
  const fine = noise(256, 256, 34 + kind)
  const fade = fbm(kind === 2 ? 6 : 3, 4, 37 + kind)
  return pixels((x, y) => {
    const twill = Math.sin((TAU * (2 * x + y)) / 8)
    let v = 0.5 + 0.16 * twill + 0.2 * (slub(x, y) - 0.5) + 0.07 * (fine(x, y) - 0.5)
    if (kind === 1) v += 0.16 * (fade(x, y) - 0.4)
    if (kind === 2) v += Math.max(0, fade(x, y) - 0.5) * 0.9
    return v
  })
}

/** Malla: agujeros en filas al tresbolillo (paso y radio en px). */
function mesh(step: number, radius: number) {
  const fine = noise(128, 128, 41 + step)
  return pixels((x, y) => {
    const row = Math.floor(y / step)
    const ox = row % 2 ? step / 2 : 0
    const u = ((x + ox) % step) - step / 2
    const v = (y % step) - step / 2
    const r = Math.hypot(u, v)
    if (r < radius) return 0.14 + (r / radius) * 0.1
    if (r < radius + 1.5) return 0.78
    return 0.58 + (fine(x, y) - 0.5) * 0.08
  })
}
