import { simplifyClosed, traceLoops } from '../pages/library/vectorize'

/**
 * Contorno de una máscara (lo opaco de un canvas) como trazado: todas sus vueltas (huecos incluidos, en sentido
 * contrario, así se rellena bien) y los puntos de la vuelta más grande (para dibujar la selección y su caja).
 */
export function maskToPath(mask: HTMLCanvasElement): { path: Path2D; pts: number[] } | null {
  const w = mask.width
  const h = mask.height
  const d = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const bits = new Uint8Array(w * h)
  for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] > 127 ? 1 : 0
  const loops = traceLoops(bits, w, h)
    .map((l) => simplifyClosed(l, 0.8))
    .filter((l) => l.length >= 3)
  if (!loops.length) return null
  const path = new Path2D()
  let best: [number, number][] = loops[0]
  let bestArea = 0
  for (const l of loops) {
    path.moveTo(l[0][0], l[0][1])
    for (let i = 1; i < l.length; i++) path.lineTo(l[i][0], l[i][1])
    path.closePath()
    let a = 0
    for (let i = 0; i < l.length; i++) {
      const p = l[i]
      const q = l[(i + 1) % l.length]
      a += p[0] * q[1] - q[0] * p[1]
    }
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a)
      best = l
    }
  }
  return { path, pts: best.flat() }
}
