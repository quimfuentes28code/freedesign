import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { api, imageSize } from '../../api/client'
import { Callouts, CmGrid, Dimensions, newCallout, ScaleBar } from '../../designer/annotations'
import { DrawingsLayer, TracingLayer, type Brush, type DrawTool } from '../../designer/drawings'
import { CX } from '../../designer/geometry'
import { unitsOf } from '../../designer/prints'
import { FlatView, type FlatContext } from '../../designer/FlatView'
import { ShapeHandles } from '../../designer/handles'
import { defaultMeasures } from '../../designer/measures'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import { garmentPoms, type Body } from '../../production/measurements'
import type { Callout, ColorBlock, DesignData, Detail, Drawing, Print, Tracing } from '../../shared/designs'
import type { Material } from '../../shared/library'

export type CanvasView = View | 'all'

/** Cómo se ve el lienzo: color o línea, y qué ayudas técnicas se muestran. */
export interface CanvasSettings {
  mode: 'color' | 'linea'
  dims: boolean
  grid: boolean
  notes: boolean
  /** Pincel de la herramienta de dibujo. */
  brush: Brush
}

const WIDTHS = [
  { v: 0.6, label: 'Fino' },
  { v: 1.2, label: 'Medio' },
  { v: 2.4, label: 'Grueso' },
  { v: 4, label: 'Muy grueso' },
]
const TOOLS: { id: DrawTool | null; label: string; title: string; icon: RailIcon }[] = [
  { id: null, label: 'Seleccionar', title: 'Seleccionar y mover (Esc)', icon: 'select' },
  { id: 'free', label: 'Lápiz', title: 'Lápiz: dibujo a mano alzada', icon: 'free' },
  { id: 'line', label: 'Línea', title: 'Línea recta', icon: 'line' },
  { id: 'rect', label: 'Rectángulo', title: 'Rectángulo', icon: 'rect' },
  { id: 'ellipse', label: 'Elipse', title: 'Elipse o círculo (con Mayús, círculo)', icon: 'ellipse' },
  { id: 'triangle', label: 'Triángulo', title: 'Triángulo', icon: 'triangle' },
  { id: 'star', label: 'Estrella', title: 'Estrella', icon: 'star' },
  { id: 'heart', label: 'Corazón', title: 'Corazón', icon: 'heart' },
  { id: 'diamond', label: 'Rombo', title: 'Rombo', icon: 'diamond' },
]

/** Iconos de la columna de herramientas (20×20, trazo con el color del texto). */
const RAIL_ICONS = {
  select: 'M5 3l11 6.5-4.8 1.3L9 15.5z',
  free: 'M4 16l1.2-4.2L13 4l3 3-7.8 7.8zM11.5 5.5l3 3',
  line: 'M4 16L16 4',
  rect: 'M4 5.5h12v9H4z',
  ellipse: 'M3 10a7 5 0 1 0 14 0a7 5 0 1 0-14 0',
  triangle: 'M10 3.5L17 16H3z',
  star: 'M10 2.5l2.2 4.9 5.3.5-4 3.5 1.2 5.2L10 13.9l-4.7 2.7 1.2-5.2-4-3.5 5.3-.5z',
  heart: 'M10 6.5C10 3.5 3.5 3 3.5 7.5c0 3.5 4 6 6.5 9 2.5-3 6.5-5.5 6.5-9C16.5 3 10 3.5 10 6.5z',
  diamond: 'M10 2.5L17 10l-7 7.5L3 10z',
  note: 'M4 4h12v9H9.5L6 16v-3H4z',
  block: 'M4 4h12v12H4zM4 16L16 4',
  shape: 'M4 4h5M4 4v5M16 16h-5M16 16v-5M4 4l12 12',
  trace: 'M3 5h14v10H3zM3 13l4-4 3 3 2-2 5 5',
} as const
type RailIcon = keyof typeof RAIL_ICONS

