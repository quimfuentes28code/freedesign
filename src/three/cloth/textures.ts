import * as THREE from 'three'

/**
 * Relieve del tejido. Las UV de la prenda están en cm reales; `SIZE` es cuántos cm ocupa una repetición.
 * - punto: jersey o felpa · canale: costillas · sarga: diagonal (denim, chino) · liso: sin relieve
 * - pana: canutillos anchos · gofre: cuadritos (waffle, piqué) · rejilla: malla o ripstop
 * - grano: piel · rizo: borrego, bouclé, pelo · acolchado: canales de plumas
 */
export type Knit = 'punto' | 'canale' | 'sarga' | 'liso' | 'pana' | 'gofre' | 'rejilla' | 'grano' | 'rizo' | 'acolchado'

const SIZE: Record<Knit, number> = {
  punto: 1.2,
  // 4 costillas por repetición: ~4 mm cada una, como un canalé 2x2 de verdad
  canale: 1.6,
  sarga: 1.5,
  liso: 1,
  pana: 2.4,
  gofre: 1.4,
  rejilla: 0.8,
  grano: 3,
  rizo: 1.6,
  acolchado: 12,
}
const cache = new Map<Knit, THREE.Texture>()

/** Ruido suave y periódico (para piel y rizo), sin dependencias. */
function wave(x: number, y: number, seeds: number[][]) {
  let h = 0
  for (const [fx, fy, ph] of seeds) h += Math.sin(Math.PI * 2 * (fx * x + fy * y) + ph)
  return h / seeds.length
}
const GRAIN = [[3, 5, 0.3], [7, -2, 1.7], [-5, 6, 2.9], [11, 9, 0.8], [-13, 4, 4.1]]
const CURL = [[4, 4, 0], [-4, 4, 1.3], [8, 0, 2.2], [0, 8, 3.1]]

/** Altura del relieve en una repetición (x, y en [0, 1)), periódica. */
const HEIGHT: Record<Knit, (x: number, y: number) => number> = {
  // Punto de camiseta o felpa: columnas de pequeñas uves
  punto: (x, y) => {
    const cx = (x * 8) % 1
    const cy = (y * 10) % 1
    return 1 - Math.min(Math.abs(Math.abs(cx - 0.5) * 2 - (1 - cy)) * 2.2, 1)
  },
  // Canalé: costillas verticales redondeadas
  canale: (x) => Math.pow(Math.abs(Math.sin(Math.PI * 4 * x)), 0.85),
  // Sarga (denim): diagonales
  sarga: (x, y) => Math.abs(Math.sin(Math.PI * 12 * (x + y))),
  liso: () => 0.5,
  // Pana: canutillos redondeados y anchos
  pana: (x) => Math.sqrt(Math.abs(Math.sin(Math.PI * 3 * x))),
  // Gofre: cuadritos hundidos
  gofre: (x, y) => Math.min(Math.abs(Math.sin(Math.PI * 4 * x)), Math.abs(Math.sin(Math.PI * 4 * y))),
  // Rejilla: agujeros redondos
  rejilla: (x, y) => Math.min(1, Math.hypot(((x * 4) % 1) - 0.5, ((y * 4) % 1) - 0.5) * 2.6),
  grano: (x, y) => 0.5 + 0.5 * wave(x, y, GRAIN),
  rizo: (x, y) => Math.abs(wave(x, y, CURL)),
  // Acolchado: canales horizontales abombados
  acolchado: (_x, y) => Math.sqrt(Math.abs(Math.sin(Math.PI * y))),
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
