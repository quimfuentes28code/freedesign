import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { DesignData, Drawing, Tracing } from '../shared/designs'
import { withMirrors } from './geometry'
import { fileUrl } from '../shared/library'
import type { FlatContext } from './FlatView'
import { Transformable } from './prints'
import type { View } from './types'

/**
 * Dibujo a mano sobre el plano (lápiz, líneas, rectángulos y elipses) y el boceto para calcar.
 * Todo en unidades del lienzo, encima del dibujo técnico.
 */

export type DrawTool = Drawing['kind']

/** Formas cerradas (se pueden rellenar). */
export const CLOSED_SHAPES: DrawTool[] = ['rect', 'ellipse', 'triangle', 'star', 'heart', 'diamond']

export interface Brush {
  color: string
  width: number
  dash: boolean
  /** Dibuja canales de acolchado (puffer, chaleco) en vez de líneas. */
  quilt?: boolean
  /** Simétrico: el trazo se repite reflejado al otro lado del centro. */
  mirror?: boolean
  /** Relleno de las formas cerradas. */
  fill?: string
  /** Esquinas redondeadas (rectángulo, triángulo, rombo, estrella). */
  round?: number
  /** Suaviza el trazo a mano al soltarlo (sin temblores ni trompicones). */
  smooth?: boolean
}

/** Contorno cerrado por unos puntos, con las esquinas redondeadas (`r`: 0 en pico, 1 muy redondas). */
function roundedPolygon(pts: [number, number][], r: number) {
  const f = (v: number) => v.toFixed(1)
  if (r <= 0) return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + ' Z'
  const k = Math.min(0.5, r * 0.5)
  const n = pts.length
  // Cada esquina se cambia por una curva que empieza y acaba en sus dos lados
  const cut = (a: [number, number], b: [number, number]) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  let d = ''
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const a = cut(p, pts[(i - 1 + n) % n])
    const b = cut(p, pts[(i + 1) % n])
    d += `${i ? ' L' : 'M'}${f(a[0])} ${f(a[1])} Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`
  }
  return d + ' Z'
}

/**
 * Suaviza un trazo a mano: quita los puntos que sobran (temblores) y redondea los quiebros. Puntos x0, y0, x1, y1…
 */
export function smoothPoints(points: number[], strength = 1) {
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i], points[i + 1]])
  if (pts.length < 4) return points
  // 1. Simplificar (Ramer-Douglas-Peucker): fuera los puntos a menos de `eps` de la línea que los une
  const eps = 0.9 * strength
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let best = eps
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
      if (dist > best) {
        best = dist
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  let out = pts.filter((_, i) => keep[i])
  // 2. Redondear (Chaikin): cada tramo se cambia por dos puntos a 1/4 y 3/4, conservando los extremos
  for (let it = 0; it < 2; it++) {
    if (out.length < 3) break
    const next: [number, number][] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i]
      const [x1, y1] = out[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
}

/** Trazos con sus copias reflejadas (los que van en simétrico). */
const mirrored = (drawings: Drawing[]) => withMirrors({ drawings } as DesignData).drawings ?? drawings

/** Trazado SVG de un dibujo. El lápiz se suaviza con curvas entre los puntos medios. */
export function drawingPath(d: Drawing) {
  const p = d.points
  const [x0, y0, x1, y1] = [p[0], p[1], p[p.length - 2], p[p.length - 1]]
  switch (d.kind) {
    case 'line':
      return `M${x0} ${y0} L${x1} ${y1}`
    case 'rect':
      if (d.round) return roundedPolygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], d.round)
      return `M${x0} ${y0} H${x1} V${y1} H${x0} Z`
    case 'ellipse': {
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const rx = Math.abs(x1 - x0) / 2
      const ry = Math.abs(y1 - y0) / 2
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
    }
    case 'triangle':
    case 'star':
    case 'heart':
    case 'diamond': {
      // En la caja de esquina a esquina (u, v de 0 a 1)
      const L = Math.min(x0, x1)
      const T = Math.min(y0, y1)
      const W = Math.abs(x1 - x0)
      const H = Math.abs(y1 - y0)
      const at = (u: number, v: number) => `${(L + u * W).toFixed(1)} ${(T + v * H).toFixed(1)}`
      const pt = (u: number, v: number): [number, number] => [L + u * W, T + v * H]
      if (d.kind === 'triangle') return roundedPolygon([pt(0.5, 0), pt(1, 1), pt(0, 1)], d.round ?? 0)
      if (d.kind === 'diamond') return roundedPolygon([pt(0.5, 0), pt(1, 0.5), pt(0.5, 1), pt(0, 0.5)], d.round ?? 0)
      if (d.kind === 'heart')
        return `M${at(0.5, 0.28)} C${at(0.5, 0.05)} ${at(0, 0)} ${at(0, 0.32)} C${at(0, 0.6)} ${at(0.35, 0.78)} ${at(0.5, 1)} C${at(0.65, 0.78)} ${at(1, 0.6)} ${at(1, 0.32)} C${at(1, 0)} ${at(0.5, 0.05)} ${at(0.5, 0.28)} Z`
      // Estrella de cinco puntas
      const star: [number, number][] = []
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const r = k % 2 ? 0.2 : 0.5
        star.push(pt(0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r * 1.05))
      }
      return roundedPolygon(star, d.round ?? 0)
    }
    default: {
      if (p.length < 6) return `M${x0} ${y0} L${x1} ${y1}`
      let d2 = `M${x0} ${y0}`
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2
        const my = (p[i + 1] + p[i + 3]) / 2
        d2 += ` Q${p[i]} ${p[i + 1]} ${mx.toFixed(1)} ${my.toFixed(1)}`
      }
      return `${d2} L${x1} ${y1}`
    }
  }
}

