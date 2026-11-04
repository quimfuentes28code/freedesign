import * as THREE from 'three'

/**
 * Tela hecha de piezas de patrón cosidas entre sí.
 * Cada pieza es una rejilla de puntos con su forma plana (en cm reales) y una posición inicial en 3D.
 * Las distancias del patrón plano son las "de reposo": al asentar la prenda, la tela intenta recuperarlas.
 */
export class Cloth {
  /** Posición 3D de cada punto (unidades del modelo). */
  pos: number[] = []
  /** Coordenadas planas del patrón (cm reales), para las texturas de tela. */
  flat: number[] = []
  /** Pieza a la que pertenece cada punto. */
  panelOf: number[] = []
  /** Triángulos, separados por material (0 = tela principal, 1 = canalé). */
  tris: [number[], number[]] = [[], []]
  /** Restricciones de distancia: a, b, longitud de reposo, rigidez (0–1). */
  links: { a: number; b: number; rest: number; k: number }[] = []
  /** Pares de puntos cosidos entre piezas. */
  seams: [number, number][] = []
  panels: Panel[] = []

  /** @param unit unidades del modelo por cada cm real (el patrón se dibuja en cm). */
  constructor(readonly unit: number) {}

  /** Crea una pieza de rejilla `nu` × `nv`. `flat(u, v)` da su forma plana; `place(u, v)` su posición inicial. */
  addPanel(spec: PanelSpec): Panel {
    const { nu, nv, flat, place, material = 0, bend = 1 } = spec
    const id = this.panels.length
    const start = this.pos.length / 3
    const at = (i: number, j: number) => start + j * nu + i
    const f = new THREE.Vector2()
    const p = new THREE.Vector3()
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u = i / (nu - 1)
        const v = j / (nv - 1)
        flat(u, v, f)
        place(u, v, p)
        this.pos.push(p.x, p.y, p.z)
        this.flat.push(f.x, f.y)
        this.panelOf.push(id)
      }
    }
    const link = (a: number, b: number, k: number, scale = 1) => {
      const ax = this.flat[a * 2] - this.flat[b * 2]
      const ay = this.flat[a * 2 + 1] - this.flat[b * 2 + 1]
      this.links.push({ a, b, rest: Math.hypot(ax, ay) * scale * this.unit, k })
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = at(i, j)
        // Estructura (tela) y diagonales (cizalla)
        if (i + 1 < nu) link(a, at(i + 1, j), 1)
        if (j + 1 < nv) link(a, at(i, j + 1), 1)
        if (i + 1 < nu && j + 1 < nv) {
          link(a, at(i + 1, j + 1), 0.5)
          link(at(i + 1, j), at(i, j + 1), 0.5)
          this.tris[material].push(a, at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1))
        }
        // Rigidez a la flexión: puntos a dos pasos
        if (i + 2 < nu) link(a, at(i + 2, j), 0.15 * bend)
        if (j + 2 < nv) link(a, at(i, j + 2), 0.15 * bend)
      }
    }
    const panel: Panel = {
      id,
      nu,
      nv,
      index: at,
      row: (j) => Array.from({ length: nu }, (_, i) => at(i, j)),
      col: (i) => Array.from({ length: nv }, (_, j) => at(i, j)),
    }
    this.panels.push(panel)
    return panel
  }

  /** Cose dos bordes (listas ordenadas de puntos), emparejando por longitud recorrida. */
  sew(a: number[], b: number[]) {
    const pa = this.params(a)
    const pb = this.params(b)
    const nearest = (t: number, list: number[], params: number[]) => {
      let best = 0
      for (let i = 1; i < params.length; i++) if (Math.abs(params[i] - t) < Math.abs(params[best] - t)) best = i
      return list[best]
    }
    a.forEach((v, i) => this.seams.push([v, nearest(pa[i], b, pb)]))
    b.forEach((v, i) => this.seams.push([nearest(pb[i], a, pa), v]))
  }

  /** Posición relativa (0–1) de cada punto a lo largo de un borde, según el patrón plano. */
  private params(list: number[]) {
    const out = [0]
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      out.push(out[i - 1] + Math.hypot(this.flat[a * 2] - this.flat[b * 2], this.flat[a * 2 + 1] - this.flat[b * 2 + 1]))
    }
    const total = out[out.length - 1] || 1
    return out.map((d) => d / total)
  }

  /** Vecinos de cada punto (dentro de su pieza y a través de las costuras). */
  neighbours() {
    const n = this.pos.length / 3
    const adj: number[][] = Array.from({ length: n }, () => [])
    for (const { a, b, k } of this.links) {
      if (k < 1) continue
      adj[a].push(b)
      adj[b].push(a)
    }
    for (const [a, b] of this.seams) {
      adj[a].push(b)
      adj[b].push(a)
    }
    return adj
  }
}

export interface PanelSpec {
  nu: number
  nv: number
  flat: (u: number, v: number, out: THREE.Vector2) => void
  place: (u: number, v: number, out: THREE.Vector3) => void
  /** 0 = tela principal, 1 = canalé (puños, bajo, cuello). */
  material?: 0 | 1
  /** Multiplicador de la rigidez a la flexión. */
  bend?: number
}

export interface Panel {
  id: number
  nu: number
  nv: number
  index: (i: number, j: number) => number
  row: (j: number) => number[]
  col: (i: number) => number[]
}
