import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, imageSize } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { Transformable } from '../../designer/prints'
import { FontPicker } from '../../components/FontPicker'
import { loadFont, useFontsVersion } from '../../designer/fonts'
import type { ArtLayer } from '../../shared/artworks'
import { fileUrl } from '../../shared/library'
import { useHistory } from '../designer/useHistory'
import { ART_SIZE, ArtLayerView, exportSvg, layerSize } from './artLayers'
import './creator.css'

const SWATCHES = ['#1d1d1f', '#ffffff', '#f2efe8', '#b3261e', '#c4643a', '#e3b341', '#2f4a3a', '#1f2a44', '#3b5b8c', '#a99bc9']
/** A cuántas unidades del lienzo se pega una capa a una guía. */
const SNAP = 6

/** Caja (sin girar) que ocupa una capa en el lienzo, contando su giro. */
function boxOf(l: ArtLayer) {
  const { w, h } = layerSize(l)
  const a = (l.rotation * Math.PI) / 180
  const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
  const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
  return { x0: l.x - bw / 2, x1: l.x + bw / 2, y0: l.y - bh / 2, y1: l.y + bh / 2 }
}
type Box = ReturnType<typeof boxOf>
const union = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  y1: Math.max(...boxes.map((b) => b.y1)),
})

const layerName = (l: ArtLayer) =>
  l.type === 'text' ? l.text || 'Texto' : l.type === 'image' ? 'Imagen' : { rect: 'Rectángulo', circle: 'Círculo', star: 'Estrella' }[l.shape]

/**
 * Creador de estampados y logos: textos (rectos o en arco), formas e imágenes en capas.
 * Se puede deshacer, seleccionar varias capas (Mayús + clic), agruparlas, alinearlas y repartirlas; al moverlas se
 * pegan a guías (centro y bordes del lienzo y de las otras capas). Al guardar se genera un SVG que queda en la
 * Biblioteca y se puede colocar sobre las prendas.
 */
