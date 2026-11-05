import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DesignData, Detail, Print, ZipStyle } from '../shared/designs'
import { blockLine, halfPlane, onTilesChange, pieceTile, tileUrl, type Tile } from './surfaces'
import { buttonPrims, DetailGraphic, detailAspect, PrimsView, shade, zipperPrims } from './details'
import { useFontsVersion } from './fonts'
import { fileUrl, type Material } from '../shared/library'
import { VIEW_H, VIEW_W } from './geometry'
import type { Body } from '../production/measurements'
import { resolveMaterial, type CatalogMaterial } from './materials'
import { drawScale } from './measures'
import { PrintShape, printSize, Transformable, UNITS_PER_CM } from './prints'
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
  /** Edición de detalles (botones, cremalleras, parches…), como los estampados. */
  selectedDetail?: string | null
  onSelectDetail?: (id: string | null) => void
  onChangeDetail?: (d: Detail) => void
  /** Mantiene el encuadre aunque cambie la forma (al estirar la prenda, para que el punto siga al cursor). */
  lockFrame?: boolean
}

/** Estilo de cremallera según el material elegido para la fornitura (si no se ha elegido uno a propósito). */
const ZIP_BY_MATERIAL: Record<string, ZipStyle> = { 'cat:cremallera-vislon': 'vislon', 'cat:cremallera-nylon': 'nylon', 'cat:cremallera-invisible': 'invisible' }

/** Números de un trazado SVG → su caja (para colocar las fornituras con estilo donde estaba la forma simple). */
function pathBox(d: string) {
  const v = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < v.length; i += 2) {
    x0 = Math.min(x0, v[i])
    x1 = Math.max(x1, v[i])
    y0 = Math.min(y0, v[i + 1])
    y1 = Math.max(y1, v[i + 1])
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
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

/** Caja de un grupo del dibujo sin contar los bloques de color (marcados con data-block). */
function boxWithoutBlocks(el: SVGGraphicsElement): Box | null {
  if (el.hasAttribute('data-block')) return null
  if (!el.querySelector('[data-block]')) {
    const r = el.getBBox()
    return r.width || r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  }
  let b: Box | null = null
  for (const c of el.children) {
    const r = c instanceof SVGGraphicsElement ? boxWithoutBlocks(c) : null
    if (!r) continue
    b = b ? { x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), w: Math.max(b.x + b.w, r.x + r.w) - Math.min(b.x, r.x), h: Math.max(b.y + b.h, r.y + r.h) - Math.min(b.y, r.y) } : r
  }
  return b
}

