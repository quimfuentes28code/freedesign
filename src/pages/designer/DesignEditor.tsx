import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { colorLabel } from '../../designer/colors'
import { switchColorway } from '../../designer/colorways'
import { CX } from '../../designer/geometry'
import { resolveMaterial } from '../../designer/materials'
import { UNITS_PER_CM } from '../../designer/prints'
import { fileUrl } from '../../shared/library'
import { getTemplate } from '../../designer/templates'
import { OPTION_GROUPS, opt, type GarmentTemplate } from '../../designer/types'
import { clientBody, standardBody } from '../../production/measurements'
import { DETAIL_KINDS, type Callout, type DesignData, type DesignInput, type Detail, type PieceStyle, type Print } from '../../shared/designs'
import { detailAspect, detailPrims, PrimsView } from '../../designer/details'
import { DetailsPanel } from './DetailsPanel'
import { Canvas, type CanvasSettings, type CanvasView } from './Canvas'
import { ColorwaysBar, ColorwaysCompare } from './Colorways'
import { Design3D } from './Design3D'
import { MeasuresPanel } from './MeasuresPanel'
import { PieceInspector } from './PieceInspector'
import { ExportMenu } from './ExportMenu'
import { PrintsPanel } from './PrintsPanel'
import { Fold } from './Fold'
import { useHistory } from './useHistory'
import './designer.css'
import './studio-editor.css'

type ViewMode = '2d' | '3d' | 'ambas'
const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: '2d', label: 'Diseño 2D', title: 'Dibujo técnico' },
  { id: '3d', label: 'Ver en 3D', title: 'El diseño sobre el maniquí en 3D' },
  { id: 'ambas', label: '2D + 3D', title: 'Las dos vistas a la vez' },
]

/** Lo que enseña el inspector: lo seleccionado o, si no hay nada, la prenda. */
type Tab = 'pieza' | 'prenda' | 'estampados' | 'detalles' | 'notas'
const PANEL_KIND: Record<Tab, string> = { pieza: 'Pieza', prenda: 'Prenda', estampados: 'Capas', detalles: 'Capas', notas: 'Capas' }
const PANEL_TITLE: Record<Tab, string> = { pieza: 'Pieza', prenda: 'Prenda', estampados: 'Estampados', detalles: 'Detalles y fornituras', notas: 'Notas' }

const DEFAULT_SETTINGS: CanvasSettings = { mode: 'color', dims: false, grid: false, notes: true, brush: { color: '#1d1c1a', width: 1.2, dash: false } }

/** Lee y guarda una preferencia del editor en este navegador (si se puede). */
function stored<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...def, ...JSON.parse(v) } : def
  } catch {
    return def
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // Sin almacenamiento (modo privado): se recuerda solo mientras la página está abierta
  }
}

/**
 * Editor de un diseño, como un estudio: a la izquierda las capas (piezas, estampados, notas), en el centro el lienzo
 * (2D, 3D o los dos) con sus variantes de color, y a la derecha las propiedades de lo seleccionado.
 * Lo que se diseña en 2D se ve al momento sobre el maniquí 3D.
 */
