import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, imageSize } from '../../api/client'
import { Field, Status } from '../../components/ui'
import { Transformable } from '../../designer/prints'
import { FontPicker } from '../../components/FontPicker'
import { loadFont, useFontsVersion } from '../../designer/fonts'
import { SHAPE_KINDS, TEXT_WARPS, type ArtLayer, type FillStyle, type PathNode, type ShapeKind } from '../../shared/artworks'
import { fileUrl } from '../../shared/library'
import { useHistory } from '../designer/useHistory'
import { ART_SIZE, ArtLayerView, exportSvg, layerSize, warpOf } from './artLayers'
import { nodesBox, nodesPath, shapePath, smoothNodes } from './artShapes'
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
  l.type === 'text' ? l.text.split('\n')[0] || 'Texto' : l.type === 'image' ? 'Imagen' : l.type === 'path' ? (l.closed ? 'Forma a mano' : 'Trazo') : (SHAPE_KINDS.find((k) => k.id === l.shape)?.label ?? 'Forma')

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
  const setLayers = (next: ArtLayer[] | ((all: ArtLayer[]) => ArtLayer[])) => {
    // Se guarda al momento para que varios cambios seguidos (p. ej. flechas muy rápidas) partan del último
    const value = typeof next === 'function' ? next(layersRef.current) : next
    layersRef.current = value
    history.set(value)
  }
  const [selection, setSelection] = useState<string[]>([])
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ file: string; width: number; height: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // Dibujo: pluma (clic para cada punto, arrastrar para curvar) o lápiz (a mano alzada)
  const [tool, setTool] = useState<'pluma' | 'lapiz' | null>(null)
  const [draft, setDraft] = useState<PathNode[]>([])
  const drawing = useRef<{ down: boolean; start: [number, number] } | null>(null)
  const [shapeMenu, setShapeMenu] = useState(false)
  const exportRef = useRef<SVGGElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fillInput = useRef<HTMLInputElement>(null)
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
  const SHAPE_SIZE: Partial<Record<ShapeKind, [number, number]>> = { line: [260, 10], arrow: [260, 70], ribbon: [380, 150], laurel: [300, 280], heart: [220, 200], shield: [200, 240] }
  const addShape = (shape: ShapeKind) => {
    const [w, h] = SHAPE_SIZE[shape] ?? [220, 220]
    add({ id: crypto.randomUUID(), type: 'shape', shape, fill: shape === 'laurel' ? '#2f4a3a' : '#c4643a', stroke: '', strokeWidth: 6, w, h, ...center })
    setShapeMenu(false)
  }

  /** Termina el trazo de la pluma o el lápiz y lo convierte en capa (centrada en su caja). */
  const finishPath = (nodes: PathNode[], closed: boolean) => {
    setDraft([])
    drawing.current = null
    if (nodes.length < 2) return
    const b = nodesBox(nodes)
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    add({
      id: crypto.randomUUID(),
      type: 'path',
      nodes: nodes.map((p) => ({ ...p, x: p.x - cx, y: p.y - cy })),
      closed,
      fill: closed ? '#c4643a' : '',
      stroke: closed ? '' : '#1d1d1f',
      strokeWidth: 6,
      x: cx,
      y: cy,
      rotation: 0,
    })
  }
  const svgPoint = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement)
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }
  const drawDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    const p = svgPoint(e)
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sin puntero activo: se dibuja igual
    }
    if (tool === 'lapiz') {
      drawing.current = { down: true, start: p }
      setDraft([{ x: p[0], y: p[1] }])
      return
    }
    // Pluma: cerca del primer punto cierra la forma
    if (draft.length > 2 && Math.hypot(p[0] - draft[0].x, p[1] - draft[0].y) < 10) return finishPath(draft, true)
    drawing.current = { down: true, start: p }
    setDraft([...draft, { x: p[0], y: p[1] }])
  }
  const drawMove = (e: React.PointerEvent) => {
    const d = drawing.current
    if (!d?.down) return
    const p = svgPoint(e)
    if (tool === 'lapiz') setDraft((pts) => [...pts, { x: p[0], y: p[1] }])
    // Pluma: arrastrar desde el punto le da su curva
    else setDraft((pts) => pts.map((n, i) => (i === pts.length - 1 ? { ...n, hx: (p[0] - d.start[0]) / 3, hy: (p[1] - d.start[1]) / 3 } : n)))
  }
  const drawUp = () => {
    const d = drawing.current
    if (!d) return
    d.down = false
    if (tool === 'lapiz') finishPath(smoothNodes(draft.map((n) => [n.x, n.y])), false)
  }
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
    selection.length && setLayers((all) => all.map((l) => (selection.includes(l.id) && !l.locked ? ({ ...l, x: l.x + dx, y: l.y + dy } as ArtLayer) : l)))

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
      } else if (e.key === 'Enter' && tool === 'pluma') {
        finishPath(draft, false)
      } else if (e.key === 'Escape') {
        if (tool) {
          setDraft([])
          setTool(null)
        } else setSelection([])
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
          <div className="shape-menu">
            <button className={shapeMenu ? 'button active' : 'button'} onClick={() => setShapeMenu((v) => !v)} aria-expanded={shapeMenu}>
              + Forma ▾
            </button>
            {shapeMenu && (
              <div className="shape-menu-panel" role="menu">
                {SHAPE_KINDS.map((k) => (
                  <button key={k.id} className="shape-pick" onClick={() => addShape(k.id)} role="menuitem">
                    <svg viewBox="-60 -60 120 120" width="34" height="34" aria-hidden>
                      <path d={shapePath(k.id, ...(k.id === 'line' ? [100, 8] : k.id === 'arrow' ? [100, 40] : k.id === 'ribbon' ? [110, 50] : [90, 90]) as [number, number])} fill="currentColor" />
                    </svg>
                    <span>{k.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={tool === 'pluma' ? 'button active' : 'button'}
            onClick={() => {
              setDraft([])
              setTool(tool === 'pluma' ? null : 'pluma')
            }}
            title="Pluma: clic para cada punto, arrastra para curvar; clic en el primero cierra la forma, Intro la deja abierta"
          >
            ✒ Pluma
          </button>
          <button
            className={tool === 'lapiz' ? 'button active' : 'button'}
            onClick={() => {
              setDraft([])
              setTool(tool === 'lapiz' ? null : 'lapiz')
            }}
            title="Lápiz: dibuja a mano alzada"
          >
            ✎ Lápiz
          </button>
          <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files?.[0])} />
          <input
            ref={fillInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const { width, height } = await imageSize(file)
                const { key } = await api.uploadImage(file)
                update({ fillImage: { file: key, aspect: height / width } })
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          />
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
                    else if (l.type === 'path') Object.assign(patch, { nodes: l.nodes.map((p) => ({ x: p.x * k, y: p.y * k, hx: (p.hx ?? 0) * k, hy: (p.hy ?? 0) * k })) })
                    else Object.assign(patch, { w: l.w * k, h: l.h * k })
                    setLayers((all) => all.map((x) => (x.id === l.id ? ({ ...x, ...patch } as ArtLayer) : x)))
                  }}
                >
                  <ArtLayerView layer={l} />
                </Transformable>
              )
            })}
            {tool && (
              <g>
                <rect x={0} y={0} width={ART_SIZE} height={ART_SIZE} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={drawDown} onPointerMove={drawMove} onPointerUp={drawUp} onDoubleClick={() => tool === 'pluma' && finishPath(draft.slice(0, -1), false)} />
                {draft.length > 0 && (
                  <g pointerEvents="none">
                    <path d={tool === 'lapiz' ? `M${draft.map((n) => `${n.x} ${n.y}`).join('L')}` : nodesPath(draft, false)} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    {tool === 'pluma' &&
                      draft.map((n, i) => (
                        <g key={i}>
                          {(n.hx || n.hy) && <line x1={n.x - (n.hx ?? 0)} y1={n.y - (n.hy ?? 0)} x2={n.x + (n.hx ?? 0)} y2={n.y + (n.hy ?? 0)} stroke="#93c5fd" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
                          <rect x={n.x - 4} y={n.y - 4} width={8} height={8} fill={i === 0 ? '#2563eb' : '#fff'} stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                        </g>
                      ))}
                  </g>
                )}
              </g>
            )}
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
                  <span className="print-thumb">{l.type === 'image' ? <img src={fileUrl(l.file)} alt="" /> : l.type === 'text' ? 'Aa' : l.type === 'path' ? '✎' : '◆'}</span>
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
                <Field label="Texto (Intro para otra línea)">
                  <textarea rows={Math.min(5, current.text.split('\n').length + 1)} value={current.text} onChange={(e) => update({ text: e.target.value })} />
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
                <ChipRow
                  label="Forma"
                  value={warpOf(current)}
                  options={TEXT_WARPS}
                  onChange={(warp) => update({ warp, ...(warp === 'arco' && !current.arc ? { arc: 40 } : {}) })}
                />
                {warpOf(current) === 'arco' && <Range label="Curvatura" value={current.arc} min={-100} max={100} onChange={(arc) => update({ arc })} />}
                {['circulo', 'onda', 'bandera', 'abombado', 'perspectiva'].includes(warpOf(current)) && (
                  <Range
                    label={warpOf(current) === 'circulo' ? 'Hueco abajo' : 'Intensidad'}
                    value={current.warpAmount ?? 50}
                    min={warpOf(current) === 'circulo' ? 0 : -100}
                    max={100}
                    onChange={(warpAmount) => update({ warpAmount })}
                  />
                )}
                {current.text.includes('\n') && (
                  <>
                    <ChipRow
                      label="Alineación"
                      value={current.align ?? 'center'}
                      options={[
                        { id: 'left', label: 'Izquierda' },
                        { id: 'center', label: 'Centro' },
                        { id: 'right', label: 'Derecha' },
                      ]}
                      onChange={(align) => update({ align })}
                    />
                    <Range label="Interlineado" value={Math.round((current.lineHeight ?? 1.15) * 100)} min={70} max={220} onChange={(v) => update({ lineHeight: v / 100 })} />
                  </>
                )}
                <Range label="Espaciado" value={current.letterSpacing} min={-5} max={40} onChange={(letterSpacing) => update({ letterSpacing })} />

                <h3 className="form-sub">Relleno y contornos</h3>
                <div className="field">
                  <span>Relleno con una imagen</span>
                  <div className="print-actions">
                    <button className="button" onClick={() => fillInput.current?.click()}>
                      {current.fillImage ? 'Cambiar imagen' : 'Elegir imagen'}
                    </button>
                    {current.fillImage && (
                      <button className="button" onClick={() => update({ fillImage: null })}>
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
                <ColorField label="Degradado hasta" value={current.gradient ?? ''} optional onChange={(gradient) => update({ gradient: gradient || undefined })} />
                {current.gradient && <Range label="Ángulo del degradado" value={current.gradientAngle ?? 90} min={0} max={360} onChange={(gradientAngle) => update({ gradientAngle })} />}
                <ColorField label="Contorno" value={current.stroke} optional onChange={(stroke) => update({ stroke })} />
                {current.stroke && <Range label="Grosor del contorno" value={current.strokeWidth} min={1} max={20} onChange={(strokeWidth) => update({ strokeWidth })} />}
                <ColorField label="Segundo contorno (por fuera)" value={current.stroke2 ?? ''} optional onChange={(stroke2) => update({ stroke2: stroke2 || undefined })} />
                {current.stroke2 && <Range label="Grosor del segundo contorno" value={current.stroke2Width ?? 6} min={1} max={30} onChange={(stroke2Width) => update({ stroke2Width })} />}

                <h3 className="form-sub">Sombra</h3>
                <ColorField label="Color de la sombra" value={current.shadow ?? ''} optional onChange={(shadow) => update({ shadow: shadow || undefined })} />
                {current.shadow && (
                  <>
                    <Range label="Desplazamiento horizontal" value={current.shadowX ?? 4} min={-40} max={40} onChange={(shadowX) => update({ shadowX })} />
                    <Range label="Desplazamiento vertical" value={current.shadowY ?? 4} min={-40} max={40} onChange={(shadowY) => update({ shadowY })} />
                    <Range label="Desenfoque" value={current.shadowBlur ?? 0} min={0} max={20} onChange={(shadowBlur) => update({ shadowBlur })} />
                  </>
                )}
              </>
            )}
            {current.type === 'shape' && (
              <>
                <div className="field">
                  <span>Forma</span>
                  <select value={current.shape} onChange={(e) => update({ shape: e.target.value as ShapeKind })}>
                    {SHAPE_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                {(current.shape === 'star' || current.shape === 'burst') && (
                  <>
                    <Range label="Puntas" value={current.points ?? (current.shape === 'burst' ? 20 : 5)} min={3} max={40} onChange={(points) => update({ points })} />
                    <Range label="Profundidad de las puntas" value={Math.round((1 - (current.inner ?? (current.shape === 'burst' ? 0.8 : 0.45))) * 100)} min={5} max={80} onChange={(v) => update({ inner: 1 - v / 100 })} />
                  </>
                )}
                {current.shape === 'polygon' && <Range label="Lados" value={current.points ?? 6} min={3} max={12} onChange={(points) => update({ points })} />}
                {current.shape === 'badge' && <Range label="Ondas del borde" value={current.points ?? 16} min={6} max={40} onChange={(points) => update({ points })} />}
                {current.shape === 'laurel' && <Range label="Hojas por rama" value={current.points ?? 9} min={4} max={16} onChange={(points) => update({ points })} />}
                {current.shape === 'rect' && <Range label="Esquinas redondeadas" value={Math.round((current.radius ?? 0) * 100)} min={0} max={100} onChange={(v) => update({ radius: v / 100 })} />}
                <FillFields layer={current} onChange={update} />
                <ColorField label="Contorno" value={current.stroke} optional onChange={(stroke) => update({ stroke })} />
                {current.stroke && <Range label="Grosor del contorno" value={current.strokeWidth} min={1} max={30} onChange={(strokeWidth) => update({ strokeWidth })} />}
                <Range label="Proporción (alto)" value={Math.round((current.h / current.w) * 100)} min={2} max={300} onChange={(v) => update({ h: (current.w * v) / 100 })} />
              </>
            )}
            {current.type === 'path' && (
              <>
                <label className="toggle-row">
                  <span>Forma cerrada (con relleno)</span>
                  <input type="checkbox" checked={current.closed} onChange={(e) => update({ closed: e.target.checked, ...(e.target.checked && !current.fill ? { fill: '#c4643a' } : {}) })} />
                </label>
                {current.closed && <FillFields layer={current} onChange={update} optional />}
                <ColorField label="Trazo" value={current.stroke} optional onChange={(stroke) => update({ stroke })} />
                {current.stroke && <Range label="Grosor del trazo" value={current.strokeWidth} min={1} max={40} onChange={(strokeWidth) => update({ strokeWidth })} />}
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

/** Relleno de formas y trazos: color y, si se quiere, degradado o textura. */
function FillFields({ layer, onChange, optional }: { layer: FillStyle & { fill: string }; onChange: (p: Partial<ArtLayer>) => void; optional?: boolean }) {
  const kind = layer.pattern ?? (layer.fill2 ? 'degradado' : 'liso')
  return (
    <>
      <ColorField label="Relleno" value={layer.fill} optional={optional} onChange={(fill) => onChange({ fill })} />
      <div className="field">
        <span>Tipo de relleno</span>
        <div className="chips">
          {(
            [
              ['liso', 'Liso'],
              ['degradado', 'Degradado'],
              ['rayas', 'Rayas'],
              ['puntos', 'Puntos'],
              ['cuadros', 'Cuadros'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={kind === id ? 'chip active' : 'chip'}
              onClick={() =>
                onChange(
                  id === 'liso'
                    ? { fill2: undefined, pattern: undefined }
                    : id === 'degradado'
                      ? { pattern: undefined, fill2: layer.fill2 ?? '#e3b341' }
                      : { fill2: undefined, pattern: id, patternColor: layer.patternColor ?? '#ffffff' },
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'degradado' && <ColorField label="Hasta" value={layer.fill2 ?? ''} onChange={(fill2) => onChange({ fill2 })} />}
      {layer.pattern && (
        <>
          <ColorField label="Color de la textura" value={layer.patternColor ?? '#ffffff'} onChange={(patternColor) => onChange({ patternColor })} />
          <Range label="Tamaño de la textura" value={layer.patternSize ?? 16} min={4} max={80} onChange={(patternSize) => onChange({ patternSize })} />
        </>
      )}
      {kind !== 'liso' && <Range label="Ángulo" value={layer.fillAngle ?? (layer.pattern ? 0 : 90)} min={0} max={360} onChange={(fillAngle) => onChange({ fillAngle })} />}
    </>
  )
}

/** Fila de opciones (una elegida). */
function ChipRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button key={o.id} className={value === o.id ? 'chip active' : 'chip'} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
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
