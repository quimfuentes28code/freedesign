import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { Field } from '../../components/ui'
import { CX } from '../../designer/geometry'
import { printSize, unitsOf } from '../../designer/prints'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import { FontPicker } from '../../components/FontPicker'
import { TECHNIQUES, type Artwork, type Technique } from '../../shared/artworks'
import type { Print } from '../../shared/designs'
import { fileUrl } from '../../shared/library'

interface Props {
  template: GarmentTemplate
  prints: Print[]
  onChange: (prints: Print[]) => void
  /** Vista en la que se añaden los estampados nuevos. */
  view: View
  onViewChange: (v: View) => void
  selected: string | null
  onSelect: (id: string | null) => void
  artworks: Artwork[]
  onArtworksChange: () => void
}

/** Efectos de un texto: espaciado, arco, vertical, contorno y sombra. */
function TextEffects({ p, update }: { p: Print; update: (patch: Partial<Print>) => void }) {
  return (
    <div className="text-effects">
      <label className="field">
        <span>
          Espaciado <strong>{(p.letterSpacing ?? 0).toLocaleString('es-ES')}</strong>
        </span>
        <input type="range" min={-4} max={20} step={0.5} value={p.letterSpacing ?? 0} onChange={(e) => update({ letterSpacing: Number(e.target.value) || undefined })} />
      </label>
      <label className="field">
        <span>
          Arco <strong>{p.arc ? `${p.arc > 0 ? '∩' : '∪'} ${Math.abs(p.arc)}` : 'recto'}</strong>
        </span>
        <input type="range" min={-100} max={100} value={p.arc ?? 0} disabled={p.vertical} onChange={(e) => update({ arc: Number(e.target.value) || undefined })} />
      </label>
      <label className="toggle-row">
        <span>Vertical (letra a letra)</span>
        <input type="checkbox" checked={!!p.vertical} onChange={(e) => update({ vertical: e.target.checked || undefined, ...(e.target.checked ? { arc: undefined } : {}) })} />
      </label>
      <div className="effect-row">
        <label className="toggle-row">
          <span>Contorno</span>
          <input type="checkbox" checked={!!p.stroke} onChange={(e) => update(e.target.checked ? { stroke: '#ffffff', strokeWidth: 1 } : { stroke: undefined, strokeWidth: undefined })} />
        </label>
        {p.stroke && (
          <>
            <input type="color" value={p.stroke} onChange={(e) => update({ stroke: e.target.value })} aria-label="Color del contorno" />
            <input type="range" min={0.2} max={6} step={0.1} value={p.strokeWidth ?? 1} onChange={(e) => update({ strokeWidth: Number(e.target.value) })} aria-label="Grosor del contorno" />
          </>
        )}
      </div>
      <div className="effect-row">
        <label className="toggle-row">
          <span>Sombra</span>
          <input type="checkbox" checked={!!p.shadow} onChange={(e) => update(e.target.checked ? { shadow: '#000000', shadowOffset: 1.5 } : { shadow: undefined, shadowOffset: undefined })} />
        </label>
        {p.shadow && (
          <>
            <input type="color" value={p.shadow} onChange={(e) => update({ shadow: e.target.value })} aria-label="Color de la sombra" />
            <input type="range" min={0.3} max={8} step={0.1} value={p.shadowOffset ?? 1.5} onChange={(e) => update({ shadowOffset: Number(e.target.value) })} aria-label="Distancia de la sombra" />
          </>
        )}
      </div>
    </div>
  )
}

