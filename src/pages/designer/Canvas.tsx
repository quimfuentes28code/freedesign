import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { Callouts, CmGrid, Dimensions, newCallout, ScaleBar } from '../../designer/annotations'
import { FlatView, type FlatContext } from '../../designer/FlatView'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import { garmentPoms, type Body } from '../../production/measurements'
import type { Callout, DesignData, Print } from '../../shared/designs'
import type { Material } from '../../shared/library'

export type CanvasView = View | 'all'

/** Cómo se ve el lienzo: color o línea, y qué ayudas técnicas se muestran. */
export interface CanvasSettings {
  mode: 'color' | 'linea'
  dims: boolean
  grid: boolean
  notes: boolean
}

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  highlight: string | null
  view: CanvasView
  onViewChange: (v: CanvasView) => void
  settings: CanvasSettings
  onSettings: (s: CanvasSettings) => void
  selectedPiece: string | null
  onPickPiece: (piece: string | null) => void
  selectedPrint: string | null
  onSelectPrint: (id: string | null) => void
  onChangePrint: (p: Print) => void
  selectedCallout: string | null
  onSelectCallout: (id: string | null) => void
  onCallouts: (c: Callout[]) => void
  /** Medidas del cuerpo para las cotas y de dónde salen (talla o cliente). */
  body: Body
  bodyLabel: string
}

/**
 * Lienzo del editor: vista delantera, espalda, lateral o las tres a la vez, en color o en línea.
 * Clic en una pieza para editarla; los estampados se arrastran, escalan y giran; las notas se colocan con un clic.
 * Rueda o botones para acercar; arrastrando el fondo se mueve.
 */
export function Canvas(props: Props) {
  const { template, data, materials, highlight, view, onViewChange, settings, onSettings } = props
  const { selectedPiece, onPickPiece, selectedPrint, onSelectPrint, onChangePrint, selectedCallout, onSelectCallout, onCallouts, body, bodyLabel } = props
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [adding, setAdding] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const callouts = data.callouts ?? []

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
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo (p. ej. eventos simulados): se sigue funcionando sin captura
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })
  }
  const toggle = (k: keyof Omit<CanvasSettings, 'mode'>) => onSettings({ ...settings, [k]: !settings[k] })

  const views = view === 'all' ? VIEWS.map((v) => v.id) : [view]
  const annotated = settings.dims || settings.notes
  const overlay = (v: View) => (ctx: FlatContext) => (
    <>
      {settings.grid && <CmGrid ctx={ctx} />}
      {settings.dims && v === 'front' && <Dimensions ctx={ctx} template={template} options={data.options} body={body} />}
      {settings.notes && (
        <Callouts
          ctx={ctx}
          callouts={callouts}
          view={v}
          selected={selectedCallout}
          onSelect={onSelectCallout}
          onChange={(c) => onCallouts(callouts.map((x) => (x.id === c.id ? c : x)))}
          adding={adding}
          onAdd={(p) => {
            const c = newCallout(v, p)
            onCallouts([...callouts, c])
            onSelectCallout(c.id)
            setAdding(false)
          }}
        />
      )}
      <ScaleBar ctx={ctx} />
    </>
  )
  const poms = settings.dims ? garmentPoms(template, data.options) : []

  return (
    <div className="canvas">
      <div className="canvas-toolbar">
        <div className="segmented" role="group" aria-label="Vista">
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
        <div className="canvas-tools">
          <div className="segmented" role="group" aria-label="Estilo del dibujo">
            <button className={settings.mode === 'color' ? 'active' : ''} onClick={() => onSettings({ ...settings, mode: 'color' })} title="Con colores y tejidos">
              Color
            </button>
            <button className={settings.mode === 'linea' ? 'active' : ''} onClick={() => onSettings({ ...settings, mode: 'linea' })} title="En blanco y negro, como un plano de taller">
              Línea
            </button>
          </div>
          <button className={settings.dims ? 'tool active' : 'tool'} onClick={() => toggle('dims')} aria-pressed={settings.dims} title="Cotas con las medidas (vista delantera)">
            Cotas
          </button>
          <button className={settings.grid ? 'tool active' : 'tool'} onClick={() => toggle('grid')} aria-pressed={settings.grid} title="Cuadrícula de 5 cm">
            Cuadrícula
          </button>
          <button className={settings.notes ? 'tool active' : 'tool'} onClick={() => toggle('notes')} aria-pressed={settings.notes} title="Mostrar las notas">
            Notas
          </button>
          <button
            className={adding ? 'tool adding' : 'tool'}
            onClick={() => {
              if (!settings.notes) onSettings({ ...settings, notes: true })
              setAdding((a) => !a)
            }}
            title="Haz clic en el dibujo donde quieras la nota"
          >
            {adding ? 'Haz clic en el dibujo…' : '+ Nota'}
          </button>
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
        className={`canvas-stage${zoom > 1 ? ' zoomed' : ''}${settings.mode === 'linea' ? ' line-mode' : ''}`}
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
                pad={annotated ? 40 : 16}
                mode={settings.mode}
                selectedPiece={selectedPiece}
                onPickPiece={(p) => {
                  onPickPiece(p)
                  onSelectCallout(null)
                }}
                selectedPrint={selectedPrint}
                onSelectPrint={(id) => {
                  onSelectPrint(id)
                  if (id === null) {
                    onPickPiece(null)
                    onSelectCallout(null)
                  }
                }}
                onChangePrint={onChangePrint}
                overlay={overlay(v)}
              />
              {view === 'all' && <figcaption>{VIEWS.find((x) => x.id === v)?.label}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
      <p className="canvas-hint">
        {settings.dims && poms.length > 0 ? (
          <>
            <strong>Cotas ({bodyLabel}):</strong>{' '}
            {poms
              .slice(0, 8)
              .map((p, i) => `${String.fromCharCode(65 + i)} ${p.label.toLowerCase()}`)
              .join(' · ')}
          </>
        ) : (
          'Clic en una pieza para editarla · Rueda para acercar · Ctrl+Z deshacer · Supr borra el estampado o la nota seleccionada'
        )}
      </p>
    </div>
  )
}
