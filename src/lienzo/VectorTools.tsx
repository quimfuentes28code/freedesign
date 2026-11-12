/**
 * Herramientas vectoriales del lienzo, como en Illustrator: Pluma (P), Selección directa (A) y Formas (M). Crean y
 * editan capas `vector` (trazados con curvas Bézier, `src/lienzo/vectorPaths.ts`). El lienzo (`Lienzo.tsx`) les pasa
 * los eventos del puntero ya en coordenadas del papel y pinta lo que devuelven: la capa en edición (`viewOf`), la vista
 * de edición con anclas y manejadores (`VectorOverlay`) y el panel de propiedades (`VectorPanel`).
 *
 * - Pluma: clic = punto de esquina; arrastrar = punto suave con manejadores; clic en el primer punto = cerrar; Intro o
 *   Esc = terminar abierto; Retroceso = quitar el último punto.
 * - Selección directa: arrastrar un ancla, un manejador (con Alt se separa del otro) o el trazado entero; doble toque
 *   en un ancla = esquina ↔ suave; Supr = borrar el punto (o el trazado si se ha elegido entero).
 * - Formas: rectángulo, elipse, polígono, estrella y línea; con Mayús, proporcionadas (la línea, cada 45°).
 * Cada acción terminada es un paso del historial del lienzo (deshacer/rehacer de siempre).
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasDoc, VectorLayer, VNode, VPath } from '../shared/designs'
import { clean, curveBounds, dashOf, hitPath, mapPath, pathD, SHAPE_KINDS, shapeNodes, toggleSmooth, translatePath, vectorSvg, type Pt, type ShapeKind } from './vectorPaths'
import { DEFAULT_PENCIL, fitPencil, liveFilter, type OneEuro2D, type PencilSettings } from './vectorPencil'

export type VectorToolId = 'pen' | 'vpencil' | 'direct' | 'vshape'
export const isVectorTool = (t: string): t is VectorToolId => t === 'pen' || t === 'vpencil' || t === 'direct' || t === 'vshape'

interface Style {
  width: number
  dash: boolean
  round: boolean
  fill: string | null
}
const STYLE_KEY = 'freedesign.vector.style'
function loadStyle(): Style {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null')
    if (s && typeof s.width === 'number') return { width: s.width, dash: !!s.dash, round: s.round !== false, fill: typeof s.fill === 'string' ? s.fill : null }
  } catch {
    // Sin almacenamiento
  }
  return { width: 4, dash: false, round: true, fill: null }
}
const PENCIL_KEY = 'freedesign.vector.pencil'
function loadPencil(): PencilSettings {
  try {
    const s = JSON.parse(localStorage.getItem(PENCIL_KEY) ?? 'null')
    if (s && typeof s.level === 'number')
      return { auto: s.auto !== false, level: Math.min(1, Math.max(0, s.level)), precision: ['baja', 'media', 'alta'].includes(s.precision) ? s.precision : 'media', finish: s.finish !== false }
  } catch {
    // Sin almacenamiento
  }
  return DEFAULT_PENCIL
}
type Box = { x0: number; y0: number; x1: number; y1: number }
const cornersOf = (b: Box): Pt[] => [
  [b.x0, b.y0],
  [b.x1, b.y0],
  [b.x1, b.y1],
  [b.x0, b.y1],
]
/** Distancia del asa de girar sobre el recuadro, en px de pantalla. */
const ROTATE_GAP = 28