/** Panel de estampados y logos del editor: añadir gráficos o textos, y ajustar el seleccionado. */
export function PrintsPanel({ template, prints, onChange, view, onViewChange, selected, onSelect, artworks, onArtworksChange }: Props) {
  const [picking, setPicking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const current = prints.find((p) => p.id === selected) ?? null
  const zones = template.printZones[view] ?? []

  const place = (): Pick<Print, 'x' | 'y'> => {
    const z = zones[1] ?? zones[0]
    return z ? { x: z.x, y: z.y } : { x: CX, y: 180 }
  }
  const add = (p: Omit<Print, 'id' | 'view' | 'x' | 'y' | 'rotation' | 'technique' | 'clip'>) => {
    const print: Print = { id: crypto.randomUUID(), view, ...place(), rotation: 0, technique: 'serigrafia', clip: true, ...p }
    onChange([...prints, print])
    onSelect(print.id)
    setPicking(false)
  }
  const addArtwork = (a: Artwork) =>
    add({
      kind: 'artwork',
      artworkId: a.id,
      file: a.file,
      aspect: a.height / a.width,
      w: (zones[1] ?? zones[0])?.w ?? 70,
      text: '',
      font: '',
      size: 20,
      color: '#1d1d1f',
      bold: false,
    })
  const addText = () =>
    add({ kind: 'text', artworkId: null, file: '', aspect: 1, w: 60, text: 'TEXTO', font: "'Anton', sans-serif", size: 18, color: '#1d1d1f', bold: true })

  const upload = async (f: File | undefined) => {
    if (!f) return
    setUploading(true)
    setError(null)
    try {
      const a = await api.uploadArtwork(f)
      onArtworksChange()
      addArtwork(a)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const update = (patch: Partial<Print>) => current && onChange(prints.map((p) => (p.id === current.id ? { ...p, ...patch } : p)))
  const move = (dir: -1 | 1) => {
    if (!current) return
    const i = prints.indexOf(current)
    const j = i + dir
    if (j < 0 || j >= prints.length) return
    const next = [...prints]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const remove = () => {
    if (!current) return
    onChange(prints.filter((p) => p.id !== current.id))
    onSelect(null)
  }
  const duplicate = () => {
    if (!current) return
    const copy = { ...current, id: crypto.randomUUID(), x: current.x + 10, y: current.y + 10 }
    onChange([...prints, copy])
    onSelect(copy.id)
  }

  const UNITS_PER_CM = unitsOf(template)
  const widthCm = current ? printSize(current).w / UNITS_PER_CM : 0
  const setWidthCm = (cm: number) => {
    if (!current) return
    const units = cm * UNITS_PER_CM
    if (current.kind === 'artwork') update({ w: units })
    else update({ size: (current.size * units) / printSize(current).w })
  }
  const nameOf = (p: Print) => (p.kind === 'text' ? `«${p.text}»` : (artworks.find((a) => a.id === p.artworkId)?.name ?? 'Gráfico'))

  return (
    <section>
      <h2>Estampados y logos</h2>
      <div className="print-actions">
        <button className="button" onClick={() => setPicking(!picking)}>
          + Gráfico
        </button>
        <button className="button" onClick={addText}>
          + Texto
        </button>
      </div>
      <p className="muted small">Se añaden en la vista {VIEWS.find((v) => v.id === view)?.label.toLowerCase()}.</p>
      {error && <p className="status error">{error}</p>}

      {picking && (
        <div className="artwork-picker">
          <div className="artwork-picker-grid">
            <button className="artwork-tile upload" onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? 'Subiendo…' : 'Subir imagen'}
            </button>
            {artworks.map((a) => (
              <button key={a.id} className="artwork-tile" onClick={() => addArtwork(a)} title={a.name}>
                <img src={fileUrl(a.file)} alt={a.name} />
              </button>
            ))}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <Link to="/biblioteca/graficos/nuevo" target="_blank" className="link">
            Crear un logo o gráfico en el creador ↗
          </Link>
        </div>
      )}

      {prints.length > 0 && (
        <ul className="print-list">
          {prints.map((p) => (
            <li key={p.id}>
              <button
                className={p.id === selected ? 'print-row active' : 'print-row'}
                onClick={() => {
                  onSelect(p.id)
                  onViewChange(p.view)
                }}
              >
                <span className="print-thumb">{p.kind === 'artwork' ? <img src={fileUrl(p.file)} alt="" /> : 'Aa'}</span>
                <span className="print-name">{nameOf(p)}</span>
                <span className="muted small">{VIEWS.find((v) => v.id === p.view)?.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div className="print-editor">
          {current.kind === 'text' && (
            <>
              <Field label="Texto">
                <input value={current.text} onChange={(e) => update({ text: e.target.value })} />
              </Field>
              <FontPicker value={current.font} onChange={(font) => update({ font })} />
              <div className="fields">
                <Field label="Color">
                  <input type="color" value={current.color} onChange={(e) => update({ color: e.target.value })} />
                </Field>
                <div className="toggle-pair">
                  <label className="toggle-row">
                    <span>Negrita</span>
                    <input type="checkbox" checked={current.bold} onChange={(e) => update({ bold: e.target.checked })} />
                  </label>
                  <label className="toggle-row">
                    <span>Cursiva</span>
                    <input type="checkbox" checked={!!current.italic} onChange={(e) => update({ italic: e.target.checked || undefined })} />
                  </label>
                </div>
              </div>
              <TextEffects p={current} update={update} />
            </>
          )}
          <Field label="Técnica">
            <select value={current.technique} onChange={(e) => update({ technique: e.target.value as Technique })}>
              {TECHNIQUES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="field">
            <span>
              Ancho ≈ <strong>{widthCm.toFixed(1)} cm</strong>
            </span>
            <input type="range" min={2} max={45} step={0.5} value={Math.min(45, widthCm)} onChange={(e) => setWidthCm(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>
              Giro <strong>{Math.round(current.rotation)}°</strong>
            </span>
            <input type="range" min={-180} max={180} value={current.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} />
          </label>
          {(template.printZones[current.view] ?? []).length > 0 && (
            <div className="option-row">
              <span>Posición rápida</span>
              <div className="chips">
                {(template.printZones[current.view] ?? []).map((z) => (
                  <button
                    key={z.id}
                    className="chip"
                    onClick={() => {
                      const units = z.w
                      if (current.kind === 'artwork') update({ x: z.x, y: z.y, w: units, rotation: 0 })
                      else update({ x: z.x, y: z.y, rotation: 0, size: (current.size * units) / printSize(current).w })
                    }}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="toggle-row">
            <span>Recortar al contorno de la prenda</span>
            <input type="checkbox" checked={current.clip} onChange={(e) => update({ clip: e.target.checked })} />
          </label>
          <div className="print-actions">
            <button className="button" onClick={() => update({ x: CX })} title="Centrar en la prenda (también se ajusta solo al acercarlo al centro)">
              ↔ Centrar
            </button>
            <button className="button" onClick={() => update({ rotation: 0 })} title="Quitar el giro">
              Enderezar
            </button>
            <button className="button" onClick={() => update({ locked: !current.locked })} title="Bloquear para no moverlo sin querer">
              {current.locked ? 'Desbloquear' : 'Bloquear'}
            </button>
          </div>
          <div className="print-actions">
            <button className="button" onClick={() => move(-1)} title="Poner por debajo">
              ↓ Atrás
            </button>
            <button className="button" onClick={() => move(1)} title="Poner por encima">
              ↑ Delante
            </button>
            <button className="button" onClick={duplicate}>
              Duplicar
            </button>
            <button className="button danger" onClick={remove}>
              Quitar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
