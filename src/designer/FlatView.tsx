import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { DesignData } from '../shared/designs'
import { fileUrl, type Material } from '../shared/library'
import { VIEW_H, VIEW_W } from './geometry'
import type { GarmentTemplate, View } from './types'

interface Props {
  template: GarmentTemplate
  data: DesignData
  view: View
  /** Materiales de la Biblioteca por id (para usar su foto como textura). */
  materials?: Map<string, Material>
  /** Pieza resaltada (al pasar por encima en el panel). */
  highlight?: string | null
  className?: string
  /**
   * Encuadre: «ajustado» recorta alrededor del dibujo (miniaturas, una vista sola);
   * «común» usa el mismo lienzo en todas las vistas, para que se vean a la misma escala.
   */
  frame?: 'ajustado' | 'comun'
}

/** Dibujo técnico (flat) de una prenda en una vista, con los colores y materiales de cada pieza. */
export function FlatView({ template, data, view, materials, highlight, className, frame = 'ajustado' }: Props) {
  const uid = useId().replace(/:/g, '')
  const shapes = template.draw(view, data.options)
  // Encuadre: el lienzo se ajusta al dibujo (con un margen), así la prenda ocupa todo el espacio disponible
  const group = useRef<SVGGElement>(null)
  const [box, setBox] = useState(`0 0 ${VIEW_W} ${VIEW_H}`)
  const key = shapes.map((s) => s.d).join('|')
  useLayoutEffect(() => {
    if (frame === 'comun') {
      setBox(`40 0 ${VIEW_W - 80} ${VIEW_H}`)
      return
    }
    const b = group.current?.getBBox()
    if (!b || !b.width) return
    const pad = 12
    setBox(`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`)
  }, [key, frame])
  const style = (piece?: string) => (piece ? data.pieces[piece] : undefined)
  const textured = new Map<string, string>()
  for (const [id, s] of Object.entries(data.pieces)) {
    const m = s.materialId ? materials?.get(s.materialId) : undefined
    if (m?.photo) textured.set(id, fileUrl(m.photo))
  }

  return (
    <svg className={className} viewBox={box} role="img" aria-label={`${template.name}: vista ${view}`}>
      <defs>
        {[...textured].map(([piece, url]) => (
          <pattern key={piece} id={`${uid}-${piece}`} patternUnits="userSpaceOnUse" width="70" height="70">
            <image href={url} width="70" height="70" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
      </defs>
      <g ref={group}>
      {shapes.map((s, i) => {
        const st = style(s.piece)
        const color = st?.color ?? template.pieces.find((p) => p.id === s.piece)?.defaultColor ?? '#d9d6cf'
        const tex = s.piece ? textured.get(s.piece) : undefined
        const hl = highlight && s.piece === highlight
        switch (s.kind) {
          case 'fill':
          case 'shade':
            return (
              <g key={i}>
                <path d={s.d} fill={color} />
                {tex && <path d={s.d} fill={`url(#${uid}-${s.piece})`} style={{ mixBlendMode: 'multiply' }} opacity={0.55} />}
                {s.kind === 'shade' && <path d={s.d} fill="#000" opacity={0.2} />}
                {hl && <path d={s.d} fill="#3b82f6" opacity={0.18} />}
                <path d={s.d} fill="none" stroke="#1d1c1a" strokeWidth={1.4} strokeLinejoin="round" />
              </g>
            )
          case 'hardware':
            return <path key={i} d={s.d} fill={color} stroke="#1d1c1a" strokeWidth={1} strokeLinejoin="round" />
          case 'line':
            return <path key={i} d={s.d} fill="none" stroke={s.piece && st && isDark(color) ? '#f4f1ea' : '#1d1c1a'} strokeWidth={1.2} strokeLinecap="round" />
          case 'stitch':
            return (
              <path
                key={i}
                d={s.d}
                fill="none"
                stroke={isDark(color) ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'}
                strokeWidth={0.9}
                strokeDasharray="3.2 2.4"
                strokeLinecap="round"
              />
            )
          case 'rib':
            return <path key={i} d={s.d} fill="none" stroke={isDark(color) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)'} strokeWidth={0.8} />
        }
      })}
      </g>
    </svg>
  )
}

/** ¿Es un color oscuro? (para que pespuntes y líneas se vean encima). */
function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110
}
