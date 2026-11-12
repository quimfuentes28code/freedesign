import { drawMorePattern, MORE_PATTERNS } from './morePatterns'
import type { ColorBlock, PieceStyle, Surface, Wash } from '../shared/designs'
import { fileUrl } from '../shared/library'

/**
 * Superficie de una pieza (rayas, cuadros, lunares, camuflaje, tie-dye, logo repetido, degradado) con su lavado,
 * pintada como un «azulejo» que se repite. El mismo azulejo es el relleno del dibujo 2D y la textura de la tela 3D.
 * El color de la pieza va ya dentro del azulejo.
 */

const PX = 512

export interface Tile {
  canvas: HTMLCanvasElement
  /** Lado del azulejo en cm reales. */
  cm: number
  /** Para guardarlo en caché y saber si ha cambiado. */
  key: string
  /** Un degradado no se repite: va de arriba abajo de la pieza. */
  stretch: boolean
}

/** Tamaño por defecto del dibujo que se repite (cm) en cada superficie. */
export const DEFAULT_SIZE: Record<string, number> = { escoces: 12, patagallo: 1.2, diplomatica: 1.5, zigzag: 3, imagen: 20, rayas: 2, cuadros: 3, lunares: 2, camuflaje: 40, tiedye: 55, logo: 8, degradado: 70, ...Object.fromEntries(MORE_PATTERNS.map((p) => [p.id, p.size])) }

/** Generador de números pseudoaleatorios con semilla (el camuflaje sale siempre igual para la misma pieza). */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** Mancha orgánica (camuflaje) alrededor de (cx, cy). */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number) {
  const n = 9
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.55 + rand() * 0.75)
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (0.6 + rand() * 0.5)]
  })
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n]
    const q = pts[(i + 1) % n]
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    if (i === 0) ctx.moveTo(m[0], m[1])
    else ctx.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  ctx.closePath()
  ctx.fill()
}

