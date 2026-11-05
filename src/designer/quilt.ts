import type { Pt } from './geometry'

/**
 * Formas de los canales del acolchado (puffer, chaleco): líneas de pespunte en un plano (a, b), donde `a` es la
 * dirección de los canales (de arriba abajo en el cuerpo, del hombro al puño en la manga) y `b` la transversal.
 * Se dibujan de sobra y luego se recortan a la pieza.
 */

export const QUILT_SHAPES = [
  { id: 'rectos', label: 'Rectos' },
  { id: 'v', label: 'En V' },
  { id: 'onda', label: 'Ondulados' },
  { id: 'rombos', label: 'Rombos' },
  { id: 'cuadros', label: 'Cuadros' },
  { id: 'verticales', label: 'Verticales' },
  { id: 'diagonales', label: 'Diagonales' },
] as const
export type QuiltShape = (typeof QUILT_SHAPES)[number]['id']

/**
 * Líneas de un patrón de acolchado en el rectángulo a ∈ [a0, a1], b ∈ [-bw, bw] (b = 0 es el centro, para que el
 * dibujo quede simétrico), con canales separados `step`.
 */
export function quiltLines(shape: QuiltShape, step: number, a0: number, a1: number, bw: number): [number, number][][] {
  const lines: [number, number][][] = []
  const from = a0 + step
  const sample = (fn: (b: number) => number) => {
    const pts: [number, number][] = []
    const n = Math.max(2, Math.ceil((2 * bw) / 4))
    for (let i = 0; i <= n; i++) {
      const b = -bw + (2 * bw * i) / n
      pts.push([fn(b), b])
    }
    return pts
  }
  // Canales a lo largo de b (rectos, en V, ondulados)
  const across = (fn: (a: number, b: number) => number, extra = 0) => {
    for (let a = from - extra; a < a1 + extra; a += step) lines.push(sample((b) => fn(a, b)))
  }
  // Líneas en la otra dirección (b fijo), repartidas desde el centro sin caer en él (ahí va la cremallera)
  const along = (gap: number) => {
    for (let b = gap / 2; b < bw; b += gap) {
      lines.push([[a0, b], [a1, b]])
      lines.push([[a0, -b], [a1, -b]])
    }
  }
  // Diagonales a ±45° más o menos (pendiente k), separadas `gap` en la dirección a
  const diagonal = (k: number, gap: number) => {
    for (let c = a0 - bw * Math.abs(k); c < a1 + bw * Math.abs(k); c += gap) lines.push([[c - k * bw, -bw], [c + k * bw, bw]])
  }
  switch (shape) {
    case 'rectos':
      across((a) => a)
      break
    case 'v':
      // En V: el pico hacia abajo en el centro
      across((a, b) => a - Math.abs(b) * 0.45, bw * 0.45)
      break
    case 'onda':
      across((a, b) => a + step * 0.28 * Math.sin((2 * Math.PI * b) / (step * 3.2)))
      break
    case 'rombos':
      diagonal(0.65, step * 1.25)
      diagonal(-0.65, step * 1.25)
      break
    case 'cuadros':
      across((a) => a)
      along(step * 1.35)
      break
    case 'verticales':
      along(step * 0.9)
      break
    case 'diagonales':
      diagonal(0.55, step)
      break
  }
  return lines
}

/** Pasa las líneas del plano (a, b) al dibujo con una función de cambio de coordenadas. */
export const mapLines = (lines: [number, number][][], to: (a: number, b: number) => Pt) => lines.map((l) => l.map(([a, b]) => to(a, b)))
