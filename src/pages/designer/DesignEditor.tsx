import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { getTemplate } from '../../designer/templates'
import { OPTION_GROUPS, opt, type GarmentTemplate, type PieceDef } from '../../designer/types'
import type { DesignData, DesignInput, PieceStyle, Print } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Canvas, type CanvasView } from './Canvas'
import { Design3D } from './Design3D'
import { MaterialPicker } from './MaterialPicker'
import { PrintsPanel } from './PrintsPanel'
import './designer.css'

/** Colores rápidos habituales en streetwear (además del selector libre). */
const PALETTE = [
  '#1d1d1f', '#f2efe8', '#efe3c8', '#9a9a9c', '#c9b89f', '#5b4636', '#4b5a3c', '#2f4a3a',
  '#1f2a44', '#3b5b8c', '#6b1f2a', '#b3261e', '#c4643a', '#e3b341', '#a99bc9', '#e8b4c0',
]

type ViewMode = '2d' | '3d' | 'ambas'
const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: '2d', label: '2D', title: 'Dibujo técnico' },
  { id: '3d', label: '3D', title: 'Maniquí en 3D' },
  { id: 'ambas', label: '2D + 3D', title: 'Las dos vistas a la vez' },
]

/** Editor de un diseño: lienzo (2D, 3D o ambos) y panel con piezas, materiales, opciones y datos. Todo se ve al momento en las dos vistas. */
export function DesignEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clients = useApi(() => api.listClients(), [])
  const projects = useApi(() => api.listProjects(), [])
  const library = useApi(() => api.listMaterials(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])

  const [design, setDesign] = useState<DesignInput | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [view, setView] = useState<CanvasView>('front')
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('fd:editor-mode')
      return saved === '3d' || saved === 'ambas' ? saved : '2d'
    } catch {
      return '2d'
    }
  })
  const changeMode = (m: ViewMode) => {
    setMode(m)
    try {
      localStorage.setItem('fd:editor-mode', m)
    } catch {
      // Sin almacenamiento (modo privado): se recuerda solo mientras la página está abierta
    }
  }
  const [selectedPrint, setSelectedPrint] = useState<string | null>(null)
  const artworks = useApi(() => api.listArtworks(), [])

  useEffect(() => {
    if (!id) return
    api
      .getDesign(id)
      .then((d) => {
        const input: DesignInput = { name: d.name, template: d.template, clientId: d.clientId, projectId: d.projectId, data: d.data }
        setDesign(input)
        setSaved(JSON.stringify(input))
      })
      .catch((e: Error) => setError(e.message))
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

  // Ctrl/Cmd + S guarda; Supr quita el estampado seleccionado (si no se está escribiendo en un campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPrint && design && !typing) {
        setDesign({ ...design, data: { ...design.data, prints: (design.data.prints ?? []).filter((p) => p.id !== selectedPrint) } })
        setSelectedPrint(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  const setData = (patch: Partial<DesignData>) => setDesign({ ...design, data: { ...design.data, ...patch } })
  const setPiece = (piece: string, patch: Partial<PieceStyle>) =>
    setData({ pieces: { ...design.data.pieces, [piece]: { ...pieceStyle(template, design.data, piece), ...patch } } })
  const setOption = (key: string, value: string | boolean) => setData({ options: { ...design.data.options, [key]: value } })
  const prints = design.data.prints ?? []
  const setPrints = (next: Print[]) => setData({ prints: next })
  const changePrint = (p: Print) => setPrints(prints.map((x) => (x.id === p.id ? p : x)))

  const remove = async () => {
    if (!id || !confirm(`¿Eliminar el diseño «${design.name}»? No se puede deshacer.`)) return
    await api.deleteDesign(id)
    navigate('/disenador')
  }

  const active = template.activePieces(design.data.options)
  return (
    <div className="editor">
      <div className="editor-main">
        <header className="editor-header">
          <Link to="/disenador" className="button">
            ← Diseños
          </Link>
          <input
            className="editor-name"
            value={design.name}
            onChange={(e) => setDesign({ ...design, name: e.target.value })}
            aria-label="Nombre del diseño"
          />
          <span className="muted small">{template.name}</span>
          <div className="segmented view-mode" role="group" aria-label="Vista">
            {VIEW_MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => changeMode(m.id)} title={m.title}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="editor-actions">
            <span className={dirty ? 'save-state dirty' : 'save-state'}>{saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
            <button className="button primary" onClick={save} disabled={!dirty || saving}>
              Guardar
            </button>
          </div>
        </header>
        {error && <p className="status error">{error}</p>}
        <div className={`editor-views mode-${mode}`}>
          {mode !== '3d' && (
            <Canvas
              template={template}
              data={design.data}
              materials={materials}
              highlight={highlight}
              view={view}
              onViewChange={setView}
              selectedPrint={selectedPrint}
              onSelectPrint={setSelectedPrint}
              onChangePrint={changePrint}
            />
          )}
          {mode !== '2d' && (
            <Design3D template={template} data={design.data} materials={materials} client={clients.data?.find((c) => c.id === design.clientId)} />
          )}
        </div>
      </div>

      <aside className="editor-panel">
        <section>
          <h2>Piezas</h2>
          <p className="muted small">Color y material de cada parte de la prenda.</p>
          {template.pieces
            .filter((p) => active.includes(p.id))
            .map((p) => (
              <PieceEditor
                key={p.id}
                template={template.id}
                piece={p}
                style={pieceStyle(template, design.data, p.id)}
                materials={library.data ?? []}
                onChange={(patch) => setPiece(p.id, patch)}
                onHover={setHighlight}
              />
            ))}
          <button
            className="link-button"
            onClick={() => {
              const body = pieceStyle(template, design.data, template.pieces[0].id)
              const pieces = { ...design.data.pieces }
              for (const p of template.pieces) if (p.materials.includes('tejido')) pieces[p.id] = { ...body }
              setData({ pieces })
            }}
          >
            Usar el color y tejido del {template.pieces[0].label.toLowerCase()} en todas las piezas de tela
          </button>
        </section>

        <PrintsPanel
          template={template}
          prints={prints}
          onChange={setPrints}
          view={view === 'all' ? 'front' : view}
          onViewChange={setView}
          selected={selectedPrint}
          onSelect={setSelectedPrint}
          artworks={artworks.data ?? []}
          onArtworksChange={artworks.reload}
        />

        {OPTION_GROUPS.map((g) => {
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
                        <button
                          key={ch.id}
                          className={opt(template, design.data.options, o.id) === ch.id ? 'chip active' : 'chip'}
                          onClick={() => setOption(o.id, ch.id)}
                        >
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
            <Link to={`/proyectos/${design.projectId}`} className="link">
              Ir al proyecto
            </Link>
          )}
          <Field label="Notas">
            <textarea rows={4} value={design.data.notes} onChange={(e) => setData({ notes: e.target.value })} placeholder="Ideas, referencias, cambios pedidos por el cliente…" />
          </Field>
          <button className="button danger spaced-top" onClick={remove}>
            Eliminar diseño
          </button>
        </section>
      </aside>
    </div>
  )
}

/** Estilo de una pieza, con el color por defecto si el diseño aún no lo tiene. */
function pieceStyle(t: GarmentTemplate, data: DesignData, piece: string): PieceStyle {
  return data.pieces[piece] ?? { color: t.pieces.find((p) => p.id === piece)?.defaultColor ?? '#cccccc', materialId: null }
}

interface PieceEditorProps {
  template: string
  piece: PieceDef
  style: PieceStyle
  materials: Material[]
  onChange: (patch: Partial<PieceStyle>) => void
  onHover: (piece: string | null) => void
}

function PieceEditor({ template, piece, style, materials, onChange, onHover }: PieceEditorProps) {
  return (
    <div className="piece" onMouseEnter={() => onHover(piece.id)} onMouseLeave={() => onHover(null)}>
      <div className="piece-head">
        <label className="piece-color" title="Elegir color">
          <input type="color" value={style.color} onChange={(e) => onChange({ color: e.target.value })} />
          <span style={{ background: style.color }} />
        </label>
        <strong>{piece.label}</strong>
        <span className="muted small">{style.color.toUpperCase()}</span>
      </div>
      <div className="palette">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={c === style.color ? 'swatch-button active' : 'swatch-button'}
            style={{ background: c }}
            onClick={() => onChange({ color: c })}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <MaterialPicker
        template={template}
        piece={piece}
        materialId={style.materialId}
        color={style.color}
        library={materials}
        // Los metales tienen su propio color: al elegirlos, la pieza lo toma
        onChange={(materialId, m) => onChange(m?.tint ? { materialId, color: m.tint } : { materialId })}
      />
    </div>
  )
}
