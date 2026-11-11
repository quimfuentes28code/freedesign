import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { mockupCanvas } from '../designer/exportFlat'
import { LOOK_ANGLES, LOOK_SCENES, lookPrompt, type LookScene } from '../designer/lookbook'
import { FlatView } from '../designer/FlatView'
import { drawScale } from '../designer/measures'
import { reshapePockets } from '../designer/pocketShape'
import { defaultDesign, getTemplate, NEW_DESIGN_CATALOG } from '../designer/templates'
import type { GarmentTemplate, Options } from '../designer/types'
import { DETAIL_DEFAULTS } from '../pages/designer/DetailsPanel'
import { standardBody, type Body } from '../production/measurements'
import {
  BLEND_MODES,
  DETAIL_KINDS,
  DETAIL_STYLES,
  LONG_DETAILS,
  PULLER_STYLES,
  type BlendMode,
  type CanvasDoc,
  type CanvasLayer,
  type DesignData,
  type Detail,
  type DetailKind,
  type DetailLayer,
  type HardwarePreset,
  type MockupLayer,
  type PaintLayer,
} from '../shared/designs'
import type { Material } from '../shared/library'
import { BRUSHES, paperGrain, Stroke, union, type BrushPreset, type Rect, type Symmetry } from './brushes'
import { ColorPicker } from './ColorPicker'
import { afterSave, compose, detailCanvas, floodMask, garmentMask, grab, onArtLoaded, pieceAt, registerFlush, runtimeFor, uploadDirty, type Runtime } from './engine'
import type { Artwork } from '../shared/artworks'
import { fileUrl as fileOf } from '../shared/library'
import './lienzo.css'

type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'move'
type Panel = 'brushes' | 'layers' | 'color' | 'ajustes' | 'acciones' | 'biblioteca' | 'opciones' | 'ia' | null

interface Settings {
  brush: string
  eraser: string
  color: string
  recent: string[]
  /** Tamaño y opacidad elegidos para cada pincel. */
  sizes: Record<string, number>
  opacities: Record<string, number>
  streamline: Record<string, number>
  symmetry: Symmetry
  grid: boolean
  gridSize: number
  /** Pintar solo dentro de las prendas (mockups). */
  inside: boolean
  /** Bote: pinta la pieza de la prenda que se toca o rellena la zona cerrada de lo pintado. */
  fillMode: 'pieza' | 'zona'
}
const DEFAULTS: Settings = { brush: 'tecnica', eraser: 'aeroduro', color: '#1d1c1a', recent: [], sizes: {}, opacities: {}, streamline: {}, symmetry: 'none', grid: false, gridSize: 50, inside: false, fillMode: 'pieza' }
const KEY = 'fd:lienzo'
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

const uid = () => crypto.randomUUID()