function RailButton({ icon, label, active, onClick }: { icon: RailIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? 'rail-button active' : 'rail-button'} onClick={onClick} title={label} aria-label={label} aria-pressed={active}>
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d={RAIL_ICONS[icon]} />
      </svg>
    </button>
  )
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
  selectedDrawing: string | null
  onSelectDrawing: (id: string | null) => void
  onDrawings: (d: Drawing[]) => void
  onTracings: (t: Tracing[]) => void
  selectedDetail: string | null
  onSelectDetail: (id: string | null) => void
  onChangeDetail: (d: Detail) => void
  /** Medidas del cuerpo para las cotas y de dónde salen (talla o cliente). */
  body: Body
  bodyLabel: string
  /** Pieza que se va a dividir con una línea (bloque de color), o null. */
  blockPiece?: string | null
  onAddBlock?: (b: ColorBlock) => void
  onCancelBlock?: () => void
  /** Activa la herramienta de dividir la pieza seleccionada; devuelve false si no hay una pieza de tela elegida. */
  onBlockTool?: () => boolean
  /** Medidas propias del diseño (al estirar la forma con los puntos). */
  onMeasures?: (m: Record<string, number>) => void
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
  const { selectedDrawing, onSelectDrawing, onDrawings, onTracings, selectedDetail, onSelectDetail, onChangeDetail, blockPiece, onAddBlock, onCancelBlock, onBlockTool, onMeasures } = props
  const cancelBlock = useRef(onCancelBlock)
  cancelBlock.current = onCancelBlock
  const [adding, setAdding] = useState(false)
  const [tool, setTool] = useState<DrawTool | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [calco, setCalco] = useState(false)
  // «Estirar forma»: puntos para cambiar escote, largo, mangas… arrastrándolos
  const [shaping, setShaping] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Los avisos se van solos al rato
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(t)
  }, [notice])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const allCallouts = data.callouts ?? []
  const callouts = allCallouts.filter((c) => !c.hidden)
  const drawings = data.drawings ?? []
  const tracings = data.tracings ?? []
  const current = view === 'all' ? null : view
  const tracing = tracings.find((t) => t.view === current)
  const selectedDraw = drawings.find((d) => d.id === selectedDrawing)
  const centered = (data.prints ?? []).find((p) => p.id === selectedPrint && Math.abs(p.x - CX) < 0.01)

  // Esc deja de dibujar (o de ajustar el calco)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setTool(null)
      setAdding(false)
      setAdjusting(false)
      setCalco(false)
      setShaping(false)
      setNotice(null)
      cancelBlock.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // El pincel se aplica al trazo seleccionado
  const setBrush = (patch: Partial<Brush>) => {
    onSettings({ ...settings, brush: { ...settings.brush, ...patch } })
    if (selectedDraw) onDrawings(drawings.map((d) => (d.id === selectedDraw.id ? { ...d, ...patch } : d)))
  }

  const uploadTracing = async (file: File | undefined) => {
    if (!file || !current) return
    setUploading(true)
    setUploadError(null)
    try {
      const { width, height } = await imageSize(file)
      const { key } = await api.uploadImage(file)
      const t: Tracing = { id: crypto.randomUUID(), view: current, file: key, aspect: height / width, x: CX, y: 230, w: 300, opacity: 0.5 }
      onTracings([...tracings.filter((x) => x.view !== current), t])
      setAdjusting(true)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }
  const setTracing = (patch: Partial<Tracing>) => tracing && onTracings(tracings.map((t) => (t.id === tracing.id ? { ...t, ...patch } : t)))

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

  // Medidas de las cotas: las propias del diseño y, el resto, las que tocan (ajustadas a las propias)
  const measures = { ...Object.fromEntries(defaultMeasures(template, data, body)), ...data.measures }
  const views = view === 'all' ? VIEWS.map((v) => v.id) : [view]
  const annotated = settings.dims || settings.notes
  const overlay = (v: View) => (ctx: FlatContext) => (
    <>
      {tracings
        .filter((t) => t.view === v)
        .map((t) => (
          <TracingLayer key={t.id} tracing={t} adjusting={adjusting && v === current} onChange={(next) => onTracings(tracings.map((x) => (x.id === t.id ? next : x)))} />
        ))}
      {settings.grid && <CmGrid ctx={ctx} upc={unitsOf(template)} />}
      {centered && centered.view === v && (
        <line x1={CX} x2={CX} y1={ctx.box.y} y2={ctx.box.y + ctx.box.h} stroke="#db2777" strokeWidth={0.6} strokeDasharray="3 2" pointerEvents="none" />
      )}
      <DrawingsLayer
        ctx={ctx}
        drawings={drawings}
        view={v}
        selected={selectedDrawing}
        onSelect={onSelectDrawing}
        tool={blockPiece ? 'line' : v === current || view === 'all' ? tool : null}
        brush={blockPiece ? { color: '#db2777', width: 0.8, dash: true } : settings.brush}
        snap={settings.grid ? unitsOf(template) : null}
        onUpdate={(d) => onDrawings(drawings.map((x) => (x.id === d.id ? d : x)))}
        onAdd={(d) => {
          if (!blockPiece) return onDrawings([...drawings, d])
          // La línea divide la pieza: toma el otro color la parte donde no está el centro de la pieza (la más pequeña)
          const [x1, y1, x2, y2] = d.points
          const c = ctx.pieces[blockPiece]
          const cross = c ? (x2 - x1) * (c.y + c.h / 2 - y1) - (y2 - y1) * (c.x + c.w / 2 - x1) : -1
          onAddBlock?.({ id: crypto.randomUUID(), view: v, piece: blockPiece, x1, y1, x2, y2, side: cross > 0 ? -1 : 1, color: '#1f2937' })
        }}
      />
      {settings.dims && v === 'front' && <Dimensions ctx={ctx} template={template} options={data.options} body={body} measures={measures} />}
      {settings.notes && (
        <Callouts
          ctx={ctx}
          callouts={callouts}
          view={v}
          selected={selectedCallout}
          onSelect={onSelectCallout}
          onChange={(c) => onCallouts(allCallouts.map((x) => (x.id === c.id ? c : x)))}
          adding={adding}
          onAdd={(p) => {
            const c = newCallout(v, p)
            onCallouts([...allCallouts, c])
            onSelectCallout(c.id)
            setAdding(false)
          }}
        />
      )}
      <ScaleBar ctx={ctx} upc={unitsOf(template)} />
      {shaping && onMeasures && <ShapeHandles template={template} data={data} view={v} body={body} onMeasures={onMeasures} />}
    </>
  )
  const poms = settings.dims ? garmentPoms(template, data.options) : []
  // Qué hacer con la herramienta en uso (en la barra de abajo, sin tapar el dibujo)
  const toolHint = shaping
    ? 'Arrastra los puntos azules para estirar la prenda · las medidas se apuntan en la ficha · Esc termina'
    : adding
      ? 'Haz clic en el dibujo donde quieras la nota · Esc cancela'
      : blockPiece
        ? 'Arrastra una línea de lado a lado de la pieza para dividirla · Esc cancela'
        : notice

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
          <button className={settings.notes ? 'tool active' : 'tool'} onClick={() => toggle('notes')} aria-pressed={settings.notes} title="Ver u ocultar las notas">
            Notas
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
      <div className="canvas-body">
        <div className="tool-rail" role="toolbar" aria-orientation="vertical" aria-label="Herramientas">
          {TOOLS.map((t) => (
            <RailButton
              key={t.label}
              icon={t.icon}
              label={t.title}
              active={tool === t.id && !adding && !blockPiece && !(t.id === null && (calco || shaping))}
              onClick={() => {
                setTool(t.id)
                setAdding(false)
                setAdjusting(false)
                setCalco(false)
                setShaping(false)
              setShaping(false)
                setNotice(null)
                onCancelBlock?.()
                if (t.id) onSelectDrawing(null)
              }}
            />
          ))}
          <span className="rail-sep" />
          <RailButton
            icon="note"
            label="Nota: haz clic en el dibujo donde quieras señalar algo"
            active={adding}
            onClick={() => {
              if (!settings.notes) onSettings({ ...settings, notes: true })
              setTool(null)
              setCalco(false)
              setShaping(false)
              setNotice(null)
              setAdding((a) => !a)
            }}
          />
          <RailButton
            icon="shape"
            label="Estirar forma: arrastra los puntos azules para cambiar el escote, el largo, las mangas…"
            active={shaping}
            onClick={() => {
              setTool(null)
              setAdding(false)
              setCalco(false)
              setNotice(null)
              onCancelBlock?.()
              setShaping((v) => !v)
            }}
          />
          <RailButton
            icon="block"
            label="Dividir color: parte la pieza seleccionada con una línea"
            active={!!blockPiece}
            onClick={() => {
              setTool(null)
              setAdding(false)
              setCalco(false)
              setShaping(false)
              if (blockPiece) return onCancelBlock?.()
              if (!onBlockTool?.()) setNotice('Elige primero una pieza de tela (un clic en el dibujo) y luego esta herramienta.')
            }}
          />
          <RailButton
            icon="trace"
            label="Calco: sube la foto de un boceto a mano para dibujar encima"
            active={calco}
            onClick={() => {
              setTool(null)
              setAdding(false)
              setNotice(null)
              setShaping(false)
              setCalco((c) => !c)
            }}
          />
        </div>
        <div className="canvas-area">
          {(tool || selectedDraw) && (
            <div className="canvas-context">
              <span className="muted small">{selectedDraw && !tool ? 'Trazo seleccionado' : 'Pincel'}</span>
              <label className="brush-color" title="Color del trazo">
                <input type="color" value={selectedDraw?.color ?? settings.brush.color} onChange={(e) => setBrush({ color: e.target.value })} />
                <span style={{ background: selectedDraw?.color ?? settings.brush.color }} />
              </label>
              <select value={selectedDraw?.width ?? settings.brush.width} onChange={(e) => setBrush({ width: Number(e.target.value) })} aria-label="Grosor del trazo">
                {WIDTHS.map((w) => (
                  <option key={w.v} value={w.v}>
                    {w.label}
                  </option>
                ))}
              </select>
              <label className="toggle small-toggle" title="Trazo discontinuo, como un pespunte">
                <input type="checkbox" checked={selectedDraw?.dash ?? settings.brush.dash} onChange={(e) => setBrush({ dash: e.target.checked })} />
                Pespunte
              </label>
              <label className="toggle small-toggle" title="Dibuja canales de acolchado (puffer, chaleco): pespunte con el relleno abultado a los lados">
                <input type="checkbox" checked={(selectedDraw ? selectedDraw.quilt : settings.brush.quilt) ?? false} onChange={(e) => setBrush({ quilt: e.target.checked })} />
                Canal de acolchado
              </label>
              <label className="toggle small-toggle" title="Relleno de las formas (rectángulo, elipse, triángulo, estrella, corazón, rombo; con el lápiz, la forma se cierra: tu propio bolsillo o parche)">
                <input
                  type="checkbox"
                  checked={!!(selectedDraw ? selectedDraw.fill : settings.brush.fill)}
                  onChange={(e) => setBrush({ fill: e.target.checked ? (selectedDraw?.color ?? settings.brush.color) : undefined })}
                />
                Relleno
              </label>
              {(selectedDraw ? selectedDraw.fill : settings.brush.fill) && (
                <label className="brush-color" title="Color del relleno">
                  <input type="color" value={(selectedDraw ? selectedDraw.fill : settings.brush.fill) ?? '#000000'} onChange={(e) => setBrush({ fill: e.target.value })} />
                  <span style={{ background: (selectedDraw ? selectedDraw.fill : settings.brush.fill) ?? '#000' }} />
                </label>
              )}
              {(selectedDraw ? selectedDraw.kind === 'free' : tool === 'free') && (
                <label className="toggle small-toggle" title="Cuánto se suaviza el trazo a mano: a la izquierda, tal cual; a la derecha, muy suave. Se puede cambiar después">
                  Suavizado
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={(selectedDraw ? selectedDraw.smooth : typeof settings.brush.smooth === 'number' ? settings.brush.smooth : 1) ?? 0}
                    onChange={(e) => setBrush({ smooth: Number(e.target.value) || 0 })}
                  />
                </label>
              )}
              {selectedDraw && !selectedDraw.locked && !tool && <span className="muted small">Arrastra los puntos para cambiar la forma (el del centro de una línea la curva)</span>}
              {(selectedDraw ? ['rect', 'triangle', 'diamond', 'star'].includes(selectedDraw.kind) : tool && ['rect', 'triangle', 'diamond', 'star'].includes(tool)) && (
                <label className="toggle small-toggle" title="Redondea las esquinas de la forma">
                  Esquinas
                  <input type="range" min={0} max={1} step={0.05} value={(selectedDraw ? selectedDraw.round : settings.brush.round) ?? 0} onChange={(e) => setBrush({ round: Number(e.target.value) || undefined })} />
                </label>
              )}
              <label className="toggle small-toggle" title="Simétrico: lo que dibujes se repite reflejado al otro lado del centro de la prenda">
                <input type="checkbox" checked={(selectedDraw ? selectedDraw.mirror : settings.brush.mirror) ?? false} onChange={(e) => setBrush({ mirror: e.target.checked })} />
                Simétrico
              </label>
              {selectedDraw && (
                <button className="tool" onClick={() => onDrawings(drawings.filter((d) => d.id !== selectedDraw.id))} title="Borrar el trazo (Supr)">
                  Borrar trazo
                </button>
              )}
            </div>
          )}
          {calco && (
            <div className="canvas-context">
              <span className="muted small">Calco</span>
              {!current ? (
                <span className="muted small">Elige una sola vista (delantero, espalda o lateral)</span>
              ) : !tracing ? (
                <button className="tool" onClick={() => fileInput.current?.click()} disabled={uploading} title="Sube la foto de un dibujo a mano para calcarlo">
                  {uploading ? 'Subiendo…' : 'Subir boceto'}
                </button>
              ) : (
                <>
                  <button className={adjusting ? 'tool active' : 'tool'} onClick={() => setAdjusting((a) => !a)} disabled={tracing.locked} title="Mover y escalar el boceto">
                    {adjusting ? 'Listo' : 'Mover y escalar'}
                  </button>
                  <label className="small-toggle small">
                    Transparencia
                    <input type="range" min={0.1} max={1} step={0.05} value={tracing.opacity} onChange={(e) => setTracing({ opacity: Number(e.target.value) })} />
                  </label>
                  <button className="tool" onClick={() => onTracings(tracings.filter((t) => t.id !== tracing.id))} title="Quitar el boceto">
                    Quitar
                  </button>
                </>
              )}
              {uploadError && <span className="status error small">{uploadError}</span>}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => uploadTracing(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
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
                body={body}
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
                    onSelectDrawing(null)
                  }
                }}
                onChangePrint={onChangePrint}
                selectedDetail={selectedDetail}
                onSelectDetail={onSelectDetail}
                onChangeDetail={onChangeDetail}
                overlay={overlay(v)}
                lockFrame={shaping}
              />
              {view === 'all' && <figcaption>{VIEWS.find((x) => x.id === v)?.label}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
        </div>
      </div>
      <p className={toolHint ? 'canvas-hint active' : 'canvas-hint'} role="status">
        {toolHint ? (
          toolHint
        ) : settings.dims && poms.length > 0 ? (
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
