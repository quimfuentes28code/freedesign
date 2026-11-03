import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, useApi } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { getTemplate } from '../../designer/templates'
import { OPTION_GROUPS, opt, type GarmentTemplate, type PieceDef } from '../../designer/types'
import type { DesignData, DesignInput, PieceStyle } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Canvas } from './Canvas'
import './designer.css'

/** Colores rápidos habituales en streetwear (además del selector libre). */
const PALETTE = [
  '#1d1d1f', '#f2efe8', '#efe3c8', '#9a9a9c', '#c9b89f', '#5b4636', '#4b5a3c', '#2f4a3a',
  '#1f2a44', '#3b5b8c', '#6b1f2a', '#b3261e', '#c4643a', '#e3b341', '#a99bc9', '#e8b4c0',
]

/** Editor de un diseño: lienzo con las vistas y panel con piezas, opciones y datos. */
export function DesignEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clients = useApi(() => api.listClients(), [])
  const library = useApi(() => api.listMaterials(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])

  const [design, setDesign] = useState<DesignInput | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api
      .getDesign(id)
      .then((d) => {
        const input: DesignInput = { name: d.name, template: d.template, clientId: d.clientId, data: d.data }
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

  // Ctrl/Cmd + S guarda
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
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
          <div className="editor-actions">
            <span className={dirty ? 'save-state dirty' : 'save-state'}>{saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
            <button className="button primary" onClick={save} disabled={!dirty || saving}>
              Guardar
            </button>
          </div>
        </header>
        {error && <p className="status error">{error}</p>}
        <Canvas template={template} data={design.data} materials={materials} highlight={highlight} />
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
  piece: PieceDef
  style: PieceStyle
  materials: Material[]
  onChange: (patch: Partial<PieceStyle>) => void
  onHover: (piece: string | null) => void
}

function PieceEditor({ piece, style, materials, onChange, onHover }: PieceEditorProps) {
  const options = materials.filter((m) => piece.materials.includes(m.category))
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
      <select value={style.materialId ?? ''} onChange={(e) => onChange({ materialId: e.target.value || null })}>
        <option value="">{options.length ? 'Material sin elegir' : 'Sin materiales en la Biblioteca'}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.composition ? ` · ${m.composition}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