/** Lienzo nuevo: delante y detrás de la prenda en línea, para pintar encima, y una capa de pintura. */
export function defaultDoc(): CanvasDoc {
  return {
    w: 2000,
    h: 1400,
    paper: '#ffffff',
    layers: [
      { id: uid(), kind: 'mockup', name: 'Prenda · Delantero', view: 'front', x: 140, y: 120, w: 820, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' },
      { id: uid(), kind: 'mockup', name: 'Prenda · Espalda', view: 'back', x: 1040, y: 120, w: 820, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' },
      { id: uid(), kind: 'paint', name: 'Capa 1', file: null, visible: true, locked: false, opacity: 1, blend: 'normal' },
    ],
  }
}

interface Props {
  designId: string
  name: string
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  body: Body
  onChange: (doc: CanvasDoc) => void
  /**
   * Cambiar el color de una pieza de la prenda del propio diseño (y, a la vez, el lienzo, si cambia: el mockup pasa a
   * verse a color).
   */
  onPieceColor: (piece: string, color: string, canvas?: CanvasDoc) => void
  onOptions: (patch: Options) => void
  /** Guardar el diseño (el editor sube antes las capas cambiadas). */
  onSave: () => void
  onExit: () => void
  saving: boolean
  dirty: boolean
}

/**
 * Lienzo creativo del Diseñador (como Procreate e Illustrator): mockups de la prenda, capas de pintura con pinceles
 * sensibles a la presión, imágenes, simetría, cuadrícula, cuentagotas, bote y gestos de tableta.
 */
export function Lienzo(props: Props) {
  const { designId, template, data, materials, body, onChange } = props
  const doc = data.canvas ?? fallback(designId)
  const r = runtimeFor(designId, doc)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const [settings, setSettingsState] = useState(loadSettings)
  const setSettings = (patch: Partial<Settings>) =>
    setSettingsState((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Sin almacenamiento: solo mientras la página está abierta
      }
      return next
    })
  const [tool, setTool] = useState<Tool>('brush')
  const [panel, setPanel] = useState<Panel>(null)
  const [active, setActive] = useState<string>(() => [...doc.layers].reverse().find((l) => l.kind === 'paint')?.id ?? doc.layers[doc.layers.length - 1]?.id ?? '')
  const [view, setView] = useState({ x: 0, y: 0, s: 0.4, r: 0 })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const { user } = useAuth()
  // Fornituras propias y gráficos de la cuenta (para la biblioteca y los logos de botones, tiradores y parches)
  const [presets, setPresets] = useState<HardwarePreset[]>([])
  const [artworks, setArtworks] = useState<Artwork[]>([])
  useEffect(() => {
    api.listHardware().then(setPresets).catch(() => {})
    api.listArtworks().then(setArtworks).catch(() => {})
  }, [])
  useEffect(() => onArtLoaded(() => redraw()), [])

  const docRef = useRef(doc)
  docRef.current = doc
  const brush = BRUSHES.find((b) => b.id === (tool === 'eraser' ? settings.eraser : settings.brush)) ?? BRUSHES[0]
  const size = (tool === 'eraser' ? settings.sizes[`e:${brush.id}`] : settings.sizes[brush.id]) ?? (tool === 'eraser' ? brush.size * 1.5 : brush.size)
  const opacity = (tool === 'eraser' ? settings.opacities[`e:${brush.id}`] : settings.opacities[brush.id]) ?? (tool === 'eraser' ? 1 : brush.opacity)
  const streamline = settings.streamline[brush.id] ?? brush.streamline
  const setSize = (v: number) => setSettings({ sizes: { ...settings.sizes, [tool === 'eraser' ? `e:${brush.id}` : brush.id]: v } })
  const setOpacity = (v: number) => setSettings({ opacities: { ...settings.opacities, [tool === 'eraser' ? `e:${brush.id}` : brush.id]: v } })

  /** Cambia el documento (y lo apunta en el historial del lienzo). */
  const change = useCallback(
    (next: CanvasDoc, record = true) => {
      if (record) r.history.push({ kind: 'doc', before: docRef.current, after: next })
      docRef.current = next
      onChange(next)
    },
    [r, onChange],
  )
  /** Avisa de que han cambiado píxeles (el editor marca «cambios sin guardar»). */
  const touch = useCallback(() => {
    const next = { ...docRef.current, rev: (docRef.current.rev ?? 0) + 1 }
    docRef.current = next
    onChange(next)
  }, [onChange])

  // Al abrir: carga las capas guardadas y encaja el lienzo en la pantalla
  const viewport = useRef<HTMLDivElement>(null)
  const fit = useCallback(() => {
    const el = viewport.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const s = Math.min((width - 140) / doc.w, (height - 60) / doc.h)
    setView({ s, r: 0, x: (width - doc.w * s) / 2, y: (height - doc.h * s) / 2 })
  }, [doc.w, doc.h])
  useEffect(() => {
    let alive = true
    r.load(doc).then(() => {
      if (!alive) return
      setLoading(false)
      redraw()
    })
    fit()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])

  // Mockups: el dibujo de la prenda de cada vista (se vuelve a pintar al cambiar el diseño)
  const designKey = useMemo(() => JSON.stringify({ ...data, canvas: undefined }), [data])
  const mockKey = doc.layers
    .filter((l): l is MockupLayer => l.kind === 'mockup')
    .map((l) => JSON.stringify([l.id, l.view, l.style, l.template, l.options, l.pieces]))
    .join('|')
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      for (const l of docRef.current.layers) {
        if (l.kind !== 'mockup') continue
        try {
          const src = mockupSource(l, template, data, body)
          if (!src) continue
          const { canvas, box } = await mockupCanvas(src.t, src.data, materials, src.body, l.view, l.style, 1400)
          if (!alive) return
          if (l.style === 'linea') tintLine(canvas)
          r.mockups.set(l.id, canvas)
          // Sus piezas, para pintarlas con el bote
          r.mockupInfo.set(l.id, { box, shapes: reshapePockets(src.t.draw(l.view, src.data.options, drawScale(src.t, src.data, src.body)), src.data) })
        } catch (e) {
          console.error('No se ha podido pintar el mockup', e)
        }
      }
      if (alive) {
        maskCache.current = null
        redraw()
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designKey, mockKey, template, materials, body, r])

  // Guardado: el editor llama a esto antes de guardar (sube las capas cambiadas)
  useEffect(
    () =>
      registerFlush(designId, async () => {
        if (!r.dirty.size && data.canvas) return null
        const next = await uploadDirty(r, docRef.current)
        docRef.current = next
        return next
      }),
    [designId, r, data.canvas],
  )
  useEffect(() => {
    if (!props.dirty && !props.saving) afterSave(designId)
  }, [props.dirty, props.saving, designId])

  const layer = doc.layers.find((l) => l.id === active) ?? null
  const paintLayer = layer?.kind === 'paint' ? layer : null

  // --- Coordenadas: de la pantalla al lienzo ---
  const toDoc = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect()
    const px = clientX - rect.left - view.x
    const py = clientY - rect.top - view.y
    const c = Math.cos(-view.r)
    const s = Math.sin(-view.r)
    return { x: (px * c - py * s) / view.s, y: (px * s + py * c) / view.s }
  }

  // --- Pintar ---
  const raw = useRef<HTMLCanvasElement | null>(null)
  const preview = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const backup = useRef<HTMLCanvasElement | null>(null)
  const maskCache = useRef<HTMLCanvasElement | null>(null)
  const stroke = useRef<{ s: Stroke; layer: PaintLayer; erase: boolean; masks: HTMLCanvasElement[]; pointer: number; touchStart: number } | null>(null)
  const frameReq = useRef(0)
  const ensure = (ref: { current: HTMLCanvasElement | null }) => {
    if (!ref.current || ref.current.width !== doc.w || ref.current.height !== doc.h) {
      ref.current = document.createElement('canvas')
      ref.current.width = doc.w
      ref.current.height = doc.h
    }
    return ref.current
  }

  /** Repinta la zona `f` del trazo en curso (vista previa o borrado en directo). */
  const renderFrame = (f: Rect) => {
    const st = stroke.current
    if (!st) return
    const w = f.x1 - f.x0
    const h = f.y1 - f.y0
    if (w <= 0 || h <= 0) return
    const src = raw.current!
    const grained = (g: CanvasRenderingContext2D) => {
      if (st.s && st.layer && st.erase !== undefined && brushOf(st).grain > 0) {
        g.globalCompositeOperation = 'destination-out'
        g.globalAlpha = brushOf(st).grain * 0.85
        g.fillStyle = g.createPattern(paperGrain(), 'repeat')!
        g.fillRect(f.x0, f.y0, w, h)
        g.globalAlpha = 1
      }
      for (const m of st.masks) {
        g.globalCompositeOperation = 'destination-in'
        g.drawImage(m, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
      }
      g.globalCompositeOperation = 'source-over'
    }
    if (st.erase) {
      // Borrado en directo: la capa como estaba más lo borrado hasta ahora
      const tmp = ensure(previewTmp)
      const tg = tmp.getContext('2d')!
      tg.clearRect(f.x0, f.y0, w, h)
      tg.drawImage(src, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
      grained(tg)
      const lg = r.layer(st.layer.id).getContext('2d')!
      lg.save()
      lg.clearRect(f.x0, f.y0, w, h)
      lg.drawImage(backup.current!, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
      lg.globalCompositeOperation = 'destination-out'
      lg.globalAlpha = opacityRef.current
      lg.drawImage(tmp, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
      lg.restore()
      return
    }
    const pg = preview.current.getContext('2d')!
    pg.clearRect(f.x0, f.y0, w, h)
    pg.drawImage(src, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
    grained(pg)
  }
  const previewTmp = useRef<HTMLCanvasElement | null>(null)
  const opacityRef = useRef(opacity)
  opacityRef.current = opacity
  const brushRef = useRef(brush)
  brushRef.current = brush
  const brushOf = (_st: unknown) => brushRef.current

  const scheduleFrame = () => {
    if (frameReq.current) return
    frameReq.current = requestAnimationFrame(() => {
      frameReq.current = 0
      const f = stroke.current?.s.takeFrame()
      if (f) renderFrame(f)
    })
  }

  const startStroke = (e: ReactPointerEvent, erase: boolean) => {
    if (!paintLayer) return flash('Elige una capa de pintura para dibujar (en «Capas»)')
    if (paintLayer.locked) return flash('La capa está bloqueada')
    if (!paintLayer.visible) return flash('La capa está oculta')
    const target = ensure(raw)
    target.getContext('2d')!.clearRect(0, 0, doc.w, doc.h)
    preview.current.width = doc.w
    preview.current.height = doc.h
    const lc = r.layer(paintLayer.id)
    const bk = ensure(backup)
    const bg = bk.getContext('2d')!
    bg.clearRect(0, 0, doc.w, doc.h)
    bg.drawImage(lc, 0, 0)
    const masks: HTMLCanvasElement[] = []
    if (paintLayer.alphaLock && !erase) masks.push(bk)
    if (settings.inside && !erase) {
      if (!maskCache.current) maskCache.current = garmentMask(r, doc)
      masks.push(maskCache.current)
    }
    const s = new Stroke(target, {
      brush,
      color: settings.color,
      size,
      opacity,
      streamline,
      symmetry: settings.symmetry,
      axis: { x: doc.w / 2, y: doc.h / 2 },
    })
    stroke.current = { s, layer: paintLayer, erase, masks, pointer: e.pointerId, touchStart: e.pointerType === 'touch' ? performance.now() : 0 }
    const p = toDoc(e.clientX, e.clientY)
    s.add(p.x, p.y, pressureOf(e))
    scheduleFrame()
    redraw()
  }
  const moveStroke = (e: ReactPointerEvent) => {
    const st = stroke.current
    if (!st || e.pointerId !== st.pointer) return
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toDoc(ev.clientX, ev.clientY)
      st.s.add(p.x, p.y, pressureOf(ev))
    }
    scheduleFrame()
  }
  const endStroke = (e: ReactPointerEvent | null, cancel = false) => {
    const st = stroke.current
    if (!st) return
    if (e && e.pointerId !== st.pointer) return
    if (e && !cancel) {
      const p = toDoc(e.clientX, e.clientY)
      st.s.finish(p.x, p.y, pressureOf(e))
    }
    cancelAnimationFrame(frameReq.current)
    frameReq.current = 0
    const rect = st.s.dirty
    const lc = r.layer(st.layer.id)
    if (rect && !cancel) {
      renderFrame(rect)
      const before = grab(backup.current!, rect)
      if (!st.erase) {
        const lg = lc.getContext('2d')!
        lg.save()
        lg.globalAlpha = opacityRef.current
        lg.drawImage(preview.current, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0)
        lg.restore()
      }
      r.history.push({ kind: 'pixels', layer: st.layer.id, rect, before, after: grab(lc, rect) })
      r.dirty.add(st.layer.id)
      touch()
      if (!st.erase) remember(settings.color)
    } else if (rect) {
      // Cancelado (al poner el segundo dedo para mover el lienzo): la capa vuelve a como estaba
      lc.getContext('2d')!.drawImage(backup.current!, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0)
    }
    preview.current.getContext('2d')!.clearRect(0, 0, doc.w, doc.h)
    stroke.current = null
    redraw()
  }
  const remember = (c: string) => {
    if (settings.recent[0] === c) return
    setSettings({ recent: [c, ...settings.recent.filter((x) => x !== c)].slice(0, 14) })
  }

  // --- Cuentagotas, bote y mover ---
  const pick = (x: number, y: number) => {
    const c = compose(r, doc)
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    const hex = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    setSettings({ color: hex })
  }
  const fill = (x: number, y: number) => {
    if (settings.fillMode === 'pieza') {
      const hit = pieceAt(r, doc, x, y)
      if (!hit) return flash('Toca una pieza de una prenda (o cambia el bote a «Zona pintada»)')
      remember(settings.color)
      // En línea no se ven los colores: la prenda pasa a verse a color (lo que no se ha pintado sigue en gris claro)
      const toColor = hit.layer.style === 'linea'
      if (!hit.layer.template) {
        // (todas las vistas de la prenda del diseño a la vez: delante, espalda…)
        const next = toColor ? { ...doc, layers: doc.layers.map((l) => (l.kind === 'mockup' && !l.template ? ({ ...l, style: 'color' } as CanvasLayer) : l)) } : undefined
        if (next) {
          r.history.push({ kind: 'doc', before: docRef.current, after: next })
          docRef.current = next
        }
        return props.onPieceColor(hit.piece, settings.color, next)
      }
      return patch(hit.layer.id, { ...(toColor ? { style: 'color' } : {}), pieces: { ...hit.layer.pieces, [hit.piece]: { color: settings.color } } })
    }
    if (!paintLayer || paintLayer.locked) return flash('Elige una capa de pintura sin bloquear')
    const mask = floodMask(compose(r, doc), x, y)
    if (!mask) return
    const lc = r.layer(paintLayer.id)
    const all = { x0: 0, y0: 0, x1: doc.w, y1: doc.h }
    const before = grab(lc, all)
    const tmp = document.createElement('canvas')
    tmp.width = doc.w
    tmp.height = doc.h
    const g = tmp.getContext('2d')!
    // La zona, un poco más grande (tapa el borde antialias de la línea)
    g.filter = 'blur(1px)'
    g.drawImage(mask, 0, 0)
    g.filter = 'none'
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = settings.color
    g.fillRect(0, 0, doc.w, doc.h)
    if (paintLayer.alphaLock) {
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(lc, 0, 0)
    }
    if (settings.inside) {
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(garmentMask(r, doc), 0, 0)
    }
    const lg = lc.getContext('2d')!
    // El bote rellena siempre opaco (como en Procreate), sin la opacidad del pincel
    lg.globalAlpha = 1
    lg.drawImage(tmp, 0, 0)
    lg.globalAlpha = 1
    r.history.push({ kind: 'pixels', layer: paintLayer.id, rect: all, before, after: grab(lc, all) })
    r.dirty.add(paintLayer.id)
    remember(settings.color)
    touch()
    redraw()
  }
  const moving = useRef<{ x: number; y: number; layer: CanvasLayer; dx: number; dy: number; pointer: number } | null>(null)
  const [moveOffset, setMoveOffset] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const endMove = () => {
    const m = moving.current
    moving.current = null
    setMoveOffset(null)
    if (!m || (!m.dx && !m.dy)) return
    const l = m.layer
    if (l.kind === 'paint') {
      const lc = r.layer(l.id)
      const all = { x0: 0, y0: 0, x1: doc.w, y1: doc.h }
      const before = grab(lc, all)
      const copy = document.createElement('canvas')
      copy.width = doc.w
      copy.height = doc.h
      copy.getContext('2d')!.drawImage(lc, 0, 0)
      const g = lc.getContext('2d')!
      g.clearRect(0, 0, doc.w, doc.h)
      g.drawImage(copy, Math.round(m.dx), Math.round(m.dy))
      r.history.push({ kind: 'pixels', layer: l.id, rect: all, before, after: grab(lc, all) })
      r.dirty.add(l.id)
      touch()
    } else {
      change({ ...doc, layers: doc.layers.map((x) => (x.id === l.id ? ({ ...x, x: Math.round(l.x + m.dx), y: Math.round(l.y + m.dy) } as CanvasLayer) : x)) })
      maskCache.current = null
    }
  }

  // --- Gestos: dedos para mover, girar y acercar; dos dedos tocan = deshacer, tres = rehacer ---
  const pointers = useRef(new Map<number, { x: number; y: number; type: string; t: number; sx: number; sy: number }>())
  const gesture = useRef<{ view: typeof view; mid: { x: number; y: number }; dist: number; ang: number; moved: boolean; count: number; t: number } | null>(null)
  const penSeen = useRef(false)
  const panning = useRef<{ x: number; y: number; view: typeof view } | null>(null)
  const space = useRef(false)

  const gestureState = () => {
    const pts = [...pointers.current.values()].filter((p) => p.type === 'touch')
    const [a, b] = pts
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    return { mid, dist: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (loading) return
    setPanel(null)
    const el = viewport.current!
    el.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, t: performance.now(), sx: e.clientX, sy: e.clientY })
    if (e.pointerType === 'pen') penSeen.current = true
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch')
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // Segundo dedo: si el primero empezó a pintar hace muy poco, se cancela (era un gesto)
      if (stroke.current && stroke.current.touchStart && performance.now() - stroke.current.touchStart < 300) endStroke(null, true)
      const g = gestureState()
      gesture.current = { view, mid: g.mid, dist: g.dist, ang: g.ang, moved: false, count: touches.length, t: performance.now() }
      return
    }
    // Mover el lienzo: botón central, espacio + arrastrar, o el dedo cuando se dibuja con lápiz
    if (e.button === 1 || space.current || (e.pointerType === 'touch' && penSeen.current)) {
      panning.current = { x: e.clientX, y: e.clientY, view }
      return
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const p = toDoc(e.clientX, e.clientY)
    if (tool === 'brush' || tool === 'eraser') startStroke(e, tool === 'eraser')
    else if (tool === 'picker') pick(p.x, p.y)
    else if (tool === 'fill') fill(p.x, p.y)
    else if (tool === 'move' && layer && !layer.locked) moving.current = { x: p.x, y: p.y, layer, dx: 0, dy: 0, pointer: e.pointerId }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const pt = pointers.current.get(e.pointerId)
    if (pt) {
      pt.x = e.clientX
      pt.y = e.clientY
    }
    const g = gesture.current
    if (g && pointers.current.size >= 2 && e.pointerType === 'touch') {
      const now = gestureState()
      const k = now.dist / Math.max(1, g.dist)
      const rot = now.ang - g.ang
      if (Math.abs(k - 1) > 0.02 || Math.abs(rot) > 0.03 || Math.hypot(now.mid.x - g.mid.x, now.mid.y - g.mid.y) > 6) g.moved = true
      // Se acerca y gira alrededor del punto medio de los dedos, y se mueve con él
      const rect = viewport.current!.getBoundingClientRect()
      const mx = g.mid.x - rect.left
      const my = g.mid.y - rect.top
      const s = Math.min(8, Math.max(0.05, g.view.s * k))
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      const ox = g.view.x - mx
      const oy = g.view.y - my
      const f = s / g.view.s
      setView({ s, r: g.view.r + rot, x: mx + (ox * cos - oy * sin) * f + (now.mid.x - g.mid.x), y: my + (ox * sin + oy * cos) * f + (now.mid.y - g.mid.y) })
      return
    }
    if (panning.current) {
      const p = panning.current
      setView({ ...p.view, x: p.view.x + e.clientX - p.x, y: p.view.y + e.clientY - p.y })
      return
    }
    if (stroke.current) return moveStroke(e)
    const m = moving.current
    if (m && e.pointerId === m.pointer) {
      const p = toDoc(e.clientX, e.clientY)
      m.dx = p.x - m.x
      m.dy = p.y - m.y
      setMoveOffset({ id: m.layer.id, dx: m.dx, dy: m.dy })
    }
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (g) {
      if (pointers.current.size === 0) {
        // Toque rápido con varios dedos sin moverlos: deshacer (2) o rehacer (3)
        if (!g.moved && performance.now() - g.t < 350) {
          if (g.count === 2) undo()
          if (g.count >= 3) redo()
        }
        gesture.current = null
      } else if (g.count < pointers.current.size + 1) g.count = pointers.current.size + 1
      return
    }
    if (panning.current) {
      panning.current = null
      return
    }
    if (stroke.current) return endStroke(e)
    if (moving.current) endMove()
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = viewport.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      // Rueda (o pellizco del trackpad): acercar alrededor del puntero
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      const s = Math.min(8, Math.max(0.05, view.s * k))
      const f = s / view.s
      setView({ ...view, s, x: mx + (view.x - mx) * f, y: my + (view.y - my) * f })
    } else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY })
  }

  // --- Deshacer / rehacer ---
  const undo = () => {
    const d = r.history.undo(r)
    if (d) change(d, false)
    else touch()
    maskCache.current = null
    redraw()
  }
  const redo = () => {
    const d = r.history.redo(r)
    if (d) change(d, false)
    else touch()
    maskCache.current = null
    redraw()
  }

  // Atajos de teclado (el lienzo se queda con Ctrl+Z; el resto del editor no lo recibe)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (typing) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        e.stopImmediatePropagation()
        redo()
      } else if (mod && k === 's') {
        e.preventDefault()
        e.stopImmediatePropagation()
        props.onSave()
      } else if (!mod) {
        if (k === ' ') {
          space.current = true
          e.preventDefault()
        } else if (k === 'b') setTool('brush')
        else if (k === 'e') setTool('eraser')
        else if (k === 'i') setTool('picker')
        else if (k === 'g') setTool('fill')
        else if (k === 'v') setTool('move')
        else if (k === '0') fit()
        else if (k === '[') setSize(Math.max(1, Math.round(size / 1.2)))
        else if (k === ']') setSize(Math.min(500, Math.round(size * 1.2 + 1)))
        else if (k === 'escape') setPanel(null)
        else if (k === 'delete' || k === 'backspace') {
          // (en el lienzo no borra lo seleccionado del dibujo técnico)
        } else return
        e.stopImmediatePropagation()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
  })

  // Pegar una imagen (Ctrl+V): se sube y queda como capa de imagen en el centro
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      addImage(file)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  })

  const flash = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 2500)
  }

  // --- Capas ---
  const insertAbove = (l: CanvasLayer) => {
    const i = doc.layers.findIndex((x) => x.id === active)
    const layers = [...doc.layers]
    layers.splice(i < 0 ? layers.length : i + 1, 0, l)
    change({ ...doc, layers })
    setActive(l.id)
  }
  const addPaint = () => {
    const n = doc.layers.filter((l) => l.kind === 'paint').length + 1
    insertAbove({ id: uid(), kind: 'paint', name: `Capa ${n}`, file: null, visible: true, locked: false, opacity: 1, blend: 'normal' })
  }
  const addMockup = (view: MockupLayer['view']) => {
    const label = view === 'front' ? 'Delantero' : view === 'back' ? 'Espalda' : 'Lateral'
    insertAbove({ id: uid(), kind: 'mockup', name: `Prenda · ${label}`, view, x: doc.w / 2 - 400, y: 120, w: 800, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' })
  }
  /** Prenda del catálogo como mockup nuevo, centrada en (x, y). */
  const addGarment = (entryId: string, x: number, y: number) => {
    const e = NEW_DESIGN_CATALOG.find((c) => c.id === entryId)
    if (!e) return
    const w = e.template.family === 'head' ? 420 : 620
    const opts = { ...defaultDesign(e.template, e.options).options }
    insertAbove({ id: uid(), kind: 'mockup', name: e.name, view: 'front', x: x - w / 2, y: y - w * 0.6, w, style: 'linea', template: e.template.id, options: opts, pieces: {}, visible: true, locked: false, opacity: 1, blend: 'normal' })
    setTool('move')
  }
  /** Fornitura nueva (de la biblioteca o una propia), centrada en (x, y). Su ancho en el lienzo sale de su tamaño real. */
  const addDetail = (from: Detail, label: string, x: number, y: number) => {
    const detail = { ...from, id: uid(), view: 'front' as const, x: 0, y: 0 }
    const base = detail
    // 1 unidad del dibujo = 0,5 cm; en el lienzo, unos 8 px por cm (una prenda ocupa ~600 px)
    const w = Math.max(20, base.w * 4)
    const name = label || (DETAIL_KINDS.find((k) => k.id === detail.kind)?.label ?? 'Fornitura')
    insertAbove({ id: uid(), kind: 'detail', name, detail, x, y, w, rotation: base.rotation, visible: true, locked: false, opacity: 1, blend: 'normal' })
    setTool('move')
  }
  const center = () => {
    const rect = viewport.current!.getBoundingClientRect()
    return toDoc(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
  /** Lo que se arrastra desde la biblioteca (sigue al dedo; al soltar sobre el lienzo, se coloca ahí). */
  const [carry, setCarry] = useState<{ item: LibraryItem; x: number; y: number; x0: number; y0: number; moved: boolean } | null>(null)
  const dropItem = (item: LibraryItem, clientX: number | null, clientY: number | null) => {
    const rect = viewport.current!.getBoundingClientRect()
    const inside = clientX !== null && clientY !== null && clientX > rect.left && clientX < rect.right && clientY > rect.top && clientY < rect.bottom
    const p = inside ? toDoc(clientX!, clientY!) : center()
    if (item.kind === 'garment') addGarment(item.id, p.x, p.y)
    else addDetail(item.detail, item.label, p.x, p.y)
  }
  useEffect(() => {
    if (!carry) return
    const move = (e: PointerEvent) => setCarry((c) => (c ? { ...c, x: e.clientX, y: e.clientY, moved: c.moved || Math.hypot(e.clientX - c.x, e.clientY - c.y) > 6 } : c))
    const up = (e: PointerEvent) => {
      const c = carry
      setCarry(null)
      // Arrastrado si se ha soltado lejos de donde empezó (aunque el movimiento haya sido muy rápido)
      c.moved = c.moved || Math.hypot(e.clientX - c.x0, e.clientY - c.y0) > 12
      // Sin arrastrar (un toque): al centro de la pantalla
      dropItem(c.item, c.moved ? e.clientX : null, c.moved ? e.clientY : null)
      if (c.moved) setPanel(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carry?.item])

  const addImage = async (file: File) => {
    flash('Subiendo imagen…')
    try {
      const { key } = await api.uploadImage(file)
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = URL.createObjectURL(file)
      })
      const w = Math.min(doc.w * 0.5, img.naturalWidth)
      const aspect = img.naturalHeight / img.naturalWidth
      const { loadImage } = await import('./engine')
      const { fileUrl } = await import('../shared/library')
      const loaded = await loadImage(fileUrl(key))
      if (loaded) r.images.set(key, loaded)
      insertAbove({ id: uid(), kind: 'image', name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imagen', file: key, aspect, x: (doc.w - w) / 2, y: (doc.h - w * aspect) / 2, w, rotation: 0, visible: true, locked: false, opacity: 1, blend: 'normal' })
      setTool('move')
      flash('Imagen añadida: muévela con la herramienta Mover')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se ha podido subir la imagen')
    }
  }
  const patch = (id: string, p: Partial<CanvasLayer>) => change({ ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...p } as CanvasLayer) : l)) })
  const remove = (id: string) => {
    const layers = doc.layers.filter((l) => l.id !== id)
    change({ ...doc, layers })
    if (active === id) setActive(layers[layers.length - 1]?.id ?? '')
  }
  const duplicate = (l: CanvasLayer) => {
    const copy = { ...l, id: uid(), name: `${l.name} copia` } as CanvasLayer
    if (l.kind === 'paint') {
      r.layer(copy.id).getContext('2d')!.drawImage(r.layer(l.id), 0, 0)
      r.dirty.add(copy.id)
      ;(copy as PaintLayer).file = null
    }
    if (l.kind === 'mockup') {
      const m = r.mockups.get(l.id)
      if (m) r.mockups.set(copy.id, m)
    }
    insertAbove(copy)
  }
  const reorder = (id: string, dir: 1 | -1) => {
    const i = doc.layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= doc.layers.length) return
    const layers = [...doc.layers]
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    change({ ...doc, layers })
  }
  const mergeDown = (l: CanvasLayer) => {
    const i = doc.layers.findIndex((x) => x.id === l.id)
    const below = doc.layers[i - 1]
    if (l.kind !== 'paint' || below?.kind !== 'paint') return flash('Solo se combinan dos capas de pintura')
    const lc = r.layer(below.id)
    const all = { x0: 0, y0: 0, x1: doc.w, y1: doc.h }
    const before = grab(lc, all)
    const g = lc.getContext('2d')!
    g.save()
    g.globalAlpha = l.opacity
    g.globalCompositeOperation = (l.blend === 'normal' ? 'source-over' : l.blend) as GlobalCompositeOperation
    g.drawImage(r.layer(l.id), 0, 0)
    g.restore()
    r.history.push({ kind: 'pixels', layer: below.id, rect: all, before, after: grab(lc, all) })
    r.dirty.add(below.id)
    remove(l.id)
    setActive(below.id)
  }
  const clearLayer = (l: PaintLayer) => {
    const lc = r.layer(l.id)
    const all = { x0: 0, y0: 0, x1: doc.w, y1: doc.h }
    const before = grab(lc, all)
    lc.getContext('2d')!.clearRect(0, 0, doc.w, doc.h)
    r.history.push({ kind: 'pixels', layer: l.id, rect: all, before, after: grab(lc, all) })
    r.dirty.add(l.id)
    touch()
    redraw()
  }
  const exportPng = async () => {
    const c = compose(r, doc)
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${props.name || 'diseño'}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // --- Pintado de las capas en el DOM (cada capa un elemento, con su opacidad y modo de fusión) ---
  const mount = (el: HTMLDivElement | null, c: HTMLCanvasElement | undefined) => {
    if (!el || !c) return
    if (el.firstChild !== c) {
      el.replaceChildren(c)
      c.className = 'lz-layer-canvas'
    }
  }
  const mountPreview = (el: HTMLDivElement | null) => {
    if (!el) return
    if (el.firstChild !== preview.current) {
      el.replaceChildren(preview.current)
      preview.current.className = 'lz-layer-canvas'
    }
  }

  const brand = (user?.brandColors ?? []).map((c) => c.hex)
  const transform = `translate(${view.x}px, ${view.y}px) rotate(${view.r}rad) scale(${view.s})`
  const cursor = tool === 'move' ? 'move' : tool === 'picker' || tool === 'fill' ? 'crosshair' : 'none'
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  // A pantalla completa, fuera del editor (sus paneles tienen transformaciones que encerrarían el lienzo)
  return createPortal(
    <div className="lienzo">
      <header className="lz-top">
        <div className="lz-left">
          <button className="lz-btn" onClick={props.onExit} title="Volver al diseño técnico">
            ← Diseño
          </button>
          <button className={panel === 'acciones' ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === 'acciones' ? null : 'acciones')} title="Acciones: añadir, exportar">
            <Icon d="M10 3.5l1.6 3.8 4 .4-3 2.7.9 4-3.5-2.1-3.5 2.1.9-4-3-2.7 4-.4z" />
          </button>
          <button className={panel === 'ajustes' ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === 'ajustes' ? null : 'ajustes')} title="Guías: simetría, cuadrícula, estabilizador">
            <Icon d="M10 2.5v15M2.5 10h15M5 5l10 10" />
          </button>
          <button className={panel === 'biblioteca' ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === 'biblioteca' ? null : 'biblioteca')} title="Biblioteca: prendas y fornituras para arrastrar al lienzo">
            <Icon d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM13.5 11v5M11 13.5h5" />
          </button>
          <button className={panel === 'ia' ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === 'ia' ? null : 'ia')} title="Imagen con IA: texto preparado para Gemini o ChatGPT">
            <Icon d="M10 2.5l1.4 3.6 3.6 1.4-3.6 1.4L10 12.5 8.6 8.9 5 7.5l3.6-1.4zM15 12l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 13l.6 1.4 1.4.6-1.4.6L5 17l-.6-1.4L3 15l1.4-.6z" />
          </button>
          <button className={tool === 'move' ? 'lz-icon on' : 'lz-icon'} onClick={() => setTool('move')} title="Mover la capa (V)">
            <Icon d="M10 2.5v15M2.5 10h15M10 2.5l-2.5 2.5M10 2.5l2.5 2.5M10 17.5l-2.5-2.5M10 17.5l2.5-2.5M2.5 10l2.5-2.5M2.5 10l2.5 2.5M17.5 10l-2.5-2.5M17.5 10l-2.5 2.5" />
          </button>
          <span className="lz-title">{props.name}</span>
        </div>
        <div className="lz-right">
          <span className="lz-save">{props.saving ? 'Guardando…' : props.dirty ? 'Sin guardar' : 'Guardado'}</span>
          <button className="lz-btn primary" onClick={props.onSave} disabled={!props.dirty || props.saving} title="Guardar (Ctrl+S)">
            Guardar
          </button>
          <button className={tool === 'brush' ? 'lz-icon on' : 'lz-icon'} onClick={() => (tool === 'brush' ? setPanel(panel === 'brushes' ? null : 'brushes') : setTool('brush'))} title="Pincel (B) — toca otra vez para elegir pincel">
            <Icon d="M14.5 3.5l2 2-8 8-3 1 1-3zM4 16.5c1.5 0 2.5-1 2.5-2.5" />
          </button>
          <button className={tool === 'eraser' ? 'lz-icon on' : 'lz-icon'} onClick={() => (tool === 'eraser' ? setPanel(panel === 'brushes' ? null : 'brushes') : setTool('eraser'))} title="Borrador (E) — toca otra vez para elegir su pincel">
            <Icon d="M7 16.5h9M3.5 12.5l7-7 5 5-6 6H7z" />
          </button>
          <button className={tool === 'picker' ? 'lz-icon on' : 'lz-icon'} onClick={() => setTool('picker')} title="Cuentagotas (I)">
            <Icon d="M13 3.5l3.5 3.5-2 2-3.5-3.5zM11 5.5l-7 7v3h3l7-7" />
          </button>
          <button className={tool === 'fill' ? 'lz-icon on' : 'lz-icon'} onClick={() => setTool('fill')} title="Bote de pintura: rellena la zona cerrada (G)">
            <Icon d="M4 9.5l5.5-5.5 6 6-5.5 5.5zM16.5 12.5c0 1.5-1 2.5-1 2.5s-1-1-1-2.5" />
          </button>
          <button className={panel === 'layers' ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === 'layers' ? null : 'layers')} title="Capas">
            <Icon d="M10 3l7 3.5-7 3.5-7-3.5zM3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5" />
          </button>
          <button className="lz-color-btn" style={{ background: settings.color }} onClick={() => setPanel(panel === 'color' ? null : 'color')} title="Color" aria-label="Color" />
        </div>
      </header>

      {/* Columna de la izquierda: tamaño, opacidad, deshacer */}
      <aside className="lz-side">
        <VSlider value={Math.log(size) / Math.log(500)} onChange={(v) => setSize(Math.max(1, Math.round(500 ** v)))} title={`Tamaño: ${Math.round(size)} px`} />
        <span className="lz-side-val">{Math.round(size)}</span>
        <VSlider value={opacity} onChange={(v) => setOpacity(Math.max(0.02, Math.round(v * 100) / 100))} title={`Opacidad: ${Math.round(opacity * 100)} %`} />
        <span className="lz-side-val">{Math.round(opacity * 100)}%</span>
        <button className="lz-icon" onClick={undo} disabled={!r.history.canUndo()} title="Deshacer (Ctrl+Z o toque con dos dedos)">
          <Icon d="M7 6.5L3.5 10 7 13.5M3.5 10H12a4.5 4.5 0 010 9h-2" />
        </button>
        <button className="lz-icon" onClick={redo} disabled={!r.history.canRedo()} title="Rehacer (Ctrl+Mayús+Z o toque con tres dedos)">
          <Icon d="M13 6.5l3.5 3.5-3.5 3.5M16.5 10H8a4.5 4.5 0 000 9h2" />
        </button>
      </aside>

      <div
        ref={viewport}
        className="lz-viewport"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onPointerMove(e)
          if (e.pointerType !== 'touch') setHover({ x: e.clientX, y: e.clientY })
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId)
          gesture.current = null
          panning.current = null
          endStroke(null, true)
        }}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="lz-paper" style={{ width: doc.w, height: doc.h, background: doc.paper, transform }}>
          {doc.layers.map((l) => {
            if (!l.visible) return null
            const off = moveOffset?.id === l.id ? moveOffset : null
            const style = { opacity: l.opacity, mixBlendMode: l.blend as React.CSSProperties['mixBlendMode'] }
            if (l.kind === 'paint')
              return (
                <div key={l.id} className="lz-layer" style={{ ...style, transform: off ? `translate(${off.dx}px, ${off.dy}px)` : undefined }}>
                  <div className="lz-fill" ref={(el) => mount(el, r.layer(l.id))} />
                  {stroke.current?.layer.id === l.id && !stroke.current.erase && <div className="lz-fill" style={{ opacity }} ref={mountPreview} />}
                </div>
              )
            if (l.kind === 'mockup') {
              const m = r.mockups.get(l.id)
              return (
                <div
                  key={l.id}
                  className={l.id === active && tool === 'move' ? 'lz-item selected' : 'lz-item'}
                  style={{ ...style, left: l.x + (off?.dx ?? 0), top: l.y + (off?.dy ?? 0), width: l.w, height: m ? (l.w * m.height) / m.width : l.w * 1.2 }}
                  ref={(el) => mount(el, m)}
                />
              )
            }
            if (l.kind === 'detail') {
              const c = detailCanvas(r, l)
              const h = (l.w * c.height) / c.width
              return (
                <div
                  key={l.id + c.width + c.height}
                  className={l.id === active && tool === 'move' ? 'lz-item selected' : 'lz-item'}
                  style={{ ...style, left: l.x - l.w / 2 + (off?.dx ?? 0), top: l.y - h / 2 + (off?.dy ?? 0), width: l.w, height: h, transform: `rotate(${l.rotation}deg)` }}
                  ref={(el) => mount(el, c)}
                />
              )
            }
            const img = r.images.get(l.file)
            const h = l.w * l.aspect
            return (
              <div
                key={l.id}
                className={l.id === active && tool === 'move' ? 'lz-item selected' : 'lz-item'}
                style={{ ...style, left: l.x + (off?.dx ?? 0), top: l.y + (off?.dy ?? 0), width: l.w, height: h, transform: `rotate(${l.rotation}deg)` }}
              >
                {img && <img src={img.src} alt="" draggable={false} />}
              </div>
            )
          })}
          {settings.grid && <div className="lz-grid" style={{ backgroundSize: `${settings.gridSize}px ${settings.gridSize}px` }} />}
          {settings.symmetry !== 'none' && (
            <>
              {(settings.symmetry === 'vertical' || settings.symmetry === 'cuadrante') && <div className="lz-axis v" style={{ left: doc.w / 2 }} />}
              {(settings.symmetry === 'horizontal' || settings.symmetry === 'cuadrante') && <div className="lz-axis h" style={{ top: doc.h / 2 }} />}
            </>
          )}
        </div>
        {/* Contorno del pincel bajo el puntero (con ratón o lápiz) */}
        {hover && (tool === 'brush' || tool === 'eraser') && (
          <div
            className="lz-cursor"
            style={{
              left: hover.x - (viewport.current?.getBoundingClientRect().left ?? 0),
              top: hover.y - (viewport.current?.getBoundingClientRect().top ?? 0),
              width: Math.max(4, size * view.s),
              height: Math.max(4, size * view.s),
            }}
          />
        )}
        {loading && <div className="lz-loading">Cargando lienzo…</div>}
        {notice && <div className="lz-notice">{notice}</div>}
      </div>

      {tool === 'fill' && (
        <div className="lz-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <span>Bote:</span>
          <button className={settings.fillMode === 'pieza' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ fillMode: 'pieza' })} title="Toca una pieza de la prenda (manga, cuerpo, capucha…) para darle color">
            Pieza de la prenda
          </button>
          <button className={settings.fillMode === 'zona' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ fillMode: 'zona' })} title="Rellena la zona cerrada por líneas en la capa de pintura">
            Zona pintada
          </button>
        </div>
      )}
      {carry && carry.moved && (
        <div className="lz-carry" style={{ left: carry.x, top: carry.y }}>
          {carry.item.label}
        </div>
      )}
      {panel === 'biblioteca' && (
        <Pop className="lz-pop left wide" title="Biblioteca">
          <Library
            materials={materials}
            presets={presets}
            onDeletePreset={(p) => {
              setPresets((list) => list.filter((x) => x.id !== p.id))
              api.deleteHardware(p.id).catch(() => flash('No se ha podido borrar'))
            }}
            onStart={(item, e) => setCarry({ item, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false })}
          />
        </Pop>
      )}
      {panel === 'opciones' && layer?.kind === 'mockup' && (
        <Pop className="lz-pop right wide" title={`Opciones · ${layer.name}`}>
          <GarmentOptions
            layer={layer}
            own={{ template, data }}
            materials={materials}
            onChange={(patchOpts) => (layer.template ? patch(layer.id, { options: { ...layer.options, ...patchOpts } }) : props.onOptions(patchOpts))}
          />
        </Pop>
      )}
      {panel === 'ia' && (
        <Pop className="lz-pop left wide" title="Imagen con IA">
          <AiPanel
            design={{ id: designId, name: props.name, template: template.id, data, clientId: null, projectId: null } as unknown as import('../shared/designs').Design}
            materials={materials}
            female={data.options.genero === 'mujer'}
            onExport={exportPng}
          />
        </Pop>
      )}
      {panel === 'brushes' && (
        <Pop className="lz-pop right" title={tool === 'eraser' ? 'Pincel del borrador' : 'Biblioteca de pinceles'}>
          <BrushLibrary
            current={brush.id}
            onPick={(id) => setSettings(tool === 'eraser' ? { eraser: id } : { brush: id })}
            color={tool === 'eraser' ? '#e7e5e4' : settings.color}
          />
          <div className="lz-field">
            <span>
              Estabilizador <strong>{Math.round(streamline * 100)} %</strong>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={streamline} onChange={(e) => setSettings({ streamline: { ...settings.streamline, [brush.id]: Number(e.target.value) } })} />
            <small className="lz-muted">Más alto = líneas más limpias y suaves (va un poco por detrás del lápiz)</small>
          </div>
        </Pop>
      )}
      {panel === 'color' && (
        <Pop className="lz-pop right" title="Color">
          <ColorPicker color={settings.color} onChange={(c) => setSettings({ color: c })} recent={settings.recent} brand={brand} />
        </Pop>
      )}
      {panel === 'layers' && (
        <Pop className="lz-pop right wide" title="Capas" action={<button className="lz-btn" onClick={addPaint} title="Capa de pintura nueva">+ Capa</button>}>
          <div className="lz-layers">
            {[...doc.layers].reverse().map((l) => (
              <LayerRow
                key={l.id}
                layer={l}
                active={l.id === active}
                thumb={l.kind === 'paint' ? r.layer(l.id) : l.kind === 'mockup' ? r.mockups.get(l.id) : l.kind === 'detail' ? detailCanvas(r, l) : undefined}
                onOptions={() => setPanel('opciones')}
                artworks={artworks}
                onSavePreset={async (name, detail) => {
                  try {
                    const p = await api.createHardware(name, detail)
                    setPresets((list) => [p, ...list])
                    flash(`«${name}» guardada en Mis fornituras`)
                  } catch (e) {
                    flash(e instanceof Error ? e.message : 'No se ha podido guardar')
                  }
                }}
                image={l.kind === 'image' ? r.images.get(l.file)?.src : undefined}
                onSelect={() => setActive(l.id)}
                onPatch={(p) => {
                  patch(l.id, p)
                  if ('visible' in p || 'x' in p || 'w' in p) maskCache.current = null
                }}
                onRemove={() => remove(l.id)}
                onDuplicate={() => duplicate(l)}
                onUp={() => reorder(l.id, 1)}
                onDown={() => reorder(l.id, -1)}
                onMerge={() => mergeDown(l)}
                onClear={l.kind === 'paint' ? () => clearLayer(l) : undefined}
              />
            ))}
          </div>
        </Pop>
      )}
      {panel === 'ajustes' && (
        <Pop className="lz-pop left" title="Guías de dibujo">
          <p className="lz-label">Simetría</p>
          <div className="lz-chips">
            {(
              [
                ['none', 'Sin simetría'],
                ['vertical', 'Vertical'],
                ['horizontal', 'Horizontal'],
                ['cuadrante', 'Cuatro lados'],
              ] as [Symmetry, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.symmetry === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ symmetry: id })}>
                {label}
              </button>
            ))}
          </div>
          <label className="lz-toggle">
            <input type="checkbox" checked={settings.grid} onChange={(e) => setSettings({ grid: e.target.checked })} /> Cuadrícula
          </label>
          {settings.grid && (
            <div className="lz-field">
              <span>
                Tamaño de la cuadrícula <strong>{settings.gridSize} px</strong>
              </span>
              <input type="range" min={10} max={200} step={5} value={settings.gridSize} onChange={(e) => setSettings({ gridSize: Number(e.target.value) })} />
            </div>
          )}
          <label className="lz-toggle" title="Lo que pintes no se sale de la prenda (los mockups visibles): sombras, desgastados, color">
            <input type="checkbox" checked={settings.inside} onChange={(e) => setSettings({ inside: e.target.checked })} /> Pintar solo dentro de la prenda
          </label>
          <div className="lz-field">
            <span>Color del papel</span>
            <input type="color" value={doc.paper} onChange={(e) => change({ ...doc, paper: e.target.value })} />
          </div>
          <button className="lz-btn" onClick={fit}>
            Encajar el lienzo en la pantalla (0)
          </button>
        </Pop>
      )}
      {panel === 'acciones' && (
        <Pop className="lz-pop left" title="Acciones">
          <p className="lz-label">Añadir</p>
          <div className="lz-chips">
            <button className="lz-chip" onClick={addPaint}>
              Capa de pintura
            </button>
            <button className="lz-chip" onClick={() => addMockup('front')}>
              Prenda delante
            </button>
            <button className="lz-chip" onClick={() => addMockup('back')}>
              Prenda detrás
            </button>
            <button className="lz-chip" onClick={() => addMockup('side')}>
              Prenda de lado
            </button>
            <label className="lz-chip">
              Imagen…
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
            </label>
          </div>
          <p className="lz-muted">También puedes pegar una imagen con Ctrl+V.</p>
          <p className="lz-label">Compartir</p>
          <div className="lz-chips">
            <a className="lz-chip" href={`/produccion/patron/${designId}`} title="Las piezas del patrón de la prenda, para imprimir a tamaño real">
              Ver el patrón
            </a>
            <button className="lz-chip" onClick={exportPng}>
              Exportar PNG
            </button>
          </div>
          <p className="lz-label">Gestos</p>
          <p className="lz-muted">
            Dos dedos: mover, acercar y girar. Toque con dos dedos: deshacer; con tres: rehacer. Con ratón: rueda para acercar, espacio + arrastrar para
            mover. Atajos: B pincel, E borrador, I cuentagotas, G bote, V mover, [ ] tamaño, 0 encajar.
          </p>
        </Pop>
      )}
    </div>,
    document.body,
  )
}

