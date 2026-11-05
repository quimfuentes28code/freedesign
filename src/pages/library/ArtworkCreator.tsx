import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, imageSize } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { Transformable } from '../../designer/prints'
import { FontPicker } from '../../components/FontPicker'
import { loadFont, useFontsVersion } from '../../designer/fonts'
import type { ArtLayer } from '../../shared/artworks'
import { fileUrl } from '../../shared/library'
import { ART_SIZE, ArtLayerView, exportSvg, layerSize } from './artLayers'
import './creator.css'

const SWATCHES = ['#1d1d1f', '#ffffff', '#f2efe8', '#b3261e', '#c4643a', '#e3b341', '#2f4a3a', '#1f2a44', '#3b5b8c', '#a99bc9']

/**
 * Creador de estampados y logos: textos (rectos o en arco), formas e imágenes en capas.
 * Al guardar se genera un SVG que queda en la Biblioteca y se puede colocar sobre las prendas.
 */
export function ArtworkCreator() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [name, setName] = useState('Logo sin título')
  const [layers, setLayers] = useState<ArtLayer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ file: string; width: number; height: number } | null>(null)
  const exportRef = useRef<SVGGElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  // Fuentes de los textos: se descargan al usarlas y, al llegar, se vuelve a medir y pintar
  useFontsVersion()
  const fontsKey = layers.map((l) => (l.type === 'text' ? l.font : '')).join('|')
  useEffect(() => {
    for (const l of layers) if (l.type === 'text') loadFont(l.font)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsKey])

  useEffect(() => {
    if (isNew) return
    api
      .getArtwork(id)
      .then((a) => {
        setName(a.name)
        if (a.data) setLayers(a.data.layers)
        else setUploaded({ file: a.file, width: a.width, height: a.height })
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const current = layers.find((l) => l.id === selected) ?? null
  const update = (patch: Partial<ArtLayer>) =>
    current && setLayers(layers.map((l) => (l.id === current.id ? ({ ...l, ...patch } as ArtLayer) : l)))
  const add = (l: ArtLayer) => {
    setLayers([...layers, l])
    setSelected(l.id)
  }
  const center = { x: ART_SIZE / 2, y: ART_SIZE / 2, rotation: 0 }

  const addText = () =>
    add({
      id: crypto.randomUUID(),
      type: 'text',
      text: 'FREEDESIGN',
      font: "'Anton', sans-serif",
      size: 64,
      color: '#1d1d1f',
      bold: true,
      italic: false,
      letterSpacing: 2,
      stroke: '',
      strokeWidth: 4,
      arc: 0,
      ...center,
    })
  const addShape = (shape: 'rect' | 'circle' | 'star') =>
    add({ id: crypto.randomUUID(), type: 'shape', shape, fill: '#c4643a', stroke: '', strokeWidth: 6, w: 220, h: 220, ...center })
  const addImage = async (f: File | undefined, base?: { file: string; width: number; height: number }) => {
    try {
      const img = base ?? (await (async () => {
        const { width, height } = await imageSize(f!)
        const { key } = await api.uploadImage(f!)
        return { file: key, width, height }
      })())
      const w = Math.min(420, img.width)
      add({ id: crypto.randomUUID(), type: 'image', file: img.file, aspect: img.height / img.width, w, ...center })
      setUploaded(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const move = (dir: -1 | 1) => {
    if (!current) return
    const i = layers.indexOf(current)
    const j = i + dir
    if (j < 0 || j >= layers.length) return
    const next = [...layers]
    ;[next[i], next[j]] = [next[j], next[i]]
    setLayers(next)
  }
  const remove = () => {
    if (!current) return
    setLayers(layers.filter((l) => l.id !== current.id))
    setSelected(null)
  }
  const duplicate = () => current && add({ ...current, id: crypto.randomUUID(), x: current.x + 20, y: current.y + 20 })

  const save = async () => {
    if (!exportRef.current || layers.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const { blob, width, height } = await exportSvg(exportRef.current, layers)
      const { key } = await api.uploadImage(new File([blob], 'grafico.svg', { type: 'image/svg+xml' }))
      const input = { name: name.trim() || 'Gráfico', file: key, width, height, data: { layers }, tags: '' }
      if (isNew) {
        const created = await api.createArtwork(input)
        navigate(`/biblioteca/graficos/${created.id}`, { replace: true })
      } else {
        await api.updateArtwork(id, input)
      }
      setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const removeArtwork = async () => {
    if (!id || !confirm(`¿Eliminar el gráfico «${name}»? Los diseños que ya lo usan lo conservan.`)) return
    await api.deleteArtwork(id)
    navigate('/biblioteca/graficos')
  }

  if (loading) return <div className="page"><Status loading /></div>

  // Gráfico subido (sin capas): se puede ver, renombrar o usar como base de uno nuevo en el creador
  if (uploaded && layers.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>{name}</h1>
            <p className="page-subtitle">Imagen subida</p>
          </div>
          <div className="page-actions">
            <Link to="/biblioteca/graficos" className="button">
              Volver
            </Link>
            <button className="button primary" onClick={() => addImage(undefined, uploaded)}>
              Editar en el creador
            </button>
          </div>
        </header>
        <div className="card artwork-preview">
          <img src={fileUrl(uploaded.file)} alt={name} />
        </div>
        <p className="muted small">
          {Math.round(uploaded.width)} × {Math.round(uploaded.height)} px. «Editar en el creador» lo pone como capa para añadirle textos o
          formas; al guardar se crea una versión nueva de este gráfico.
        </p>
        <div className="danger-zone">
          <button className="button danger" onClick={removeArtwork}>
            Eliminar gráfico
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="creator">
      <div className="creator-main">
        <header className="editor-header">
          <Link to="/biblioteca/graficos" className="button">
            ← Gráficos
          </Link>
          <input className="editor-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del gráfico" />
          <div className="editor-actions">
            {savedAt && <span className="save-state">Guardado a las {savedAt}</span>}
            <button className="button primary" onClick={save} disabled={saving || layers.length === 0}>
              {saving ? 'Guardando…' : 'Guardar en la Biblioteca'}
            </button>
          </div>
        </header>
        {error && <p className="status error">{error}</p>}
        <div className="creator-tools">
          <button className="button" onClick={addText}>
            + Texto
          </button>
          <button className="button" onClick={() => imageInput.current?.click()}>
            + Imagen
          </button>
          <button className="button" onClick={() => addShape('rect')}>
            + Rectángulo
          </button>
          <button className="button" onClick={() => addShape('circle')}>
            + Círculo
          </button>
          <button className="button" onClick={() => addShape('star')}>
            + Estrella
          </button>
          <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files?.[0])} />
        </div>
        <div className="artboard">
          <svg viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`} onPointerDown={() => setSelected(null)}>
            {layers.map((l) => {
              const { w, h } = layerSize(l)
              return (
                <Transformable
                  key={l.id}
                  value={{ x: l.x, y: l.y, w, rotation: l.rotation }}
                  aspect={h / w}
                  selected={selected === l.id}
                  onSelect={() => setSelected(l.id)}
                  onChange={(t) => {
                    const k = t.w / w
                    const patch: Partial<ArtLayer> = { x: t.x, y: t.y, rotation: t.rotation }
                    if (l.type === 'text') Object.assign(patch, { size: l.size * k })
                    else if (l.type === 'image') Object.assign(patch, { w: t.w })
                    else Object.assign(patch, { w: l.w * k, h: l.h * k })
                    setLayers((all) => all.map((x) => (x.id === l.id ? ({ ...x, ...patch } as ArtLayer) : x)))
                  }}
                >
                  <ArtLayerView layer={l} />
                </Transformable>
              )
            })}
          </svg>
          {layers.length === 0 && <p className="artboard-empty">Añade un texto, una imagen o una forma para empezar</p>}
        </div>
        {/* Copia sin marcos de selección, para exportar el SVG */}
        <svg className="export-stage" viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`} aria-hidden="true">
          <g ref={exportRef}>
            {layers.map((l) => (
              <ArtLayerView key={l.id} layer={l} />
            ))}
          </g>
        </svg>
      </div>

      <aside className="editor-panel">
        <section>
          <h2>Capas</h2>
          {layers.length === 0 && <p className="muted small">Sin capas todavía.</p>}
          <ul className="print-list">
            {[...layers].reverse().map((l) => (
              <li key={l.id}>
                <button className={l.id === selected ? 'print-row active' : 'print-row'} onClick={() => setSelected(l.id)}>
                  <span className="print-thumb">{l.type === 'image' ? <img src={fileUrl(l.file)} alt="" /> : l.type === 'text' ? 'Aa' : '◆'}</span>
                  <span className="print-name">{l.type === 'text' ? l.text : l.type === 'image' ? 'Imagen' : { rect: 'Rectángulo', circle: 'Círculo', star: 'Estrella' }[l.shape]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {current && (
          <section>
            <h2>Capa seleccionada</h2>
            {current.type === 'text' && (
              <>
                <Field label="Texto">
                  <input value={current.text} onChange={(e) => update({ text: e.target.value })} />
                </Field>
                <FontPicker value={current.font} onChange={(font) => update({ font })} />
                <ColorField label="Color" value={current.color} onChange={(color) => update({ color })} />
                <div className="toggle-pair">
                  <label className="toggle-row">
                    <span>Negrita</span>
                    <input type="checkbox" checked={current.bold} onChange={(e) => update({ bold: e.target.checked })} />
                  </label>
                  <label className="toggle-row">
                    <span>Cursiva</span>
                    <input type="checkbox" checked={current.italic} onChange={(e) => update({ italic: e.target.checked })} />
                  </label>
                </div>
                <Range label="Espaciado" value={current.letterSpacing} min={-5} max={40} onChange={(letterSpacing) => update({ letterSpacing })} />
                <Range label="Curvatura" value={current.arc} min={-100} max={100} onChange={(arc) => update({ arc })} />
                <ColorField label="Contorno" value={current.stroke} optional onChange={(stroke) => update({ stroke })} />
                {current.stroke && <Range label="Grosor del contorno" value={current.strokeWidth} min={1} max={20} onChange={(strokeWidth) => update({ strokeWidth })} />}
              </>
            )}
            {current.type === 'shape' && (
              <>
                <ColorField label="Relleno" value={current.fill} onChange={(fill) => update({ fill })} />
                <ColorField label="Contorno" value={current.stroke} optional onChange={(stroke) => update({ stroke })} />
                {current.stroke && <Range label="Grosor del contorno" value={current.strokeWidth} min={1} max={30} onChange={(strokeWidth) => update({ strokeWidth })} />}
                <Range label="Proporción (alto)" value={Math.round((current.h / current.w) * 100)} min={10} max={300} onChange={(v) => update({ h: (current.w * v) / 100 })} />
              </>
            )}
            <Range label="Giro" value={Math.round(current.rotation)} min={-180} max={180} onChange={(rotation) => update({ rotation })} />
            <div className="print-actions">
              <button className="button" onClick={() => move(-1)}>
                ↓ Atrás
              </button>
              <button className="button" onClick={() => move(1)}>
                ↑ Delante
              </button>
              <button className="button" onClick={duplicate}>
                Duplicar
              </button>
              <button className="button danger" onClick={remove}>
                Quitar
              </button>
            </div>
          </section>
        )}

        {!isNew && (
          <section>
            <button className="button danger" onClick={removeArtwork}>
              Eliminar gráfico
            </button>
          </section>
        )}
      </aside>
    </div>
  )
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {label} <strong>{value}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function ColorField({ label, value, optional, onChange }: { label: string; value: string; optional?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-line">
        {optional && (
          <button className={!value ? 'swatch-button none active' : 'swatch-button none'} onClick={() => onChange('')} aria-label="Sin color" />
        )}
        {SWATCHES.map((c) => (
          <button key={c} className={c === value ? 'swatch-button active' : 'swatch-button'} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
        <input type="color" value={value || '#1d1d1f'} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}
