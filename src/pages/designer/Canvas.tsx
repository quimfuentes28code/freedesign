import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { FlatView } from '../../designer/FlatView'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import type { DesignData, Print } from '../../shared/designs'
import type { Material } from '../../shared/library'

export type CanvasView = View | 'all'

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  highlight: string | null
  view: CanvasView
  onViewChange: (v: CanvasView) => void
  selectedPrint: string | null
  onSelectPrint: (id: string | null) => void
  onChangePrint: (p: Print) => void
}

/**
 * Lienzo del editor: vista delantera, espalda, lateral o las tres a la vez.
 * Con la rueda o los botones se acerca para ver detalles, y arrastrando el fondo se mueve.
 * Los estampados se arrastran, se escalan desde la esquina y se giran con el asa de arriba.
 */
export function Canvas({ template, data, materials, highlight, view, onViewChange, selectedPrint, onSelectPrint, onChangePrint }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const setZoomClamped = (z: number) => {
    const next = Math.min(4, Math.max(1, z))
    setZoom(next)
    if (next === 1) setPan({ x: 0, y: 0 })
  }
  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && zoom === 1 && e.deltaY > 0) return
    setZoomClamped(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
  }
  const onDown = (e: PointerEvent) => {
    if (zoom === 1) return
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })
  }

  const views = view === 'all' ? VIEWS.map((v) => v.id) : [view]
  return (
    <div className="canvas">
      <div className="canvas-toolbar">
        <div className="segmented">
          {[...VIEWS, { id: 'all' as const, label: 'Todas' }].map((v) => (
            <button
              key={v.id}
              className={view === v.id ? 'active' : ''}
              onClick={() => {
                onViewChange(v.id)
                reset()
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="zoom">
          <button onClick={() => setZoomClamped(zoom / 1.25)} disabled={zoom === 1} aria-label="Alejar">
            −
          </button>
          <button onClick={reset} className="zoom-value" title="Volver a la vista completa">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoomClamped(zoom * 1.25)} disabled={zoom === 4} aria-label="Acercar">
            +
          </button>
        </div>
      </div>
      <div
        className={zoom > 1 ? 'canvas-stage zoomed' : 'canvas-stage'}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <div className="canvas-content" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {views.map((v) => (
            <figure key={v} className="canvas-view">
              <FlatView
                template={template}
                data={data}
                view={v}
                materials={materials}
                highlight={highlight}
                frame={view === 'all' ? 'comun' : 'ajustado'}
                selectedPrint={selectedPrint}
                onSelectPrint={onSelectPrint}
                onChangePrint={onChangePrint}
              />
              {view === 'all' && <figcaption>{VIEWS.find((x) => x.id === v)?.label}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
      <p className="canvas-hint">
        Rueda del ratón o botones para acercar · Arrastra el fondo para moverte · Arrastra un estampado para colocarlo
      </p>
    </div>
  )
}