/** Mockup en línea: la prenda en gris muy claro con su contorno negro (como un plano técnico listo para pintar). */
function tintLine(c: HTMLCanvasElement) {
  const shape = document.createElement('canvas')
  shape.width = c.width
  shape.height = c.height
  shape.getContext('2d')!.drawImage(c, 0, 0)
  const g = c.getContext('2d')!
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = '#ebebea'
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(shape, 0, 0)
  g.globalCompositeOperation = 'source-over'
}

/** Lienzo de reserva mientras el diseño no tiene uno guardado (el mismo para el mismo diseño). */
const fallbacks = new Map<string, CanvasDoc>()
function fallback(id: string) {
  let d = fallbacks.get(id)
  if (!d) {
    d = defaultDoc()
    fallbacks.set(id, d)
  }
  return d
}

/** Presión del puntero: el ratón no tiene (0,5 al pulsar) y entonces se usa la del pincel al máximo. */
function pressureOf(e: { pointerType: string; pressure: number }) {
  if (e.pointerType === 'mouse') return 1
  return e.pressure || 0.5
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function Pop({ title, className, children, action }: { title: string; className: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={className} onPointerDown={(e) => e.stopPropagation()}>
      <div className="lz-pop-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Deslizador vertical (tamaño y opacidad, como en Procreate). */
function VSlider({ value, onChange, title }: { value: number; onChange: (v: number) => void; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    onChange(Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height)))
  }
  return (
    <div
      ref={ref}
      className="lz-vslider"
      title={title}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e.clientY)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientY)}
    >
      <div className="lz-vslider-fill" style={{ height: `${value * 100}%` }} />
      <div className="lz-vslider-knob" style={{ bottom: `calc(${value * 100}% - 7px)` }} />
    </div>
  )
}