const images = new Map<string, HTMLImageElement>()
/** Imagen de un gráfico (logo repetido). Si aún no ha cargado, avisa con `onLoad` para volver a pintar. */
function artImage(file: string, onLoad: () => void) {
  let img = images.get(file)
  if (!img) {
    img = new Image()
    img.onload = onLoad
    img.src = fileUrl(file)
    images.set(file, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

function drawSurface(ctx: CanvasRenderingContext2D, s: Surface, base: string, onLoad: () => void) {
  const W = PX
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, W)
  ctx.fillStyle = s.color2
  ctx.strokeStyle = s.color2
  switch (s.kind) {
    case 'rayas':
      ctx.fillRect(0, 0, W, W / 2)
      break
    case 'cuadros':
      // Vichy: dos franjas translúcidas que se cruzan (más oscuro donde se solapan)
      ctx.globalAlpha = 0.55
      ctx.fillRect(0, 0, W / 2, W)
      ctx.fillRect(0, 0, W, W / 2)
      ctx.globalAlpha = 1
      break
    case 'escoces': {
      // Tartán: franjas anchas translúcidas del segundo color que se cruzan y rayas finas del tercero
      ctx.globalAlpha = 0.5
      ctx.fillRect(0, 0, W * 0.4, W)
      ctx.fillRect(0, 0, W, W * 0.4)
      ctx.globalAlpha = 0.85
      ctx.fillStyle = s.color3
      ctx.fillRect(W * 0.68, 0, W * 0.04, W)
      ctx.fillRect(0, W * 0.68, W, W * 0.04)
      ctx.globalAlpha = 0.6
      ctx.fillRect(W * 0.18, 0, W * 0.02, W)
      ctx.fillRect(0, W * 0.18, W, W * 0.02)
      ctx.globalAlpha = 1
      break
    }
    case 'patagallo': {
      // Pata de gallo: cuadro con dos colas en diagonal (encaja con los azulejos de al lado)
      const u = W / 4
      ctx.fillRect(0, 2 * u, 2 * u, 2 * u)
      ctx.beginPath()
      ctx.moveTo(0, 2 * u)
      ctx.lineTo(2 * u, 0)
      ctx.lineTo(3 * u, 0)
      ctx.lineTo(0, 3 * u)
      ctx.closePath()
      ctx.moveTo(2 * u, 4 * u)
      ctx.lineTo(4 * u, 2 * u)
      ctx.lineTo(4 * u, 3 * u)
      ctx.lineTo(3 * u, 4 * u)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'diplomatica':
      // Raya fina sobre el fondo
      ctx.fillRect(0, 0, W * 0.07, W)
      break
    case 'zigzag':
      ctx.lineWidth = W * 0.1
      ctx.lineJoin = 'miter'
      for (const y of [0.35, 0.85]) {
        ctx.beginPath()
        ctx.moveTo(-W * 0.1, W * (y + 0.04))
        ctx.lineTo(0, W * y)
        ctx.lineTo(W / 2, W * (y - 0.2))
        ctx.lineTo(W, W * y)
        ctx.lineTo(W * 1.1, W * (y - 0.04))
        ctx.stroke()
      }
      break
    case 'imagen': {
      const img = s.file ? artImage(s.file, onLoad) : null
      if (img) ctx.drawImage(img, 0, 0, W, W)
      break
    }
    case 'lunares':
      for (const [x, y] of [[W / 4, W / 4], [(3 * W) / 4, (3 * W) / 4]]) {
        ctx.beginPath()
        ctx.arc(x, y, W * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'camuflaje': {
      const rand = rng(1234)
      for (const [color, count, r] of [[s.color2, 9, 0.16], [s.color3, 8, 0.12], [base, 4, 0.08]] as const) {
        ctx.fillStyle = color
        for (let i = 0; i < count; i++) {
          const x = rand() * W
          const y = rand() * W
          // Se repite en los bordes para que el azulejo encaje sin cortes
          for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) blob(ctx, x + dx, y + dy, W * r, rng(i * 97 + count))
        }
      }
      break
    }
    case 'tiedye': {
      // Espiral de anillos de color difuminados alrededor del centro
      ctx.filter = 'blur(10px)'
      const colors = [s.color2, s.color3, base]
      for (let i = 14; i > 0; i--) {
        ctx.fillStyle = colors[i % 3]
        ctx.beginPath()
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.12) {
          const r = (i / 14) * W * 0.75 * (1 + 0.12 * Math.sin(a * 5 + i))
          const x = W / 2 + Math.cos(a + i * 0.35) * r
          const y = W / 2 + Math.sin(a + i * 0.35) * r
          if (a === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.fill()
      }
      ctx.filter = 'none'
      break
    }
    case 'logo': {
      const img = s.art ? artImage(s.art.file, onLoad) : null
      if (img && s.art) {
        const w = W * 0.62
        const h = w * s.art.aspect
        ctx.drawImage(img, (W - w) / 2, (W - h) / 2, w, h)
      }
      break
    }
    default:
      // Cuadros, rayas, motivos, animal print, camuflajes y efectos de morePatterns.ts
      drawMorePattern(ctx, s.kind, W, base, s.color2, s.color3 || s.color2)
      break
    case 'degradado': {
      const g = ctx.createLinearGradient(0, 0, 0, W)
      g.addColorStop(0, base)
      g.addColorStop(1, s.color2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, W)
      break
    }
  }
}

/** Lavado sobre el azulejo: vintage y decolorado apagan el color; desgastado y ácido añaden manchas claras. */
function applyWash(src: HTMLCanvasElement, w: Wash) {
  const out = document.createElement('canvas')
  out.width = out.height = PX
  const ctx = out.getContext('2d')!
  const a = w.amount
  if (w.kind === 'vintage') ctx.filter = `saturate(${1 - a * 0.55}) sepia(${a * 0.35}) brightness(${1 + a * 0.08})`
  if (w.kind === 'decolorado') ctx.filter = `saturate(${1 - a * 0.7}) brightness(${1 + a * 0.28}) contrast(${1 - a * 0.2})`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  const rand = rng(77)
  if (w.kind === 'desgastado') {
    // Motas y arañazos claros, como una tela muy lavada
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 900 * a; i++) {
      ctx.globalAlpha = 0.08 + rand() * 0.18
      ctx.fillRect(rand() * PX, rand() * PX, 1 + rand() * 3, 1 + rand() * 1.5)
    }
    ctx.globalAlpha = 0.12 * a
    ctx.fillRect(0, 0, PX, PX)
  }
  if (w.kind === 'acido') {
    // Lavado ácido: vetas claras marmoleadas
    ctx.filter = 'blur(6px)'
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 28; i++) {
      ctx.globalAlpha = (0.15 + rand() * 0.35) * a
      const x = rand() * PX
      const y = rand() * PX
      for (const dx of [-PX, 0, PX]) for (const dy of [-PX, 0, PX]) blob(ctx, x + dx, y + dy, PX * (0.04 + rand() * 0.08), rng(i + 5))
    }
    ctx.filter = 'none'
  }
  ctx.globalAlpha = 1
  return out
}

const cache = new Map<string, Tile>()
const listeners = new Set<() => void>()
/** Avisa cuando un azulejo cambia después de crearlo (por ejemplo, al cargar el logo que se repite). */
export const onTilesChange = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Clave del azulejo de una pieza (vacía si es lisa y sin lavado: se pinta solo con su color). */
export function tileKey(style: Pick<PieceStyle, 'color' | 'surface' | 'wash'>) {
  if (!style.surface && !style.wash) return ''
  return JSON.stringify([style.color, style.surface ?? null, style.wash ?? null])
}

/** Azulejo de una pieza, o null si es lisa y sin lavado. */
export function pieceTile(style: Pick<PieceStyle, 'color' | 'surface' | 'wash'>): Tile | null {
  const key = tileKey(style)
  if (!key) return null
  let tile = cache.get(key)
  if (tile) return tile
  const surface = style.surface ?? { kind: 'liso', color2: style.color, color3: style.color, size: 10, angle: 0 }
  const raw = document.createElement('canvas')
  raw.width = raw.height = PX
  const paint = () => {
    const ctx = raw.getContext('2d')!
    drawSurface(ctx, surface as Surface, style.color, () => {
      paint()
      urls.delete(raw)
      const t = cache.get(key)
      if (t) t.canvas = style.wash ? applyWash(raw, style.wash) : raw
      listeners.forEach((fn) => fn())
    })
  }
  paint()
  tile = {
    canvas: style.wash ? applyWash(raw, style.wash) : raw,
    cm: surface.size || DEFAULT_SIZE[surface.kind] || 10,
    key,
    stretch: surface.kind === 'degradado',
  }
  cache.set(key, tile)
  return tile
}

const urls = new WeakMap<HTMLCanvasElement, string>()
/** El azulejo como imagen (para el relleno del SVG). */
export function tileUrl(t: Tile) {
  let u = urls.get(t.canvas)
  if (!u) {
    u = t.canvas.toDataURL('image/png')
    urls.set(t.canvas, u)
  }
  return u
}

/** Descripción para la ficha técnica, p. ej. «Rayas de 2 cm, 45° · lavado vintage». */
export function surfaceLabel(style: Pick<PieceStyle, 'surface' | 'wash'>, kinds: readonly { id: string; label: string }[], washes: readonly { id: string; label: string }[]) {
  const out: string[] = []
  const s = style.surface
  if (s) out.push(`${kinds.find((k) => k.id === s.kind)?.label ?? s.kind}${s.kind === 'degradado' ? '' : ` de ${s.size.toLocaleString('es-ES')} cm`}${s.angle ? `, ${Math.round(s.angle)}°` : ''}`)
  if (style.wash) out.push(`lavado ${(washes.find((w) => w.id === style.wash!.kind)?.label ?? style.wash.kind).toLowerCase()}`)
  return out.join(' · ')
}

/** Semiplano del lado de un bloque de color (un polígono enorme que luego se recorta a la pieza). */
export function halfPlane(b: ColorBlock) {
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1
  const [dx, dy] = [(b.x2 - b.x1) / len, (b.y2 - b.y1) / len]
  const [nx, ny] = [-dy * b.side, dx * b.side]
  const L = 2000
  const a = [b.x1 - dx * L, b.y1 - dy * L]
  const c = [b.x2 + dx * L, b.y2 + dy * L]
  return `M${a[0]} ${a[1]}L${c[0]} ${c[1]}L${c[0] + nx * L} ${c[1] + ny * L}L${a[0] + nx * L} ${a[1] + ny * L}Z`
}

/** Línea de un bloque de color, desplazada `off` hacia dentro del bloque (para el pespunte). */
export function blockLine(b: ColorBlock, off: number) {
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1
  const [dx, dy] = [(b.x2 - b.x1) / len, (b.y2 - b.y1) / len]
  const [nx, ny] = [-dy * b.side * off, dx * b.side * off]
  const L = 2000
  return `M${b.x1 - dx * L + nx} ${b.y1 - dy * L + ny}L${b.x2 + dx * L + nx} ${b.y2 + dy * L + ny}`
}

