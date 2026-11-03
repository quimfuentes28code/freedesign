/**
 * Geometría para los dibujos técnicos (flats). Lienzo de 400 × 480 con el eje de simetría en x = 200.
 */

export type Pt = readonly [number, number]

export const CX = 200
export const VIEW_W = 400
export const VIEW_H = 480

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export const len = (a: Pt) => Math.hypot(a[0], a[1])
export const norm = (a: Pt): Pt => mul(a, 1 / (len(a) || 1))
/** Perpendicular (girada 90° en sentido horario en pantalla). */
export const perp = (a: Pt): Pt => [-a[1], a[0]]
/** Refleja un punto respecto al eje vertical central. */
export const mirror = (p: Pt): Pt => [2 * CX - p[0], p[1]]

const f = (n: number) => Math.round(n * 10) / 10
const P = (p: Pt) => `${f(p[0])} ${f(p[1])}`

/** Tramo de un contorno: llega a `to`, en línea recta o con una curva (control `c`). */
export interface Seg {
  to: Pt
  c?: Pt
}

/** Contorno abierto o cerrado a partir de un punto inicial y tramos. */
export function path(start: Pt, segs: Seg[], close = true) {
  let d = `M${P(start)}`
  for (const s of segs) d += s.c ? ` Q${P(s.c)} ${P(s.to)}` : ` L${P(s.to)}`
  return close ? `${d} Z` : d
}

/**
 * Contorno simétrico: se describe solo la mitad derecha, desde un punto del eje (arriba) hasta otro punto
 * del eje (abajo), y se completa reflejándola.
 */
export function symmetric(start: Pt, segs: Seg[]) {
  const pts = [start, ...segs.map((s) => s.to)]
  const back: Seg[] = []
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]
    back.push({ to: mirror(pts[i]), c: s.c ? mirror(s.c) : undefined })
  }
  return path(start, [...segs, ...back])
}

/** Refleja un contorno completo (para piezas que van a ambos lados, como las mangas o los bolsillos). */
export function mirrorSegs(start: Pt, segs: Seg[]): [Pt, Seg[]] {
  return [mirror(start), segs.map((s) => ({ to: mirror(s.to), c: s.c ? mirror(s.c) : undefined }))]
}

/** Línea (abierta) entre puntos. */
export const line = (...pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)}`).join(' ')

/** Línea paralela a a→b desplazada `d` hacia su lado izquierdo (en pantalla, con y hacia abajo). */
export function offsetLine(a: Pt, b: Pt, d: number) {
  const n = mul(norm(perp(sub(b, a))), d)
  return line(add(a, n), add(b, n))
}

/** Curva cuadrática como trazo abierto. */
export const curve = (a: Pt, c: Pt, b: Pt) => `M${P(a)} Q${P(c)} ${P(b)}`

/** Rectángulo (opcionalmente con esquinas redondeadas). */
export function rect(x: number, y: number, w: number, h: number, r = 0) {
  if (!r) return path([x, y], [{ to: [x + w, y] }, { to: [x + w, y + h] }, { to: [x, y + h] }])
  return [
    `M${P([x + r, y])}`,
    `L${P([x + w - r, y])} Q${P([x + w, y])} ${P([x + w, y + r])}`,
    `L${P([x + w, y + h - r])} Q${P([x + w, y + h])} ${P([x + w - r, y + h])}`,
    `L${P([x + r, y + h])} Q${P([x, y + h])} ${P([x, y + h - r])}`,
    `L${P([x, y + r])} Q${P([x, y])} ${P([x + r, y])} Z`,
  ].join(' ')
}

/** Cuadrilátero a partir de sus cuatro esquinas. */
export const quad = (a: Pt, b: Pt, c: Pt, d: Pt) => path(a, [{ to: b }, { to: c }, { to: d }])

/**
 * Líneas finas del canalé dentro de una banda: van del borde a1→a2 al borde b1→b2.
 * `spacing` es la separación aproximada entre costillas.
 */
export function ribLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt, spacing = 4) {
  const n = Math.max(2, Math.round(len(sub(a2, a1)) / spacing))
  const out: string[] = []
  for (let i = 1; i < n; i++) {
    const t = i / n
    out.push(line(lerp(a1, a2, t), lerp(b1, b2, t)))
  }
  return out.join(' ')
}
