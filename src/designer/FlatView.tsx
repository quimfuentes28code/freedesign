import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { DesignData, Print } from '../shared/designs'
import { fileUrl, type Material } from '../shared/library'
import { VIEW_H, VIEW_W } from './geometry'
import { PrintShape, printSize, Transformable } from './prints'
import type { GarmentTemplate, Shape, View } from './types'

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
  /** Edición de estampados: si se pasa `onChangePrint`, se pueden seleccionar, mover, escalar y girar. */
  selectedPrint?: string | null
  onSelectPrint?: (id: string | null) => void
  onChangePrint?: (p: Print) => void
}

/** Dibujo técnico (flat) de una prenda en una vista, con los colores y materiales de cada pieza y sus estampados. */
export function FlatView(props: Props) {
  const { template, data, view, materials, highlight, className, frame = 'ajustado', selectedPrint, onSelectPrint, onChangePrint } = props
  const uid = useId().replace(/:/g, '')
  const shapes = template.draw(view, data.options)
  const prints = (data.prints ?? []).filter((p) => p.view === view)

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

  const textured = new Map<string, string>()
  for (const [id, s] of Object.entries(data.pieces)) {
    const m = s.materialId ? materials?.get(s.materialId) : undefined
    if (m?.photo) textured.set(id, fileUrl(m.photo))
  }
  const colorOf = (piece?: string) =>
    (piece && data.pieces[piece]?.color) || template.pieces.find((p) => p.id === piece)?.defaultColor || '#d9d6cf'

  const renderShape = (s: Shape, i: number) => {
    const color = colorOf(s.piece)
    const tex = s.piece ? textured.get(s.piece) : undefined
    switch (s.kind) {
      case 'fill':
      case 'shade':
        return (
          <g key={i}>
            <path d={s.d} fill={color} />
            {tex && <path d={s.d} fill={`url(#${uid}-${s.piece})`} style={{ mixBlendMode: 'multiply' }} opacity={0.55} />}
            {s.kind === 'shade' && <path d={s.d} fill="#000" opacity={0.2} />}
            {highlight && s.piece === highlight && <path d={s.d} fill="#3b82f6" opacity={0.18} />}
            <path d={s.d} fill="none" stroke="#1d1c1a" strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        )
      case 'hardware':
        return <path key={i} d={s.d} fill={color} stroke="#1d1c1a" strokeWidth={1} strokeLinejoin="round" />
      case 'line':
        return <path key={i} d={s.d} fill="none" stroke={isDark(color) ? '#f4f1ea' : '#1d1c1a'} strokeWidth={1.2} strokeLinecap="round" />
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
  }

  // Las fornituras (cremallera, cordones) van por encima de los estampados
  const onTop = (s: Shape) => s.kind === 'hardware' || (s.kind === 'line' && /cord/.test(s.piece ?? ''))
  const editable = !!onChangePrint

  return (
    <svg
      className={className}
      viewBox={box}
      role="img"
      aria-label={`${template.name}: vista ${view}`}
      onPointerDown={editable ? () => onSelectPrint?.(null) : undefined}
    >
      <defs>
        {[...textured].map(([piece, url]) => (
          <pattern key={piece} id={`${uid}-${piece}`} patternUnits="userSpaceOnUse" width="70" height="70">
            <image href={url} width="70" height="70" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
        <clipPath id={`${uid}-garment`}>
          {shapes.filter((s) => s.kind === 'fill').map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </clipPath>
      </defs>
      <g ref={group}>{shapes.map(renderShape)}</g>
      {prints.map((p) => {
        const shape = (
          <g clipPath={p.clip ? `url(#${uid}-garment)` : undefined}>
            <PrintShape p={p} />
          </g>
        )
        if (!editable) return <g key={p.id}>{shape}</g>
        const { w, h } = printSize(p)
        return (
          <Transformable
            key={p.id}
            value={{ x: p.x, y: p.y, w, rotation: p.rotation }}
            aspect={h / w}
            selected={selectedPrint === p.id}
            onSelect={() => onSelectPrint?.(p.id)}
            onChange={(t) =>
              onChangePrint({
                ...p,
                x: t.x,
                y: t.y,
                rotation: t.rotation,
                ...(p.kind === 'text' ? { size: (p.size * t.w) / w } : { w: t.w }),
              })
            }
          >
            {shape}
          </Transformable>
        )
      })}
      <g pointerEvents="none">{shapes.filter(onTop).map(renderShape)}</g>
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