/** Dibujo técnico (flat) de una prenda en una vista, con los colores y materiales de cada pieza y sus estampados. */
export function FlatView(props: Props) {
  const { template, data, view, materials, highlight, className, frame = 'ajustado', selectedPrint, onSelectPrint, onChangePrint } = props
  const { mode = 'color', selectedPiece, onPickPiece, overlay, pad = 12, body, selectedDetail, onSelectDetail, onChangeDetail, lockFrame } = props
  const line = mode === 'linea'
  const uid = useId().replace(/:/g, '')
  // Al terminar de descargar una fuente se vuelve a pintar (cambia el tamaño de los textos)
  useFontsVersion()
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
        const b = boxWithoutBlocks(el)
        if (!b) continue
        const prev = boxes[id]
        if (!prev) boxes[id] = b
        else {
          const x = Math.min(prev.x, b.x)
          const y = Math.min(prev.y, b.y)
          boxes[id] = { x, y, w: Math.max(prev.x + prev.w, b.x + b.w) - x, h: Math.max(prev.y + prev.h, b.y + b.h) - y }
        }
      }
      setPieceBoxes(boxes)
    }
    if (lockFrame) return
    if (frame === 'comun') {
      setBox({ x: 40, y: 0, w: VIEW_W - 80, h: VIEW_H })
      return
    }
    // Encuadre del dibujo sin los bloques de color (su semiplano es enorme, aunque se recorte a la pieza)
    const b = group.current ? boxWithoutBlocks(group.current) : null
    if (!b || !b.w) return
    setBox({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frame, pad, !!overlay, lockFrame])

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

  // Superficies (rayas, camuflaje…) y lavados: un azulejo por pieza; y bloques de color de esta vista
  const [, bumpTiles] = useState(0)
  useEffect(() => onTilesChange(() => bumpTiles((n) => n + 1)), [])
  const tiles = new Map<string, Tile>()
  if (!line) {
    for (const p of template.pieces) {
      const st = data.pieces[p.id]
      const t = st ? pieceTile(st) : null
      if (t) tiles.set(p.id, t)
    }
  }
  const blocks = (data.blocks ?? []).filter((b) => b.view === view)

  // Fornituras de la prenda con su estilo (botón de 4 agujeros, cremallera de metal…)
  const hw = data.hardware ?? {}
  const renderRole = (s: Shape, i: number) => {
    const b = pathBox(s.d)
    const color = colorOf(s.piece)
    const material = s.piece ? data.pieces[s.piece]?.materialId : null
    const prims =
      s.role === 'button'
        ? buttonPrims(hw.buttons ?? (material === 'cat:automatico' ? 'automatico' : '4'), b.w, color, hw.buttonArt)
        : zipperPrims(hw.zip ?? ZIP_BY_MATERIAL[material ?? ''] ?? 'metal', hw.puller ?? 'clasico', b.w, b.h, color, line ? '#ffffff' : shade(colorOf(template.pieces[0]?.id), -0.12), hw.pullerArt)
    return (
      <g key={i} data-piece={s.piece} transform={`translate(${b.x + b.w / 2} ${b.y + b.h / 2})`} {...pick(s.piece)} filter={line ? undefined : `url(#${uid}-relief)`}>
        <PrimsView prims={prims} />
      </g>
    )
  }

  const renderShape = (s: Shape, i: number) => {
    if (s.role) return renderRole(s, i)
    const color = colorOf(s.piece)
    const tex = s.piece ? textured.get(s.piece) : undefined
    const weave = weaveOf(s.piece)
    const gloss = glossOf(s.piece)
    switch (s.kind) {
      case 'fill':
      case 'shade': {
        const surface = s.piece && tiles.has(s.piece) ? `url(#${uid}-s-${s.piece})` : null
        const myBlocks = s.kind === 'fill' ? blocks.filter((b) => b.piece === s.piece) : []
        return (
          <g key={i} data-piece={s.kind === 'fill' ? s.piece : undefined} {...pick(s.piece)}>
            <path d={s.d} fill={surface ?? color} />
            {myBlocks.length > 0 && (
              <>
                <clipPath id={`${uid}-k${i}`}>
                  <path d={s.d} />
                </clipPath>
                <g clipPath={`url(#${uid}-k${i})`} data-block="">
                  {myBlocks.map((b) => (
                    <g key={b.id}>
                      <path d={halfPlane(b)} fill={line ? '#ffffff' : b.color} />
                      {/* Costura del bloque y su pespunte, del lado del bloque */}
                      <path d={blockLine(b, 0)} stroke={isDark(line ? '#ffffff' : b.color) ? '#f4f1ea' : '#1d1c1a'} strokeWidth={1.1} fill="none" />
                      <path d={blockLine(b, 2.5)} stroke={isDark(line ? '#ffffff' : b.color) ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'} strokeWidth={0.9} strokeDasharray="3.2 2.4" fill="none" />
                    </g>
                  ))}
                </g>
              </>
            )}
            {tex && <path d={s.d} fill={`url(#${uid}-${s.piece})`} style={{ mixBlendMode: 'multiply' }} opacity={0.55} />}
            {weave && <path d={s.d} fill={weave} />}
            {gloss > 0.05 && <path d={s.d} fill={`url(#${uid}-gloss)`} opacity={Math.min(0.8, gloss * 0.7)} />}
            {s.kind === 'shade' && <path d={s.d} fill="#000" opacity={0.2} />}
            {highlight && s.piece === highlight && <path d={s.d} fill="#3b82f6" opacity={0.18} />}
            <path d={s.d} fill="none" stroke="#1d1c1a" strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        )
      }
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
  const details = (data.details ?? []).filter((d) => d.view === view && !d.hidden)
  // Bordados y parches con relieve: sombra suave que les da volumen
  const raised = (p: Print) => !line && (p.technique === 'bordado' || p.technique === 'parche')

  return (
    <svg
      className={className}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      role="img"
      aria-label={`${template.name}: vista ${view}`}
      onPointerDown={
        editable
          ? () => {
              onSelectPrint?.(null)
              onSelectDetail?.(null)
            }
          : undefined
      }
    >
      <defs>
        <filter id={`${uid}-relief`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.4" dy="0.7" stdDeviation="0.5" floodColor="#000" floodOpacity="0.35" />
        </filter>
        <filter id={`${uid}-raised`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.6" dy="1.1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.45" />
        </filter>
        {[...textured].map(([piece, url]) => (
          <pattern key={piece} id={`${uid}-${piece}`} patternUnits="userSpaceOnUse" width="70" height="70">
            <image href={url} width="70" height="70" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
        {[...looks].map(([piece, m]) => (
          <WeavePattern key={piece} id={`${uid}-w-${piece}`} weave={m.weave} />
        ))}
        {[...tiles].map(([piece, t]) => {
          const s = data.pieces[piece]?.surface
          const angle = s?.angle ?? 0
          if (t.stretch && s) {
            // Degradado: de arriba abajo de cada trozo de la pieza (girado según el ángulo)
            return (
              <linearGradient key={piece} id={`${uid}-s-${piece}`} x1="0" y1="0" x2="0" y2="1" gradientTransform={`rotate(${angle} 0.5 0.5)`}>
                <stop offset="0" stopColor={data.pieces[piece]?.color} />
                <stop offset="1" stopColor={s.color2} />
              </linearGradient>
            )
          }
          const size = t.cm * UNITS_PER_CM
          return (
            <pattern key={piece} id={`${uid}-s-${piece}`} patternUnits="userSpaceOnUse" width={size} height={size} patternTransform={angle ? `rotate(${angle})` : undefined}>
              <image href={tileUrl(t)} width={size} height={size} preserveAspectRatio="none" />
            </pattern>
          )
        })}
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
            <g filter={raised(p) ? `url(#${uid}-raised)` : undefined}>
              <PrintShape p={p} />
            </g>
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
      {details.map((d) => {
        const filter = line ? undefined : `url(#${uid}-${d.relief ? 'raised' : 'relief'})`
        const shape = <DetailGraphic d={line ? { ...d, color: '#ffffff', color2: '#1d1c1a' } : d} filter={filter} />
        if (!onChangeDetail || d.locked) return <g key={d.id}>{shape}</g>
        const aspect = detailAspect(d)
        return (
          <Transformable
            key={d.id}
            value={{ x: d.x, y: d.y, w: d.w, rotation: d.rotation }}
            aspect={aspect}
            selected={selectedDetail === d.id}
            onSelect={() => onSelectDetail?.(d.id)}
            onChange={(t) => onChangeDetail({ ...d, x: t.x, y: t.y, rotation: t.rotation, w: t.w, ...(d.kind === 'cremallera' ? { length: t.w * aspect } : {}) })}
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
