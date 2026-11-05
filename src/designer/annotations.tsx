import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { garmentPoms, type Body } from '../production/measurements'
import type { Callout } from '../shared/designs'
import type { Box, FlatContext } from './FlatView'
import { CX } from './geometry'
import { measureText, UNITS_PER_CM } from './prints'
import { isPants, type GarmentTemplate, type Options, type View } from './types'

/**
 * Anotaciones del dibujo técnico, dibujadas encima del plano: cotas con la letra de cada punto de medida
 * (las mismas de la tabla de medidas de la ficha técnica), escala, cuadrícula en cm y notas con flecha.
 */

const DIM = '#2563eb'
const NOTE = '#c2410c'
const FONT = 'Inter, system-ui, sans-serif'

/** Letra de un punto de medida (A, B, C…), igual que en la ficha técnica. */
export function pomLetters(t: GarmentTemplate, o: Options) {
  return new Map(garmentPoms(t, o).map((p, i) => [p.id, String.fromCharCode(65 + i)]))
}

interface DimLine {
  pom: string
  /** Vertical u horizontal. */
  dir: 'v' | 'h'
  /** Posición fija (x de una vertical, y de una horizontal) y de dónde a dónde va. */
  at: number
  from: number
  to: number
}

/** Qué cotas se dibujan y dónde, según las piezas de la vista delantera. */
function dimLines(t: GarmentTemplate, pieces: Record<string, Box>): DimLine[] {
  const bottom = (...b: (Box | undefined)[]) => Math.max(...b.filter(Boolean).map((x) => x!.y + x!.h))
  if (isPants(t)) {
    const legs = pieces.perneras
    const band = pieces.cinturilla
    if (!legs || !band) return []
    const end = bottom(legs, pieces.punos)
    return [
      { pom: 'cintura', dir: 'h', at: band.y - 12, from: band.x, to: band.x + band.w },
      { pom: 'cadera', dir: 'h', at: band.y + band.h + 18 * UNITS_PER_CM, from: legs.x, to: legs.x + legs.w },
      { pom: 'largo', dir: 'v', at: legs.x - 14, from: band.y, to: end },
      { pom: 'bajo', dir: 'h', at: end + 12, from: legs.x, to: legs.x + legs.w * 0.42 },
    ]
  }
  // Gorro y gorra: ancho y alto de la copa; en la gorra, también la visera
  if (t.family === 'head') {
    const crown = pieces.copa
    if (!crown) return []
    const brim = pieces.visera
    const lowest = bottom(crown, pieces.vuelta, brim)
    return t.id === 'gorra'
      ? [
          { pom: 'alto-copa', dir: 'v', at: crown.x - 14, from: crown.y, to: crown.y + crown.h },
          ...(brim ? [{ pom: 'ancho-visera', dir: 'h' as const, at: lowest + 12, from: brim.x, to: brim.x + brim.w }] : []),
        ]
      : [
          { pom: 'alto', dir: 'v', at: crown.x - 14, from: crown.y, to: lowest },
          { pom: 'ancho', dir: 'h', at: lowest + 12, from: crown.x, to: crown.x + crown.w },
        ]
  }
  const body = pieces.cuerpo
  if (!body) return []
  const sleeves = pieces.mangas
  const hem = pieces.bajo
  const end = bottom(body, hem)
  const lines: DimLine[] = [
    { pom: 'largo', dir: 'v', at: Math.min(body.x, sleeves?.x ?? body.x) - 14, from: body.y, to: end },
    { pom: 'pecho', dir: 'h', at: body.y + body.h * 0.3, from: body.x + body.w * 0.06, to: body.x + body.w * 0.94 },
    { pom: 'bajo', dir: 'h', at: end + 12, from: (hem ?? body).x, to: (hem ?? body).x + (hem ?? body).w },
  ]
  if (sleeves) lines.push({ pom: 'manga', dir: 'v', at: sleeves.x + sleeves.w + 12, from: sleeves.y + 6, to: sleeves.y + sleeves.h })
  return lines
}