const dashOf = (d: Pick<Drawing, 'dash' | 'width'>) => (d.dash ? `${Math.max(2.4, d.width * 2.4)} ${Math.max(1.8, d.width * 1.8)}` : undefined)

/**
 * Un trazo pintado: línea normal o, si es un canal de acolchado, la hendidura del pespunte (sombra) con el relleno
 * abultado a los lados (brillo) y el pespunte encima.
 */
function Stroke({ d, path: line }: { d: Drawing; path: string }) {
  let path = line
  // Con relleno, el trazo a mano se cierra (forma propia: un bolsillo, un parche…)
  const fill = d.fill && (CLOSED_SHAPES.includes(d.kind) || d.kind === 'free') ? d.fill : 'none'
  if (d.fill && d.kind === 'free') path += ' Z'
  if (!d.quilt) return <path d={path} fill={fill} stroke={d.color} strokeWidth={d.width} strokeDasharray={dashOf(d)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
  const w = Math.max(0.6, d.width)
  return (
    <g pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={path} stroke="#000" strokeOpacity={0.12} strokeWidth={w * 7} />
      <path d={path} stroke="#000" strokeOpacity={0.22} strokeWidth={w * 3} />
      <path d={path} stroke="#fff" strokeOpacity={0.16} strokeWidth={w * 1.6} transform="translate(0 -1.4)" />
      <path d={path} stroke={d.color} strokeWidth={w * 0.7} strokeDasharray={`${w * 2.4} ${w * 1.7}`} />
    </g>
  )
}

/** Solo los trazos (para la ficha técnica y las miniaturas). */
export function DrawingsView({ drawings, view }: { drawings: Drawing[]; view: View }) {
  return (
    <g pointerEvents="none">
      {mirrored(drawings)
        .filter((d) => d.view === view && !d.hidden)
        .map((d) => (
          <Stroke key={d.id} d={d} path={drawingPath(d)} />
        ))}
    </g>
  )
}

interface LayerProps {
  ctx: FlatContext
  drawings: Drawing[]
  view: View
  selected: string | null
  onSelect: (id: string | null) => void
  /** Herramienta activa (null = solo seleccionar) y pincel con el que se dibuja. */
  tool: DrawTool | null
  brush: Brush
  /** Ajustar los puntos a la cuadrícula de 1 cm. */
  snap: number | null
  onAdd: (d: Drawing) => void
}

/** Trazos editables: clic para seleccionar; con una herramienta activa, arrastrar sobre el plano dibuja uno nuevo. */
export function DrawingsLayer({ ctx, drawings, view, selected, onSelect, tool, brush, snap, onAdd }: LayerProps) {
  const [draft, setDraft] = useState<Drawing | null>(null)
  const drawing = useRef(false)
  const toSvg = (e: ReactPointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    const s = (v: number) => (snap ? Math.round(v / snap) * snap : Math.round(v * 10) / 10)
    return [s(p.x), s(p.y)] as const
  }

  const start = (e: ReactPointerEvent) => {
    if (!tool) return
    e.preventDefault()
    e.stopPropagation()
    const [x, y] = toSvg(e)
    drawing.current = true
    setDraft({ id: crypto.randomUUID(), view, kind: tool, points: [x, y, x, y], ...brush })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo: se dibuja igual, sin captura
    }
  }
  const move = (e: ReactPointerEvent) => {
    if (!drawing.current || !draft) return
    const [x, y] = toSvg(e)
    if (draft.kind === 'free') {
      const p = draft.points
      // Un punto nuevo cada ~1,5 unidades: suficiente para que el trazo sea suave sin pesar mucho
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 1.5) return
      setDraft({ ...draft, points: [...p, x, y] })
    } else if (e.shiftKey && draft.kind !== 'line') {
      // Con Mayús, proporción 1:1 (círculo, cuadrado, estrella regular…)
      const [x0, y0] = draft.points
      const side = Math.max(Math.abs(x - x0), Math.abs(y - y0))
      setDraft({ ...draft, points: [x0, y0, x0 + Math.sign(x - x0 || 1) * side, y0 + Math.sign(y - y0 || 1) * side] })
    } else {
      setDraft({ ...draft, points: [draft.points[0], draft.points[1], x, y] })
    }
  }
  const end = () => {
    if (!drawing.current || !draft) return
    drawing.current = false
    const p = draft.points
    const size = Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1])
    // El trazo a mano se suaviza al soltarlo (salvo que se haya quitado «Suavizar»)
    const smooth = draft.kind === 'free' && brush.smooth !== false
    if (size > 1 || p.length > 6) onAdd(smooth ? { ...draft, points: smoothPoints(p) } : draft)
    setDraft(null)
  }

  return (
    <g>
      {mirrored(drawings)
        .filter((d) => d.view === view && !d.hidden)
        .map((d) => {
          const path = drawingPath(d)
          return (
            <g key={d.id}>
              <Stroke d={d} path={path} />
              {selected === d.id && <path d={path} fill="none" stroke="#2563eb" strokeWidth={0.8} strokeDasharray="2 2" pointerEvents="none" />}
              {/* Zona para agarrarlo aunque el trazo sea fino */}
              {!tool && !d.locked && (
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(8, d.width + 6)}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(d.id)
                  }}
                />
              )}
            </g>
          )
        })}
      {draft && mirrored([draft]).map((d) => <Stroke key={d.id} d={d} path={drawingPath(d)} />)}
      {tool && (
        <rect
          x={ctx.box.x}
          y={ctx.box.y}
          width={ctx.box.w}
          height={ctx.box.h}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </g>
  )
}

/** Boceto para calcar, semitransparente encima del plano. Si se está ajustando, se mueve y se escala como un estampado. */
export function TracingLayer({ tracing, adjusting, onChange }: { tracing: Tracing; adjusting: boolean; onChange: (t: Tracing) => void }) {
  if (tracing.hidden) return null
  const h = tracing.w * tracing.aspect
  const image = (
    <image
      href={fileUrl(tracing.file)}
      x={tracing.x - tracing.w / 2}
      y={tracing.y - h / 2}
      width={tracing.w}
      height={h}
      opacity={tracing.opacity}
      preserveAspectRatio="none"
      style={{ mixBlendMode: 'multiply' }}
    />
  )
  if (!adjusting || tracing.locked) return <g pointerEvents="none">{image}</g>
  return (
    <Transformable
      value={{ x: tracing.x, y: tracing.y, w: tracing.w, rotation: 0 }}
      aspect={tracing.aspect}
      selected
      onSelect={() => {}}
      onChange={(t) => onChange({ ...tracing, x: t.x, y: t.y, w: t.w })}
    >
      {image}
    </Transformable>
  )
}
