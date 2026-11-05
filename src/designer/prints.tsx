import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Print } from '../shared/designs'
import { fileUrl } from '../shared/library'
import { loadFont } from './fonts'

/** Unidades del lienzo del dibujo técnico por cm real (aprox. en una talla M). */
export const UNITS_PER_CM = 2
/** Unidades del lienzo por cm de una prenda base (las de cabeza se dibujan más grandes). */
export const unitsOf = (t?: { unitsPerCm?: number } | null) => t?.unitsPerCm ?? UNITS_PER_CM

let ctx: CanvasRenderingContext2D | null = null
/** Ancho de un texto con su tipografía, en las mismas unidades que `size`. */
export function measureText(text: string, font: string, size: number, bold = false, italic = false, letterSpacing = 0) {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size * 0.6
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} 100px ${font}`
  return (ctx.measureText(text || ' ').width / 100) * size + Math.max(0, text.length - 1) * letterSpacing
}

/** Una letra colocada (centro y giro en grados), para el texto en arco o vertical. */
export interface Glyph {
  ch: string
  x: number
  y: number
  rot: number
}

/**
 * Cómo se reparte un texto: recto (glyphs = null, se pinta de una vez), en arco (cada letra sobre un trozo de
 * circunferencia, tangente a ella) o vertical (una letra debajo de otra). Centrado en (0, 0).
 */
export function textLayout(p: Pick<Print, 'text' | 'font' | 'size' | 'bold' | 'italic' | 'letterSpacing' | 'arc' | 'vertical'>) {
  const ls = p.letterSpacing ?? 0
  const chars = [...(p.text || ' ')]
  const width = (s: string) => measureText(s, p.font, p.size, p.bold, p.italic)
  if (p.vertical) {
    const lineH = p.size * 0.95 + ls
    const glyphs = chars.map((ch, i): Glyph => ({ ch, x: 0, y: (i - (chars.length - 1) / 2) * lineH, rot: 0 }))
    return { glyphs, w: Math.max(...chars.map(width)), h: chars.length * lineH }
  }
  if (p.arc) {
    const ws = chars.map(width)
    const W = ws.reduce((a, b) => a + b, 0) + ls * (chars.length - 1)
    const theta = Math.max(0.05, (Math.PI * Math.abs(p.arc)) / 100)
    const r = W / theta
    const s = Math.sign(p.arc)
    const sag = r * (1 - Math.cos(Math.min(theta, 2 * Math.PI) / 2))
    let cum = 0
    const glyphs = chars.map((ch, i): Glyph => {
      const a = (cum + ws[i] / 2 - W / 2) / r
      cum += ws[i] + ls
      // Arco hacia arriba (∩): las puntas bajan; hacia abajo (∪): suben. Centrado en el alto del arco
      return { ch, x: r * Math.sin(a), y: s * (r * (1 - Math.cos(a)) - sag / 2), rot: (s * a * 180) / Math.PI }
    })
    return { glyphs, w: (theta > Math.PI ? 2 * r : 2 * r * Math.sin(theta / 2)) + p.size * 0.6, h: sag + p.size * 1.15 }
  }
  return { glyphs: null, w: measureText(p.text, p.font, p.size, p.bold, p.italic, ls), h: p.size * 1.15 }
}

/** Ancho y alto que ocupa un estampado. */
export function printSize(p: Print) {
  if (p.kind === 'text') {
    const { w, h } = textLayout(p)
    const extra = (p.stroke ? (p.strokeWidth ?? 1) : 0) + (p.shadow ? (p.shadowOffset ?? 1.5) : 0)
    return { w: w + extra, h: h + extra }
  }
  return { w: p.w, h: p.w * p.aspect }
}

/** Texto de un estampado (con sus efectos) centrado en (0, 0). */
export function PrintText({ p }: { p: Print }) {
  useEffect(() => {
    loadFont(p.font)
  }, [p.font])
  const { glyphs } = textLayout(p)
  const font = { fontFamily: p.font, fontSize: p.size, fontWeight: p.bold ? 700 : 400, fontStyle: p.italic ? 'italic' : 'normal' }
  const paint = (fill: string, dx: number, dy: number, key: string, outline: boolean) => {
    const stroke = outline && p.stroke ? { stroke: p.stroke, strokeWidth: p.strokeWidth ?? 1, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const } : {}
    const shadowStroke = !outline && p.stroke ? { stroke: fill, strokeWidth: p.strokeWidth ?? 1, strokeLinejoin: 'round' as const } : {}
    if (!glyphs) {
      return (
        <text key={key} x={dx} y={dy} textAnchor="middle" dominantBaseline="central" fill={fill} letterSpacing={p.letterSpacing || undefined} {...font} {...stroke} {...shadowStroke}>
          {p.text}
        </text>
      )
    }
    return (
      <g key={key}>
        {glyphs.map((g, i) => (
          <text key={i} x={g.x + dx} y={g.y + dy} transform={g.rot ? `rotate(${g.rot} ${g.x + dx} ${g.y + dy})` : undefined} textAnchor="middle" dominantBaseline="central" fill={fill} {...font} {...stroke} {...shadowStroke}>
            {g.ch}
          </text>
        ))}
      </g>
    )
  }
  const off = p.shadowOffset ?? 1.5
  return (
    <>
      {p.shadow && paint(p.shadow, off * 0.7, off, 'sombra', false)}
      {paint(p.color, 0, 0, 'texto', true)}
    </>
  )
}

/** Dibuja un estampado en su sitio (centrado en x, y y girado). */
export function PrintShape({ p }: { p: Print }) {
  const { w, h } = printSize(p)
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rotation})`}>
      {p.kind === 'artwork' ? (
        <image href={p.file.includes(':') ? p.file : fileUrl(p.file)} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" />
      ) : (
        <PrintText p={p} />
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