/** Biblioteca de pinceles por grupos, cada uno con su muestra de trazo. */
function BrushLibrary({ current, onPick, color }: { current: string; onPick: (id: string) => void; color: string }) {
  const groups = [...new Set(BRUSHES.map((b) => b.group))]
  const [group, setGroup] = useState(BRUSHES.find((b) => b.id === current)?.group ?? groups[0])
  return (
    <div className="lz-brushes">
      <nav>
        {groups.map((g) => (
          <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </nav>
      <div className="lz-brush-list">
        {BRUSHES.filter((b) => b.group === group).map((b) => (
          <button key={b.id} className={b.id === current ? 'lz-brush on' : 'lz-brush'} onClick={() => onPick(b.id)}>
            <span>{b.name}</span>
            <BrushPreview brush={b} color={color} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Muestra de un pincel: una onda pintada con él (con presión que sube y baja). */
function BrushPreview({ brush, color }: { brush: BrushPreset; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const raw = document.createElement('canvas')
    raw.width = c.width
    raw.height = c.height
    const s = new Stroke(raw, { brush, color, size: Math.min(26, brush.size * 1.4 + 3), opacity: 1, streamline: 0, symmetry: 'none', axis: { x: 0, y: 0 } })
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      s.add(12 + t * (c.width - 24), c.height / 2 + Math.sin(t * Math.PI * 2) * 10, Math.sin(t * Math.PI) * 0.9 + 0.1)
    }
    g.globalAlpha = brush.opacity
    g.drawImage(raw, 0, 0)
    if (brush.grain) {
      g.globalCompositeOperation = 'destination-out'
      g.globalAlpha = brush.grain * 0.85
      g.fillStyle = g.createPattern(paperGrain(), 'repeat')!
      g.fillRect(0, 0, c.width, c.height)
      g.globalCompositeOperation = 'source-over'
    }
    g.globalAlpha = 1
  }, [brush, color])
  return <canvas ref={ref} width={220} height={44} className="lz-brush-preview" />
}

/** Una fila del panel de capas: miniatura, nombre, visibilidad y, si está activa, sus ajustes. */
function LayerRow(props: {
  layer: CanvasLayer
  active: boolean
  thumb?: HTMLCanvasElement
  image?: string
  onSelect: () => void
  onPatch: (p: Partial<CanvasLayer>) => void
  onRemove: () => void
  onDuplicate: () => void
  onUp: () => void
  onDown: () => void
  onMerge: () => void
  onClear?: () => void
  onOptions: () => void
  artworks: Artwork[]
  onSavePreset: (name: string, detail: Detail) => void
}) {
  const { layer: l, active } = props
  const thumbRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = thumbRef.current
    if (!c || !props.thumb) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const k = Math.min(c.width / props.thumb.width, c.height / props.thumb.height)
    g.drawImage(props.thumb, (c.width - props.thumb.width * k) / 2, (c.height - props.thumb.height * k) / 2, props.thumb.width * k, props.thumb.height * k)
  })
  const [editing, setEditing] = useState(false)
  const kind = l.kind === 'paint' ? 'Pintura' : l.kind === 'mockup' ? 'Prenda' : l.kind === 'detail' ? 'Fornitura' : 'Imagen'
  return (
    <div className={active ? 'lz-layer-row on' : 'lz-layer-row'}>
      <div className="lz-layer-main" onClick={props.onSelect}>
        <div className="lz-thumb">{props.image ? <img src={props.image} alt="" /> : <canvas ref={thumbRef} width={60} height={44} />}</div>
        <div className="lz-layer-name">
          {editing ? (
            <input autoFocus defaultValue={l.name} onBlur={(e) => (setEditing(false), props.onPatch({ name: e.target.value || l.name }))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          ) : (
            <strong onDoubleClick={() => setEditing(true)} title="Doble clic para cambiar el nombre">
              {l.name}
            </strong>
          )}
          <small>
            {kind}
            {l.blend !== 'normal' ? ` · ${BLEND_MODES.find((b) => b.id === l.blend)?.label}` : ''}
            {l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)} %` : ''}
            {l.locked ? ' · bloqueada' : ''}
          </small>
        </div>
        <button className="lz-mini" onClick={(e) => (e.stopPropagation(), props.onPatch({ visible: !l.visible }))} title={l.visible ? 'Ocultar' : 'Mostrar'}>
          {l.visible ? '◉' : '○'}
        </button>
      </div>
      {active && (
        <div className="lz-layer-opts">
          <div className="lz-field">
            <span>
              Opacidad <strong>{Math.round(l.opacity * 100)} %</strong>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={l.opacity} onChange={(e) => props.onPatch({ opacity: Number(e.target.value) })} />
          </div>
          <div className="lz-field">
            <span>Fusión</span>
            <select value={l.blend} onChange={(e) => props.onPatch({ blend: e.target.value as BlendMode })}>
              {BLEND_MODES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          {l.kind === 'mockup' && (
            <>
              <div className="lz-chips">
                {(['front', 'back', 'side'] as const).map((v) => (
                  <button key={v} className={l.view === v ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ view: v })}>
                    {v === 'front' ? 'Delantero' : v === 'back' ? 'Espalda' : 'Lateral'}
                  </button>
                ))}
              </div>
              <div className="lz-chips">
                <button className={l.style === 'linea' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ style: 'linea' })} title="Gris claro con contorno, para pintar encima">
                  En línea
                </button>
                <button className={l.style === 'color' ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ style: 'color' })} title="Con los colores y tejidos del diseño">
                  A color
                </button>
              </div>
            </>
          )}
          {l.kind === 'mockup' && (
            <button className="lz-btn" onClick={props.onOptions} title="Cuello, capucha, bolsillos, mangas… viendo cómo queda cada uno">
              Cambiar cuello, capucha, bolsillos…
            </button>
          )}
          {l.kind === 'detail' && <DetailOptions layer={l} onPatch={props.onPatch} artworks={props.artworks} onSavePreset={props.onSavePreset} />}
          {(l.kind === 'mockup' || l.kind === 'image' || l.kind === 'detail') && (
            <div className="lz-field">
              <span>
                Tamaño <strong>{Math.round(l.w)} px</strong>
              </span>
              <input type="range" min={l.kind === 'detail' ? 8 : 60} max={2400} step={l.kind === 'detail' ? 2 : 10} value={l.w} onChange={(e) => props.onPatch({ w: Number(e.target.value) })} />
            </div>
          )}
          {(l.kind === 'image' || l.kind === 'detail') && (
            <div className="lz-field">
              <span>
                Giro <strong>{Math.round(l.rotation)}°</strong>
              </span>
              <input type="range" min={-180} max={180} step={1} value={l.rotation} onChange={(e) => props.onPatch({ rotation: Number(e.target.value) })} />
            </div>
          )}
          <div className="lz-chips">
            <button className={l.locked ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ locked: !l.locked })}>
              Bloquear
            </button>
            {l.kind === 'paint' && (
              <button className={l.alphaLock ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ alphaLock: !l.alphaLock } as Partial<PaintLayer>)} title="Solo se pinta donde ya hay algo pintado en esta capa">
                Bloquear transparencia
              </button>
            )}
          </div>
          <div className="lz-chips">
            <button className="lz-chip" onClick={props.onUp} title="Subir">
              ↑ Subir
            </button>
            <button className="lz-chip" onClick={props.onDown} title="Bajar">
              ↓ Bajar
            </button>
            <button className="lz-chip" onClick={props.onDuplicate}>
              Duplicar
            </button>
            {l.kind === 'paint' && (
              <button className="lz-chip" onClick={props.onMerge} title="Juntar con la capa de pintura de debajo">
                Combinar abajo
              </button>
            )}
            {props.onClear && (
              <button className="lz-chip" onClick={props.onClear}>
                Vaciar
              </button>
            )}
            <button className="lz-chip danger" onClick={props.onRemove}>
              Borrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Las funciones del motor que no se usan aquí directamente
void union

/** Lo que se puede arrastrar desde la biblioteca. */
type LibraryItem = { kind: 'garment'; id: string; label: string } | { kind: 'detail'; detail: Detail; label: string }

/** Fornitura de la biblioteca: la de serie de su tipo, con un estilo. */
const stock = (kind: DetailKind, style: string | null): Detail => ({ ...DETAIL_DEFAULTS[kind], ...(style ? { style } : {}), id: 'stock', view: 'front', x: 0, y: 0 })

/** Fornituras de la biblioteca: cada tipo con sus estilos (cremalleras metálicas, invisibles, botones de 2 o 4 agujeros…). */
const HARDWARE: { kind: DetailKind; styles: (string | null)[] }[] = DETAIL_KINDS.map((k) => ({
  kind: k.id,
  styles: DETAIL_STYLES[k.id]?.map((s) => s.id) ?? [null],
}))

/** Biblioteca visual: prendas del catálogo y fornituras, para tocar (al centro) o arrastrar al lienzo. */
function Library({
  materials,
  presets,
  onDeletePreset,
  onStart,
}: {
  materials: Map<string, import('../shared/library').Material>
  presets: HardwarePreset[]
  onDeletePreset: (p: HardwarePreset) => void
  onStart: (item: LibraryItem, e: React.PointerEvent) => void
}) {
  const [tab, setTab] = useState<'prendas' | 'fornituras' | 'mias'>('prendas')
  const [kind, setKind] = useState<DetailKind>('cremallera')
  const body = useMemo(() => standardBody('M'), [])
  return (
    <div className="lz-library">
      <div className="lz-chips">
        <button className={tab === 'prendas' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('prendas')}>
          Prendas
        </button>
        <button className={tab === 'fornituras' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('fornituras')}>
          Fornituras y detalles
        </button>
        <button className={tab === 'mias' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('mias')}>
          Mis fornituras{presets.length ? ` (${presets.length})` : ''}
        </button>
      </div>
      <p className="lz-muted">Arrastra al lienzo o toca para ponerlo en el centro.</p>
      {tab === 'mias' ? (
        presets.length ? (
          <div className="lz-grid-items">
            {presets.map((p) => (
              <div key={p.id} className="lz-lib-wrap">
                <button className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'detail', detail: p.detail, label: p.name }, ev)} title={p.name}>
                  <div className="lz-lib-thumb">
                    <DetailThumb detail={p.detail} />
                  </div>
                  <span>{p.name}</span>
                </button>
                <button className="lz-lib-del" onClick={() => onDeletePreset(p)} title="Quitar de mis fornituras" aria-label={`Quitar ${p.name}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="lz-muted">
            Aún no tienes fornituras propias. Pon una en el lienzo (una cremallera, un botón, un parche…), ajústala a tu gusto (tipo, tirador, colores, tu
            logo) y, en sus ajustes de la capa, toca «Guardar en mis fornituras».
          </p>
        )
      ) : tab === 'prendas' ? (
        <div className="lz-grid-items">
          {NEW_DESIGN_CATALOG.map((e) => {
            const data = { ...defaultDesign(e.template, e.options), prints: [] } as DesignData
            return (
              <button key={e.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'garment', id: e.id, label: e.name }, ev)} title={e.description}>
                <div className="lz-lib-thumb">
                  <FlatView template={e.template} data={data} view="front" materials={materials} mode="linea" body={body} />
                </div>
                <span>{e.name}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="lz-chips">
            {HARDWARE.map((h) => (
              <button key={h.kind} className={h.kind === kind ? 'lz-chip on' : 'lz-chip'} onClick={() => setKind(h.kind)}>
                {DETAIL_KINDS.find((k) => k.id === h.kind)?.label}
              </button>
            ))}
          </div>
          <div className="lz-grid-items">
            {HARDWARE.find((h) => h.kind === kind)!.styles.map((style) => {
              const label = DETAIL_STYLES[kind]?.find((x) => x.id === style)?.label ?? DETAIL_KINDS.find((k) => k.id === kind)?.label ?? ''
              return (
                <button key={style ?? 'x'} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'detail', detail: stock(kind, style), label: DETAIL_KINDS.find((k) => k.id === kind)?.label ?? label }, ev)}>
                  <div className="lz-lib-thumb">
                    <DetailThumb detail={stock(kind, style)} />
                  </div>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Miniatura de una fornitura con su estilo. */
function DetailThumb({ detail }: { detail: Detail }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(detail)
  const [, again] = useReducer((n: number) => n + 1, 0)
  useEffect(() => onArtLoaded(again), [])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const layer: DetailLayer = {
      id: `thumb-${key}`,
      kind: 'detail',
      name: '',
      detail,
      x: 0,
      y: 0,
      w: 120,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'normal',
    }
    const src = detailCanvas(thumbRuntime, layer)
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    const k = Math.min((c.width * 0.8) / src.width, (c.height * 0.8) / src.height)
    g.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k)
  })
  return <canvas ref={ref} width={120} height={90} />
}
/** Memoria aparte para las miniaturas de la biblioteca. */
const thumbRuntime = { details: new Map() } as unknown as Runtime

/** Ajustes de una fornitura: estilo, tirador, colores y largo. */
function DetailOptions({
  layer: l,
  onPatch,
  artworks,
  onSavePreset,
}: {
  layer: DetailLayer
  onPatch: (p: Partial<CanvasLayer>) => void
  artworks: Artwork[]
  onSavePreset: (name: string, detail: Detail) => void
}) {
  const d = l.detail
  const set = (p: Partial<DetailLayer['detail']>) => onPatch({ detail: { ...d, ...p } } as Partial<CanvasLayer>)
  const styles = DETAIL_STYLES[d.kind]
  const [naming, setNaming] = useState<string | null>(null)
  // Llevan logo: botones, tirador de la cremallera, parches y etiquetas
  const withArt = d.kind === 'boton' || d.kind === 'parche' || d.kind === 'etiqueta' || (d.kind === 'cremallera' && d.puller === 'logo')
  return (
    <>
      {styles && (
        <div className="lz-chips">
          {styles.map((s) => (
            <button key={s.id} className={d.style === s.id ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ style: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {d.kind === 'cremallera' && (
        <>
          <p className="lz-label">Tirador</p>
          <div className="lz-chips">
            {PULLER_STYLES.map((p) => (
              <button key={p.id} className={(d.puller ?? 'clasico') === p.id ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ puller: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="lz-color-pair">
        <label className="lz-field">
          <span>Color</span>
          <input type="color" value={d.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="lz-field">
          <span>Contraste</span>
          <input type="color" value={d.color2} onChange={(e) => set({ color2: e.target.value })} />
        </label>
      </div>
      {(d.kind === 'etiqueta' || d.kind === 'parche') && (
        <label className="lz-field">
          <span>Texto</span>
          <input className="lz-hex" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        </label>
      )}
      {LONG_DETAILS.includes(d.kind) && (
        <div className="lz-field">
          <span>
            Largo <strong>{Math.round((d.length ?? 100) / 2)} cm</strong>
          </span>
          <input type="range" min={6} max={400} step={2} value={d.length ?? 100} onChange={(e) => set({ length: Number(e.target.value) })} />
        </div>
      )}
      {withArt && (
        <>
          <p className="lz-label">{d.kind === 'cremallera' ? 'Logo del tirador' : 'Tu logo o gráfico'}</p>
          {artworks.length ? (
            <div className="lz-art-list">
              <button className={!d.art ? 'lz-art on' : 'lz-art'} onClick={() => set({ art: null })} title="Sin logo">
                Sin logo
              </button>
              {artworks.map((a) => (
                <button
                  key={a.id}
                  className={d.art?.file === a.file ? 'lz-art on' : 'lz-art'}
                  onClick={() => set({ art: { artworkId: a.id, file: a.file, aspect: a.height / Math.max(1, a.width) } })}
                  title={a.name}
                >
                  <img src={fileOf(a.file)} alt={a.name} />
                </button>
              ))}
            </div>
          ) : (
            <p className="lz-muted">Crea o sube tus logos en Biblioteca → Gráficos y salen aquí.</p>
          )}
          {d.kind === 'boton' && d.art && d.style !== 'logo' && styles?.some((s) => s.id === 'logo') && (
            <button className="lz-chip" onClick={() => set({ style: 'logo' })}>
              Botón con la forma del logo
            </button>
          )}
        </>
      )}
      {naming === null ? (
        <button className="lz-btn" onClick={() => setNaming(l.name)} title="Para usarla en cualquier diseño desde la biblioteca">
          Guardar en mis fornituras
        </button>
      ) : (
        <div className="lz-save-row">
          <input className="lz-hex" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Nombre (p. ej. Cremallera metal dorada)" />
          <button
            className="lz-btn primary"
            onClick={() => {
              onSavePreset(naming.trim() || l.name, d)
              setNaming(null)
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </>
  )
}

/** De dónde sale el dibujo de un mockup: la prenda del propio diseño o una del catálogo con sus opciones y colores. */
function mockupSource(l: MockupLayer, own: GarmentTemplate, data: DesignData, body: Body) {
  if (!l.template) return { t: own, data, body }
  const t = getTemplate(l.template)
  if (!t) return null
  const base = defaultDesign(t, l.options)
  // Lo que no se ha pintado, en gris muy claro (como el mockup en línea)
  const pieces = Object.fromEntries(Object.entries(base.pieces).map(([k, v]) => [k, { ...v, color: l.pieces?.[k]?.color ?? (l.style === 'color' ? '#ebebea' : v.color) }]))
  const kind = l.options?.genero === 'mujer' ? 'mujer' : 'hombre'
  return { t, data: { ...base, pieces, prints: [] } as DesignData, body: standardBody('M', kind) }
}

/**
 * Opciones de una prenda (cuello, capucha, bolsillos, mangas, largos…) viendo cómo queda cada una: una miniatura
 * de la prenda con esa opción. Se abre una opción cada vez.
 */
function GarmentOptions({ layer, own, materials, onChange }: { layer: MockupLayer; own: { template: GarmentTemplate; data: DesignData }; materials: Map<string, import('../shared/library').Material>; onChange: (p: Options) => void }) {
  const t = layer.template ? getTemplate(layer.template) : own.template
  const [open, setOpen] = useState<string | null>(null)
  if (!t) return null
  const current: Options = layer.template ? { ...defaultDesign(t).options, ...layer.options } : own.data.options
  const base = layer.template ? ({ ...defaultDesign(t, current), prints: [] } as DesignData) : own.data
  return (
    <div className="lz-options">
      {t.options.map((o) => {
        const value = current[o.id]
        const choices = o.type === 'choice' ? o.choices : [
          { id: 'true', label: 'Sí' },
          { id: 'false', label: 'No' },
        ]
        const label = o.type === 'choice' ? o.choices.find((c) => c.id === value)?.label : value ? 'Sí' : 'No'
        return (
          <div key={o.id} className="lz-option">
            <button className="lz-option-head" onClick={() => setOpen(open === o.id ? null : o.id)}>
              <span>{o.label}</span>
              <strong>{label}</strong>
            </button>
            {open === o.id && (
              <div className="lz-grid-items small">
                {choices.map((c) => {
                  const v = o.type === 'choice' ? c.id : c.id === 'true'
                  const data = { ...base, options: { ...base.options, [o.id]: v } }
                  return (
                    <button key={c.id} className={String(value) === String(v) ? 'lz-lib-item on' : 'lz-lib-item'} onClick={() => onChange({ [o.id]: v })}>
                      <div className="lz-lib-thumb">
                        <FlatView template={t} data={data} view={layer.view} materials={materials} mode="linea" />
                      </div>
                      <span>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Pedir una imagen a una IA externa (Gemini o ChatGPT), sin coste en la app: prepara el texto con todo el detalle de
 * la prenda (el del Lookbook), lo copia y abre la IA en una ventana al lado. La imagen que devuelva se pega en el
 * lienzo con Ctrl+V (queda como capa de imagen) o se sube con «Imagen…».
 */
function AiPanel({ design, materials, female, onExport }: { design: import('../shared/designs').Design; materials: Map<string, import('../shared/library').Material>; female: boolean; onExport: () => void }) {
  const [scene, setScene] = useState<LookScene>(LOOK_SCENES[0].id)
  const [extra, setExtra] = useState('')
  const base = useMemo(
    () =>
      lookPrompt({
        items: [{ role: 'Prenda', design }],
        materials,
        kind: female ? 'mujer' : 'hombre',
        shoes: '',
        shoesText: '',
        scene,
        sceneText: '',
        angles: [LOOK_ANGLES[0].id],
        extra,
      }),
    [design, materials, female, scene, extra],
  )
  const [text, setText] = useState(base)
  useEffect(() => setText(base), [base])
  const [copied, setCopied] = useState(false)
  const open = async (url: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    // Ventana a un lado de la pantalla (si el navegador lo permite)
    const w = Math.min(560, Math.round(window.screen.availWidth * 0.4))
    window.open(url, 'fd-ia', `popup,width=${w},height=${window.screen.availHeight},left=${window.screen.availWidth - w},top=0`)
  }
  return (
    <div className="lz-ai">
      <p className="lz-muted">
        Prepara el texto con todo el detalle de la prenda. Al abrir la IA, el texto queda copiado: pégalo allí (Ctrl+V) junto con la imagen del lienzo como
        referencia. Cuando tengas la imagen, cópiala y pégala aquí con Ctrl+V: queda como una capa.
      </p>
      <p className="lz-label">Escenario</p>
      <div className="lz-chips">
        {LOOK_SCENES.filter((x) => x.id !== 'otro').map((x) => (
          <button key={x.id} className={scene === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setScene(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <label className="lz-field">
        <span>Algo más (pose, capucha puesta, chaqueta abierta…)</span>
        <input className="lz-hex" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </label>
      <label className="lz-field">
        <span>Texto para la IA (lo puedes retocar)</span>
        <textarea className="lz-hex lz-prompt" value={text} onChange={(e) => setText(e.target.value)} rows={10} />
      </label>
      <div className="lz-chips">
        <button className="lz-btn" onClick={onExport} title="Descarga el lienzo como PNG para adjuntarlo a la IA como referencia">
          Descargar el lienzo (referencia)
        </button>
      </div>
      <div className="lz-chips">
        <button className="lz-btn primary" onClick={() => open('https://gemini.google.com/app')}>
          Copiar y abrir Gemini
        </button>
        <button className="lz-btn" onClick={() => open('https://chatgpt.com/')}>
          Copiar y abrir ChatGPT
        </button>
      </div>
      {copied && <p className="lz-muted">Texto copiado: pégalo en la IA con Ctrl+V.</p>}
    </div>
  )
}
