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
import type { Callout, DesignData, DesignInput, PieceStyle, Print } from '../../shared/designs'
import { Canvas, type CanvasSettings, type CanvasView } from './Canvas'
import { ColorwaysBar, ColorwaysCompare } from './Colorways'
import { Design3D } from './Design3D'
import { MeasuresPanel } from './MeasuresPanel'
import { PieceInspector } from './PieceInspector'
import { PrintsPanel } from './PrintsPanel'
import { useHistory } from './useHistory'
import './designer.css'
import './studio-editor.css'

type ViewMode = '2d' | '3d' | 'ambas'
const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: '2d', label: 'Diseño 2D', title: 'Dibujo técnico' },
  { id: '3d', label: 'Ver en 3D', title: 'El diseño sobre el maniquí en 3D' },
  { id: 'ambas', label: '2D + 3D', title: 'Las dos vistas a la vez' },
]

type Tab = 'pieza' | 'prenda' | 'estampados' | 'notas' | 'datos'
const TABS: { id: Tab; label: string }[] = [
  { id: 'pieza', label: 'Pieza' },
  { id: 'prenda', label: 'Prenda' },
  { id: 'estampados', label: 'Estampados' },
  { id: 'notas', label: 'Notas' },
  { id: 'datos', label: 'Datos' },
]

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
  const [tab, setTab] = useState<Tab>('pieza')
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [selectedPrint, setSelectedPrint] = useState<string | null>(null)
  const [selectedCallout, setSelectedCallout] = useState<string | null>(null)
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
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
        } else if (selectedDrawing) {
          history.set({ ...design, data: { ...design.data, drawings: (design.data.drawings ?? []).filter((d) => d.id !== selectedDrawing) } })
          setSelectedDrawing(null)
        }
      } else if (e.key === 'Escape') {
        setSelectedPiece(null)
        setSelectedPrint(null)
        setSelectedCallout(null)
        setSelectedDrawing(null)
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
  const patchLayer = <K extends 'prints' | 'drawings' | 'callouts' | 'tracings'>(key: K, id: string, patch: Record<string, unknown>) =>
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
          <span className={dirty ? 'save-state dirty' : 'save-state'}>{saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
          <button className="button primary" onClick={save} disabled={!dirty || saving} title="Guardar (Ctrl+S)">
            Guardar
          </button>
        </div>
      </header>
      {error && <p className="status error editor-error">{error}</p>}

      <aside className="editor-layers" aria-label="Capas">
        <h2>Piezas</h2>
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

        <h2>Estampados</h2>
        {prints.length === 0 ? (
          <p className="muted small">Ninguno. Añádelos en la pestaña Estampados.</p>
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

        <h2>Notas</h2>
        {callouts.length === 0 ? (
          <p className="muted small">Usa «+ Nota» en el dibujo para señalar detalles.</p>
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

        <h2>Dibujos</h2>
        {drawings.length === 0 ? (
          <p className="muted small">Usa el lápiz, la línea o las formas de la barra del dibujo.</p>
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

        {tracings.length > 0 && (
          <>
            <h2>Calco</h2>
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
          </>
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
                body={body}
                bodyLabel={bodyLabel}
              />
            ))}
          {mode !== '2d' && <Design3D template={template} data={design.data} materials={materials} client={client} />}
        </div>
      </div>

      <aside className="editor-panel">
        <nav className="inspector-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'pieza' &&
          (piece ? (
            <PieceInspector
              template={template.id}
              piece={piece}
              style={pieceStyle(template, design.data, piece.id)}
              used={usedColors}
              materials={library.data ?? []}
              onChange={(patch) => setPiece(piece.id, patch)}
              onApplyToAll={() => {
                const src = pieceStyle(template, design.data, piece.id)
                const pieces = { ...design.data.pieces }
                for (const p of template.pieces) if (p.materials.includes('tejido')) pieces[p.id] = { ...src }
                setData({ pieces })
              }}
            />
          ) : (
            <section>
              <p className="muted small">Haz clic en una pieza del dibujo (o en la lista de la izquierda) para cambiar su color y su material.</p>
              <div className="piece-picker">
                {activePieces.map((p) => (
                  <button key={p.id} className="chip" onClick={() => pickPiece(p.id)}>
                    <span className="chip-dot" style={{ background: pieceStyle(template, design.data, p.id).color }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>
          ))}

        {tab === 'prenda' && (
          <MeasuresPanel template={template} data={design.data} body={body} bodyLabel={bodyLabel} onChange={(measures) => setData({ measures })} />
        )}
        {tab === 'prenda' &&
          OPTION_GROUPS.map((g) => {
            const options = template.options.filter((o) => o.group === g.id)
            if (!options.length) return null
            return (
              <section key={g.id}>
                <h2>{g.label}</h2>
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
              </section>
            )
          })}

        {tab === 'estampados' && (
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

        {tab === 'notas' && (
          <section>
            <h2>Notas del dibujo</h2>
            <p className="muted small">
              Pulsa «+ Nota» en la barra del dibujo y haz clic donde quieras señalar algo (una costura, un detalle, un acabado). Arrastra el punto o el texto para
              colocarlos. Salen también en la ficha técnica.
            </p>
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

        {tab === 'datos' && (
          <section>
            <h2>Datos del diseño</h2>
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
            <button className="button danger spaced-top" onClick={remove}>
              Eliminar diseño
            </button>
          </section>
        )}
      </aside>
    </div>
  )
}

const VIEW_LABEL = { front: 'Delantero', back: 'Espalda', side: 'Lateral' } as const
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
