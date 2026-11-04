import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DesignData, Print } from '../shared/designs'
import { fileUrl, type Material } from '../shared/library'
import { VIEW_H, VIEW_W } from './geometry'
import type { Body } from '../production/measurements'
import { resolveMaterial, type CatalogMaterial } from './materials'
import { drawScale } from './measures'
import { PrintShape, printSize, Transformable } from './prints'
import { GlossGradient, hasWeave, WeavePattern } from './swatches'
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
  /** «color» con colores y tejidos; «linea» en blanco y negro, como un plano de taller. */
  mode?: 'color' | 'linea'
  /** Pieza seleccionada (se marca con un contorno) y qué hacer al hacer clic en una pieza. */
  selectedPiece?: string | null
  onPickPiece?: (piece: string) => void
  /** Capa encima del dibujo (cotas, notas, escala), en las mismas unidades que el dibujo. */
  overlay?: (ctx: FlatContext) => ReactNode
  /** Margen alrededor del dibujo en el encuadre ajustado (más si hay cotas). */
  pad?: number
  /** Cuerpo con el que se comparan las medidas propias del diseño (talla M si no se pasa). */
  body?: Body
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Lo que sabe la capa de encima: el encuadre y dónde queda cada pieza. */
export interface FlatContext {
  box: Box
  pieces: Record<string, Box>
}

/** Dibujo técnico (flat) de una prenda en una vista, con los colores y materiales de cada pieza y sus estampados. */
export function FlatView(props: Props) {
  const { template, data, view, materials, highlight, className, frame = 'ajustado', selectedPrint, onSelectPrint, onChangePrint } = props
  const { mode = 'color', selectedPiece, onPickPiece, overlay, pad = 12, body } = props
  const line = mode === 'linea'
  const uid = useId().replace(/:/g, '')
  const shapes = template.draw(view, data.options, drawScale(template, data, body))
  const prints = (data.prints ?? []).filter((p) => p.view === view && !p.hidden)

  // Encuadre: el lienzo se ajusta al dibujo (con un margen), así la prenda ocupa todo el espacio disponible
  const group = useRef<SVGGElement>(null)
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  const [pieceBoxes, setPieceBoxes] = useState<Record<string, Box>>({})
  const key = shapes.map((s) => s.d).join('|')
  useLayoutEffect(() => {
    // Dónde queda cada pieza (para las cotas)
    if (overlay && group.current) {
      const boxes: Record<string, Box> = {}
      for (const el of group.current.querySelectorAll<SVGGraphicsElement>('[data-piece]')) {
        const id = el.dataset.piece!
        const b = el.getBBox()
        const prev = boxes[id]
        if (!prev) boxes[id] = { x: b.x, y: b.y, w: b.width, h: b.height }
        else {
          const x = Math.min(prev.x, b.x)
          const y = Math.min(prev.y, b.y)
          boxes[id] = { x, y, w: Math.max(prev.x + prev.w, b.x + b.width) - x, h: Math.max(prev.y + prev.h, b.y + b.height) - y }
        }
      }
      setPieceBoxes(boxes)
    }
    if (frame === 'comun') {
      setBox({ x: 40, y: 0, w: VIEW_W - 80, h: VIEW_H })
      return
    }
    const b = group.current?.getBBox()
    if (!b || !b.width) return
    setBox({ x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frame, pad, !!overlay])

  // Material de cada pieza: foto si es de la Biblioteca y la tiene; si no, textura y brillo del catálogo.
  // En modo línea no hay ni color ni textura: todo blanco con su contorno.
  const textured = new Map<string, string>()
  const looks = new Map<string, CatalogMaterial>()
  if (!line) {
    for (const p of template.pieces) {
      const r = resolveMaterial(template.id, p.id, data.pieces[p.id]?.materialId, materials)
      if (r.library?.photo) textured.set(p.id, fileUrl(r.library.photo))
      else looks.set(p.id, r.catalog)
    }
  }
  const colorOf = (piece?: string) =>
    line ? '#ffffff' : (piece && data.pieces[piece]?.color) || template.pieces.find((p) => p.id === piece)?.defaultColor || '#d9d6cf'
  const pick = onPickPiece
    ? (piece?: string) => ({
        onClick: () => piece && onPickPiece(piece),
        style: { cursor: 'pointer' },
      })
    : () => ({})
  const weaveOf = (piece?: string) => {
    const m = piece ? looks.get(piece) : undefined
    return m && hasWeave(m.weave) ? `url(#${uid}-w-${piece})` : undefined
  }
  const glossOf = (piece?: string) => (piece ? (looks.get(piece)?.gloss ?? 0) : 0)

  const renderShape = (s: Shape, i: number) => {
    const color = colorOf(s.piece)
    const tex = s.piece ? textured.get(s.piece) : undefined
    const weave = weaveOf(s.piece)
    const gloss = glossOf(s.piece)
    switch (s.kind) {
      case 'fill':
      case 'shade':
        return (
          <g key={i} data-piece={s.kind === 'fill' ? s.piece : undefined} {...pick(s.piece)}>
            <path d={s.d} fill={color} />
            {tex && <path d={s.d} fill={`url(#${uid}-${s.piece})`} style={{ mixBlendMode: 'multiply' }} opacity={0.55} />}
            {weave && <path d={s.d} fill={weave} />}
            {gloss > 0.05 && <path d={s.d} fill={`url(#${uid}-gloss)`} opacity={Math.min(0.8, gloss * 0.7)} />}
            {s.kind === 'shade' && <path d={s.d} fill="#000" opacity={0.2} />}
            {highlight && s.piece === highlight && <path d={s.d} fill="#3b82f6" opacity={0.18} />}
            <path d={s.d} fill="none" stroke="#1d1c1a" strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        )
      case 'hardware':
        return (
          <g key={i} data-piece={s.piece} {...pick(s.piece)}>
            <path d={s.d} fill={color} />
            {weave && <path d={s.d} fill={weave} />}
            {gloss > 0.05 && <path d={s.d} fill={`url(#${uid}-${looks.get(s.piece!)?.weave === 'metal' ? 'metal' : 'gloss'})`} opacity={Math.min(1, gloss)} />}
            <path d={s.d} fill="none" stroke="#1d1c1a" strokeWidth={1} strokeLinejoin="round" />
          </g>
        )
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
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
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
        {[...looks].map(([piece, m]) => (
          <WeavePattern key={piece} id={`${uid}-w-${piece}`} weave={m.weave} />
        ))}
        <GlossGradient id={`${uid}-gloss`} />
        <GlossGradient id={`${uid}-metal`} metal />
        <clipPath id={`${uid}-garment`}>
          {shapes.filter((s) => s.kind === 'fill').map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </clipPath>
      </defs>
      <g ref={group}>{shapes.map(renderShape)}</g>
      {selectedPiece && (
        <g pointerEvents="none">
          {shapes
            .filter((s) => s.piece === selectedPiece && (s.kind === 'fill' || s.kind === 'hardware'))
            .map((s, i) => (
              <path key={i} d={s.d} fill="#2563eb" fillOpacity={0.08} stroke="#2563eb" strokeWidth={2.4} strokeLinejoin="round" />
            ))}
        </g>
      )}
      {prints.map((p) => {
        const shape = (
          <g clipPath={p.clip ? `url(#${uid}-garment)` : undefined} style={line ? { filter: 'grayscale(1)' } : undefined}>
            <PrintShape p={p} />
          </g>
        )
        if (!editable || p.locked) return <g key={p.id}>{shape}</g>
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
      {overlay?.({ box, pieces: pieceBoxes })}
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
