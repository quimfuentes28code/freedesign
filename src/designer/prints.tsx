import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Print } from '../shared/designs'
import { fileUrl } from '../shared/library'

/** Unidades del lienzo del dibujo técnico por cm real (aprox. en una talla M). */
export const UNITS_PER_CM = 2

let ctx: CanvasRenderingContext2D | null = null
/** Ancho de un texto con su tipografía, en las mismas unidades que `size`. */
export function measureText(text: string, font: string, size: number, bold = false, italic = false, letterSpacing = 0) {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size * 0.6
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} 100px ${font}`
  return (ctx.measureText(text || ' ').width / 100) * size + Math.max(0, text.length - 1) * letterSpacing
}

/** Ancho y alto que ocupa un estampado. */
export function printSize(p: Print) {
  if (p.kind === 'text') return { w: measureText(p.text, p.font, p.size, p.bold), h: p.size * 1.15 }
  return { w: p.w, h: p.w * p.aspect }
}

/** Dibuja un estampado en su sitio (centrado en x, y y girado). */
export function PrintShape({ p }: { p: Print }) {
  const { w, h } = printSize(p)
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rotation})`}>
      {p.kind === 'artwork' ? (
        <image href={fileUrl(p.file)} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" />
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={p.font}
          fontSize={p.size}
          fontWeight={p.bold ? 700 : 400}
          fill={p.color}
        >
          {p.text}
        </text>
      )}
    </g>
  )
}

export interface Transform {
  x: number
  y: number
  w: number
  rotation: number
}

interface TransformableProps {
  value: Transform
  /** Alto / ancho (para dibujar el marco). */
  aspect: number
  selected: boolean
  onSelect: () => void
  onChange: (t: Transform) => void
  children: ReactNode
}

/**
 * Envuelve un elemento del lienzo SVG para poder seleccionarlo, moverlo (arrastrando), cambiar su tamaño
 * (esquina) y girarlo (asa de arriba). Con Mayúsculas el giro va de 15 en 15 grados.
 */
export function Transformable({ value, aspect, selected, onSelect, onChange, children }: TransformableProps) {
  const start = useRef<{ mode: 'move' | 'resize' | 'rotate'; px: number; py: number; t: Transform; d0: number } | null>(null)
  const { x, y, w, rotation } = value
  const h = w * aspect

  const toSvg = (e: ReactPointerEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!
    const m = svg.getScreenCTM()!.inverse()
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return { x: pt.x, y: pt.y }
  }

  const begin = (mode: 'move' | 'resize' | 'rotate') => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const p = toSvg(e)
    start.current = { mode, px: p.x, py: p.y, t: value, d0: Math.hypot(p.x - x, p.y - y) || 1 }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo (p. ej. eventos simulados): se sigue funcionando sin captura
    }
  }
  const move = (e: ReactPointerEvent) => {
    const s = start.current
    if (!s) return
    const p = toSvg(e)
    if (s.mode === 'move') onChange({ ...s.t, x: s.t.x + p.x - s.px, y: s.t.y + p.y - s.py })
    else if (s.mode === 'resize') onChange({ ...s.t, w: Math.max(4, (s.t.w * Math.hypot(p.x - s.t.x, p.y - s.t.y)) / s.d0) })
    else {
      let deg = (Math.atan2(p.y - s.t.y, p.x - s.t.x) * 180) / Math.PI + 90
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      else for (const snap of [0, 90, 180, -90, -180]) if (Math.abs(deg - snap) < 3) deg = snap
      onChange({ ...s.t, rotation: Math.round(deg * 10) / 10 })
    }
  }
  const end = () => (start.current = null)

  return (
    <g onPointerDown={begin('move')} onPointerMove={move} onPointerUp={end} style={{ cursor: 'move' }}>
      {children}
      {/* Zona para poder agarrarlo aunque sea fino o transparente */}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="transparent" transform={`rotate(${rotation} ${x} ${y})`} />
      {selected && (
        <g transform={`rotate(${rotation} ${x} ${y})`}>
          <rect
            x={x - w / 2}
            y={y - h / 2}
            width={w}
            height={h}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={0.8}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
          <line x1={x} y1={y - h / 2} x2={x} y2={y - h / 2 - 12} stroke="#3b82f6" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <circle
            cx={x}
            cy={y - h / 2 - 12}
            r={3.5}
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onPointerDown={begin('rotate')}
            onPointerMove={move}
            onPointerUp={end}
          />
          <rect
            x={x + w / 2 - 3.5}
            y={y + h / 2 - 3.5}
            width={7}
            height={7}
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth={1}
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={begin('resize')}
            onPointerMove={move}
            onPointerUp={end}
          />
        </g>
      )}
    </g>
  )
}
