import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Drawing, Tracing } from '../shared/designs'
import { fileUrl } from '../shared/library'
import type { FlatContext } from './FlatView'
import { Transformable } from './prints'
import type { View } from './types'

/**
 * Dibujo a mano sobre el plano (lápiz, líneas, rectángulos y elipses) y el boceto para calcar.
 * Todo en unidades del lienzo, encima del dibujo técnico.
 */

export type DrawTool = 'free' | 'line' | 'rect' | 'ellipse'

export interface Brush {
  color: string
  width: number
  dash: boolean
}

/** Trazado SVG de un dibujo. El lápiz se suaviza con curvas entre los puntos medios. */
export function drawingPath(d: Drawing) {
  const p = d.points
  const [x0, y0, x1, y1] = [p[0], p[1], p[p.length - 2], p[p.length - 1]]
  switch (d.kind) {
    case 'line':
      return `M${x0} ${y0} L${x1} ${y1}`
    case 'rect':
      return `M${x0} ${y0} H${x1} V${y1} H${x0} Z`
    case 'ellipse': {
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const rx = Math.abs(x1 - x0) / 2
      const ry = Math.abs(y1 - y0) / 2
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
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

/** Solo los trazos (para la ficha técnica y las miniaturas). */
export function DrawingsView({ drawings, view }: { drawings: Drawing[]; view: View }) {
  return (
    <g pointerEvents="none">
      {drawings
        .filter((d) => d.view === view && !d.hidden)
        .map((d) => (
          <path key={d.id} d={drawingPath(d)} fill="none" stroke={d.color} strokeWidth={d.width} strokeDasharray={dashOf(d)} strokeLinecap="round" strokeLinejoin="round" />
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
    } else {
      setDraft({ ...draft, points: [draft.points[0], draft.points[1], x, y] })
    }
  }
  const end = () => {
    if (!drawing.current || !draft) return
    drawing.current = false
    const p = draft.points
    const size = Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1])
    if (size > 1 || p.length > 6) onAdd(draft)
    setDraft(null)
  }

  return (
    <g>
      {drawings
        .filter((d) => d.view === view && !d.hidden)
        .map((d) => {
          const path = drawingPath(d)
          return (
            <g key={d.id}>
              <path d={path} fill="none" stroke={d.color} strokeWidth={d.width} strokeDasharray={dashOf(d)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
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
      {draft && (
        <path d={drawingPath(draft)} fill="none" stroke={draft.color} strokeWidth={draft.width} strokeDasharray={dashOf(draft)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      )}
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