/** Cotas de la vista delantera con su letra y su medida (de la talla o del cliente que se pase). */
export function Dimensions(props: { ctx: FlatContext; template: GarmentTemplate; options: Options; body: Body; measures?: Record<string, number> }) {
  const { ctx, template, options, body, measures } = props
  const poms = garmentPoms(template, options).map((p) => (measures?.[p.id] !== undefined ? { ...p, value: () => measures[p.id] } : p))
  const letters = pomLetters(template, options)
  return (
    <g pointerEvents="none" fontFamily={FONT}>
      {dimLines(template, ctx.pieces).map((d) => {
        const pom = poms.find((p) => p.id === d.pom)
        if (!pom) return null
        const label = `${letters.get(d.pom)} ${pom.value(body).toLocaleString('es-ES')}`
        const mid = (d.from + d.to) / 2
        const [x1, y1, x2, y2] = d.dir === 'v' ? [d.at, d.from, d.at, d.to] : [d.from, d.at, d.to, d.at]
        const tick = (x: number, y: number) =>
          d.dir === 'v' ? <line x1={x - 3} x2={x + 3} y1={y} y2={y} stroke={DIM} strokeWidth={0.8} /> : <line x1={x} x2={x} y1={y - 3} y2={y + 3} stroke={DIM} strokeWidth={0.8} />
        const w = measureText(label, FONT, 8, true) + 6
        const [lx, ly] = d.dir === 'v' ? [d.at, mid] : [mid, d.at]
        return (
          <g key={d.pom}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth={0.8} strokeDasharray={d.pom === 'pecho' ? '3 2' : undefined} />
            {tick(x1, y1)}
            {tick(x2, y2)}
            <rect x={lx - w / 2} y={ly - 6} width={w} height={12} rx={3} fill="#fff" stroke={DIM} strokeWidth={0.6} />
            <text x={lx} y={ly} fontSize={8} fontWeight={700} fill={DIM} textAnchor="middle" dominantBaseline="central">
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Barra de escala de 10 cm en la esquina de abajo a la izquierda. */
/** `upc`: unidades del lienzo por cm de la prenda (ver `unitsOf`). */
export function ScaleBar({ ctx, upc = UNITS_PER_CM }: { ctx: FlatContext; upc?: number }) {
  const len = 10 * upc
  const x = ctx.box.x + 6
  const y = ctx.box.y + ctx.box.h - 8
  return (
    <g pointerEvents="none" fontFamily={FONT} fill="#55524c">
      <rect x={x} y={y - 3} width={len / 2} height={3} fill="#1d1c1a" />
      <rect x={x + len / 2} y={y - 3} width={len / 2} height={3} fill="#fff" stroke="#1d1c1a" strokeWidth={0.6} />
      <text x={x} y={y - 6} fontSize={6}>
        0
      </text>
      <text x={x + len} y={y - 6} fontSize={6} textAnchor="end">
        10 cm
      </text>
    </g>
  )
}

/** Cuadrícula de 5 cm (más marcada cada 10 cm). */
export function CmGrid({ ctx, upc = UNITS_PER_CM }: { ctx: FlatContext; upc?: number }) {
  const step = 5 * upc
  const { x, y, w, h } = ctx.box
  const xs: number[] = []
  const ys: number[] = []
  for (let v = Math.ceil((x - CX) / step) * step + CX; v < x + w; v += step) xs.push(v)
  for (let v = Math.ceil(y / step) * step; v < y + h; v += step) ys.push(v)
  const major = (v: number, base: number) => Math.round((v - base) / step) % 2 === 0
  return (
    <g pointerEvents="none">
      {xs.map((v) => (
        <line key={`x${v}`} x1={v} x2={v} y1={y} y2={y + h} stroke="#2563eb" strokeOpacity={major(v, CX) ? 0.16 : 0.07} strokeWidth={0.5} />
      ))}
      {ys.map((v) => (
        <line key={`y${v}`} x1={x} x2={x + w} y1={v} y2={v} stroke="#2563eb" strokeOpacity={major(v, 0) ? 0.16 : 0.07} strokeWidth={0.5} />
      ))}
    </g>
  )
}

interface CalloutsProps {
  ctx: FlatContext
  callouts: Callout[]
  view: View
  /** Edición: seleccionar, mover el punto o la nota, y añadir con un clic (si `adding`). */
  selected?: string | null
  onSelect?: (id: string | null) => void
  onChange?: (c: Callout) => void
  adding?: boolean
  onAdd?: (point: { x: number; y: number }) => void
}

/** Notas con flecha sobre el dibujo. */
export function Callouts({ ctx, callouts, view, selected, onSelect, onChange, adding, onAdd }: CalloutsProps) {
  const drag = useRef<{ id: string; part: 'point' | 'label'; px: number; py: number; c: Callout } | null>(null)
  const toSvg = (e: ReactPointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }
  const begin = (c: Callout, part: 'point' | 'label') => (e: ReactPointerEvent) => {
    if (!onChange) return
    e.stopPropagation()
    onSelect?.(c.id)
    const p = toSvg(e)
    drag.current = { id: c.id, part, px: p.x, py: p.y, c }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo: se mueve igual, sin captura
    }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || !onChange) return
    const p = toSvg(e)
    const dx = p.x - d.px
    const dy = p.y - d.py
    onChange(d.part === 'point' ? { ...d.c, x: d.c.x + dx, y: d.c.y + dy } : { ...d.c, lx: d.c.lx + dx, ly: d.c.ly + dy })
  }
  const end = () => (drag.current = null)

  return (
    <g fontFamily={FONT}>
      {callouts
        .filter((c) => c.view === view)
        .map((c) => {
          const text = c.text || 'Nota'
          const w = measureText(text, FONT, 8) + 8
          const right = c.lx >= c.x
          const rx = right ? c.lx : c.lx - w
          const active = selected === c.id
          const color = active ? DIM : NOTE
          return (
            <g key={c.id} onPointerMove={move} onPointerUp={end}>
              <line x1={c.x} y1={c.y} x2={c.lx} y2={c.ly} stroke={color} strokeWidth={0.8} />
              <circle cx={c.x} cy={c.y} r={active ? 3 : 2.2} fill={color} style={{ cursor: onChange ? 'move' : undefined }} onPointerDown={begin(c, 'point')} />
              <g onPointerDown={begin(c, 'label')} style={{ cursor: onChange ? 'move' : undefined }}>
                <rect x={rx} y={c.ly - 7} width={w} height={14} rx={3} fill="#fff" stroke={color} strokeWidth={active ? 1.2 : 0.7} />
                <text x={rx + 4} y={c.ly} fontSize={8} fill="#1d1c1a" dominantBaseline="central">
                  {text}
                </text>
              </g>
            </g>
          )
        })}
      {adding && (
        <rect
          x={ctx.box.x}
          y={ctx.box.y}
          width={ctx.box.w}
          height={ctx.box.h}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => {
            // Sin el comportamiento por defecto, el clic no quita el foco a la casilla del texto de la nota
            e.preventDefault()
            e.stopPropagation()
            onAdd?.(toSvg(e))
          }}
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
    </g>
  )
}

/** Nota nueva en un punto: la etiqueta hacia fuera de la prenda. */
export function newCallout(view: View, p: { x: number; y: number }): Callout {
  const out = p.x >= CX ? 1 : -1
  return { id: crypto.randomUUID(), view, x: p.x, y: p.y, lx: p.x + out * 60, ly: p.y - 22, text: '' }
}
