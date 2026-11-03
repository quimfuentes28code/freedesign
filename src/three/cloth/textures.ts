import * as THREE from 'three'

/** Relieve del tejido. Las UV de la prenda están en cm reales; `size` es cuántos cm ocupa una repetición. */
export type Knit = 'punto' | 'canale' | 'sarga' | 'liso'

const SIZE: Record<Knit, number> = { punto: 1.2, canale: 2, sarga: 1.5, liso: 1 }
const cache = new Map<Knit, THREE.Texture>()

/** Altura del relieve en una repetición (x, y en [0, 1)), periódica. */
const HEIGHT: Record<Knit, (x: number, y: number) => number> = {
  // Punto de camiseta o felpa: columnas de pequeñas uves
  punto: (x, y) => {
    const cx = (x * 8) % 1
    const cy = (y * 10) % 1
    return 1 - Math.min(Math.abs(Math.abs(cx - 0.5) * 2 - (1 - cy)) * 2.2, 1)
  },
  // Canalé: costillas verticales marcadas
  canale: (x) => Math.pow(Math.abs(Math.sin(Math.PI * 4 * x)), 0.6),
  // Sarga (denim): diagonales
  sarga: (x, y) => Math.abs(Math.sin(Math.PI * 12 * (x + y))),
  liso: () => 0.5,
}

/** Mapa de normales del tejido, generado por código (sin descargar imágenes). */
export function knitNormalMap(knit: Knit) {
  const hit = cache.get(knit)
  if (hit) return hit
  const n = 256
  const h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = HEIGHT[knit](i / n, j / n)
  const at = (i: number, j: number) => h[((j + n) % n) * n + ((i + n) % n)]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = n
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(n, n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * 2.5
      const dy = (at(i, j + 1) - at(i, j - 1)) * 2.5
      const len = Math.hypot(dx, dy, 1)
      const k = (j * n + i) * 4
      img.data[k] = (-dx / len) * 127.5 + 127.5
      img.data[k + 1] = (-dy / len) * 127.5 + 127.5
      img.data[k + 2] = (1 / len) * 127.5 + 127.5
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / SIZE[knit], 1 / SIZE[knit])
  tex.anisotropy = 8
  tex.colorSpace = THREE.NoColorSpace
  cache.set(knit, tex)
  return tex
}