export function DesignEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clients = useApi(() => api.listClients(), [])
  const projects = useApi(() => api.listProjects(), [])
  const library = useApi(() => api.listMaterials(), [])
  const artworks = useApi(() => api.listArtworks(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])

  const history = useHistory<DesignInput | null>(null)
  const design = history.state
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [view, setView] = useState<CanvasView>('front')
  const [tab, setTab] = useState<Tab>('prenda')
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [selectedPrint, setSelectedPrint] = useState<string | null>(null)
  const [selectedCallout, setSelectedCallout] = useState<string | null>(null)
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  // Herramienta para dividir la pieza seleccionada con una línea (bloque de color)
  const [blockTool, setBlockTool] = useState(false)
  const [mode, setMode] = useState<ViewMode>(() => stored<{ v: ViewMode }>('fd:editor-mode-v2', { v: '2d' }).v)
  const [settings, setSettings] = useState<CanvasSettings>(() => stored('fd:canvas', DEFAULT_SETTINGS))
  const changeMode = (m: ViewMode) => {
    setMode(m)
    store('fd:editor-mode-v2', { v: m })
  }
  const changeSettings = (s: CanvasSettings) => {
    setSettings(s)
    store('fd:canvas', s)
  }

  useEffect(() => {
    if (!id) return
    api
      .getDesign(id)
      .then((d) => {
        const input: DesignInput = { name: d.name, template: d.template, clientId: d.clientId, projectId: d.projectId, data: d.data }
        history.reset(input)
        setSaved(JSON.stringify(input))
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const dirty = design !== null && JSON.stringify(design) !== saved
  const save = async () => {
    if (!id || !design) return
    setSaving(true)
    setError(null)
    try {
      await api.updateDesign(id, design)
      setSaved(JSON.stringify(design))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Atajos: Ctrl+S guarda, Ctrl+Z deshace, Ctrl+Mayús+Z o Ctrl+Y rehace, Supr borra lo seleccionado, Esc deselecciona
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') {
        e.preventDefault()
        save()
        return
      }
      if (typing) return
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        history.redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && design) {
        if (selectedPrint) {
          history.set({ ...design, data: { ...design.data, prints: (design.data.prints ?? []).filter((p) => p.id !== selectedPrint) } })
          setSelectedPrint(null)
        } else if (selectedCallout) {
          history.set({ ...design, data: { ...design.data, callouts: (design.data.callouts ?? []).filter((c) => c.id !== selectedCallout) } })
          setSelectedCallout(null)
        } else if (selectedDetail) {
          history.set({ ...design, data: { ...design.data, details: (design.data.details ?? []).filter((d) => d.id !== selectedDetail) } })
          setSelectedDetail(null)
        } else if (selectedDrawing) {
          history.set({ ...design, data: { ...design.data, drawings: (design.data.drawings ?? []).filter((d) => d.id !== selectedDrawing) } })
          setSelectedDrawing(null)
        }
      } else if (e.key === 'Escape') {
        setSelectedPiece(null)
        setSelectedPrint(null)
        setSelectedCallout(null)
        setSelectedDrawing(null)
        setSelectedDetail(null)
        setTab('prenda')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Al seleccionar una nota, su texto queda listo para escribir (después del clic en el dibujo)
  useEffect(() => {
    if (tab !== 'notas' || !selectedCallout) return
    const t = setTimeout(() => document.getElementById(`note-${selectedCallout}`)?.focus(), 120)
    return () => clearTimeout(t)
  }, [tab, selectedCallout])

  // Aviso al salir con cambios sin guardar
  useEffect(() => {
    if (!dirty) return
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  if (error && !design) return <div className="page"><Status error={error} /></div>
  if (!design) return <div className="page"><Status loading /></div>
  const template = getTemplate(design.template)
  if (!template) return <div className="page"><Status error={`Prenda base desconocida: ${design.template}`} /></div>

  const setDesign = history.set
  const setData = (patch: Partial<DesignData>) => setDesign({ ...design, data: { ...design.data, ...patch } })
  const setPiece = (piece: string, patch: Partial<PieceStyle>) =>
    setData({ pieces: { ...design.data.pieces, [piece]: { ...pieceStyle(template, design.data, piece), ...patch } } })
  const setOption = (key: string, value: string | boolean) => setData({ options: { ...design.data.options, [key]: value } })
  const prints = design.data.prints ?? []
  const setPrints = (next: Print[]) => setData({ prints: next })
  // Al mover un estampado se ajusta al centro de la prenda (si queda a menos de 1,5 cm) y, con la cuadrícula, a cada cm
  const changePrint = (p: Print) => {
    const snapped = { ...p }
    if (settings.grid) {
      snapped.x = CX + Math.round((p.x - CX) / UNITS_PER_CM) * UNITS_PER_CM
      snapped.y = Math.round(p.y / UNITS_PER_CM) * UNITS_PER_CM
    }
    if (Math.abs(snapped.x - CX) < 1.5 * UNITS_PER_CM) snapped.x = CX
    setPrints(prints.map((x) => (x.id === p.id ? snapped : x)))
  }
  const drawings = design.data.drawings ?? []
  const tracings = design.data.tracings ?? []
  /** Cambia una capa (estampado, trazo, nota o calco) por su id: ocultar, bloquear… */
  const patchLayer = <K extends 'prints' | 'drawings' | 'callouts' | 'tracings' | 'details'>(key: K, id: string, patch: Record<string, unknown>) =>
    setData({ [key]: ((design.data[key] ?? []) as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } as Partial<DesignData>)
  const callouts = design.data.callouts ?? []
  const setCallouts = (next: Callout[]) => setData({ callouts: next })

  const remove = async () => {
    if (!id || !confirm(`¿Eliminar el diseño «${design.name}»? No se puede deshacer.`)) return
    await api.deleteDesign(id)
    navigate('/disenador')
  }

  const pickPiece = (p: string | null) => {
    setSelectedPiece(p)
    setBlockTool(false)
    if (p) {
      setSelectedPrint(null)
      setTab('pieza')
    }
  }
  const pickPrint = (p: string | null) => {
    setSelectedPrint(p)
    if (p) {
      setSelectedPiece(null)
      setTab('estampados')
    }
  }
  const pickDetail = (d: string | null) => {
    setSelectedDetail(d)
    if (d) {
      setSelectedPiece(null)
      setSelectedPrint(null)
      setTab('detalles')
    }
  }
  const details = design.data.details ?? []
  const setDetails = (next: Detail[]) => setData({ details: next })
  const pickCallout = (c: string | null) => {
    setSelectedCallout(c)
    if (c) {
      setSelectedPiece(null)
      setTab('notas')
    }
  }

  const active = template.activePieces(design.data.options)
  const activePieces = template.pieces.filter((p) => active.includes(p.id))
  const piece = activePieces.find((p) => p.id === selectedPiece)
  // Sin pieza elegida, el inspector enseña la prenda
  const panel: Tab = tab === 'pieza' && !piece ? 'prenda' : tab
  /** Abre el panel de añadir estampados o detalles, sin nada seleccionado. */
  const openPanel = (t: 'estampados' | 'detalles') => {
    setSelectedPiece(null)
    setSelectedPrint(null)
    setSelectedDetail(null)
    setSelectedCallout(null)
    setTab(t)
  }
  const backToGarment = () => {
    setSelectedPiece(null)
    setSelectedPrint(null)
    setSelectedDetail(null)
    setSelectedCallout(null)
    setSelectedDrawing(null)
    setBlockTool(false)
    setTab('prenda')
  }
  const usedColors = [...new Set(activePieces.map((p) => pieceStyle(template, design.data, p.id).color))]
  const client = clients.data?.find((c) => c.id === design.clientId)
  const fromClient = client && Object.keys(client.measurements).length ? clientBody(client.measurements) : null
  const body = fromClient?.body ?? standardBody('M')
  const bodyLabel = fromClient ? `a medida de ${client!.name}` : 'talla M'

  return (
    <div className="editor studio-editor">
      <header className="editor-header">
        <Link to="/disenador" className="button">
          ← Diseños
        </Link>
        <input className="editor-name" value={design.name} onChange={(e) => setDesign({ ...design, name: e.target.value })} aria-label="Nombre del diseño" />
        <span className="tag muted">{template.name}</span>
        <div className="history-buttons">
          <button className="tool" onClick={history.undo} disabled={!history.canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            ↶
          </button>
          <button className="tool" onClick={history.redo} disabled={!history.canRedo} title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer">
            ↷
          </button>
        </div>
        <div className="segmented view-mode" role="group" aria-label="Vista">
          {VIEW_MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => changeMode(m.id)} title={m.title}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <ExportMenu
            template={template}
            data={design.data}
            materials={materials}
            body={body}
            bodyLabel={bodyLabel}
            name={design.name}
            view={view === 'all' ? null : view}
            mode={settings.mode}
            dims={settings.dims}
            notes={settings.notes}
          />
          <span className={dirty ? 'save-state dirty' : 'save-state'}>{saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
          <button className="button primary" onClick={save} disabled={!dirty || saving} title="Guardar (Ctrl+S)">
            Guardar
          </button>
        </div>
      </header>
      {error && <p className="status error editor-error">{error}</p>}

      <aside className="editor-layers" aria-label="Capas">
        <Fold title="Piezas" open extra={<span className="fold-count">{activePieces.length}</span>}>
          <ul className="layer-list">
            {activePieces.map((p) => {
              const s = pieceStyle(template, design.data, p.id)
              const r = resolveMaterial(template.id, p.id, s.materialId, materials)
              return (
                <li key={p.id}>
                  <button
                    className={selectedPiece === p.id ? 'layer active' : 'layer'}
                    onClick={() => pickPiece(p.id)}
                    onMouseEnter={() => setHighlight(p.id)}
                    onMouseLeave={() => setHighlight(null)}
                  >
                    <span className="layer-swatch" style={{ background: s.color }} />
                    <span className="layer-text">
                      <span>{p.label}</span>
                      <span className="muted">{colorLabel(s).name || s.color.toUpperCase()} · {r.library?.name ?? r.catalog.name}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Fold>

        <Fold title="Estampados" open={prints.length > 0} extra={<AddButton label="Añadir estampado" onClick={() => openPanel('estampados')} />}>
          {prints.length === 0 ? (
            <p className="muted small">Logos y textos sobre la prenda.</p>
          ) : (
            <ul className="layer-list">
              {[...prints].reverse().map((p) => (
                <li key={p.id} className={p.hidden ? 'layer-row hidden' : 'layer-row'}>
                  <button
                    className={selectedPrint === p.id ? 'layer active' : 'layer'}
                    onClick={() => {
                      pickPrint(p.id)
                      if (view !== 'all' && view !== p.view) setView(p.view)
                    }}
                  >
                    <span className="layer-swatch thumb">
                      {p.kind === 'artwork' ? <img src={fileUrl(p.file)} alt="" /> : <b style={{ color: p.color }}>T</b>}
                    </span>
                    <span className="layer-text">
                      <span>{p.kind === 'text' ? `«${p.text}»` : (artworks.data?.find((a) => a.id === p.artworkId)?.name ?? 'Gráfico')}</span>
                      <span className="muted">{VIEW_LABEL[p.view]}</span>
                    </span>
                  </button>
                  <LayerToggles hidden={p.hidden} locked={p.locked} onChange={(patch) => patchLayer('prints', p.id, patch)} />
                </li>
              ))}
            </ul>
          )}
        </Fold>

        <Fold title="Detalles" open={details.length > 0} extra={<AddButton label="Añadir detalle" onClick={() => openPanel('detalles')} />}>
          {details.length === 0 ? (
            <p className="muted small">Botones, cremalleras, etiquetas, parches…</p>
          ) : (
            <ul className="layer-list">
              {[...details].reverse().map((d) => (
                <li key={d.id} className={d.hidden ? 'layer-row hidden' : 'layer-row'}>
                  <button
                    className={selectedDetail === d.id ? 'layer active' : 'layer'}
                    onClick={() => {
                      pickDetail(d.id)
                      if (view !== 'all' && view !== d.view) setView(d.view)
                    }}
                  >
                    <span className="layer-swatch">
                      <DetailIcon d={d} />
                    </span>
                    <span className="layer-text">
                      <span>
                        {DETAIL_KINDS.find((k) => k.id === d.kind)?.label}
                        {d.text ? ` «${d.text}»` : ''}
                      </span>
                      <span className="muted">{VIEW_LABEL[d.view]}</span>
                    </span>
                  </button>
                  <LayerToggles hidden={d.hidden} locked={d.locked} onChange={(patch) => patchLayer('details', d.id, patch)} />
                </li>
              ))}
            </ul>
          )}
        </Fold>

        <Fold title="Notas" open={callouts.length > 0} extra={callouts.length > 0 ? <span className="fold-count">{callouts.length}</span> : undefined}>
          {callouts.length === 0 ? (
            <p className="muted small">Con la herramienta Nota (a la izquierda del dibujo) señalas costuras, acabados…</p>
          ) : (
            <ul className="layer-list">
              {callouts.map((c, i) => (
                <li key={c.id} className={c.hidden ? 'layer-row hidden' : 'layer-row'}>
                  <button
                    className={selectedCallout === c.id ? 'layer active' : 'layer'}
                    onClick={() => {
                      pickCallout(c.id)
                      if (view !== 'all' && view !== c.view) setView(c.view)
                    }}
                  >
                    <span className="layer-swatch note">{i + 1}</span>
                    <span className="layer-text">
                      <span>{c.text || 'Nota sin texto'}</span>
                    </span>
                  </button>
                  <LayerToggles hidden={c.hidden} lockable={false} onChange={(patch) => patchLayer('callouts', c.id, patch)} />
                </li>
              ))}
            </ul>
          )}
        </Fold>

        <Fold title="Trazos" open={drawings.length > 0} extra={drawings.length > 0 ? <span className="fold-count">{drawings.length}</span> : undefined}>
          {drawings.length === 0 ? (
            <p className="muted small">Lo que dibujes con el lápiz, la línea o las formas.</p>
          ) : (
            <ul className="layer-list">
              {[...drawings].reverse().map((d) => (
                <li key={d.id} className={d.hidden ? 'layer-row hidden' : 'layer-row'}>
                  <button
                    className={selectedDrawing === d.id ? 'layer active' : 'layer'}
                    onClick={() => {
                      setSelectedDrawing(d.locked ? null : d.id)
                      if (view !== 'all' && view !== d.view) setView(d.view)
                    }}
                  >
                    <span className="layer-swatch">
                      <svg viewBox="0 0 20 20" width="18" height="18">
                        <path d="M3 15 C 7 3, 12 18, 17 5" fill="none" stroke={d.color} strokeWidth={Math.min(3, d.width + 0.6)} strokeDasharray={d.dash ? '3 2' : undefined} />
                      </svg>
                    </span>
                    <span className="layer-text">
                      <span>{DRAW_LABEL[d.kind]}</span>
                      <span className="muted">{VIEW_LABEL[d.view]}</span>
                    </span>
                  </button>
                  <LayerToggles hidden={d.hidden} locked={d.locked} onChange={(patch) => patchLayer('drawings', d.id, patch)} />
                </li>
              ))}
            </ul>
          )}
        </Fold>

        {tracings.length > 0 && (
          <Fold title="Calco" open>
            <ul className="layer-list">
              {tracings.map((t) => (
                <li key={t.id} className={t.hidden ? 'layer-row hidden' : 'layer-row'}>
                  <button className="layer" onClick={() => view !== 'all' && view !== t.view && setView(t.view)}>
                    <span className="layer-swatch thumb">
                      <img src={fileUrl(t.file)} alt="" />
                    </span>
                    <span className="layer-text">
                      <span>Boceto</span>
                      <span className="muted">{VIEW_LABEL[t.view]}</span>
                    </span>
                  </button>
                  <LayerToggles hidden={t.hidden} locked={t.locked} onChange={(patch) => patchLayer('tracings', t.id, patch)} />
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </aside>

      <div className="editor-main">
        <ColorwaysBar template={template} data={design.data} onChange={(d) => setDesign({ ...design, data: d })} comparing={comparing} onCompare={setComparing} />
        <div className={`editor-views mode-${mode}`}>
          {mode !== '3d' &&
            (comparing ? (
              <ColorwaysCompare
                template={template}
                data={design.data}
                materials={materials}
                onPick={(cid) => {
                  setDesign({ ...design, data: switchColorway(design.data, cid) })
                  setComparing(false)
                }}
              />
            ) : (
              <Canvas
                template={template}
                data={design.data}
                materials={materials}
                highlight={highlight}
                view={view}
                onViewChange={setView}
                settings={settings}
                onSettings={changeSettings}
                selectedPiece={selectedPiece}
                onPickPiece={pickPiece}
                selectedPrint={selectedPrint}
                onSelectPrint={pickPrint}
                onChangePrint={changePrint}
                selectedCallout={selectedCallout}
                onSelectCallout={pickCallout}
                onCallouts={setCallouts}
                selectedDrawing={selectedDrawing}
                onSelectDrawing={(d) => {
                  setSelectedDrawing(d)
                  if (d) {
                    setSelectedPiece(null)
                    setSelectedPrint(null)
                  }
                }}
                onDrawings={(next) => setData({ drawings: next })}
                onTracings={(next) => setData({ tracings: next })}
                selectedDetail={selectedDetail}
                onSelectDetail={pickDetail}
                onChangeDetail={(d) => setDetails(details.map((x) => (x.id === d.id ? d : x)))}
                body={body}
                bodyLabel={bodyLabel}
                blockPiece={blockTool ? selectedPiece : null}
                onAddBlock={(b) => {
                  setData({ blocks: [...(design.data.blocks ?? []), b] })
                  setBlockTool(false)
                }}
                onCancelBlock={() => setBlockTool(false)}
                onBlockTool={() => {
                  if (!piece || !piece.materials.includes('tejido')) return false
                  setBlockTool(true)
                  if (view === 'all') setView('front')
                  return true
                }}
              />
            ))}
          {mode !== '2d' && <Design3D template={template} data={design.data} materials={materials} client={client} />}
        </div>
      </div>

      <aside className="editor-panel">
        <div className="inspector-head">
          {panel !== 'prenda' && (
            <button className="inspector-back" onClick={backToGarment} title="Volver a la prenda (Esc)" aria-label="Volver a la prenda">
              ←
            </button>
          )}
          <div>
            <span className="muted small">{PANEL_KIND[panel]}</span>
            <h2>{panel === 'pieza' && piece ? piece.label : panel === 'prenda' ? template.name : PANEL_TITLE[panel]}</h2>
          </div>
        </div>

        {panel === 'pieza' && piece && (
          <PieceInspector
            template={template.id}
            piece={piece}
            style={pieceStyle(template, design.data, piece.id)}
            used={usedColors}
            materials={library.data ?? []}
            onChange={(patch) => setPiece(piece.id, patch)}
            hardware={design.data.hardware}
            onHardware={(hardware) => setData({ hardware })}
            isZip={template.draw('front', design.data.options).some((s) => s.role === 'zip' && s.piece === piece.id)}
            artworks={artworks.data ?? []}
            blocks={(design.data.blocks ?? []).filter((b) => b.piece === piece.id)}
            onBlocks={(list) => setData({ blocks: [...(design.data.blocks ?? []).filter((b) => b.piece !== piece.id), ...list] })}
            blockTool={blockTool}
            onBlockTool={(on) => {
              setBlockTool(on)
              if (on && view === 'all') setView('front')
            }}
            onApplyToAll={() => {
              const src = pieceStyle(template, design.data, piece.id)
              const pieces = { ...design.data.pieces }
              for (const p of template.pieces) if (p.materials.includes('tejido')) pieces[p.id] = { ...src }
              setData({ pieces })
            }}
          />
        )}

        {panel === 'prenda' && (
          <div className="inspector-prenda">
            <p className="muted small">Haz clic en una pieza del dibujo para cambiar su color, superficie y material.</p>
            {OPTION_GROUPS.map((g, gi) => {
                const options = template.options.filter((o) => o.group === g.id)
                if (!options.length) return null
                return (
                  <Fold key={g.id} title={g.label} open={gi === 0}>
                    {options.map((o) =>
                      o.type === 'toggle' ? (
                        <label key={o.id} className="toggle-row">
                          <span>{o.label}</span>
                          <input type="checkbox" checked={opt<boolean>(template, design.data.options, o.id)} onChange={(e) => setOption(o.id, e.target.checked)} />
                        </label>
                      ) : (
                        <div key={o.id} className="option-row">
                          <span>{o.label}</span>
                          <div className="chips">
                            {o.choices.map((ch) => (
                              <button key={ch.id} className={opt(template, design.data.options, o.id) === ch.id ? 'chip active' : 'chip'} onClick={() => setOption(o.id, ch.id)}>
                                {ch.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                    )}
                  </Fold>
                )
              })}
            <Fold title="Medidas">
              <MeasuresPanel template={template} data={design.data} body={body} bodyLabel={bodyLabel} onChange={(measures) => setData({ measures })} />
            </Fold>
            <Fold title="Datos del diseño">
              <Field label="Cliente">
                <select value={design.clientId ?? ''} onChange={(e) => setDesign({ ...design, clientId: e.target.value || null })}>
                  <option value="">Sin cliente (marca propia)</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Proyecto">
                <select value={design.projectId ?? ''} onChange={(e) => setDesign({ ...design, projectId: e.target.value || null })}>
                  <option value="">Sin proyecto</option>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              {design.projectId && (
                <p className="inline-links">
                  <Link to={`/proyectos/${design.projectId}`} className="link">
                    Ir al proyecto
                  </Link>
                  <Link to={`/produccion/ficha/${design.projectId}`} className="link">
                    Ficha técnica
                  </Link>
                </p>
              )}
              <Field label="Notas">
                <textarea rows={4} value={design.data.notes} onChange={(e) => setData({ notes: e.target.value })} placeholder="Ideas, referencias, cambios pedidos por el cliente…" />
              </Field>
              <label className="toggle-row spaced-top">
                <span>
                  Plantilla de la marca
                  <span className="muted small block">Sale al crear un diseño nuevo, para empezar desde aquí (con sus colores, medidas y estampados).</span>
                </span>
                <input type="checkbox" checked={!!design.data.brandTemplate} onChange={(e) => setData({ brandTemplate: e.target.checked || undefined })} />
              </label>
              <button className="button danger spaced-top" onClick={remove}>
                Eliminar diseño
              </button>
            </Fold>
          </div>
        )}

        {panel === 'estampados' && (
          <PrintsPanel
            template={template}
            prints={prints}
            onChange={setPrints}
            view={view === 'all' ? 'front' : view}
            onViewChange={setView}
            selected={selectedPrint}
            onSelect={pickPrint}
            artworks={artworks.data ?? []}
            onArtworksChange={artworks.reload}
          />
        )}

        {panel === 'detalles' && (
          <DetailsPanel
            details={details}
            onChange={setDetails}
            view={view === 'all' ? 'front' : view}
            selected={selectedDetail}
            onSelect={pickDetail}
            artworks={artworks.data ?? []}
          />
        )}

        {panel === 'notas' && (
          <section>
            <p className="muted small">Arrastra el punto o el texto en el dibujo para colocarlos. Salen también en la ficha técnica.</p>
            {callouts.map((c, i) => (
              <div key={c.id} className={selectedCallout === c.id ? 'note-row active' : 'note-row'} onClick={() => setSelectedCallout(c.id)}>
                <span className="layer-swatch note">{i + 1}</span>
                <input
                  id={`note-${c.id}`}
                  value={c.text}
                  placeholder="Texto de la nota"
                  onChange={(e) => setCallouts(callouts.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                />
                <button className="icon-button" aria-label="Quitar nota" onClick={() => setCallouts(callouts.filter((x) => x.id !== c.id))}>
                  ×
                </button>
              </div>
            ))}
          </section>
        )}
      </aside>
    </div>
  )
}

/** Botón «+» de la cabecera de un grupo de capas. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="fold-add" onClick={onClick} title={label} aria-label={label}>
      +
    </button>
  )
}

const VIEW_LABEL = { front: 'Delantero', back: 'Espalda', side: 'Lateral' } as const

/** Miniatura de un detalle para la lista de capas. */
function DetailIcon({ d }: { d: Detail }) {
  const sample = { ...d, x: 0, y: 0, rotation: 0, ...(d.kind === 'cremallera' ? { length: d.w * 5 } : {}) }
  const s = Math.max(sample.w, sample.w * detailAspect(sample)) * 1.2
  return (
    <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} width="20" height="20" aria-hidden>
      <PrimsView prims={detailPrims(sample)} />
    </svg>
  )
}
const DRAW_LABEL = { free: 'Trazo a mano', line: 'Línea', rect: 'Rectángulo', ellipse: 'Elipse' } as const

/** Botones de una capa: mostrar/ocultar y (si se puede) bloquear/desbloquear. */
function LayerToggles(props: { hidden?: boolean; locked?: boolean; lockable?: boolean; onChange: (p: { hidden?: boolean; locked?: boolean }) => void }) {
  const { hidden, locked, lockable = true, onChange } = props
  return (
    <span className="layer-toggles">
      <button className={hidden ? 'layer-toggle off' : 'layer-toggle'} onClick={() => onChange({ hidden: !hidden })} title={hidden ? 'Mostrar' : 'Ocultar'} aria-label={hidden ? 'Mostrar' : 'Ocultar'}>
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
          <path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10s-3 5.5-8.5 5.5S1.5 10 1.5 10Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.6" fill="currentColor" />
          {hidden && <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.6" />}
        </svg>
      </button>
      {lockable ? (
        <button className={locked ? 'layer-toggle on' : 'layer-toggle'} onClick={() => onChange({ locked: !locked })} title={locked ? 'Desbloquear' : 'Bloquear'} aria-label={locked ? 'Desbloquear' : 'Bloquear'}>
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
            <rect x="4" y="9" width="12" height="8.5" rx="1.5" fill={locked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
            <path d={locked ? 'M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9' : 'M6.5 9V6.5a3.5 3.5 0 0 1 6.8-1.2'} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      ) : null}
    </span>
  )
}

/** Estilo de una pieza, con el color por defecto si el diseño aún no lo tiene. */
function pieceStyle(t: GarmentTemplate, data: DesignData, piece: string): PieceStyle {
  return data.pieces[piece] ?? { color: t.pieces.find((p) => p.id === piece)?.defaultColor ?? '#cccccc', materialId: null }
}
