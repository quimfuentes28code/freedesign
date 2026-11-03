import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { Field } from '../../components/ui'
import { CX } from '../../designer/geometry'
import { printSize, UNITS_PER_CM } from '../../designer/prints'
import { VIEWS, type GarmentTemplate, type View } from '../../designer/types'
import { FONTS, TECHNIQUES, type Artwork, type Technique } from '../../shared/artworks'
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
    add({ kind: 'text', artworkId: null, file: '', aspect: 1, w: 60, text: 'TEXTO', font: FONTS[0].id, size: 18, color: '#1d1d1f', bold: true })

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
              <div className="fields">
                <Field label="Tipografía">
                  <select value={current.font} onChange={(e) => update({ font: e.target.value })}>
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Color">
                  <input type="color" value={current.color} onChange={(e) => update({ color: e.target.value })} />
                </Field>
              </div>
              <label className="toggle-row">
                <span>Negrita</span>
                <input type="checkbox" checked={current.bold} onChange={(e) => update({ bold: e.target.checked })} />
              </label>
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