export function ArtworkCreator() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [name, setName] = useState('Logo sin título')
  const history = useHistory<ArtLayer[]>([])
  const layers = history.state
  const layersRef = useRef(layers)
  layersRef.current = layers
  const setLayers = (next: ArtLayer[] | ((all: ArtLayer[]) => ArtLayer[])) => history.set(typeof next === 'function' ? next(layersRef.current) : next)
  const [selection, setSelection] = useState<string[]>([])
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ file: string; width: number; height: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const exportRef = useRef<SVGGElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const shiftDown = useRef(false)
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
        if (a.data) history.reset(a.data.layers)
        else setUploaded({ file: a.file, width: a.width, height: a.height })
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  // --- Selección: las capas de un grupo van siempre juntas ---
  const withGroups = (ids: string[], all = layers) => {
    const groups = new Set(all.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group))
    return all.filter((l) => ids.includes(l.id) || (l.group && groups.has(l.group))).map((l) => l.id)
  }
  const select = (layerId: string, additive = false) => {
    const ids = withGroups([layerId])
    if (!additive) return setSelection(ids)
    setSelection((sel) => (ids.every((i) => sel.includes(i)) ? sel.filter((i) => !ids.includes(i)) : [...new Set([...sel, ...ids])]))
  }
  const selected = layers.filter((l) => selection.includes(l.id))
  const current = selected.length === 1 ? selected[0] : null
  const grouped = selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group)

  const update = (patch: Partial<ArtLayer>) => current && setLayers(layers.map((l) => (l.id === current.id ? ({ ...l, ...patch } as ArtLayer) : l)))
  const patchLayer = (layerId: string, patch: Partial<ArtLayer>) => setLayers(layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as ArtLayer) : l)))
  const add = (l: ArtLayer) => {
    setLayers([...layers, l])
    setSelection([l.id])
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
      const img =
        base ??
        (await (async () => {
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

  // --- Acciones sobre la selección ---
  const removeSelected = () => {
    if (!selection.length) return
    setLayers(layers.filter((l) => !selection.includes(l.id)))
    setSelection([])
  }
  const duplicateSelected = () => {
    if (!selected.length) return
    // Los grupos copiados forman un grupo nuevo
    const groupMap = new Map<string, string>()
    const copies = selected.map((l) => {
      const group = l.group ? (groupMap.get(l.group) ?? groupMap.set(l.group, crypto.randomUUID()).get(l.group)) : undefined
      return { ...l, id: crypto.randomUUID(), x: l.x + 20, y: l.y + 20, locked: false, ...(group ? { group } : {}) } as ArtLayer
    })
    setLayers([...layers, ...copies])
    setSelection(copies.map((c) => c.id))
  }
  const groupSelected = () => {
    if (selected.length < 2) return
    const group = crypto.randomUUID()
    setLayers(layers.map((l) => (selection.includes(l.id) ? ({ ...l, group } as ArtLayer) : l)))
  }
  const ungroupSelected = () => setLayers(layers.map((l) => (selection.includes(l.id) ? ({ ...l, group: undefined } as ArtLayer) : l)))
  const nudge = (dx: number, dy: number) =>
    selection.length && setLayers(layers.map((l) => (selection.includes(l.id) && !l.locked ? ({ ...l, x: l.x + dx, y: l.y + dy } as ArtLayer) : l)))

  /** Unidades que se alinean: cada grupo junto y cada capa suelta por su cuenta. */
  const units = () => {
    const map = new Map<string, ArtLayer[]>()
    for (const l of selected.filter((x) => !x.locked)) {
      const k = l.group ?? l.id
      map.set(k, [...(map.get(k) ?? []), l])
    }
    return [...map.values()].map((ls) => ({ ids: ls.map((l) => l.id), box: union(ls.map(boxOf)) }))
  }
  const shiftUnits = (moves: { ids: string[]; dx: number; dy: number }[]) =>
    setLayers(
      layers.map((l) => {
        const m = moves.find((u) => u.ids.includes(l.id))
        return m ? ({ ...l, x: l.x + m.dx, y: l.y + m.dy } as ArtLayer) : l
      }),
    )
  /** Alinea con el lienzo (una sola capa o un grupo) o con la caja de toda la selección. */
  const align = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const us = units()
    if (!us.length) return
    const ref = us.length === 1 ? { x0: 0, x1: ART_SIZE, y0: 0, y1: ART_SIZE } : union(us.map((u) => u.box))
    shiftUnits(
      us.map(({ ids, box: b }) => ({
        ids,
        dx: kind === 'left' ? ref.x0 - b.x0 : kind === 'right' ? ref.x1 - b.x1 : kind === 'hcenter' ? (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2 : 0,
        dy: kind === 'top' ? ref.y0 - b.y0 : kind === 'bottom' ? ref.y1 - b.y1 : kind === 'vcenter' ? (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2 : 0,
      })),
    )
  }
  /** Reparte con el mismo espacio entre ellas (de tres en adelante). */
  const distribute = (axis: 'x' | 'y') => {
    const us = units()
    if (us.length < 3) return
    const c = (b: Box) => (axis === 'x' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2)
    const sorted = [...us].sort((a, b) => c(a.box) - c(b.box))
    const first = c(sorted[0].box)
    const step = (c(sorted[sorted.length - 1].box) - first) / (sorted.length - 1)
    shiftUnits(sorted.map((u, i) => ({ ids: u.ids, dx: axis === 'x' ? first + step * i - c(u.box) : 0, dy: axis === 'y' ? first + step * i - c(u.box) : 0 })))
  }

  // --- Mover con guías: el centro y los bordes se pegan al lienzo y a las otras capas ---
  const snapMove = (l: ArtLayer, x: number, y: number, moving: string[]) => {
    const b = boxOf({ ...l, x, y } as ArtLayer)
    const others = layers.filter((o) => !moving.includes(o.id) && !o.hidden).map(boxOf)
    const xs = [0, ART_SIZE / 2, ART_SIZE, ...others.flatMap((o) => [o.x0, (o.x0 + o.x1) / 2, o.x1])]
    const ys = [0, ART_SIZE / 2, ART_SIZE, ...others.flatMap((o) => [o.y0, (o.y0 + o.y1) / 2, o.y1])]
    const best = (cands: number[], targets: number[]) => {
      let out: { d: number; t: number } | null = null
      for (const c of cands) for (const t of targets) if (Math.abs(t - c) < SNAP && (!out || Math.abs(t - c) < Math.abs(out.d))) out = { d: t - c, t }
      return out
    }
    const sx = best([b.x0, (b.x0 + b.x1) / 2, b.x1], xs)
    const sy = best([b.y0, (b.y0 + b.y1) / 2, b.y1], ys)
    setGuides({ x: sx ? [sx.t] : [], y: sy ? [sy.t] : [] })
    return { x: x + (sx?.d ?? 0), y: y + (sy?.d ?? 0) }
  }

  // --- Orden de las capas (arrastrando en la lista, que va de delante a atrás) ---
  const moveLayer = (dir: -1 | 1) => {
    if (!current) return
    const i = layers.indexOf(current)
    const j = i + dir
    if (j < 0 || j >= layers.length) return
    const next = [...layers]
    ;[next[i], next[j]] = [next[j], next[i]]
    setLayers(next)
  }
  const dropOn = (targetId: string) => (e: DragEvent) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) return setDragId(null)
    const from = layers.find((l) => l.id === dragId)!
    const rest = layers.filter((l) => l.id !== dragId)
    const at = rest.findIndex((l) => l.id === targetId)
    // La lista se ve al revés (la de delante arriba): soltar encima de una capa la pone delante de ella
    rest.splice(at + 1, 0, from)
    setLayers(rest)
    setDragId(null)
  }

  const save = async () => {
    if (!exportRef.current || layers.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const { blob, width, height } = await exportSvg(exportRef.current, layers.filter((l) => !l.hidden))
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

  // --- Atajos de teclado ---
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
      } else if (mod && k === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if (mod && k === 'a') {
        e.preventDefault()
        setSelection(layers.filter((l) => !l.hidden && !l.locked).map((l) => l.id))
      } else if (mod && k === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected()
        else groupSelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.length) {
          e.preventDefault()
          removeSelected()
        }
      } else if (e.key.startsWith('Arrow') && selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
      } else if (e.key === 'Escape') {
        setSelection([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const removeArtwork = async () => {
    if (!id || !confirm(`¿Eliminar el gráfico «${name}»? Los diseños que ya lo usan lo conservan.`)) return
    await api.deleteArtwork(id)
    navigate('/biblioteca/graficos')
  }

  // Ctrl + rueda: zoom del lienzo (con un oyente no pasivo, para que el navegador no amplíe toda la página)
  const artboard = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = artboard.current
    if (!el) return
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

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

  const visible = layers.filter((l) => !l.hidden)

  return (
    <div className="creator">
      <div className="creator-main">
        <header className="editor-header">
          <Link to="/biblioteca/graficos" className="button">
            ← Gráficos
          </Link>
          <input className="editor-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del gráfico" />
          <div className="history-buttons">
            <button className="tool" onClick={history.undo} disabled={!history.canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
              ↶
            </button>
            <button className="tool" onClick={history.redo} disabled={!history.canRedo} title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer">
              ↷
            </button>
          </div>
          <div className="editor-actions">
            {savedAt && <span className="save-state">Guardado a las {savedAt}</span>}
            <button className="button primary" onClick={save} disabled={saving || layers.length === 0} title="Guardar (Ctrl+S)">
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
          <div className="zoom creator-zoom">
            <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Alejar">
              −
            </button>
            <button onClick={() => setZoom(1)} className="zoom-value" title="Volver al 100 % (Ctrl + rueda para acercar)">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} aria-label="Acercar">
              +
            </button>
          </div>
        </div>
        <div className="artboard" ref={artboard}>
          <svg
            viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`}
            style={{ width: `calc(min(100%, 72dvh) * ${zoom})`, maxWidth: 'none' }}
            onPointerDown={() => setSelection([])}
            onPointerDownCapture={(e) => (shiftDown.current = e.shiftKey)}
            onPointerUp={() => setGuides({ x: [], y: [] })}
          >
            {visible.map((l) => {
              if (l.locked) return <g key={l.id} pointerEvents="none"><ArtLayerView layer={l} /></g>
              const { w, h } = layerSize(l)
              return (
                <Transformable
                  key={l.id}
                  value={{ x: l.x, y: l.y, w, rotation: l.rotation }}
                  aspect={h / w}
                  selected={selection.includes(l.id)}
                  onSelect={() => {
                    // Con Mayúsculas se añade (o se quita) de la selección; sin ellas, si ya estaba, se mueve con las demás
                    if (shiftDown.current) select(l.id, true)
                    else if (!selection.includes(l.id)) select(l.id)
                  }}
                  onChange={(t) => {
                    const moving = t.w === w && t.rotation === l.rotation
                    if (moving) {
                      const ids = selection.includes(l.id) ? selection : withGroups([l.id])
                      const p = snapMove(l, t.x, t.y, ids)
                      const dx = p.x - l.x
                      const dy = p.y - l.y
                      setLayers((all) => all.map((x) => (ids.includes(x.id) && !x.locked ? ({ ...x, x: x.x + dx, y: x.y + dy } as ArtLayer) : x)))
                      return
                    }
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
            {/* Guías a las que se ha pegado la capa al moverla */}
            <g pointerEvents="none">
              {guides.x.map((x) => (
                <line key={`gx${x}`} x1={x} x2={x} y1={0} y2={ART_SIZE} stroke="#db2777" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              ))}
              {guides.y.map((y) => (
                <line key={`gy${y}`} x1={0} x2={ART_SIZE} y1={y} y2={y} stroke="#db2777" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          </svg>
          {layers.length === 0 && <p className="artboard-empty">Añade un texto, una imagen o una forma para empezar</p>}
        </div>
        <p className="creator-hint muted small">
          Mayús + clic: varias capas · Ctrl+G agrupar · Flechas: mover (Mayús, de 10 en 10) · Ctrl+D duplicar · Supr quitar · Ctrl+Z deshacer · Ctrl + rueda: zoom
        </p>
        {/* Copia sin marcos de selección, para exportar el SVG */}
        <svg className="export-stage" viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`} aria-hidden="true">
          <g ref={exportRef}>
            {visible.map((l) => (
              <ArtLayerView key={l.id} layer={l} />
            ))}
          </g>
        </svg>
      </div>

      <aside className="editor-panel">
        <section>
          <h2>Capas</h2>
          {layers.length === 0 && <p className="muted small">Sin capas todavía.</p>}
          <ul className="print-list creator-layers">
            {[...layers].reverse().map((l) => (
              <li
                key={l.id}
                draggable
                onDragStart={() => setDragId(l.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropOn(l.id)}
                onDragEnd={() => setDragId(null)}
                className={[l.hidden ? 'hidden' : '', dragId === l.id ? 'dragging' : '', l.group ? 'in-group' : ''].join(' ')}
              >
                <button className={selection.includes(l.id) ? 'print-row active' : 'print-row'} onClick={(e) => select(l.id, e.shiftKey)} title="Arrastra para cambiar el orden">
                  <span className="print-thumb">{l.type === 'image' ? <img src={fileUrl(l.file)} alt="" /> : l.type === 'text' ? 'Aa' : '◆'}</span>
                  <span className="print-name">{layerName(l)}</span>
                </button>
                <span className="layer-toggles">
                  <button className={l.hidden ? 'layer-toggle off' : 'layer-toggle'} onClick={() => patchLayer(l.id, { hidden: !l.hidden })} title={l.hidden ? 'Mostrar' : 'Ocultar'} aria-label={l.hidden ? 'Mostrar' : 'Ocultar'}>
                    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
                      <path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10s-3 5.5-8.5 5.5S1.5 10 1.5 10Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="10" r="2.6" fill="currentColor" />
                      {l.hidden && <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.6" />}
                    </svg>
                  </button>
                  <button className={l.locked ? 'layer-toggle on' : 'layer-toggle'} onClick={() => patchLayer(l.id, { locked: !l.locked })} title={l.locked ? 'Desbloquear' : 'Bloquear'} aria-label={l.locked ? 'Desbloquear' : 'Bloquear'}>
                    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
                      <rect x="4" y="9" width="12" height="8.5" rx="1.5" fill={l.locked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
                      <path d={l.locked ? 'M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9' : 'M6.5 9V6.5a3.5 3.5 0 0 1 6.8-1.2'} fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {selected.length > 0 && (
          <section>
            <h2>Alinear{selected.length > 1 && !grouped ? ' la selección' : ' en el lienzo'}</h2>
            <div className="align-grid">
              <AlignButton label="Izquierda" d="M3 2v16M6 6h10M6 13h6" onClick={() => align('left')} />
              <AlignButton label="Centro (horizontal)" d="M10 2v16M5 6h10M7 13h6" onClick={() => align('hcenter')} />
              <AlignButton label="Derecha" d="M17 2v16M4 6h10M8 13h6" onClick={() => align('right')} />
              <AlignButton label="Arriba" d="M2 3h16M6 6v10M13 6v6" onClick={() => align('top')} />
              <AlignButton label="Centro (vertical)" d="M2 10h16M6 5v10M13 7v6" onClick={() => align('vcenter')} />
              <AlignButton label="Abajo" d="M2 17h16M6 4v10M13 8v6" onClick={() => align('bottom')} />
            </div>
            {units().length >= 3 && (
              <div className="print-actions">
                <button className="button" onClick={() => distribute('x')}>
                  Repartir en horizontal
                </button>
                <button className="button" onClick={() => distribute('y')}>
                  Repartir en vertical
                </button>
              </div>
            )}
            {selected.length > 1 && (
              <div className="print-actions">
                <span className="muted small">{selected.length} capas seleccionadas</span>
                {grouped ? (
                  <button className="button" onClick={ungroupSelected} title="Ctrl+Mayús+G">
                    Desagrupar
                  </button>
                ) : (
                  <button className="button" onClick={groupSelected} title="Ctrl+G">
                    Agrupar
                  </button>
                )}
                <button className="button" onClick={duplicateSelected} title="Ctrl+D">
                  Duplicar
                </button>
                <button className="button danger" onClick={removeSelected} title="Supr">
                  Quitar
                </button>
              </div>
            )}
          </section>
        )}

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
              <button className="button" onClick={() => moveLayer(-1)}>
                ↓ Atrás
              </button>
              <button className="button" onClick={() => moveLayer(1)}>
                ↑ Delante
              </button>
              <button className="button" onClick={duplicateSelected} title="Ctrl+D">
                Duplicar
              </button>
              <button className="button danger" onClick={removeSelected} title="Supr">
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

function AlignButton({ label, d, onClick }: { label: string; d: string; onClick: () => void }) {
  return (
    <button className="tool align-button" onClick={onClick} title={label} aria-label={label}>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
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
