import type { Part } from '../pose'
import type { Cloud, CloudGrid } from '../wrap'
import type { Cloth } from './Cloth'

/**
 * Pesos de huesos de cada punto de la tela: los de los puntos del cuerpo más cercanos en la postura en T
 * (solo de las zonas que sigue su pieza) y suavizados a lo largo de la tela y a través de las costuras,
 * para que las piezas cosidas se muevan juntas.
 */
export function skinCloth(
  cloth: Cloth,
  cloud: Cloud,
  grid: CloudGrid,
  parts: Uint8Array,
  follows: Part[][],
  smoothing = 8,
) {
  const n = cloth.pos.length / 3
  const bones = new Map<number, Float32Array>()
  const weightsOf = (b: number) => {
    let w = bones.get(b)
    if (!w) bones.set(b, (w = new Float32Array(n)))
    return w
  }
  // Para cada pieza, una tabla rápida de qué zonas del cuerpo puede seguir
  const masks = follows.map((list) => {
    const mask = new Uint8Array(16)
    for (const p of list) mask[p] = 1
    return mask
  })
  for (let i = 0; i < n; i++) {
    const mask = masks[cloth.panelOf[i]]
    const near = grid.nearest(cloth.pos[i * 3], cloth.pos[i * 3 + 1], cloth.pos[i * 3 + 2], 6, (pi) => mask[parts[pi]] === 1)
    for (const [pi, dist] of near) {
      const w = 1 / (dist + 0.5)
      for (let j = 0; j < 4; j++) {
        const bw = cloud.skinWeight[pi * 4 + j]
        if (bw > 0) weightsOf(cloud.skinIndex[pi * 4 + j])[i] += bw * w
      }
    }
  }

  const total = new Float32Array(n)
  for (const w of bones.values()) for (let i = 0; i < n; i++) total[i] += w[i]
  for (const w of bones.values()) for (let i = 0; i < n; i++) w[i] = total[i] > 0 ? w[i] / total[i] : 0

  const adj = cloth.neighbours()
  const tmp = new Float32Array(n)
  for (let it = 0; it < smoothing; it++) {
    for (const w of bones.values()) {
      for (let i = 0; i < n; i++) {
        let sum = w[i] * 2
        for (const j of adj[i]) sum += w[j]
        tmp[i] = sum / (2 + adj[i].length)
      }
      w.set(tmp)
    }
  }

  const skinIndex = new Uint16Array(n * 4)
  const skinWeight = new Float32Array(n * 4)
  const entries = [...bones.entries()]
  for (let i = 0; i < n; i++) {
    const top = entries
      .map(([b, w]) => [b, w[i]] as const)
      .filter(([, w]) => w > 1e-4)
      .sort((p, q) => q[1] - p[1])
      .slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0)
    if (sum <= 0) {
      skinWeight[i * 4] = 1
      continue
    }
    top.forEach(([b, w], j) => {
      skinIndex[i * 4 + j] = b
      skinWeight[i * 4 + j] = w / sum
    })
  }
  return { skinIndex, skinWeight }
}
