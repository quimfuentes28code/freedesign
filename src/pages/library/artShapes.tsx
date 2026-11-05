import type { FillStyle, PathNode, ShapeKind } from '../../shared/artworks'

/**
 * Geometría de las formas del creador (centradas en (0, 0), de ancho w y alto h), de los trazos de la pluma y el
 * lápiz, y de sus rellenos (liso, degradado o con textura).
 */

const n = (v: number) => Math.round(v * 100) / 100

/** Puntos de un polígono que se escalan a w × h (coordenadas de −0,5 a 0,5). */
const poly = (pts: [number, number][], w: number, h: number) => `M${pts.map(([x, y]) => `${n(x * w)} ${n(y * h)}`).join('L')}Z`

/** Trazado de una forma. */
export function shapePath(kind: ShapeKind, w: number, h: number, o: { points?: number; inner?: number; radius?: number } = {}) {
  const sx = (v: number) => n(v * w)
  const sy = (v: number) => n(v * h)
  switch (kind) {
    case 'rect': {
      const r = Math.min(w, h) * 0.5 * Math.max(0, Math.min(1, o.radius ?? 0))
      const x = -w / 2
      const y = -h / 2
      if (!r) return `M${n(x)} ${n(y)}H${n(-x)}V${n(-y)}H${n(x)}Z`
      return `M${n(x + r)} ${n(y)}H${n(-x - r)}A${n(r)} ${n(r)} 0 0 1 ${n(-x)} ${n(y + r)}V${n(-y - r)}A${n(r)} ${n(r)} 0 0 1 ${n(-x - r)} ${n(-y)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(-y - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
    }
    case 'circle':
      return `M${n(-w / 2)} 0A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(w / 2)} 0A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(-w / 2)} 0Z`
    case 'star':
    case 'burst': {
      const count = kind === 'burst' ? (o.points ?? 20) : (o.points ?? 5)
      const inner = kind === 'burst' ? (o.inner ?? 0.8) : (o.inner ?? 0.45)
      const pts: [number, number][] = []
      for (let i = 0; i < count * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / count
        const k = i % 2 === 0 ? 0.5 : 0.5 * inner
        pts.push([Math.cos(a) * k, Math.sin(a) * k])
      }
      return poly(pts, w, h)
    }
    case 'polygon': {
      const sides = Math.max(3, Math.round(o.points ?? 6))
      const pts: [number, number][] = []
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
        pts.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5])
      }
      return poly(pts, w, h)
    }
    case 'line': {
      // Una línea es una barra con las puntas redondeadas (su grosor es el alto)
      const r = Math.min(h / 2, w / 2)
      return `M${n(-w / 2 + r)} ${n(-h / 2)}H${n(w / 2 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w / 2 - r)} ${n(h / 2)}H${n(-w / 2 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-w / 2 + r)} ${n(-h / 2)}Z`
    }
    case 'arrow': {
      const head = Math.min(w * 0.4, h * 1.1)
      const t = h * 0.18
      const x0 = -w / 2
      const xb = w / 2 - head
      return `M${n(x0)} ${n(-t)}H${n(xb)}V${n(-h / 2)}L${n(w / 2)} 0L${n(xb)} ${n(h / 2)}V${n(t)}H${n(x0)}Z`
    }
    case 'heart':
      return `M0 ${sy(0.5)}C${sx(-0.1)} ${sy(0.4)} ${sx(-0.5)} ${sy(0.15)} ${sx(-0.5)} ${sy(-0.15)}C${sx(-0.5)} ${sy(-0.4)} ${sx(-0.25)} ${sy(-0.52)} 0 ${sy(-0.28)}C${sx(0.25)} ${sy(-0.52)} ${sx(0.5)} ${sy(-0.4)} ${sx(0.5)} ${sy(-0.15)}C${sx(0.5)} ${sy(0.15)} ${sx(0.1)} ${sy(0.4)} 0 ${sy(0.5)}Z`
    case 'shield':
      return `M${sx(-0.5)} ${sy(-0.5)}Q0 ${sy(-0.4)} ${sx(0.5)} ${sy(-0.5)}V${sy(0.05)}C${sx(0.5)} ${sy(0.3)} ${sx(0.25)} ${sy(0.42)} 0 ${sy(0.5)}C${sx(-0.25)} ${sy(0.42)} ${sx(-0.5)} ${sy(0.3)} ${sx(-0.5)} ${sy(0.05)}Z`
    case 'ribbon':
      // Banda central y las dos colas con su corte en pico
      return [
        poly([[-0.36, -0.32], [0.36, -0.32], [0.36, 0.22], [-0.36, 0.22]], w, h),
        poly([[-0.5, -0.12], [-0.3, -0.12], [-0.3, 0.46], [-0.5, 0.46], [-0.42, 0.17]], w, h),
        // (en el mismo sentido que las demás, para que no se recorte donde se solapan)
        poly([[0.5, -0.12], [0.42, 0.17], [0.5, 0.46], [0.3, 0.46], [0.3, -0.12]], w, h),
      ].join(' ')
    case 'badge': {
      // Sello: círculo con el borde ondulado
      const pts: [number, number][] = []
      const bumps = o.points ?? 16
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2
        const r = 0.5 * (0.9 + 0.1 * Math.cos(bumps * a))
        pts.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      return poly(pts, w, h)
    }
    case 'laurel': {
      // Dos ramas de hojas en arco, abiertas por arriba
      const leaves: string[] = []
      const count = o.points ?? 9
      for (const side of [-1, 1]) {
        for (let i = 0; i < count; i++) {
          const a = Math.PI / 2 + side * (0.25 + (i / (count - 1)) * 2.2)
          const cx = Math.cos(a) * 0.4
          const cy = Math.sin(a) * 0.4
          // La hoja apunta hacia arriba por el arco (tangente) y un poco hacia fuera
          const tx = -Math.sin(a) * side
          const ty = Math.cos(a) * side
          const len = 0.13 - i * 0.004
          const wid = 0.045
          const tip: [number, number] = [cx + tx * len - Math.cos(a) * 0.03, cy + ty * len - Math.sin(a) * 0.03]
          const base: [number, number] = [cx - tx * len * 0.3, cy - ty * len * 0.3]
          const nx = -ty
          const ny = tx
          const m: [number, number] = [(tip[0] + base[0]) / 2, (tip[1] + base[1]) / 2]
          leaves.push(
            `M${sx(base[0])} ${sy(base[1])}Q${sx(m[0] + nx * wid)} ${sy(m[1] + ny * wid)} ${sx(tip[0])} ${sy(tip[1])}Q${sx(m[0] - nx * wid)} ${sy(m[1] - ny * wid)} ${sx(base[0])} ${sy(base[1])}Z`,
          )
        }
      }
      return leaves.join(' ')
    }
  }
}

/** Trazado de la pluma o el lápiz: curvas entre los puntos con sus asas. */
export function nodesPath(nodes: PathNode[], closed: boolean) {
  if (!nodes.length) return ''
  const seg = (a: PathNode, b: PathNode) => `C${n(a.x + (a.hx ?? 0))} ${n(a.y + (a.hy ?? 0))} ${n(b.x - (b.hx ?? 0))} ${n(b.y - (b.hy ?? 0))} ${n(b.x)} ${n(b.y)}`
  let d = `M${n(nodes[0].x)} ${n(nodes[0].y)}`
  for (let i = 1; i < nodes.length; i++) d += seg(nodes[i - 1], nodes[i])
  if (closed && nodes.length > 2) d += seg(nodes[nodes.length - 1], nodes[0]) + 'Z'
  return d
}

/** Caja de los puntos de un trazo (con sus asas). */
export function nodesBox(nodes: PathNode[]) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of nodes) {
    for (const [x, y] of [
      [p.x, p.y],
      [p.x + (p.hx ?? 0) * 0.75, p.y + (p.hy ?? 0) * 0.75],
      [p.x - (p.hx ?? 0) * 0.75, p.y - (p.hy ?? 0) * 0.75],
    ]) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  return { x0, y0, x1, y1 }
}

/** Curva suave que pasa por los puntos del lápiz (asas de Catmull-Rom), quitando los que sobran. */
export function smoothNodes(points: [number, number][]): PathNode[] {
  const pts: [number, number][] = []
  for (const p of points) if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 6) pts.push(p)
  if (points.length && pts.length === 1) pts.push(points[points.length - 1])
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    return { x: p[0], y: p[1], hx: (b[0] - a[0]) / 6, hy: (b[1] - a[1]) / 6 }
  })
}

/** Definición del relleno (degradado o textura) y el valor de `fill` que hay que usar. */
export function FillDefs({ id, color, style, w, h }: { id: string; color: string; style: FillStyle; w: number; h: number }) {
  if (!color) return null
  if (style.pattern) {
    const s = style.patternSize ?? 16
    const c = style.patternColor ?? '#ffffff'
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={s} height={s} patternTransform={style.fillAngle ? `rotate(${style.fillAngle})` : undefined}>
        <rect width={s} height={s} fill={color} />
        {style.pattern === 'rayas' && <rect width={s} height={s / 2} fill={c} />}
        {style.pattern === 'puntos' && <circle cx={s / 2} cy={s / 2} r={s * 0.22} fill={c} />}
        {style.pattern === 'cuadros' && (
          <>
            <rect width={s / 2} height={s} fill={c} opacity={0.55} />
            <rect width={s} height={s / 2} fill={c} opacity={0.55} />
          </>
        )}
      </pattern>
    )
  }
  if (style.fill2) {
    const a = ((style.fillAngle ?? 90) * Math.PI) / 180
    const dx = (Math.cos(a) * w) / 2
    const dy = (Math.sin(a) * h) / 2
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={-dx} y1={-dy} x2={dx} y2={dy}>
        <stop offset="0" stopColor={color} />
        <stop offset="1" stopColor={style.fill2} />
      </linearGradient>
    )
  }
  return null
}

/** Valor del `fill` (el color o el degradado o la textura). */
export const fillValue = (id: string, color: string, style: FillStyle) => (!color ? 'none' : style.pattern || style.fill2 ? `url(#${id})` : color)
