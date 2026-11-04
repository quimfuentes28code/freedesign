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
      edges: { u0: 'plana', u1: 'plana', v0: 'plana', v1: 'plana', ...spec.edges },
    }
    this.panels.push(panel)
    return panel
  }

  /**
   * Para cada punto: distancia (cm, en el patrón) al borde más cercano de su pieza, posición a lo largo de ese borde (cm)
   * y el acabado del borde. Sirve para dibujar costuras, pespuntes y rebordes en el material.
   */
  edgeInfo(): Float32Array {
    const out = new Float32Array((this.pos.length / 3) * 3)
    const f = this.flat
    const dist = (a: number, b: number) => Math.hypot(f[a * 2] - f[b * 2], f[a * 2 + 1] - f[b * 2 + 1])
    const kindAt = (k: PanelEdges[keyof PanelEdges], t: number) => EDGE_CODES[typeof k === 'function' ? k(t) : k]
    for (const p of this.panels) {
      const { nu, nv, index: at, edges } = p
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const v = at(i, j)
          // Candidatos: los cuatro bordes de la pieza (distancia, posición a lo largo, acabado)
          const cands: [number, number, number][] = [
            [dist(v, at(0, j)), f[at(0, j) * 2 + 1], kindAt(edges.u0, j)],
            [dist(v, at(nu - 1, j)), f[at(nu - 1, j) * 2 + 1], kindAt(edges.u1, j)],
            [dist(v, at(i, 0)), f[at(i, 0) * 2], kindAt(edges.v0, i)],
            [dist(v, at(i, nv - 1)), f[at(i, nv - 1) * 2], kindAt(edges.v1, i)],
          ]
          let best: [number, number, number] = [99, 0, EDGE_CODES.ninguno]
          for (const c of cands) if (c[2] !== EDGE_CODES.ninguno && c[0] < best[0]) best = c
          out.set(best, v * 3)
        }
      }
    }
    return out
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

/**
 * Acabado de un borde de pieza, para dibujar costuras y rebordes (ver Garment.tsx):
 * - plana: costura sin pespunte visible (unión con remallado)
 * - pespunte: costura con un pespunte a 6 mm de este lado
 * - recubierta: costura con doble pespunte (recubridora), como encima de puños y bajo
 * - doblez: borde doblado y redondeado (bajo de canalé, final del puño)
 * - jareta: borde doblado con el pespunte del canal del cordón (abertura de la capucha)
 * - ninguno: sin marca
 */
export type EdgeKind = 'plana' | 'pespunte' | 'recubierta' | 'doblez' | 'jareta' | 'ninguno'
export const EDGE_CODES: Record<EdgeKind, number> = { plana: 0, pespunte: 1, recubierta: 2, doblez: 3, jareta: 4, ninguno: 9 }

/** Acabado de cada borde: columna 0, última columna, fila 0 y última fila (o una función del índice a lo largo del borde). */
export interface PanelEdges {
  u0: EdgeKind | ((j: number) => EdgeKind)
  u1: EdgeKind | ((j: number) => EdgeKind)
  v0: EdgeKind | ((i: number) => EdgeKind)
  v1: EdgeKind | ((i: number) => EdgeKind)
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
  /** Acabado de sus bordes (por defecto, costuras planas). */
  edges?: Partial<PanelEdges>
}

export interface Panel {
  id: number
  nu: number
  nv: number
  index: (i: number, j: number) => number
  row: (j: number) => number[]
  col: (i: number) => number[]
  edges: PanelEdges
}