/** Trazo provisional del lápiz: curvas cuadráticas por los puntos medios (fluido y barato de calcular). */
function liveD(pts: Pt[]): string {
  if (!pts.length) return ''
  const f = (v: number) => Math.round(v * 10) / 10
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  if (pts.length === 1) return d + ` L${f(pts[0][0] + 0.01)} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
  }
  const last = pts[pts.length - 1]
  return d + ` L${f(last[0])} ${f(last[1])}`
}

interface Options {
  doc: CanvasDoc
  change: (next: CanvasDoc) => void
  active: string | null
  setActive: (id: string) => void
  /** Zoom del lienzo (para que la tolerancia y el tamaño de los puntos sean iguales en pantalla). */
  scale: number
  /** Color elegido en el lienzo: el trazo de lo nuevo. */
  color: string
  tool: string
  flash: (text: string) => void
}

type Drag =
  | { kind: 'pen'; layer: VectorLayer; isNew: boolean; path: string; idx: number; start: Pt; moved: boolean }
  | { kind: 'anchor'; layer: VectorLayer; path: string; idx: number; start: Pt; moved: boolean }
  | { kind: 'handle'; layer: VectorLayer; path: string; idx: number; which: 'hi' | 'ho'; start: Pt; moved: boolean }
  | { kind: 'path'; layer: VectorLayer; path: string; start: Pt; moved: boolean }
  | { kind: 'shape'; layer: VectorLayer; isNew: boolean; path: string; start: Pt; moved: boolean }
  | { kind: 'pencil'; layer: VectorLayer; isNew: boolean; path: string; start: Pt; moved: boolean }
  | { kind: 'scale'; layer: VectorLayer; path: string; start: Pt; moved: boolean; corner: number; box: Box }
  | { kind: 'rotate'; layer: VectorLayer; path: string; start: Pt; moved: boolean; center: Pt }

export interface Selection {
  layer: string
  path: string
  /** Punto elegido, o null si es el trazado entero. */
  node: number | null
}

const uid = () => Math.random().toString(36).slice(2, 10)
const near = (a: Pt, x: number, y: number, tol: number) => Math.hypot(a[0] - x, a[1] - y) <= tol

export function useVector(o: Options) {
  const [sel, setSel] = useState<Selection | null>(null)
  /** Capa vectorial mientras se arrastra (se guarda en el documento al soltar, en un solo paso del historial). */
  const [draft, setDraft] = useState<VectorLayer | null>(null)
  /** Trazado que se está dibujando con la pluma. */
  const [pen, setPen] = useState<{ layer: string; path: string } | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [shape, setShape] = useState<ShapeKind>('rect')
  const [style, setStyleState] = useState<Style>(loadStyle)
  const drag = useRef<Drag | null>(null)
  const [pencil, setPencilState] = useState<PencilSettings>(loadPencil)
  const setPencil = (p: Partial<PencilSettings>) =>
    setPencilState((prev) => {
      const next = { ...prev, ...p }
      try {
        localStorage.setItem(PENCIL_KEY, JSON.stringify(next))
      } catch {
        // Sin almacenamiento
      }
      return next
    })
  // Lápiz: los puntos (ya filtrados) se guardan fuera del estado de React y el trazo provisional se pinta en un
  // fotograma (requestAnimationFrame) directamente en su <path>, sin volver a pintar el lienzo en cada movimiento
  const liveRef = useRef<SVGPathElement | null>(null)
  // `pts`: filtrados (lo que se ve mientras se dibuja); `raw`: los reales, para el ajuste final (el filtro va un poco
  // por detrás del puntero y redondearía las esquinas)
  const live = useRef<{ pts: Pt[]; raw: Pt[]; filter: OneEuro2D | null; frame: number } | null>(null)
  const paintLive = () => {
    const l = live.current
    if (!l) return
    l.frame = 0
    liveRef.current?.setAttribute('d', liveD(l.pts))
  }
  useEffect(
    () => () => {
      if (live.current?.frame) cancelAnimationFrame(live.current.frame)
    },
    [],
  )
  const lastTap = useRef<{ key: string; t: number } | null>(null)
  const setStyle = (s: Partial<Style>) =>
    setStyleState((prev) => {
      const next = { ...prev, ...s }
      try {
        localStorage.setItem(STYLE_KEY, JSON.stringify(next))
      } catch {
        // Sin almacenamiento
      }
      return next
    })

  const tol = 9 / o.scale
  const vectorLayers = () => o.doc.layers.filter((l): l is VectorLayer => l.kind === 'vector')
  const layerById = (id: string): VectorLayer | null => (draft?.id === id ? draft : (vectorLayers().find((l) => l.id === id) ?? null))
  const pathIn = (l: VectorLayer | null, id: string) => l?.paths.find((p) => p.id === id) ?? null
  const withPath = (l: VectorLayer, p: VPath): VectorLayer => ({ ...l, paths: l.paths.some((x) => x.id === p.id) ? l.paths.map((x) => (x.id === p.id ? p : x)) : [...l.paths, p] })

  /** Guarda la capa en el documento (nueva: justo encima de la capa elegida). */
  const save = (l: VectorLayer, isNew = false) => {
    const layers = [...o.doc.layers]
    if (isNew || !layers.some((x) => x.id === l.id)) {
      const i = layers.findIndex((x) => x.id === o.active)
      layers.splice(i < 0 ? layers.length : i + 1, 0, l)
    } else layers[layers.findIndex((x) => x.id === l.id)] = l
    o.change({ ...o.doc, layers })
    if (o.active !== l.id) o.setActive(l.id)
    setDraft(null)
  }

  /** Capa donde va lo nuevo: la vectorial elegida o una nueva. */
  const target = (): { layer: VectorLayer; isNew: boolean } => {
    const a = o.doc.layers.find((l) => l.id === o.active)
    if (a?.kind === 'vector' && !a.locked && a.visible) return { layer: a, isNew: false }
    const n = vectorLayers().length + 1
    return { layer: { id: uid(), kind: 'vector', name: `Trazados ${n}`, visible: true, locked: false, opacity: 1, blend: 'normal', paths: [] }, isNew: true }
  }

  const newPath = (nodes: VNode[], closed: boolean): VPath => ({
    id: uid(),
    nodes,
    closed,
    fill: closed ? style.fill : null,
    stroke: o.color,
    width: style.width,
    ...(style.dash ? { dash: true } : {}),
    ...(style.round ? { round: true } : {}),
  })

  /** Termina el trazado de la pluma (si se ha quedado con un solo punto, se quita). */
  const finishPen = () => {
    if (!pen) return
    const l = layerById(pen.layer)
    const p = pathIn(l, pen.path)
    if (l && p && p.nodes.length < 2) save({ ...l, paths: l.paths.filter((x) => x.id !== p.id) })
    else if (l && p) setSel({ layer: l.id, path: p.id, node: null })
    setPen(null)
  }
  // Al cambiar de herramienta se termina lo que se estaba dibujando
  useEffect(() => {
    if (o.tool !== 'pen') finishPen()
    if (!isVectorTool(o.tool)) setSel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.tool])
  // Si deshacer quita el trazado elegido, se suelta
  useEffect(() => {
    if (sel && !pathIn(layerById(sel.layer), sel.path)) setSel(null)
    if (pen && !layerById(pen.layer)) setPen(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.doc])

  // --- Puntero ---
  const down = (p: Pt, _e?: { altKey?: boolean }, tMs?: number) => {
    const [x, y] = p
    if (o.tool === 'vpencil') {
      const t = target()
      const filter = liveFilter(pencil, o.scale)
      const q = filter ? filter.filter(x, y, tMs ?? performance.now()) : p
      live.current = { pts: [q], raw: [p], filter, frame: 0 }
      const el = liveRef.current
      if (el) {
        el.style.transition = ''
        el.style.opacity = ''
      }
      paintLive()
      drag.current = { kind: 'pencil', layer: t.layer, isNew: t.isNew, path: uid(), start: p, moved: false }
      setSel(null)
      return
    }
    if (o.tool === 'pen') {
      const l = pen ? layerById(pen.layer) : null
      const cur = pen ? pathIn(l, pen.path) : null
      if (l && cur) {
        // Clic en el primer punto: cerrar
        if (cur.nodes.length >= 2 && near([cur.nodes[0].x, cur.nodes[0].y], x, y, tol)) {
          save(withPath(l, { ...cur, closed: true, fill: style.fill }))
          setSel({ layer: l.id, path: cur.id, node: null })
          setPen(null)
          return
        }
        const next = withPath(l, { ...cur, nodes: [...cur.nodes, { x, y }] })
        setDraft(next)
        drag.current = { kind: 'pen', layer: next, isNew: false, path: cur.id, idx: cur.nodes.length, start: p, moved: false }
        return
      }
      const t = target()
      const np = newPath([{ x, y }], false)
      const next = withPath(t.layer, np)
      setDraft(next)
      setPen({ layer: next.id, path: np.id })
      setSel(null)
      drag.current = { kind: 'pen', layer: next, isNew: t.isNew, path: np.id, idx: 0, start: p, moved: false }
      return
    }

    if (o.tool === 'vshape') {
      const t = target()
      drag.current = { kind: 'shape', layer: t.layer, isNew: t.isNew, path: uid(), start: p, moved: false }
      setSel(null)
      return
    }

    if (o.tool !== 'direct') return
    // 0. Trazado entero elegido: esquinas del recuadro (escalar) y asa de arriba (girar)
    if (sel && sel.node === null) {
      const l = layerById(sel.layer)
      const sp = pathIn(l, sel.path)
      if (l && sp) {
        const b = curveBounds(sp)
        const ci = cornersOf(b).findIndex((c) => near(c, x, y, tol))
        if (ci >= 0) {
          drag.current = { kind: 'scale', layer: l, path: sp.id, start: p, moved: false, corner: ci, box: b }
          return
        }
        if (near([(b.x0 + b.x1) / 2, b.y0 - ROTATE_GAP / o.scale], x, y, tol * 1.3)) {
          drag.current = { kind: 'rotate', layer: l, path: sp.id, start: p, moved: false, center: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] }
          return
        }
      }
    }
    // 1. Manejadores del punto elegido y de sus vecinos
    if (sel && sel.node !== null) {
      const l = layerById(sel.layer)
      const sp = pathIn(l, sel.path)
      if (l && sp) {
        const n = sp.nodes.length
        for (const i of [sel.node, sel.node - 1, sel.node + 1]) {
          const idx = sp.closed ? (i + n) % n : i
          const node = sp.nodes[idx]
          if (!node) continue
          for (const which of ['hi', 'ho'] as const) {
            const h = node[which]
            if (h && near(h, x, y, tol)) {
              drag.current = { kind: 'handle', layer: l, path: sp.id, idx, which, start: p, moved: false }
              return
            }
          }
        }
      }
    }
    // 2. Anclas y 3. trazados, de la capa de más arriba a la de más abajo
    const layers = vectorLayers().filter((l) => l.visible && !l.locked).reverse()
    for (const l of layers)
      for (const sp of [...l.paths].reverse()) {
        const idx = sp.nodes.findIndex((n) => near([n.x, n.y], x, y, tol))
        if (idx >= 0) {
          const key = `${sp.id}:${idx}`
          const now = performance.now()
          if (lastTap.current?.key === key && now - lastTap.current.t < 380) {
            // Doble toque: esquina ↔ suave
            lastTap.current = null
            save(withPath(l, toggleSmooth(sp, idx)))
            setSel({ layer: l.id, path: sp.id, node: idx })
            return
          }
          lastTap.current = { key, t: now }
          setSel({ layer: l.id, path: sp.id, node: idx })
          if (o.active !== l.id) o.setActive(l.id)
          drag.current = { kind: 'anchor', layer: l, path: sp.id, idx, start: p, moved: false }
          return
        }
      }
    for (const l of layers)
      for (const sp of [...l.paths].reverse())
        if (hitPath(sp, x, y, tol)) {
          setSel({ layer: l.id, path: sp.id, node: null })
          if (o.active !== l.id) o.setActive(l.id)
          drag.current = { kind: 'path', layer: l, path: sp.id, start: p, moved: false }
          return
        }
    setSel(null)
  }

  const move = (p: Pt, e: { altKey?: boolean; shiftKey?: boolean }, tMs?: number) => {
    const d = drag.current
    if (!d) return
    const [x, y] = p
    if (d.kind === 'pencil') {
      const l = live.current
      if (!l) return
      l.pts.push(l.filter ? l.filter.filter(x, y, tMs ?? performance.now()) : p)
      l.raw.push(p)
      d.moved = true
      if (!l.frame) l.frame = requestAnimationFrame(paintLive)
      return
    }
    if (!d.moved && Math.hypot(x - d.start[0], y - d.start[1]) < 3 / o.scale) return
    d.moved = true
    const base = pathIn(d.layer, d.path)
    if (d.kind === 'shape') {
      const s = shapeNodes(shape, d.start, p, !!e.shiftKey)
      setDraft(withPath(d.layer, { ...newPath(s.nodes, s.closed), id: d.path }))
      return
    }
    if (!base) return
    const nodes = [...base.nodes]
    if (d.kind === 'pen') {
      // Arrastrar al poner el punto: manejadores simétricos (punto suave)
      const n = nodes[d.idx]
      nodes[d.idx] = { x: n.x, y: n.y, ho: [x, y], hi: [2 * n.x - x, 2 * n.y - y] }
      setDraft(withPath(d.layer, { ...base, nodes }))
    } else if (d.kind === 'anchor') {
      const dx = x - d.start[0]
      const dy = y - d.start[1]
      const n = nodes[d.idx]
      nodes[d.idx] = clean({ x: n.x + dx, y: n.y + dy, hi: n.hi && [n.hi[0] + dx, n.hi[1] + dy], ho: n.ho && [n.ho[0] + dx, n.ho[1] + dy] })
      setDraft(withPath(d.layer, { ...base, nodes }))
    } else if (d.kind === 'handle') {
      const n = nodes[d.idx]
      const other = d.which === 'hi' ? 'ho' : 'hi'
      const next: VNode = { ...n, [d.which]: [x, y] }
      // El otro manejador sigue alineado (punto suave), salvo con Alt
      const oh = n[other]
      if (oh && !e.altKey) {
        const len = Math.hypot(oh[0] - n.x, oh[1] - n.y)
        const ang = Math.atan2(y - n.y, x - n.x) + Math.PI
        next[other] = [n.x + Math.cos(ang) * len, n.y + Math.sin(ang) * len]
      }
      nodes[d.idx] = clean(next)
      setDraft(withPath(d.layer, { ...base, nodes }))
    } else if (d.kind === 'path') {
      setDraft(withPath(d.layer, translatePath(base, x - d.start[0], y - d.start[1])))
    } else if (d.kind === 'scale') {
      // Escalar desde la esquina contraria (Mayús: proporcionado)
      const cs = cornersOf(d.box)
      const anchor = cs[(d.corner + 2) % 4]
      const from = cs[d.corner]
      let sx = (x - anchor[0]) / (from[0] - anchor[0] || 1)
      let sy = (y - anchor[1]) / (from[1] - anchor[1] || 1)
      if (e.shiftKey) {
        const k = Math.max(Math.abs(sx), Math.abs(sy))
        sx = Math.sign(sx || 1) * k
        sy = Math.sign(sy || 1) * k
      }
      setDraft(withPath(d.layer, mapPath(base, (px, py) => [anchor[0] + (px - anchor[0]) * sx, anchor[1] + (py - anchor[1]) * sy])))
    } else if (d.kind === 'rotate') {
      // Girar alrededor del centro (Mayús: de 15 en 15°)
      const [cx, cy] = d.center
      let a = Math.atan2(y - cy, x - cx) - Math.atan2(d.start[1] - cy, d.start[0] - cx)
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12)
      const c = Math.cos(a)
      const sn = Math.sin(a)
      setDraft(withPath(d.layer, mapPath(base, (px, py) => [cx + (px - cx) * c - (py - cy) * sn, cy + (px - cx) * sn + (py - cy) * c])))
    }
  }

  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'pencil') {
      const l = live.current
      live.current = null
      if (l?.frame) cancelAnimationFrame(l.frame)
      // El ajuste final parte de los puntos reales (esquinas exactas y el trazo acaba donde se soltó); el suavizado lo
      // hace fitPencil por tramos, sin cruzar nunca una esquina
      const fit = fitPencil(l ? l.raw : [d.start], pencil, o.scale)
      save(withPath(d.layer, { ...newPath(fit.nodes, fit.closed), id: d.path }), d.isNew)
      // El provisional se desvanece mientras aparece el definitivo (transición natural)
      const el = liveRef.current
      if (el) {
        el.style.transition = 'opacity 160ms ease-out'
        el.style.opacity = '0'
        window.setTimeout(() => {
          if (live.current) return
          el.setAttribute('d', '')
          el.style.transition = ''
          el.style.opacity = ''
        }, 180)
      }
      return
    }
    if (d.kind === 'shape') {
      if (d.moved && draft) {
        save(draft, d.isNew)
        setSel({ layer: draft.id, path: d.path, node: null })
      } else setDraft(null)
      return
    }
    if (d.kind === 'pen') {
      // El punto se guarda aunque no se haya arrastrado (es un punto de esquina)
      save(draft ?? d.layer, d.isNew)
      return
    }
    if (d.moved && draft) save(draft)
    else setDraft(null)
  }

  /** Teclas propias (devuelve true si la ha usado). */
  const key = (k: string): boolean => {
    if (o.tool === 'pen' && pen) {
      if (k === 'enter' || k === 'escape') {
        finishPen()
        return true
      }
      if (k === 'backspace' || k === 'delete') {
        const l = layerById(pen.layer)
        const p = pathIn(l, pen.path)
        if (l && p) {
          if (p.nodes.length <= 1) {
            save({ ...l, paths: l.paths.filter((x) => x.id !== p.id) })
            setPen(null)
          } else save(withPath(l, { ...p, nodes: p.nodes.slice(0, -1) }))
        }
        return true
      }
    }
    if (sel && (k === 'delete' || k === 'backspace')) {
      removeSelected()
      return true
    }
    if (sel && k === 'escape') {
      setSel(null)
      return true
    }
    return false
  }

  // --- Acciones del panel ---
  const selected = (): { layer: VectorLayer; path: VPath } | null => {
    if (!sel) return null
    const l = layerById(sel.layer)
    const p = pathIn(l, sel.path)
    return l && p ? { layer: l, path: p } : null
  }
  const patchPath = (patch: Partial<VPath>) => {
    const s = selected()
    if (s) save(withPath(s.layer, { ...s.path, ...patch }))
    if (patch.width !== undefined) setStyle({ width: patch.width })
    if (patch.dash !== undefined) setStyle({ dash: patch.dash })
    if (patch.round !== undefined) setStyle({ round: patch.round })
  }
  const removeSelected = () => {
    const s = selected()
    if (!s || !sel) return
    if (sel.node !== null && s.path.nodes.length > 2) {
      const nodes = s.path.nodes.filter((_, i) => i !== sel.node)
      save(withPath(s.layer, { ...s.path, nodes, closed: s.path.closed && nodes.length > 2 }))
      setSel({ ...sel, node: null })
    } else {
      save({ ...s.layer, paths: s.layer.paths.filter((p) => p.id !== s.path.id) })
      setSel(null)
    }
  }
  const duplicate = () => {
    const s = selected()
    if (!s) return
    const copy = { ...translatePath(s.path, 20, 20), id: uid() }
    save({ ...s.layer, paths: [...s.layer.paths, copy] })
    setSel({ layer: s.layer.id, path: copy.id, node: null })
  }
  const flip = (axis: 'x' | 'y') => {
    const s = selected()
    if (!s) return
    const xs = s.path.nodes.map((n) => n.x)
    const ys = s.path.nodes.map((n) => n.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    save(withPath(s.layer, mapPath(s.path, (x, y) => (axis === 'x' ? [2 * cx - x, y] : [x, 2 * cy - y]))))
  }
  const order = (dir: 1 | -1) => {
    const s = selected()
    if (!s) return
    const paths = [...s.layer.paths]
    const i = paths.findIndex((p) => p.id === s.path.id)
    const j = Math.max(0, Math.min(paths.length - 1, i + dir))
    ;[paths[i], paths[j]] = [paths[j], paths[i]]
    save({ ...s.layer, paths })
  }

  /** La capa a pintar: la de edición si es esta. */
  const viewOf = (l: VectorLayer) => (draft?.id === l.id ? draft : l)
  /** Capa nueva que aún no está en el documento (la forma o el primer punto que se están haciendo). */
  const pendingNew = draft && !o.doc.layers.some((l) => l.id === draft.id) ? draft : null

  return {
    sel,
    pen,
    hover,
    setHover,
    shape,
    setShape,
    style,
    setStyle,
    down,
    move,
    up,
    key,
    dragging: () => !!drag.current,
    pencil,
    setPencil,
    liveRef,
    color: o.color,
    /** Descarga las capas vectoriales visibles en SVG (curvas exactas). */
    exportSvg: () => {
      const blob = new Blob([vectorSvg(o.doc)], { type: 'image/svg+xml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'trazados.svg'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    },
    /** Anula lo que se estaba arrastrando (p. ej. al apoyar un segundo dedo para mover el lienzo). */
    cancel: () => {
      drag.current = null
      setDraft(null)
    },
    selected,
    patchPath,
    removeSelected,
    duplicate,
    flip,
    order,
    finishPen,
    viewOf,
    pendingNew,
    layerById,
    tol,
  }
}

export type VectorApi = ReturnType<typeof useVector>

/** Trazados de una capa en SVG (nítidos a cualquier zoom). */
export function VectorSvg({ layer, w, h }: { layer: VectorLayer; w: number; h: number }) {
  return (
    <svg className="lz-vector" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {layer.paths.map((p) =>
        p.nodes.length < 2 ? null : (
          <path
            key={p.id}
            d={pathD(p)}
            fill={p.closed && p.fill ? p.fill : 'none'}
            stroke={p.stroke ?? 'none'}
            strokeWidth={p.width}
            strokeLinecap={p.round ? 'round' : 'butt'}
            strokeLinejoin={p.round ? 'round' : 'miter'}
            strokeDasharray={p.dash ? dashOf(p).join(' ') : undefined}
            opacity={p.opacity ?? 1}
          />
        ),
      )}
    </svg>
  )
}

/** Vista de edición: contorno del trazado, anclas, manejadores y la goma elástica de la pluma. */
export function VectorOverlay({ vec, w, h, scale }: { vec: VectorApi; w: number; h: number; scale: number }) {
  const s = 1 / scale
  const parts: React.ReactNode[] = []
  const box = 7 * s
  const showPath = (l: VectorLayer | null, id: string, node: number | null, editing: boolean) => {
    const p = l?.paths.find((x) => x.id === id)
    if (!p) return
    parts.push(<path key={`o${id}`} d={pathD(p)} fill="none" stroke="#3d8bfd" strokeWidth={1.5 * s} />)
    const n = p.nodes.length
    // Manejadores: los del punto elegido y sus vecinos (al dibujar, los del último)
    const withHandles = new Set<number>()
    const focus = editing ? n - 1 : node
    if (focus !== null && focus >= 0) for (const i of [focus - 1, focus, focus + 1]) withHandles.add(p.closed ? (i + n) % n : i)
    p.nodes.forEach((nd, i) => {
      if (withHandles.has(i))
        for (const hh of [nd.hi, nd.ho])
          if (hh) {
            parts.push(<line key={`l${id}${i}${hh[0]}`} x1={nd.x} y1={nd.y} x2={hh[0]} y2={hh[1]} stroke="#3d8bfd" strokeWidth={s} />)
            parts.push(<circle key={`c${id}${i}${hh[0]}`} cx={hh[0]} cy={hh[1]} r={4 * s} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 * s} />)
          }
      const on = i === node || (editing && i === n - 1)
      parts.push(
        <rect key={`a${id}${i}`} x={nd.x - box / 2} y={nd.y - box / 2} width={box} height={box} fill={on ? '#3d8bfd' : '#fff'} stroke="#3d8bfd" strokeWidth={1.5 * s} />,
      )
    })
    // Trazado entero elegido: recuadro con esquinas para escalar y asa para girar
    if (!editing && node === null) {
      const b = curveBounds(p)
      const top = b.y0 - ROTATE_GAP * s
      parts.push(<rect key="bbox" x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="none" stroke="#3d8bfd" strokeWidth={s} strokeDasharray={`${4 * s} ${3 * s}`} />)
      parts.push(<line key="rotl" x1={(b.x0 + b.x1) / 2} y1={b.y0} x2={(b.x0 + b.x1) / 2} y2={top} stroke="#3d8bfd" strokeWidth={s} />)
      parts.push(<circle key="rot" cx={(b.x0 + b.x1) / 2} cy={top} r={5 * s} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 * s} />)
      cornersOf(b).forEach(([cx, cy], i) => parts.push(<rect key={`bc${i}`} x={cx - box / 2} y={cy - box / 2} width={box} height={box} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 * s} />))
    }
    // Pluma: goma elástica hasta el puntero y aviso de cerrar sobre el primer punto
    if (editing && vec.hover && n) {
      const last = p.nodes[n - 1]
      const c1 = last.ho ?? [last.x, last.y]
      const [hx, hy] = vec.hover
      parts.push(<path key="rubber" d={`M${last.x} ${last.y} C${c1[0]} ${c1[1]} ${hx} ${hy} ${hx} ${hy}`} fill="none" stroke="#3d8bfd" strokeWidth={s} strokeDasharray={`${4 * s} ${3 * s}`} />)
      if (n >= 2 && near([p.nodes[0].x, p.nodes[0].y], hx, hy, vec.tol)) parts.push(<circle key="close" cx={p.nodes[0].x} cy={p.nodes[0].y} r={8 * s} fill="none" stroke="#ff6a2b" strokeWidth={2 * s} />)
    }
  }
  if (vec.pen) showPath(vec.layerById(vec.pen.layer), vec.pen.path, null, true)
  else if (vec.sel) showPath(vec.layerById(vec.sel.layer), vec.sel.path, vec.sel.node, false)
  return (
    <>
      {vec.pendingNew && (
        <div className="lz-layer">
          <VectorSvg layer={vec.pendingNew} w={w} h={h} />
        </div>
      )}
      <svg className="lz-overlay lz-vector-edit" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
        {parts}
        {/* Trazo provisional del lápiz (su «d» lo pone useVector en cada fotograma) */}
        <path ref={vec.liveRef} fill="none" stroke={vec.color} strokeWidth={vec.style.width} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  )
}

const HINTS: Record<VectorToolId, string> = {
  pen: 'Clic: punto · Arrastra: curva · Clic en el primero: cerrar · Intro: terminar · Retroceso: quitar punto',
  direct: 'Arrastra puntos, manejadores (Alt: por separado) o el trazado; con el trazado elegido, esquinas = escalar y asa = girar (Mayús: proporción, 15°) · Doble toque: esquina/curva · Supr: borrar',
  vshape: 'Arrastra para dibujar la forma · Mayús: proporcionada',
  vpencil: 'Dibuja a mano alzada: el trazo se convierte en curvas limpias y editables · Si acabas cerca del principio, se cierra',
}

/** Panel de propiedades del trazado elegido (y el tipo de forma, con la herramienta Formas). */
export function VectorPanel({ vec, tool, color }: { vec: VectorApi; tool: VectorToolId; color: string }) {
  const s = vec.selected()
  const p = s?.path
  return (
    <div className="lz-vbar" onPointerDown={(e) => e.stopPropagation()}>
      {tool === 'vpencil' && (
        <div className="lz-vbar-row">
          <label className="lz-vbar-field" title="Suavizado automático: convierte el trazo en curvas limpias">
            <input type="checkbox" checked={vec.pencil.auto} onChange={(e) => vec.setPencil({ auto: e.target.checked })} />
            Suavizado
          </label>
          <label className="lz-vbar-field" title="Nivel de suavizado: 0 % libre · 25 % ligero · 50 % equilibrado · 75 % muy suave · 100 % máximo">
            <span className="lz-vbar-num">{vec.pencil.auto ? `${Math.round(vec.pencil.level * 100)} %` : 'Libre'}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              list="lz-pencil-steps"
              disabled={!vec.pencil.auto}
              value={Math.round(vec.pencil.level * 100)}
              onChange={(e) => vec.setPencil({ level: Number(e.target.value) / 100 })}
            />
            <datalist id="lz-pencil-steps">
              <option value={0} />
              <option value={25} />
              <option value={50} />
              <option value={75} />
              <option value={100} />
            </datalist>
          </label>
          <span className="lz-vbar-label">Precisión</span>
          {(['baja', 'media', 'alta'] as const).map((pr) => (
            <button
              key={pr}
              className={vec.pencil.precision === pr ? 'lz-chip on' : 'lz-chip'}
              disabled={!vec.pencil.auto}
              onClick={() => vec.setPencil({ precision: pr })}
              title={pr === 'baja' ? 'Prioriza la fluidez' : pr === 'media' ? 'Equilibrio' : 'Conserva los detalles pequeños'}
            >
              {pr === 'baja' ? 'Baja' : pr === 'media' ? 'Media' : 'Alta'}
            </button>
          ))}
          <label className="lz-vbar-field" title="Refinamiento adicional al levantar el lápiz">
            <input type="checkbox" checked={vec.pencil.finish} disabled={!vec.pencil.auto} onChange={(e) => vec.setPencil({ finish: e.target.checked })} />
            Corrección al terminar
          </label>
        </div>
      )}
      {tool === 'vshape' && (
        <div className="lz-vbar-row">
          {SHAPE_KINDS.map((k) => (
            <button key={k.id} className={vec.shape === k.id ? 'lz-chip on' : 'lz-chip'} onClick={() => vec.setShape(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      )}
      {p ? (
        <div className="lz-vbar-row">
          <label className="lz-vbar-field" title="Relleno (solo en trazados cerrados)">
            <input type="checkbox" checked={!!p.fill} disabled={!p.closed} onChange={(e) => vec.patchPath({ fill: e.target.checked ? (p.stroke ?? color) : null })} />
            Relleno
            {p.fill && <input type="color" value={p.fill} onChange={(e) => vec.patchPath({ fill: e.target.value })} />}
          </label>
          <label className="lz-vbar-field" title="Trazo">
            <input type="checkbox" checked={!!p.stroke} onChange={(e) => vec.patchPath({ stroke: e.target.checked ? color : null })} />
            Trazo
            {p.stroke && <input type="color" value={p.stroke} onChange={(e) => vec.patchPath({ stroke: e.target.value })} />}
          </label>
          <label className="lz-vbar-field" title="Grosor del trazo">
            <span className="lz-vbar-num">{p.width < 10 ? p.width.toFixed(1) : Math.round(p.width)} px</span>
            <input type="range" min={0} max={1} step={0.001} value={Math.log(p.width / 0.5) / Math.log(120)} onChange={(e) => vec.patchPath({ width: Math.round(0.5 * 120 ** Number(e.target.value) * 10) / 10 })} />
          </label>
          <button className={p.dash ? 'lz-chip on' : 'lz-chip'} onClick={() => vec.patchPath({ dash: !p.dash || undefined })} title="Trazo discontinuo, como un pespunte">
            Pespunte
          </button>
          <button className={p.round ? 'lz-chip on' : 'lz-chip'} onClick={() => vec.patchPath({ round: !p.round || undefined })} title="Extremos y esquinas redondeados">
            Redondo
          </button>
          <button className="lz-chip" onClick={() => vec.patchPath({ closed: !p.closed, fill: p.closed ? null : p.fill })}>
            {p.closed ? 'Abrir' : 'Cerrar'}
          </button>
          <button className="lz-chip" onClick={() => vec.patchPath({ stroke: color })} title="Pone el color elegido en el lienzo como color del trazo">
            Color elegido
          </button>
          <button className="lz-chip" onClick={() => vec.flip('x')} title="Voltear en horizontal">
            ↔
          </button>
          <button className="lz-chip" onClick={() => vec.flip('y')} title="Voltear en vertical">
            ↕
          </button>
          <button className="lz-chip" onClick={() => vec.order(1)} title="Traer adelante">
            ↑
          </button>
          <button className="lz-chip" onClick={() => vec.order(-1)} title="Enviar atrás">
            ↓
          </button>
          <button className="lz-chip" onClick={vec.duplicate}>
            Duplicar
          </button>
          <button className="lz-chip danger" onClick={vec.removeSelected}>
            {vec.sel?.node !== null && p.nodes.length > 2 ? 'Borrar punto' : 'Borrar'}
          </button>
        </div>
      ) : (
        <div className="lz-vbar-row">
          <label className="lz-vbar-field" title="Grosor de lo que dibujes">
            <span className="lz-vbar-num">{vec.style.width < 10 ? vec.style.width.toFixed(1) : Math.round(vec.style.width)} px</span>
            <input type="range" min={0} max={1} step={0.001} value={Math.log(vec.style.width / 0.5) / Math.log(120)} onChange={(e) => vec.setStyle({ width: Math.round(0.5 * 120 ** Number(e.target.value) * 10) / 10 })} />
          </label>
          <button className={vec.style.dash ? 'lz-chip on' : 'lz-chip'} onClick={() => vec.setStyle({ dash: !vec.style.dash })}>
            Pespunte
          </button>
          <label className="lz-vbar-field" title="Relleno de las formas cerradas">
            <input type="checkbox" checked={!!vec.style.fill} onChange={(e) => vec.setStyle({ fill: e.target.checked ? '#ffffff' : null })} />
            Relleno
            {vec.style.fill && <input type="color" value={vec.style.fill} onChange={(e) => vec.setStyle({ fill: e.target.value })} />}
          </label>
        </div>
      )}
      <div className="lz-vbar-hint">
        <button className="lz-chip" onClick={vec.exportSvg} title="Descarga los trazados vectoriales en SVG, sin pérdida de calidad">
          SVG
        </button>
        <span>{HINTS[tool]}</span>
      </div>
    </div>
  )
}
