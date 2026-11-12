import { SURFACE_KINDS } from '../shared/designs'
import { PATTERN_GROUPS, patternDefaults } from '../designer/morePatterns'
import { curvePath, curveThrough, hull, isScribble, recognize, snapPoint, type Guide, type P as ShaperPoint } from './shaper'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { mockupCanvas } from '../designer/exportFlat'
import { LOOK_ANGLES, LOOK_SCENES, lookPrompt, PRODUCT_FINISHES, PRODUCT_SHOTS, productPrompt, type LookScene, type ProductShot } from '../designer/lookbook'
import { FlatView } from '../designer/FlatView'
import { drawScale } from '../designer/measures'
import { reshapePockets } from '../designer/pocketShape'
import { DEFAULT_SIZE, pieceTile } from '../designer/surfaces'
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
  type Surface,
  type SurfaceKind,
  type TextLayer,
  type LayerRole,
  type LienzoAsset,
} from '../shared/designs'
import type { Material } from '../shared/library'
import { BRUSHES, grainFor, registerBrushImages, Stroke, union, type BrushPreset, type Rect, type Symmetry } from './brushes'
import { grainFromImage, importProcreate, pngOf, tipFromImage } from './brushImport'
import { TEXTURES, textureTile, type TextureDef } from './textures'
import { autoShade, lightOf, shadeOf, type LightFrom, type ShadeStyle } from './shading'
import { ArtworkCreator, TemplateGallery } from '../pages/library/ArtworkCreator'
import { ColorPicker } from './ColorPicker'
import { afterSave, clipBaseOf, clippedLayer, compose, textureCanvas, detailCanvas, floodMask, garmentMask, grab, imageKey, loadImage, onArtLoaded, pieceAt, refreshClip, registerFlush, runtimeFor, textCanvas, uploadDirty, type Runtime } from './engine'
import { FontPicker } from '../components/FontPicker'
import { MOCKUPS, type MockupAsset } from './mockups'
import type { Artwork } from '../shared/artworks'
import { fileUrl as fileOf } from '../shared/library'
import { TabletPanel, useTabletHost, type TabletApi } from './tablet'
import type { PadPoint } from '../shared/tablet'
import { isVectorTool, useVector, VectorOverlay, VectorPanel, VectorSvg } from './VectorTools'
import { translatePath } from './vectorPaths'
import { ToolColumn, toolDef } from './Toolbar'
import './lienzo.css'

/** Puntero de los trazos que llegan del móvil que hace de tableta (no choca con los del navegador). */
const REMOTE_POINTER = 987654

type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'move' | 'text' | 'select' | 'shaper' | 'curve' | 'pen' | 'vpencil' | 'direct' | 'vshape'
type Panel = 'brushes' | 'layers' | 'color' | 'ajustes' | 'acciones' | 'biblioteca' | 'opciones' | 'ia' | 'luces' | null

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
  /** Con qué rellena el bote: color liso o un estampado (con su segundo color, tamaño en cm y, si es imagen, el archivo). */
  fillPattern: { kind: SurfaceKind; color2: string; size: number; angle: number; file?: string }
  /** Pincel de estampado: segundo y tercer color y tamaño del dibujo (cm; 0 = el de siempre). */
  patternColors?: [string, string]
  patternSize?: number
  /** Botón flotante del menú rápido: dónde está (fracción del ancho y alto del lienzo). */
  fab?: [number, number]
  /** Guía de perspectiva: sin, de 1 o de 2 puntos de fuga (en fracción del lienzo). */
  perspective: 0 | 1 | 2
  vps: [number, number][]
  /** Copias de la simetría radial y giratoria. */
  symmetryCount: number
  /** Centro de la simetría (en fracción del lienzo). */
  axis: [number, number]
  /** Asistencia de dibujo: el trazo sigue la guía (cuadrícula o perspectiva). */
  assist: boolean
  gridKind: 'cuadrada' | 'isometrica'
  /** Luces y sombras automáticas: estilo y de dónde viene la luz. */
  shadeStyle: ShadeStyle
  lightFrom: LightFrom
}
const DEFAULTS: Settings = { brush: 'tecnica', eraser: 'aeroduro', color: '#1d1c1a', recent: [], sizes: {}, opacities: {}, streamline: {}, symmetry: 'none', grid: false, gridSize: 50, inside: false, fillMode: 'pieza', fillPattern: { kind: 'liso', color2: '#ffffff', size: 3, angle: 0 }, perspective: 0, vps: [[0.5, 0.42], [0.08, 0.42], [0.92, 0.42]], symmetryCount: 6, axis: [0.5, 0.5], assist: false, gridKind: 'cuadrada', shadeStyle: 'suave', lightFrom: 'izquierda' }
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
  onPieceColor: (piece: string, color: string, canvas?: CanvasDoc, surface?: Surface | null) => void
  onOptions: (patch: Options) => void
  /** Guardar el diseño (el editor sube antes las capas cambiadas). */
  onSave: () => void
  saving: boolean
  dirty: boolean
  /** Abre «Diseños» (empezar uno nuevo, abrir otro) y «Prenda» (modelo, medidas, datos). */
  onMenu: () => void
  /** Salir del lienzo a la app (el editor guarda antes lo pendiente) */
  onExit: () => void
  onGarment: () => void
  /** Vista 3D: sin, al lado del lienzo o a pantalla completa. */
  mode3d: Mode3D
  onMode3d: (m: Mode3D) => void
  view3d?: ReactNode
  /** Imagen que el editor pide añadir (p. ej. «Importar imagen» al empezar). */
  pendingImage?: File | null
  onPendingImage?: () => void
  /** Paneles del editor, que flotan encima del lienzo. */
  children?: ReactNode
}
export type Mode3D = 'off' | 'side' | 'full'
const MODES_3D: { id: Mode3D; label: string; title: string }[] = [
  { id: 'off', label: '2D', title: 'Solo el lienzo' },
  { id: 'full', label: '3D', title: 'La prenda en 3D' },
  { id: 'side', label: '2D + 3D', title: 'El lienzo y, al lado, la prenda en 3D' },
]

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
  // Texturas y pinceles propios (de la cuenta)
  const [assets, setAssets] = useState<LienzoAsset[]>([])
  const [, setBrushImages] = useState(0)
  useEffect(() => {
    api.listLienzoAssets().then(setAssets).catch(() => {})
  }, [])
  const customBrushes = useMemo(() => assets.filter((a) => a.kind === 'pincel').map(assetBrush), [assets])
  // Las imágenes de la punta y el grano de cada pincel propio
  useEffect(() => {
    let alive = true
    for (const a of assets) {
      if (a.kind !== 'pincel' || (!a.file && !a.grain)) continue
      Promise.all([a.file ? loadImage(fileOf(a.file)) : null, a.grain ? loadImage(fileOf(a.grain)) : null]).then(([tip, grain]) => {
        if (!alive) return
        registerBrushImages(`u:${a.id}`, tip ? canvasOf(tip) : null, grain ? canvasOf(grain) : null)
        setBrushImages((n) => n + 1)
      })
    }
    return () => {
      alive = false
    }
  }, [assets])
  useEffect(() => {
    api.listHardware().then(setPresets).catch(() => {})
    api.listArtworks().then(setArtworks).catch(() => {})
  }, [])
  useEffect(() => onArtLoaded(() => redraw()), [])

  const docRef = useRef(doc)
  docRef.current = doc
  // Con el creador de gráficos abierto, el lienzo no atiende al teclado ni a pegar
  const creatorOpen = useRef(false)
  const allBrushes = [...BRUSHES, ...customBrushes]
  const brush = allBrushes.find((b) => b.id === (tool === 'eraser' ? settings.eraser : settings.brush)) ?? BRUSHES[0]
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
  // Mientras no se mueva el lienzo a mano, se vuelve a encajar al cambiar el tamaño de la ventana (al abrir, la
  // pantalla aún no tenía su tamaño y el papel quedaba pequeño y a un lado)
  const userMoved = useRef(false)
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (!userMoved.current) fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])
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
        const uploaded = await uploadDirty(r, docRef.current)
        const files = new Map(uploaded.layers.flatMap((l) => (l.kind === 'paint' ? [[l.id, l.file] as const] : [])))
        const cur = docRef.current
        const next = { ...cur, layers: cur.layers.map((l) => (l.kind === 'paint' && files.has(l.id) ? { ...l, file: files.get(l.id)! } : l)) }
        docRef.current = next
        return next
      }),
    [designId, r, data.canvas],
  )
  useEffect(() => {
    if (!props.dirty && !props.saving) afterSave(designId)
  }, [props.dirty, props.saving, designId])

  const layer = doc.layers.find((l) => l.id === active) ?? null
  // Capa de pintura con la que se trabaja: la elegida o, si se ha elegido otra cosa (un texto, una prenda), la de pintura
  // más alta (si no, el pincel no hacía nada y no se entendía por qué)
  const paintLayer = layer?.kind === 'paint' ? layer : (([...doc.layers].reverse().find((l) => l.kind === 'paint') as PaintLayer | undefined) ?? null)

  // --- Coordenadas: de la pantalla al lienzo ---
  const toDoc = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect()
    const px = clientX - rect.left - view.x
    const py = clientY - rect.top - view.y
    const c = Math.cos(-view.r)
    const s = Math.sin(-view.r)
    return { x: (px * c - py * s) / view.s, y: (px * s + py * c) / view.s }
  }

  // --- Trazados vectoriales: Pluma, Selección directa y Formas (VectorTools.tsx) ---
  const vec = useVector({
    doc,
    change: (next) => change(next),
    active,
    setActive,
    scale: view.s,
    color: settings.color,
    tool,
    flash: (t) => flash(t),
  })

  // --- Pintar ---
  const raw = useRef<HTMLCanvasElement | null>(null)
  const preview = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const backup = useRef<HTMLCanvasElement | null>(null)
  const maskCache = useRef<HTMLCanvasElement | null>(null)
  const stroke = useRef<{
    s: Stroke
    opts: ConstructorParameters<typeof Stroke>[1]
    layer: PaintLayer
    erase: boolean
    /** Difuminar (la capa se cambia en directo, como al borrar). */
    smudge: boolean
    masks: HTMLCanvasElement[]
    pointer: number
    touchStart: number
    /** Puntos del trazo (x, y, x, y…), para QuickShape. */
    pts: number[]
    /** Lo que se ha movido el puntero en la pantalla (px) y dónde estaba al último movimiento. */
    travel: number
    anchor: { x: number; y: number }
    pressure: number
    /** Temporizador de «mantener quieto» (cuentagotas o QuickShape). */
    hold: number
    shaped: boolean
    assist: { x: number; y: number; dir: [number, number] | null } | null
  } | null>(null)
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
    if (st.smudge) {
      const lg = r.layer(st.layer.id).getContext('2d')!
      lg.clearRect(f.x0, f.y0, w, h)
      lg.drawImage(src, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
      if (st.layer.clip) refreshClip(r, st.layer, f)
      return
    }
    const grained = (g: CanvasRenderingContext2D) => {
      if (st.s && st.layer && st.erase !== undefined && brushOf(st).grain > 0) {
        g.globalCompositeOperation = 'destination-out'
        g.globalAlpha = brushOf(st).grain * 0.85
        g.fillStyle = g.createPattern(grainFor(brushOf(st)), 'repeat')!
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
      // En una capa con máscara de recorte se ve su versión recortada: se rehace esa zona
      if (st.layer.clip) refreshClip(r, st.layer, f)
      return
    }
    const pg = preview.current.getContext('2d')!
    pg.clearRect(f.x0, f.y0, w, h)
    pg.drawImage(src, f.x0, f.y0, w, h, f.x0, f.y0, w, h)
    const pb = brushOf(st)
    if (pb.pattern) fillWithPattern(pg, f, pb.pattern, st.opts.color, settings.patternColors, settings.patternSize)
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

  const startStroke = (e: ReactPointerEvent, erase: boolean, at?: { x: number; y: number }) => {
    // Pincel de sombra o de luz: pinta en su propia capa, con el color de la pieza y sin salirse de la prenda
    let pl = paintLayer
    let strokeColor = settings.color
    const shading = !!brush.shade && !erase
    if (brush.shade && !erase) {
      const name = brush.shade === 'sombra' ? 'Sombras a mano' : 'Luces a mano'
      let l = doc.layers.find((x): x is PaintLayer => x.kind === 'paint' && x.name === name) ?? null
      if (!l) {
        l = { id: uid(), kind: 'paint', name, file: null, visible: true, locked: false, opacity: 1, blend: brush.shade === 'sombra' ? 'multiply' : 'screen', role: brush.shade }
        change({ ...doc, layers: [...doc.layers, l] })
        setActive(l.id)
      }
      pl = l
      const p = at ?? toDoc(e.clientX, e.clientY)
      const base = compose(r, { ...doc, layers: doc.layers.filter((x) => !x.role) })
      const d = base.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data
      const c = brush.shade === 'sombra' ? shadeOf([d[0], d[1], d[2]]) : lightOf([d[0], d[1], d[2]])
      strokeColor = `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
    }
    // Con una imagen, un texto o una fornitura elegidos, la capa de pintura más alta puede quedar debajo y lo pintado no
    // se veía (tapado por la imagen): se pinta en una capa nueva justo encima de lo elegido
    if (!shading && !erase && layer && layer.kind !== 'paint') {
      const at = doc.layers.findIndex((x) => x.id === layer.id)
      const below = !pl || doc.layers.findIndex((x) => x.id === pl!.id) < at
      if (below) {
        const n = doc.layers.filter((x) => x.kind === 'paint').length + 1
        const fresh: PaintLayer = { id: uid(), kind: 'paint', name: `Capa ${n}`, file: null, visible: true, locked: false, opacity: 1, blend: 'normal' }
        const layers = [...doc.layers]
        layers.splice(at + 1, 0, fresh)
        change({ ...doc, layers })
        setActive(fresh.id)
        pl = fresh
      }
    }
    if (!pl) return flash('Elige una capa de pintura para dibujar (en «Capas»)')
    if (pl.locked) return flash('La capa está bloqueada')
    if (!pl.visible) return flash('La capa está oculta')
    const target = ensure(raw)
    target.getContext('2d')!.clearRect(0, 0, doc.w, doc.h)
    preview.current.width = doc.w
    preview.current.height = doc.h
    const lc = r.layer(pl.id)
    const bk = ensure(backup)
    const bg = bk.getContext('2d')!
    bg.clearRect(0, 0, doc.w, doc.h)
    bg.drawImage(lc, 0, 0)
    // Difuminar: el trazo arrastra lo que hay en la capa (parte de una copia de ella)
    if (brush.smudge && !erase) target.getContext('2d')!.drawImage(lc, 0, 0)
    const masks: HTMLCanvasElement[] = []
    if (pl.alphaLock && !erase) masks.push(bk)
    if ((settings.inside || shading) && !erase) {
      if (!maskCache.current) maskCache.current = garmentMask(r, doc)
      masks.push(maskCache.current)
    }
    // Capa con máscara de recorte: lo pintado se queda dentro de su base
    const base = clipBaseOf(doc, pl)
    if (base && !erase) masks.push(clippedLayer(r, doc, pl, base).base)
    const opts = {
      brush,
      color: strokeColor,
      size,
      opacity,
      streamline,
      symmetry: settings.symmetry,
      symmetryCount: settings.symmetryCount,
      axis: { x: settings.axis[0] * doc.w, y: settings.axis[1] * doc.h },
    }
    const s = new Stroke(target, opts)
    const p = at ?? toDoc(e.clientX, e.clientY)
    stroke.current = {
      s,
      opts,
      layer: pl,
      erase,
      smudge: !!brush.smudge && !erase,
      masks,
      pointer: e.pointerId,
      touchStart: e.pointerType === 'touch' ? performance.now() : 0,
      pts: [p.x, p.y],
      travel: 0,
      anchor: { x: e.clientX, y: e.clientY },
      pressure: pressureOf(e),
      hold: 0,
      shaped: false,
      assist: settings.assist ? { x: p.x, y: p.y, dir: null } : null,
    }
    s.add(p.x, p.y, pressureOf(e))
    armHold()
    scheduleFrame()
    redraw()
  }
  /** Mantener el puntero quieto: al empezar coge el color (cuentagotas); al acabar un trazo lo vuelve una forma perfecta. */
  const armHold = () => {
    const st = stroke.current
    if (!st) return
    clearTimeout(st.hold)
    st.hold = window.setTimeout(onHold, 550)
  }
  const onHold = () => {
    const st = stroke.current
    if (!st || st.shaped) return
    if (st.travel < 6) {
      const [x, y] = st.pts
      endStroke(null, true)
      pick(x, y)
      flash('Color cogido (cuentagotas)')
      return
    }
    if (!st.smudge) quickShape(st, true)
  }
  /** Direcciones de la guía en (x, y): hacia los puntos de fuga, o las de la cuadrícula. */
  const guideDirs = (x: number, y: number): [number, number][] => {
    const unit = (dx: number, dy: number): [number, number] => {
      const l = Math.hypot(dx, dy) || 1
      return [dx / l, dy / l]
    }
    if (settings.perspective > 0) {
      const vps = settings.perspective === 1 ? [settings.vps[0]] : [settings.vps[1], settings.vps[2]]
      return [...vps.map(([fx, fy]) => unit(fx * doc.w - x, fy * doc.h - y)), [1, 0], [0, 1]]
    }
    if (settings.grid) return settings.gridKind === 'isometrica' ? [unit(Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)), unit(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)), [0, 1]] : [[1, 0], [0, 1]]
    return []
  }
  /** Con la asistencia, el punto se lleva a la recta de la guía que sigue el trazo (se elige al empezar a moverse). */
  const assisted = (st: NonNullable<typeof stroke.current>, p: { x: number; y: number }) => {
    const a = st.assist
    if (!a) return p
    if (!a.dir) {
      const dx = p.x - a.x
      const dy = p.y - a.y
      if (Math.hypot(dx, dy) < 10 / view.s) return null
      const dirs = guideDirs(a.x, a.y)
      if (!dirs.length) {
        st.assist = null
        return p
      }
      const l = Math.hypot(dx, dy)
      let best = dirs[0]
      let score = -1
      for (const d of dirs) {
        const c = Math.abs((d[0] * dx + d[1] * dy) / l)
        if (c > score) {
          score = c
          best = d
        }
      }
      a.dir = best
    }
    const t = (p.x - a.x) * a.dir[0] + (p.y - a.y) * a.dir[1]
    return { x: a.x + a.dir[0] * t, y: a.y + a.dir[1] * t }
  }
  // --- Asistente de dibujo (Shaper, guías inteligentes y curvatura), ver shaper.ts ---
  /** Puntos de las formas ya hechas (esquinas, extremos, centros), para engancharse a ellos. */
  const shaperKeys = useRef<ShaperPoint[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const guideTimer = useRef(0)
  const showGuides = (g: Guide[]) => {
    window.clearTimeout(guideTimer.current)
    setGuides(g)
    if (g.length) guideTimer.current = window.setTimeout(() => setGuides([]), 1400)
  }
  /** A qué se engancha: centro del papel, eje y medidas de las prendas y las formas ya dibujadas. */
  const snapCtx = () => {
    const keys: ShaperPoint[] = [[doc.w / 2, doc.h / 2], ...shaperKeys.current]
    for (const l of doc.layers) {
      if (l.kind !== 'mockup' || !l.visible) continue
      const c = r.mockups.get(l.id)
      const h = c ? (l.w * c.height) / c.width : l.w
      keys.push([l.x + l.w / 2, l.y], [l.x + l.w / 2, l.y + h / 2], [l.x + l.w / 2, l.y + h])
    }
    return { keys, near: 12 / view.s, w: doc.w, h: doc.h }
  }
  /** El trazo en marcha pasa a ser esta forma (polilínea), con el pincel de siempre. */
  const applyShape = (st: NonNullable<typeof stroke.current>, shape: number[]) => {
    const target = raw.current!
    target.getContext('2d')!.clearRect(0, 0, doc.w, doc.h)
    const s = new Stroke(target, { ...st.opts, streamline: 0 })
    for (let i = 0; i < shape.length; i += 2) s.add(shape[i], shape[i + 1], st.pressure || 0.6)
    st.s = s
    st.shaped = true
    s.takeFrame()
    renderFrame({ x0: 0, y0: 0, x1: doc.w, y1: doc.h })
    redraw()
  }
  /** QuickShape (mantener quieto al acabar) y Shaper (siempre): el trazo se rehace como la forma perfecta. */
  const quickShape = (st: NonNullable<typeof stroke.current>, hold = true) => {
    const found = recognize(st.pts, snapCtx())
    if (!found) return
    applyShape(st, found.shape)
    shaperKeys.current = [...shaperKeys.current, ...found.keys].slice(-200)
    showGuides(found.guides)
    flash(hold ? `${found.label} (suelta para dejarla)` : found.label)
  }
  /** Garabato con el Shaper: borra lo que tapa en la capa. */
  const eraseArea = (layerId: string, pts: number[]) => {
    const poly = hull(pts)
    if (poly.length < 3) return
    const lc = r.layer(layerId)
    const xs = poly.map((p) => p[0])
    const ys = poly.map((p) => p[1])
    const rect = {
      x0: Math.max(0, Math.floor(Math.min(...xs)) - 2),
      y0: Math.max(0, Math.floor(Math.min(...ys)) - 2),
      x1: Math.min(doc.w, Math.ceil(Math.max(...xs)) + 2),
      y1: Math.min(doc.h, Math.ceil(Math.max(...ys)) + 2),
    }
    if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return
    const before = grab(lc, rect)
    const g = lc.getContext('2d')!
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()
    g.restore()
    r.history.push({ kind: 'pixels', layer: layerId, rect, before, after: grab(lc, rect) })
    r.dirty.add(layerId)
    touch()
    redraw()
    flash('Garabato: borrado (Ctrl+Z para recuperarlo)')
  }
  // Curvatura: se ponen puntos y la curva pasa por todos; Intro o doble clic acaba, tocar el primero la cierra
  const [curvePts, setCurvePts] = useState<ShaperPoint[]>([])
  const curveClick = (p: { x: number; y: number }) => {
    if (curvePts.length >= 3 && Math.hypot(p.x - curvePts[0][0], p.y - curvePts[0][1]) < 14 / view.s) return finishCurve(true)
    const c = snapCtx()
    const s = snapPoint([p.x, p.y], { ...c, keys: [...c.keys, ...curvePts] })
    showGuides(s.guides)
    setCurvePts([...curvePts, s.p])
  }
  const finishCurve = (closed: boolean) => {
    // Sin los puntos repetidos (el doble clic pone dos más en el mismo sitio)
    const pts = curvePts.filter((p, i) => !i || Math.hypot(p[0] - curvePts[i - 1][0], p[1] - curvePts[i - 1][1]) > 3)
    setCurvePts([])
    if (pts.length < 2) return
    const shape = curveThrough(pts, closed)
    const fake = { clientX: 0, clientY: 0, pointerId: -1, pointerType: 'mouse', pressure: 0.5, button: 0 } as unknown as ReactPointerEvent
    startStroke(fake, false, { x: shape[0], y: shape[1] })
    const st = stroke.current
    if (!st) return
    st.pts = shape
    applyShape(st, shape)
    shaperKeys.current = [...shaperKeys.current, ...pts].slice(-200)
    endStroke(null)
    flash(closed ? 'Curva cerrada' : 'Curva')
  }
  const moveStroke = (e: ReactPointerEvent) => {
    const st = stroke.current
    if (!st || e.pointerId !== st.pointer || st.shaped) return
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = assisted(st, toDoc(ev.clientX, ev.clientY))
      if (!p) continue
      st.s.add(p.x, p.y, pressureOf(ev))
      st.pts.push(p.x, p.y)
      st.pressure = pressureOf(ev)
    }
    // Mientras se mueve, el temporizador de «mantener quieto» vuelve a empezar
    const d = Math.hypot(e.clientX - st.anchor.x, e.clientY - st.anchor.y)
    if (d > 3) {
      st.travel += d
      st.anchor = { x: e.clientX, y: e.clientY }
      armHold()
    }
    scheduleFrame()
  }
  const endStroke = (e: ReactPointerEvent | null, cancel = false) => {
    const st = stroke.current
    if (!st) return
    if (e && e.pointerId !== st.pointer) return
    clearTimeout(st.hold)
    let scribble: number[] | null = null
    if (tool === 'shaper' && !cancel && !st.shaped && !st.erase && st.pointer !== -1) {
      if (isScribble(st.pts)) {
        scribble = st.pts
        cancel = true
      } else quickShape(st, false)
    }
    if (e && !cancel && !st.shaped && !st.assist) {
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
      if (!st.erase && !st.smudge) {
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
    if (scribble) eraseArea(st.layer.id, scribble)
  }
  const remember = (c: string) => {
    if (settings.recent[0] === c) return
    setSettings({ recent: [c, ...settings.recent.filter((x) => x !== c)].slice(0, 14) })
  }

  // --- Selección a mano (lazo) y transformar ---
  const [lasso, setLasso] = useState<number[] | null>(null)
  const [selection, setSelection] = useState<Path2D | null>(null)
  const [selectionPts, setSelectionPts] = useState<number[] | null>(null)
  /** Trozo levantado para transformar: su imagen, dónde estaba y cómo se ha movido, escalado y girado. */
  const [floating, setFloating] = useState<{
    layer: string
    canvas: HTMLCanvasElement
    x: number
    y: number
    w: number
    h: number
    dx: number
    dy: number
    /** Escala a lo ancho y a lo alto (iguales al escalar desde la esquina). */
    sx: number
    sy: number
    rot: number
    /** Distorsionar: las cuatro esquinas (arriba izq., arriba der., abajo der., abajo izq.) en el lienzo. */
    corners: [number, number][] | null
    before: ImageData
  } | null>(null)
  const clearSelection = () => {
    setSelection(null)
    setSelectionPts(null)
  }
  const selTarget = () => {
    if (!paintLayer) {
      flash('Elige una capa de pintura (en «Capas»)')
      return null
    }
    if (paintLayer.locked) {
      flash('La capa está bloqueada')
      return null
    }
    return paintLayer
  }
  const all = () => ({ x0: 0, y0: 0, x1: doc.w, y1: doc.h })
  /** Aplica una operación sobre la capa de pintura dentro de la selección, con su paso de deshacer. */
  const withSelection = (fn: (g: CanvasRenderingContext2D, path: Path2D) => void) => {
    const l = selTarget()
    if (!l || !selection) return
    const lc = r.layer(l.id)
    const before = grab(lc, all())
    const g = lc.getContext('2d')!
    g.save()
    fn(g, selection)
    g.restore()
    r.history.push({ kind: 'pixels', layer: l.id, rect: all(), before, after: grab(lc, all()) })
    r.dirty.add(l.id)
    touch()
    redraw()
  }
  const selErase = () => withSelection((g, p) => (g.clip(p), g.clearRect(0, 0, doc.w, doc.h)))
  const selFill = () => withSelection((g, p) => ((g.fillStyle = settings.color), g.fill(p)))
  /** Copia (o corta) lo seleccionado a una capa de pintura nueva, encima. */
  const selToLayer = (cut: boolean) => {
    const l = selTarget()
    if (!l || !selection) return
    const id = uid()
    const nc = r.layer(id)
    const ng = nc.getContext('2d')!
    ng.save()
    ng.clip(selection)
    ng.drawImage(r.layer(l.id), 0, 0)
    ng.restore()
    r.dirty.add(id)
    if (cut) selErase()
    insertAbove({ id, kind: 'paint', name: `${l.name} (${cut ? 'cortado' : 'copia'})`, file: null, visible: true, locked: false, opacity: 1, blend: 'normal' })
    clearSelection()
  }
  /** Lo seleccionado con el lazo pasa a ser una fornitura propia («Mis fornituras»): su dibujo, recortado. */
  const [hwSave, setHwSave] = useState<{ kind: 'tirador' | 'boton' | 'tope' | 'parche' | 'etiqueta'; name: string } | null>(null)
  const saveSelectionAsHardware = async () => {
    const l = selTarget()
    if (!l || !selection || !selectionPts || !hwSave) return
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (let i = 0; i < selectionPts.length; i += 2) {
      x0 = Math.min(x0, selectionPts[i])
      x1 = Math.max(x1, selectionPts[i])
      y0 = Math.min(y0, selectionPts[i + 1])
      y1 = Math.max(y1, selectionPts[i + 1])
    }
    x0 = Math.max(0, Math.floor(x0))
    y0 = Math.max(0, Math.floor(y0))
    const w = Math.min(doc.w, Math.ceil(x1)) - x0
    const h = Math.min(doc.h, Math.ceil(y1)) - y0
    if (w < 4 || h < 4) return flash('La selección es muy pequeña')
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.translate(-x0, -y0)
    g.clip(selection)
    g.drawImage(r.layer(l.id), 0, 0)
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
    if (!blob) return flash('No se ha podido recortar')
    try {
      const { key } = await api.uploadBlob(blob)
      const art = { artworkId: null, file: key, aspect: h / w }
      const k = hwSave.kind
      const base = (kind: DetailKind) => ({ ...DETAIL_DEFAULTS[kind], id: crypto.randomUUID(), view: 'front' as const, x: 0, y: 0 })
      const detail: Detail =
        k === 'tirador'
          ? { ...base('cremallera'), style: 'metal', puller: 'logo', art }
          : k === 'boton'
            ? { ...base('boton'), style: 'logo', art }
            : k === 'tope'
              ? { ...base('tope'), style: 'logo', art }
              : k === 'parche'
                ? { ...base('parche'), style: 'libre', art }
                : { ...base('etiqueta'), art }
      const preset = await api.createHardware(hwSave.name.trim() || 'Mi fornitura', detail)
      setPresets((list) => [preset, ...list])
      setHwSave(null)
      clearSelection()
      flash(`«${preset.name}» guardada en Mis fornituras (Biblioteca)`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se ha podido guardar')
    }
  }
  /** Levanta lo seleccionado (o la capa entera) para moverlo, escalarlo y girarlo. */
  const startTransform = () => {
    const l = selTarget()
    if (!l) return
    const lc = r.layer(l.id)
    const before = grab(lc, all())
    // Caja de lo que se levanta: la de la selección o la de lo pintado en la capa
    let x0 = 0
    let y0 = 0
    let x1 = doc.w
    let y1 = doc.h
    if (selectionPts) {
      x0 = Infinity
      y0 = Infinity
      x1 = -Infinity
      y1 = -Infinity
      for (let i = 0; i < selectionPts.length; i += 2) {
        x0 = Math.min(x0, selectionPts[i])
        x1 = Math.max(x1, selectionPts[i])
        y0 = Math.min(y0, selectionPts[i + 1])
        y1 = Math.max(y1, selectionPts[i + 1])
      }
    } else {
      const b = paintedBox(lc)
      if (!b) return flash('La capa está vacía')
      ;[x0, y0, x1, y1] = b
    }
    x0 = Math.max(0, Math.floor(x0))
    y0 = Math.max(0, Math.floor(y0))
    x1 = Math.min(doc.w, Math.ceil(x1))
    y1 = Math.min(doc.h, Math.ceil(y1))
    const w = Math.max(1, x1 - x0)
    const h = Math.max(1, y1 - y0)
    const piece = document.createElement('canvas')
    piece.width = w
    piece.height = h
    const pg = piece.getContext('2d')!
    pg.save()
    pg.translate(-x0, -y0)
    if (selection) pg.clip(selection)
    pg.drawImage(lc, 0, 0)
    pg.restore()
    // Se quita de la capa mientras se transforma
    const g = lc.getContext('2d')!
    g.save()
    if (selection) g.clip(selection)
    g.clearRect(0, 0, doc.w, doc.h)
    g.restore()
    setFloating({ layer: l.id, canvas: piece, x: x0, y: y0, w, h, dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, corners: null, before })
    clearSelection()
    redraw()
  }
  /** Deja lo transformado en la capa (o lo devuelve como estaba). */
  const endTransform = (apply: boolean) => {
    const f = floating
    if (!f) return
    const lc = r.layer(f.layer)
    const g = lc.getContext('2d')!
    if (apply) {
      g.save()
      if (f.corners) warpDraw(g, f.canvas, f.corners, 28)
      else {
        g.translate(f.x + f.w / 2 + f.dx, f.y + f.h / 2 + f.dy)
        g.rotate((f.rot * Math.PI) / 180)
        g.scale(f.sx, f.sy)
        g.drawImage(f.canvas, -f.w / 2, -f.h / 2)
      }
      g.restore()
      r.history.push({ kind: 'pixels', layer: f.layer, rect: all(), before: f.before, after: grab(lc, all()) })
      r.dirty.add(f.layer)
      touch()
    } else g.putImageData(f.before, 0, 0)
    setFloating(null)
    redraw()
  }
  /** Arrastre de un tirador del trozo levantado: mover, escalar (esquina) o girar. */
  /** Las cuatro esquinas del trozo tal como está ahora (para pasar a distorsionar). */
  const cornersOf = (f: NonNullable<typeof floating>): [number, number][] => {
    const cx = f.x + f.w / 2 + f.dx
    const cy = f.y + f.h / 2 + f.dy
    const a = (f.rot * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    return (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const
    ).map(([u, v]) => {
      const lx = (u * f.w * f.sx) / 2
      const ly = (v * f.h * f.sy) / 2
      return [cx + lx * c - ly * s, cy + lx * s + ly * c] as [number, number]
    })
  }
  /** Arrastre de una esquina al distorsionar (o de todas, para moverlo). */
  const dragCorner = (e: React.PointerEvent, i: number | 'all') => {
    e.stopPropagation()
    e.preventDefault()
    const f0 = floating
    if (!f0?.corners) return
    const el = e.currentTarget as Element
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Puntero ya suelto
    }
    const start = toDoc(e.clientX, e.clientY)
    const c0 = f0.corners
    const move = (ev: PointerEvent) => {
      const p = toDoc(ev.clientX, ev.clientY)
      const dx = p.x - start.x
      const dy = p.y - start.y
      setFloating((f) => f && { ...f, corners: c0.map(([x, y], k) => (i === 'all' || k === i ? [x + dx, y + dy] : [x, y]) as [number, number]) })
    }
    const up = () => {
      el.removeEventListener('pointermove', move as EventListener)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move as EventListener)
    el.addEventListener('pointerup', up)
  }
  const warpRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = warpRef.current
    if (!c || !floating?.corners) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    warpDraw(g, floating.canvas, floating.corners, 14)
  }, [floating])
  const dragFloating = (e: React.PointerEvent, mode: 'move' | 'scale' | 'rotate' | 'sx' | 'sy') => {
    e.stopPropagation()
    e.preventDefault()
    const f0 = floating
    if (!f0) return
    const el = e.currentTarget as HTMLElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Puntero ya suelto: se sigue sin captura
    }
    const start = toDoc(e.clientX, e.clientY)
    const cx = f0.x + f0.w / 2 + f0.dx
    const cy = f0.y + f0.h / 2 + f0.dy
    const d0 = Math.hypot(start.x - cx, start.y - cy) || 1
    const a0 = Math.atan2(start.y - cy, start.x - cx)
    const move = (ev: PointerEvent) => {
      const p = toDoc(ev.clientX, ev.clientY)
      if (mode === 'move') setFloating((f) => f && { ...f, dx: f0.dx + p.x - start.x, dy: f0.dy + p.y - start.y })
      else if (mode === 'scale') {
        const k = Math.hypot(p.x - cx, p.y - cy) / d0
        setFloating((f) => f && { ...f, sx: Math.max(0.05, f0.sx * k), sy: Math.max(0.05, f0.sy * k) })
      } else if (mode === 'sx' || mode === 'sy') {
        // Estirar a lo ancho o a lo alto (sobre los ejes del trozo, aunque esté girado)
        const a = (f0.rot * Math.PI) / 180
        const ux = mode === 'sx' ? Math.cos(a) : -Math.sin(a)
        const uy = mode === 'sx' ? Math.sin(a) : Math.cos(a)
        const d = Math.abs((p.x - cx) * ux + (p.y - cy) * uy)
        const half = (mode === 'sx' ? f0.w : f0.h) / 2
        setFloating((f) => f && (mode === 'sx' ? { ...f, sx: Math.max(0.05, d / half) } : { ...f, sy: Math.max(0.05, d / half) }))
      } else {
        let rot = f0.rot + ((Math.atan2(p.y - cy, p.x - cx) - a0) * 180) / Math.PI
        // Se ajusta a 0, 45, 90… si está muy cerca
        const snap = Math.round(rot / 45) * 45
        if (Math.abs(rot - snap) < 3) rot = snap
        setFloating((f) => f && { ...f, rot })
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  // --- Cuentagotas, bote y mover ---
  const pick = (x: number, y: number) => {
    const c = compose(r, doc)
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    const hex = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    setSettings({ color: hex })
  }
  const fill = (x: number, y: number) => {
    // Capa en la que pinta el bote: la de pintura elegida o, si no, la de pintura más alta
    const target = paintLayer ?? ([...doc.layers].reverse().find((l) => l.kind === 'paint') as PaintLayer | undefined) ?? null
    if (settings.fillMode === 'pieza') {
      const hit = pieceAt(r, doc, x, y)
      if (!hit) {
        // Mockup de imagen: se rellena la zona que se ha tocado, entre sus líneas
        const inGarment = garmentMask(r, doc).getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 0
        if (inGarment && target) return fillZone(target, x, y)
        return flash('Toca una pieza de una prenda (o cambia el bote a «Zona pintada»)')
      }
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
        return props.onPieceColor(hit.piece, settings.color, next, fillSurface())
      }
      const surface = fillSurface()
      return patch(hit.layer.id, { ...(toColor ? { style: 'color' } : {}), pieces: { ...hit.layer.pieces, [hit.piece]: { color: settings.color, ...(surface ? { surface } : {}) } } })
    }
    if (!target) return flash('Añade una capa de pintura para rellenar')
    fillZone(target, x, y)
  }
  /** Estampado elegido en el bote (o null si es color liso). */
  const fillSurface = (): Surface | null => {
    const p = settings.fillPattern
    if (!p || p.kind === 'liso') return null
    return { kind: p.kind, color2: p.color2, color3: patternDefaults(p.kind).c3, size: p.size || DEFAULT_SIZE[p.kind] || 3, angle: p.angle, ...(p.file ? { file: p.file } : {}) }
  }
  /** Rellena la zona cerrada por líneas alrededor de (x, y), en la capa de pintura `layer`. */
  const fillZone = (layer: PaintLayer, x: number, y: number) => {
    const paintLayer = layer
    if (paintLayer.locked) return flash('La capa de pintura está bloqueada')
    // Con capas de referencia, la zona sale solo de ellas (las líneas del dibujo), aunque se pinte en otra capa
    const refs = doc.layers.filter((l) => l.reference && l.visible)
    const mask = floodMask(refs.length ? compose(r, { ...doc, layers: refs }, { paper: false }) : compose(r, doc), x, y)
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
    // Color liso o estampado (el azulejo del Diseñador, a unos 10 px por cm del lienzo y girado)
    const surface = fillSurface()
    const tile = surface ? pieceTile({ color: settings.color, surface }) : null
    if (tile && !tile.stretch) {
      const pattern = g.createPattern(tile.canvas, 'repeat')!
      const k = (tile.cm * 10) / tile.canvas.width
      pattern.setTransform(new DOMMatrix().rotate(surface!.angle).scale(k))
      g.fillStyle = pattern
    } else g.fillStyle = settings.color
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
    } else if (l.kind === 'vector') {
      change({ ...doc, layers: doc.layers.map((x) => (x.id === l.id ? { ...l, paths: l.paths.map((p) => translatePath(p, m.dx, m.dy)) } : x)) })
    } else if (l.kind !== 'texture') {
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
    const remote = e.pointerId === REMOTE_POINTER
    if (!remote) {
      setPanel(null)
      setQuick(null)
    }
    const el = viewport.current!
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Puntero ya suelto: se sigue sin captura
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, t: performance.now(), sx: e.clientX, sy: e.clientY })
    if (e.pointerType === 'pen' && !remote) penSeen.current = true
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch')
    if (e.pointerType === 'touch' && touches.length >= 2) {
      // Segundo dedo: si el primero empezó a pintar hace muy poco, se cancela (era un gesto)
      if (stroke.current && stroke.current.touchStart && performance.now() - stroke.current.touchStart < 300) endStroke(null, true)
      if (vec.dragging()) vec.cancel()
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
    if (tool === 'brush' || tool === 'eraser' || tool === 'shaper') startStroke(e, tool === 'eraser')
    else if (tool === 'curve') curveClick(p)
    else if (isVectorTool(tool)) vec.down([p.x, p.y], e, e.timeStamp)
    else if (tool === 'picker') pick(p.x, p.y)
    else if (tool === 'fill') fill(p.x, p.y)
    else if (tool === 'select') {
      if (floating) return
      clearSelection()
      setLasso([p.x, p.y])
    } else if (tool === 'text') {
      // Toca un texto para editarlo; en otro sitio, uno nuevo
      const hit = [...doc.layers].reverse().find((l): l is TextLayer => l.kind === 'text' && l.visible && Math.abs(l.x - p.x) < l.size * Math.max(2, l.text.length * 0.3) && Math.abs(l.y - p.y) < l.size)
      if (hit) setActive(hit.id)
      else addText(p.x, p.y)
      setPanel('layers')
    }
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
      userMoved.current = true
      setView({ s, r: g.view.r + rot, x: mx + (ox * cos - oy * sin) * f + (now.mid.x - g.mid.x), y: my + (ox * sin + oy * cos) * f + (now.mid.y - g.mid.y) })
      return
    }
    if (panning.current) {
      const p = panning.current
      userMoved.current = true
      setView({ ...p.view, x: p.view.x + e.clientX - p.x, y: p.view.y + e.clientY - p.y })
      return
    }
    if (vec.dragging()) {
      // El lápiz vectorial usa también los puntos intermedios del movimiento (trazos rápidos o con lápiz digital)
      const evs = tool === 'vpencil' ? ((e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []) : []
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const q = toDoc(ev.clientX, ev.clientY)
        vec.move([q.x, q.y], e, ev.timeStamp || undefined)
      }
      return
    }
    if (stroke.current) return moveStroke(e)
    if (lasso && tool === 'select') {
      const p = toDoc(e.clientX, e.clientY)
      const n = lasso.length
      if (Math.hypot(p.x - lasso[n - 2], p.y - lasso[n - 1]) > 3) setLasso([...lasso, p.x, p.y])
      return
    }
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
    if (vec.dragging()) return vec.up()
    if (stroke.current) return endStroke(e)
    if (lasso) {
      if (lasso.length >= 8) {
        const path = new Path2D()
        path.moveTo(lasso[0], lasso[1])
        for (let i = 2; i < lasso.length; i += 2) path.lineTo(lasso[i], lasso[i + 1])
        path.closePath()
        setSelection(path)
        setSelectionPts(lasso)
      }
      setLasso(null)
      return
    }
    if (moving.current) endMove()
  }

  const onWheel = (e: React.WheelEvent) => {
    userMoved.current = true
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
      if (creatorOpen.current) return
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
        } else if (tool === 'curve' && curvePts.length && (k === 'enter' || k === 'escape' || k === 'backspace')) {
          e.preventDefault()
          if (k === 'enter') finishCurve(false)
          else if (k === 'escape') setCurvePts([])
          else setCurvePts(curvePts.slice(0, -1))
        } else if (isVectorTool(tool) && vec.key(k)) {
          e.preventDefault()
        } else if (k === 'p') setTool('pen')
        else if (k === 'l') setTool('vpencil')
        else if (k === 'a') setTool('direct')
        else if (k === 'm') setTool('vshape')
        else if (k === 'n') setTool('shaper')
        else if (k === 'c') setTool('curve')
        else if (k === 'b') setTool('brush')
        else if (k === 'e') setTool('eraser')
        else if (k === 'i') setTool('picker')
        else if (k === 'g') setTool('fill')
        else if (k === 'v') setTool('move')
        else if (k === 't') setTool('text')
        else if (k === 's') setTool('select')
        else if (k === 'enter' && floating) endTransform(true)
        else if (k === '0') {
          userMoved.current = false
          fit()
        }
        else if (k === '[') setSize(Math.max(1, Math.round(size / 1.2)))
        else if (k === ']') setSize(Math.min(500, Math.round(size * 1.2 + 1)))
        else if (k === 'escape') {
          setPanel(null)
          setQuick(null)
          if (floating) endTransform(false)
          else clearSelection()
        }
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
      if (creatorOpen.current) return
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
  /** Prendas y mockups: debajo de todas las capas de pintura (son la base; si no, tapaban lo pintado). */
  const insertBase = (l: CanvasLayer) => {
    const i = doc.layers.findIndex((x) => x.kind === 'paint')
    const layers = [...doc.layers]
    layers.splice(i < 0 ? layers.length : i, 0, l)
    change({ ...doc, layers })
    setActive(l.id)
  }
  const addPaint = () => {
    const n = doc.layers.filter((l) => l.kind === 'paint').length + 1
    insertAbove({ id: uid(), kind: 'paint', name: `Capa ${n}`, file: null, visible: true, locked: false, opacity: 1, blend: 'normal' })
  }
  const addMockup = (view: MockupLayer['view']) => {
    const label = view === 'front' ? 'Delantero' : view === 'back' ? 'Espalda' : 'Lateral'
    insertBase({ id: uid(), kind: 'mockup', name: `Prenda · ${label}`, view, x: doc.w / 2 - 400, y: 120, w: 800, style: 'linea', visible: true, locked: false, opacity: 1, blend: 'normal' })
  }
  /** Prenda del catálogo como mockup nuevo, centrada en (x, y). */
  const addGarment = (entryId: string, x: number, y: number) => {
    const e = NEW_DESIGN_CATALOG.find((c) => c.id === entryId)
    if (!e) return
    const w = e.template.family === 'head' ? 420 : 620
    const opts = { ...defaultDesign(e.template, e.options).options }
    insertBase({ id: uid(), kind: 'mockup', name: e.name, view: 'front', x: x - w / 2, y: y - w * 0.6, w, style: 'linea', template: e.template.id, options: opts, pieces: {}, visible: true, locked: false, opacity: 1, blend: 'normal' })
    setTool('move')
  }
  /** Cuello o capucha soltado sobre una prenda editable: se le pone si esa prenda lo tiene. */
  const applyOption = (item: Extract<LibraryItem, { kind: 'option' }>, x: number, y: number) => {
    const target = [...doc.layers].reverse().find((l): l is MockupLayer => {
      if (l.kind !== 'mockup' || !l.visible) return false
      const m = r.mockups.get(l.id)
      const h = m ? (l.w * m.height) / m.width : l.w
      return x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + h
    })
    if (!target) return flash('Suéltalo encima de una prenda editable (las de «Prendas editables» o la de tu diseño)')
    const t = target.template ? getTemplate(target.template) : template
    const opt = t?.options.find((o) => o.id === item.option)
    const ok = opt && (opt.type === 'toggle' ? typeof item.value === 'boolean' : opt.choices.some((c) => c.id === item.value))
    if (!t || !ok) return flash(`${t?.name ?? 'Esta prenda'} no tiene «${item.label}»`)
    if (target.template) patch(target.id, { options: { ...target.options, [item.option]: item.value } })
    else props.onOptions({ [item.option]: item.value })
    setActive(target.id)
    flash(`${t.name}: ${item.label}`)
  }
  /** Texto nuevo en (x, y), con el color elegido y la última fuente usada. */
  const addText = (x: number, y: number) => {
    const n = doc.layers.filter((l) => l.kind === 'text').length + 1
    const last = [...doc.layers].reverse().find((l): l is TextLayer => l.kind === 'text')
    insertAbove({ id: uid(), kind: 'text', name: `Texto ${n}`, text: 'TU TEXTO', font: last?.font ?? "'Anton', sans-serif", size: last?.size ?? 90, color: settings.color, x, y, rotation: 0, visible: true, locked: false, opacity: 1, blend: 'normal' })
  }
  /** Gráfico de la Biblioteca (logo, estampado) como capa de imagen, centrado en (x, y). */
  const addArtwork = async (a: Artwork, x: number, y: number) => {
    const img = await loadImage(fileOf(a.file))
    if (img) r.images.set(a.file, img)
    const aspect = a.height / Math.max(1, a.width)
    const w = aspect > 1 ? 300 / aspect : 360
    insertAbove({ id: uid(), kind: 'image', name: a.name, file: a.file, aspect, x: x - w / 2, y: y - (w * aspect) / 2, w, rotation: 0, visible: true, locked: false, opacity: 1, blend: 'normal' })
    // No se cambia de herramienta: si se estaba dibujando, se sigue dibujando (encima, en una capa nueva)
    flash('Gráfico añadido. Para moverlo, usa Mover (V)')
  }
  /** Mockup de la biblioteca (imagen), centrado en (x, y). */
  const addMockupAsset = async (m: MockupAsset, x: number, y: number) => {
    const img = await loadImage(m.file)
    if (img) r.images.set(m.file, img)
    const w = m.aspect > 1 ? 420 : Math.min(900, 380 / m.aspect)
    insertBase({ id: uid(), kind: 'image', name: m.name, file: '', asset: m.file, aspect: m.aspect, x: x - w / 2, y: y - (w * m.aspect) / 2, w, rotation: 0, visible: true, locked: false, opacity: 1, blend: 'normal' })
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
    const raw = inside ? toDoc(clientX!, clientY!) : center()
    const p = { x: Math.min(doc.w - 60, Math.max(60, raw.x)), y: Math.min(doc.h - 60, Math.max(60, raw.y)) }
    if (item.kind === 'garment') addGarment(item.id, p.x, p.y)
    else if (item.kind === 'mockup') addMockupAsset(item.asset, p.x, p.y)
    else if (item.kind === 'art') addArtwork(item.artwork, p.x, p.y)
    else if (item.kind === 'option') applyOption(item, raw.x, raw.y)
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
      // No se cambia de herramienta: antes pasaba a Mover y, al seguir dibujando, se arrastraba la imagen
      flash('Imagen añadida. Para moverla, usa Mover (V); para dibujar encima, sigue con el pincel')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se ha podido subir la imagen')
    }
  }
  useEffect(() => {
    if (!props.pendingImage || loading) return
    addImage(props.pendingImage)
    props.onPendingImage?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingImage, loading])
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
  /**
   * Textura encima de la capa elegida, ya recortada a ella y en su fusión (Superponer o Luz suave): coge el color de
   * debajo y le pone el tejido. Se pueden poner varias, una encima de otra.
   */
  const addTexture = async (src: TextureDef | LienzoAsset) => {
    const own = 'kind' in src
    if (own && !r.images.has(src.file)) {
      const img = await loadImage(fileOf(src.file))
      if (img) r.images.set(src.file, img)
    }
    const def = own ? null : src
    insertAbove({
      id: uid(),
      kind: 'texture',
      name: src.name,
      texture: own ? '' : src.id,
      ...(own ? { file: src.file } : {}),
      scale: def?.scale ?? 1,
      rotation: 0,
      clip: layer ? true : undefined,
      visible: true,
      locked: false,
      opacity: def?.opacity ?? 0.8,
      blend: def?.blend ?? 'overlay',
    })
    flash(layer ? `${src.name}: recortada a «${layer.name}». Cambia su escala y fusión en Capas` : `${src.name} añadida`)
  }
  const uploadTexture = async (file: File) => {
    flash('Subiendo textura…')
    try {
      const { key } = await api.uploadImage(file)
      const a = await api.createLienzoAsset({ kind: 'textura', name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Textura', file: key, grain: null, settings: {} })
      setAssets((list) => [a, ...list])
      await addTexture(a)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se ha podido subir la textura')
    }
  }
  const deleteAsset = (a: LienzoAsset) => {
    setAssets((list) => list.filter((x) => x.id !== a.id))
    api.deleteLienzoAsset(a.id).catch(() => flash('No se ha podido borrar'))
  }

  // --- Pinceles propios: importar de Procreate, desde una imagen o guardar el actual ---
  const saveBrushAsset = async (name: string, tip: HTMLCanvasElement | null, grain: HTMLCanvasElement | null, s: LienzoAsset['settings']) => {
    const file = tip ? (await api.uploadBlob(await pngOf(tip))).key : ''
    const grainKey = grain ? (await api.uploadBlob(await pngOf(grain))).key : null
    const a = await api.createLienzoAsset({ kind: 'pincel', name: name.slice(0, 60), file, grain: grainKey, settings: s })
    if (tip || grain) registerBrushImages(`u:${a.id}`, tip, grain)
    setAssets((list) => [a, ...list])
    return a
  }
  const importBrushes = async (file: File) => {
    flash('Importando pinceles…')
    try {
      const list = await importProcreate(file)
      let last: LienzoAsset | null = null
      for (const b of list) last = await saveBrushAsset(b.name, b.tip, b.grain, { ...IMPORTED, grain: b.grain ? 0.8 : 0 })
      if (last) setSettings({ brush: `u:${last.id}` })
      setTool('brush')
      flash(`${list.length === 1 ? 'Pincel importado' : `${list.length} pinceles importados`}: están en «Mis pinceles»`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se han podido importar los pinceles')
    }
  }
  const brushFromImage = async (file: File, as: 'tip' | 'grain') => {
    try {
      const url = URL.createObjectURL(file)
      const img = await loadImage(url)
      URL.revokeObjectURL(url)
      if (!img) throw new Error('Imagen no válida')
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 50) || 'Pincel'
      const a =
        as === 'tip'
          ? await saveBrushAsset(name, tipFromImage(img), null, { ...IMPORTED, grain: 0 })
          : await saveBrushAsset(`${name} (grano)`, null, grainFromImage(img), { base: 'redondo', size: 50, grain: 0.85, hardness: 0.9, flow: 1, spacing: 0.05 })
      setSettings({ brush: `u:${a.id}` })
      setTool('brush')
      flash(`«${a.name}» guardado en Mis pinceles`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se ha podido crear el pincel')
    }
  }
  const saveCurrentBrush = async () => {
    const b = brush
    const own = assets.find((a) => `u:${a.id}` === b.id)
    try {
      const a = await saveBrushAsset(`${b.name} (mío)`, null, null, {
        ...(own ? own.settings : { base: b.id }),
        size,
        opacity,
        streamline,
      })
      setSettings({ brush: `u:${a.id}` })
      flash(`«${a.name}» guardado en Mis pinceles: cámbialo abajo`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se ha podido guardar')
    }
  }

  /**
   * Luces y sombras automáticas: cada pieza de las prendas del lienzo con su sombra en los bordes, brillo en el centro,
   * pliegues y sombra bajo las costuras, en dos capas (se rehacen si se vuelve a generar).
   */
  const AUTO = ['Sombras automáticas', 'Luces automáticas']
  const autoLayers = doc.layers.filter((l) => l.kind === 'paint' && AUTO.includes(l.name))
  const generateShading = () => {
    flash('Calculando luces y sombras…')
    setTimeout(() => {
      const keep = doc.layers.filter((l) => !(l.kind === 'paint' && AUTO.includes(l.name)))
      const base = { ...doc, layers: keep }
      // Las prendas (con sus líneas) y el color de cada pieza (sin las capas de luz y sombra)
      const res = autoShade(garmentMask(r, base), compose(r, { ...base, layers: keep.filter((l) => !l.role) }, { paper: false }), { style: settings.shadeStyle, light: settings.lightFrom })
      if (!res.pieces) return flash('No hay prendas en el lienzo: pon una desde «Diseños» o Biblioteca → Mockups')
      const amount = autoLayers[0]?.opacity ?? 0.7
      const sid = uid()
      const lid = uid()
      r.layer(sid).getContext('2d')!.drawImage(res.shadow, 0, 0)
      r.layer(lid).getContext('2d')!.drawImage(res.light, 0, 0)
      r.dirty.add(sid)
      r.dirty.add(lid)
      change({
        ...base,
        layers: [
          ...keep,
          { id: sid, kind: 'paint', name: AUTO[0], file: null, visible: true, locked: false, opacity: amount, blend: 'multiply', role: 'sombra' },
          { id: lid, kind: 'paint', name: AUTO[1], file: null, visible: true, locked: false, opacity: amount, blend: 'screen', role: 'luz' },
        ],
      })
      setActive(sid)
      flash(`Luces y sombras en ${res.pieces} piezas, en dos capas: retócalas con el borrador o los pinceles de luz y sombra`)
    }, 40)
  }

  /** Cambia los píxeles de una capa de pintura entera (con su paso de deshacer). */
  const pixelOp = (l: PaintLayer, fn: (g: CanvasRenderingContext2D, src: HTMLCanvasElement) => void) => {
    if (l.locked) return flash('La capa está bloqueada')
    const lc = r.layer(l.id)
    const before = grab(lc, all())
    const copy = document.createElement('canvas')
    copy.width = doc.w
    copy.height = doc.h
    copy.getContext('2d')!.drawImage(lc, 0, 0)
    const g = lc.getContext('2d')!
    g.save()
    g.clearRect(0, 0, doc.w, doc.h)
    fn(g, copy)
    g.restore()
    r.history.push({ kind: 'pixels', layer: l.id, rect: all(), before, after: grab(lc, all()) })
    r.dirty.add(l.id)
    touch()
    redraw()
  }
  /** Voltear una capa: la de pintura (sus píxeles) o una imagen. */
  const flipLayer = (l: CanvasLayer, axis: 'x' | 'y') => {
    if (l.kind === 'image') return patch(l.id, axis === 'x' ? { flipX: !l.flipX || undefined } : { flipY: !l.flipY || undefined })
    if (l.kind !== 'paint') return
    pixelOp(l, (g, src) => {
      g.translate(axis === 'x' ? doc.w : 0, axis === 'y' ? doc.h : 0)
      g.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1)
      g.drawImage(src, 0, 0)
    })
  }
  /** Invertir los colores de lo pintado (la transparencia se queda igual). */
  const invertLayer = (l: PaintLayer) =>
    pixelOp(l, (g, src) => {
      g.drawImage(src, 0, 0)
      g.globalCompositeOperation = 'difference'
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, doc.w, doc.h)
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(src, 0, 0)
    })
  /** Capa de sombra o de luz encima de la elegida, ya recortada a ella. */
  const addShade = (role: LayerRole) => {
    const n = doc.layers.filter((l) => l.role === role).length + 1
    insertAbove({
      id: uid(),
      kind: 'paint',
      name: `${role === 'luz' ? 'Luz' : 'Sombra'} ${n}`,
      file: null,
      visible: true,
      locked: false,
      opacity: role === 'luz' ? 0.8 : 0.6,
      blend: role === 'luz' ? 'screen' : 'multiply',
      clip: layer ? true : undefined,
      role,
    })
    setTool('brush')
    flash(role === 'luz' ? 'Capa de luz: pinta con blanco o un color claro; no se sale de la capa de debajo' : 'Capa de sombra: pinta con gris o un tono oscuro; no se sale de la capa de debajo')
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
  const cursor = tool === 'pen' || tool === 'vpencil' || tool === 'vshape' ? 'crosshair' : tool === 'direct' ? 'default' : tool === 'move' ? 'move' : tool === 'text' ? 'text' : tool === 'select' || tool === 'curve' ? 'crosshair' : tool === 'picker' || tool === 'fill' ? 'crosshair' : 'none'
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  /** Creador de gráficos abierto encima del lienzo (nuevo, con una plantilla de logo o editando uno). */
  const [creator, setCreator] = useState<{ id?: string; template?: string; graffiti?: boolean } | null>(null)
  creatorOpen.current = !!creator
  const [quick, setQuick] = useState<{ x: number; y: number } | null>(null)
  // Menú rápido (botón flotante o clic derecho). Recortar y copiar van con lo seleccionado con el lazo (S)
  const QUICK: { label: string; run: () => void }[] = [
    { label: 'Capa nueva', run: addPaint },
    {
      label: 'Recortar',
      run: () => {
        if (selection) selToLayer(true)
        else {
          setTool('select')
          flash('Rodea con el lazo lo que quieras recortar y vuelve a pulsar «Recortar»')
        }
      },
    },
    {
      label: 'Copiar',
      run: () => {
        if (selection) selToLayer(false)
        else if (layer) {
          duplicate(layer)
          flash('Capa copiada (para copiar solo una parte, selecciónala antes con el lazo)')
        }
      },
    },
    { label: 'Subir capa', run: () => (layer ? reorder(layer.id, 1) : flash('Elige una capa')) },
    { label: 'Bajar capa', run: () => (layer ? reorder(layer.id, -1) : flash('Elige una capa')) },
    { label: 'Encajar', run: fit },
    { label: 'Sombra', run: () => addShade('sombra') },
    { label: 'Biblioteca', run: () => setPanel('biblioteca') },
  ]

  // --- Móvil como tableta (src/lienzo/tablet.tsx): sus trazos entran como un lápiz con presión sobre el papel ---
  /** Pasa un punto del móvil (0..1 del papel) a un evento de puntero en la pantalla, para los mismos manejadores. */
  const remoteEvent = (pts: PadPoint[]) => {
    const rect = viewport.current!.getBoundingClientRect()
    const c = Math.cos(view.r)
    const sn = Math.sin(view.r)
    const one = (p: PadPoint) => {
      const x = p[0] * doc.w
      const y = p[1] * doc.h
      return {
        pointerId: REMOTE_POINTER,
        pointerType: 'pen',
        pressure: Math.min(1, Math.max(0.05, p[2])),
        button: 0,
        clientX: rect.left + view.x + (x * c - y * sn) * view.s,
        clientY: rect.top + view.y + (x * sn + y * c) * view.s,
      }
    }
    const evs = pts.map(one)
    const last = evs[evs.length - 1]
    setHover({ x: last.clientX, y: last.clientY })
    return { ...last, nativeEvent: { ...last, getCoalescedEvents: () => evs } } as unknown as ReactPointerEvent
  }
  const tabletApi = useRef<TabletApi | null>(null)
  tabletApi.current = {
    down: (p) => onPointerDown(remoteEvent([p])),
    move: (pts) => pts.length > 0 && onPointerMove(remoteEvent(pts)),
    up: (p) => onPointerUp(remoteEvent([p])),
    cancel: () => {
      pointers.current.delete(REMOTE_POINTER)
      endStroke(null, true)
      redraw()
    },
    undo,
    redo,
    tool: (t) => setTool(t),
    size: (n) => setSize(Math.max(1, Math.min(500, Math.round(n)))),
    snapshot: () => compose(r, docRef.current),
    drawing: () => !!stroke.current,
    doc: { w: doc.w, h: doc.h, paper: doc.paper, name: props.name },
    state: { tool, color: settings.color, size: Math.round(size) },
  }
  const tablet = useTabletHost(tabletApi)
  const [tabletOpen, setTabletOpen] = useState(false)
  const tabletChanged = tablet.changed
  const tabletDoc = tablet.sendDoc
  useEffect(() => tabletChanged(), [doc, loading, tool, settings.color, size, tabletChanged])
  useEffect(() => tabletDoc(), [doc.w, doc.h, doc.paper, props.name, tabletDoc])

  // A pantalla completa, fuera del editor (sus paneles tienen transformaciones que encerrarían el lienzo)
  return createPortal(
    <div className={`lienzo v3d-${props.mode3d}`}>
      {/* Barra de arriba (como la de aplicación de Photoshop): navegación, nombre, vista, deshacer, tableta y guardar */}
      <header className="lz-top">
        <div className="lz-left">
          <button className="lz-btn lz-exit" onClick={props.onExit} title="Salir del lienzo a tus diseños (se guarda antes)" aria-label="Salir del lienzo">
            <Icon d="M12.5 4.5 7 10l5.5 5.5" />
            <span>Salir</span>
          </button>
          <button className="lz-btn" onClick={props.onMenu} title="Empezar un diseño nuevo o abrir otro">
            <Icon d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" /> <span>Diseños</span>
          </button>
          <button className="lz-btn" onClick={props.onGarment} title="La prenda: modelo, piezas, medidas y datos del diseño">
            <span>Prenda</span>
          </button>
          <span className="lz-title">{props.name}</span>
        </div>
        <div className="lz-right">
          <button className="lz-icon" onClick={undo} disabled={!r.history.canUndo()} title="Deshacer (Ctrl+Z o toque con dos dedos)" aria-label="Deshacer">
            <Icon d="M7 6.5L3.5 10 7 13.5M3.5 10H12a4.5 4.5 0 010 9h-2" />
          </button>
          <button className="lz-icon" onClick={redo} disabled={!r.history.canRedo()} title="Rehacer (Ctrl+Mayús+Z o toque con tres dedos)" aria-label="Rehacer">
            <Icon d="M13 6.5l3.5 3.5-3.5 3.5M16.5 10H8a4.5 4.5 0 000 9h2" />
          </button>
          <div className="lz-seg" role="group" aria-label="Vista">
            {MODES_3D.map((m) => (
              <button key={m.id} className={props.mode3d === m.id ? 'on' : ''} onClick={() => props.onMode3d(m.id)} title={m.title}>
                {m.label}
              </button>
            ))}
          </div>
          <button
            className={tablet.status === 'connected' ? 'lz-icon on' : 'lz-icon'}
            onClick={() => setTabletOpen(!tabletOpen)}
            title={tablet.status === 'connected' ? 'Móvil como tableta: conectado' : 'Usar el móvil como tableta (escanea un QR)'}
          >
            <Icon d="M7 2.5h6a1 1 0 011 1v13a1 1 0 01-1 1H7a1 1 0 01-1-1v-13a1 1 0 011-1zM9 15h2M8.5 11.5l3-5 1 .6-3 5-1.3.7z" />
          </button>
          <span className="lz-save">{props.saving ? 'Guardando…' : props.dirty ? 'Sin guardar' : 'Guardado'}</span>
          <button className="lz-btn primary" onClick={props.onSave} disabled={!props.dirty || props.saving} title="Guardar (Ctrl+S)">
            Guardar
          </button>
        </div>
      </header>

      {/* Barra de opciones (como en Photoshop): lo de la herramienta elegida */}
      <div className="lz-opts" onPointerDown={(e) => e.stopPropagation()}>
        <span className="lz-opts-tool">{toolDef(tool)?.label ?? ''}</span>
        {(tool === 'brush' || tool === 'eraser' || tool === 'shaper' || tool === 'curve') && (
          <>
            <button className={panel === 'brushes' ? 'lz-chip on' : 'lz-chip'} onClick={() => setPanel(panel === 'brushes' ? null : 'brushes')} title="Elegir pincel">
              {brush.name} ▾
            </button>
            <label className="lz-opt" title="Tamaño del pincel (teclas [ y ])">
              <span>Tamaño</span>
              <input type="range" min={0} max={1} step={0.001} value={Math.log(size) / Math.log(500)} onChange={(e) => setSize(Math.max(1, Math.round(500 ** Number(e.target.value))))} />
              <b>{Math.round(size)} px</b>
            </label>
            <label className="lz-opt" title="Opacidad">
              <span>Opacidad</span>
              <input type="range" min={0.02} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              <b>{Math.round(opacity * 100)} %</b>
            </label>
            {tool !== 'eraser' && (
              <label className="lz-opt" title="Suavizado del trazo (estabilizador)">
                <span>Suavizado</span>
                <input type="range" min={0} max={1} step={0.05} value={streamline} onChange={(e) => setSettings({ streamline: { ...settings.streamline, [brush.id]: Number(e.target.value) } })} />
                <b>{Math.round(streamline * 100)} %</b>
              </label>
            )}
          </>
        )}
        {tool === 'text' && <span className="lz-opts-hint">Toca el lienzo para escribir; el texto elegido se edita en Capas</span>}
        {tool === 'move' && <span className="lz-opts-hint">Arrastra para mover la capa elegida</span>}
        {tool === 'select' && <span className="lz-opts-hint">Rodea una zona para moverla, escalarla, girarla, copiarla o borrarla</span>}
        {tool === 'picker' && <span className="lz-opts-hint">Toca un color del lienzo para cogerlo</span>}
        {isVectorTool(tool) && <VectorPanel vec={vec} tool={tool} color={settings.color} />}
      </div>

      {/* Herramientas a la izquierda, agrupadas como en Photoshop (Toolbar.tsx), y el color debajo */}
      <ToolColumn tool={tool} onPick={(id) => setTool(id as Tool)} onReclick={(id) => (id === 'brush' || id === 'eraser' ? setPanel(panel === 'brushes' ? null : 'brushes') : undefined)}>
        <button className="lz-color-btn lz-tools-color" style={{ background: settings.color }} onClick={() => setPanel(panel === 'color' ? null : 'color')} title="Color" aria-label="Color" />
      </ToolColumn>

      {/* Paneles a la derecha (como los de Photoshop): se abren y cierran tocándolos */}
      <aside className="lz-dock" aria-label="Paneles" onPointerDown={(e) => e.stopPropagation()}>
        {(
          [
            ['layers', 'Capas', 'M10 3l7 3.5-7 3.5-7-3.5zM3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5'],
            ['biblioteca', 'Biblioteca: prendas, fornituras, gráficos y texturas', 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM13.5 11v5M11 13.5h5'],
            ['ajustes', 'Guías: simetría, cuadrícula, perspectiva', 'M10 2.5v15M2.5 10h15M5 5l10 10'],
            ['luces', 'Luces y sombras: automáticas o a mano', 'M10 3.5a6.5 6.5 0 100 13zM10 3.5a6.5 6.5 0 010 13'],
            ['ia', 'Imagen con IA', 'M10 2.5l1.4 3.6 3.6 1.4-3.6 1.4L10 12.5 8.6 8.9 5 7.5l3.6-1.4zM15 12l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 13l.6 1.4 1.4.6-1.4.6L5 17l-.6-1.4L3 15l1.4-.6z'],
            ['acciones', 'Acciones: añadir, exportar, historial', 'M10 3.5l1.6 3.8 4 .4-3 2.7.9 4-3.5-2.1-3.5 2.1.9-4-3-2.7 4-.4z'],
          ] as const
        ).map(([id, title, d]) => (
          <button key={id} className={panel === id ? 'lz-icon on' : 'lz-icon'} onClick={() => setPanel(panel === id ? null : id)} title={title} aria-label={title.split(':')[0]}>
            <Icon d={d} />
          </button>
        ))}
      </aside>
      <QuickButton
        at={settings.fab ?? [0.965, 0.93]}
        open={!!quick}
        onMove={(fab) => setSettings({ fab })}
        onToggle={(b) => setQuick(quick ? null : { x: b.left < window.innerWidth / 2 ? b.right + 110 : b.left - 110, y: b.top + b.height / 2 })}
      />

      <div
        ref={viewport}
        className="lz-viewport"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onPointerMove(e)
          if (tool === 'pen') {
            const q = toDoc(e.clientX, e.clientY)
            vec.setHover([q.x, q.y])
          }
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
        onContextMenu={(e) => {
          // Clic derecho: menú rápido
          e.preventDefault()
          setQuick({ x: e.clientX, y: e.clientY })
        }}
      >
        <div className="lz-paper" style={{ width: doc.w, height: doc.h, background: doc.paper, transform }}>
          {doc.layers.map((l) => {
            if (!l.visible) return null
            const off = moveOffset?.id === l.id ? moveOffset : null
            const style = { opacity: l.opacity, mixBlendMode: l.blend as React.CSSProperties['mixBlendMode'] }
            // Con máscara de recorte: solo donde su base tiene algo
            const base = clipBaseOf(doc, l)
            if (base && !base.visible) return null
            if (base) {
              const c = clippedLayer(r, doc, l, base).canvas
              return (
                <div key={l.id} className="lz-layer" style={{ ...style, transform: off ? `translate(${off.dx}px, ${off.dy}px)` : undefined }}>
                  <div className="lz-fill" ref={(el) => mount(el, c)} />
                  {stroke.current?.layer.id === l.id && !stroke.current.erase && !stroke.current.smudge && <div className="lz-fill" style={{ opacity }} ref={mountPreview} />}
                </div>
              )
            }
            if (l.kind === 'paint')
              return (
                <div key={l.id} className="lz-layer" style={{ ...style, transform: off ? `translate(${off.dx}px, ${off.dy}px)` : undefined }}>
                  <div className="lz-fill" ref={(el) => mount(el, r.layer(l.id))} />
                  {stroke.current?.layer.id === l.id && !stroke.current.erase && !stroke.current.smudge && <div className="lz-fill" style={{ opacity }} ref={mountPreview} />}
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
            if (l.kind === 'text') {
              const c = textCanvas(r, l)
              const w = c.width / 2
              const h = c.height / 2
              return (
                <div
                  key={l.id + c.width + c.height}
                  className={l.id === active && (tool === 'move' || tool === 'text') ? 'lz-item selected' : 'lz-item'}
                  style={{ ...style, left: l.x - w / 2 + (off?.dx ?? 0), top: l.y - h / 2 + (off?.dy ?? 0), width: w, height: h, transform: `rotate(${l.rotation}deg)` }}
                  ref={(el) => mount(el, c)}
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
            if (l.kind === 'vector')
              return (
                <div key={l.id} className="lz-layer" style={{ ...style, transform: off ? `translate(${off.dx}px, ${off.dy}px)` : undefined }}>
                  <VectorSvg layer={vec.viewOf(l)} w={doc.w} h={doc.h} />
                </div>
              )
            if (l.kind === 'texture')
              return (
                <div key={l.id} className="lz-layer" style={style}>
                  <div className="lz-fill" ref={(el) => mount(el, textureCanvas(r, doc, l))} />
                </div>
              )
            const img = r.images.get(imageKey(l))
            const h = l.w * l.aspect
            return (
              <div
                key={l.id}
                className={l.id === active && tool === 'move' ? 'lz-item selected' : 'lz-item'}
                style={{ ...style, left: l.x + (off?.dx ?? 0), top: l.y + (off?.dy ?? 0), width: l.w, height: h, transform: `rotate(${l.rotation}deg) scale(${l.flipX ? -1 : 1}, ${l.flipY ? -1 : 1})` }}
              >
                {img && <img src={img.src} alt="" draggable={false} />}
              </div>
            )
          })}
          {isVectorTool(tool) && <VectorOverlay vec={vec} w={doc.w} h={doc.h} scale={view.s} />}
          {(lasso || selectionPts) && (
            <svg className="lz-overlay" viewBox={`0 0 ${doc.w} ${doc.h}`} width={doc.w} height={doc.h}>
              <polygon points={(lasso ?? selectionPts)!.join(' ')} className="lz-ants" style={{ strokeWidth: 2 / view.s }} />
            </svg>
          )}
          {floating?.corners && (
            <>
              <canvas ref={warpRef} className="lz-layer-canvas lz-warp" width={doc.w} height={doc.h} />
              <svg className="lz-overlay persp" viewBox={`0 0 ${doc.w} ${doc.h}`} width={doc.w} height={doc.h}>
                <polygon
                  points={floating.corners.map((c) => c.join(',')).join(' ')}
                  fill="rgba(61,139,253,0.06)"
                  stroke="#3d8bfd"
                  strokeWidth={2 / view.s}
                  strokeDasharray={`${8 / view.s} ${6 / view.s}`}
                  style={{ pointerEvents: 'auto', cursor: 'move' }}
                  onPointerDown={(e) => dragCorner(e, 'all')}
                />
                {floating.corners.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={13 / view.s} fill="#fff" stroke="#3d8bfd" strokeWidth={3 / view.s} style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(e) => dragCorner(e, i)} />
                ))}
              </svg>
            </>
          )}
          {floating && !floating.corners && (
            <div
              className="lz-floating"
              style={{
                left: floating.x + floating.dx,
                top: floating.y + floating.dy,
                width: floating.w,
                height: floating.h,
                transform: `rotate(${floating.rot}deg) scale(${floating.sx}, ${floating.sy})`,
              }}
              onPointerDown={(e) => dragFloating(e, 'move')}
            >
              {/* La imagen va en su propio contenedor (si no, al ponerla se borraban los tiradores) */}
              <div
                className="lz-fill"
                ref={(el) => {
                  if (el && el.firstChild !== floating.canvas) {
                    el.replaceChildren(floating.canvas)
                    floating.canvas.className = 'lz-layer-canvas'
                  }
                }}
              />
              <span className="lz-handle corner" style={{ transform: `scale(${1 / (view.s * floating.sx)}, ${1 / (view.s * floating.sy)})` }} onPointerDown={(e) => dragFloating(e, 'scale')} title="Escalar" />
              <span className="lz-handle side-x" style={{ transform: `translateY(-50%) scale(${1 / (view.s * floating.sx)}, ${1 / (view.s * floating.sy)})` }} onPointerDown={(e) => dragFloating(e, 'sx')} title="Estirar a lo ancho" />
              <span className="lz-handle side-y" style={{ transform: `translateX(-50%) scale(${1 / (view.s * floating.sx)}, ${1 / (view.s * floating.sy)})` }} onPointerDown={(e) => dragFloating(e, 'sy')} title="Estirar a lo alto" />
              <span className="lz-handle rotate" style={{ transform: `translateX(-50%) scale(${1 / (view.s * floating.sx)}, ${1 / (view.s * floating.sy)})` }} onPointerDown={(e) => dragFloating(e, 'rotate')} title="Girar" />
            </div>
          )}
          {settings.perspective > 0 && (
            <PerspectiveGuide
              w={doc.w}
              h={doc.h}
              points={(settings.perspective === 1 ? [settings.vps[0]] : [settings.vps[1], settings.vps[2]]).map(([x, y]) => [x * doc.w, y * doc.h] as [number, number])}
              scale={view.s}
              onMove={(i, x, y) => {
                const vps = [...settings.vps] as [number, number][]
                const k = settings.perspective === 1 ? 0 : i + 1
                vps[k] = [x / doc.w, y / doc.h]
                // Con dos puntos, los dos en el mismo horizonte
                if (settings.perspective === 2) vps[k === 1 ? 2 : 1] = [vps[k === 1 ? 2 : 1][0], y / doc.h]
                setSettings({ vps })
              }}
              toDoc={toDoc}
            />
          )}
          {settings.grid &&
            (settings.gridKind === 'isometrica' ? (
              <div className="lz-grid iso" style={isoGrid(settings.gridSize)} />
            ) : (
              <div className="lz-grid" style={{ backgroundSize: `${settings.gridSize}px ${settings.gridSize}px` }} />
            ))}
          {(guides.length > 0 || curvePts.length > 0) && (
            <svg className="lz-overlay persp" viewBox={`0 0 ${doc.w} ${doc.h}`} width={doc.w} height={doc.h}>
              {guides.map((g, i) => (
                <line key={i} x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} stroke="#ff3dbb" strokeWidth={1.5 / view.s} strokeDasharray={`${6 / view.s} ${4 / view.s}`} />
              ))}
              {curvePts.length > 0 && (
                <path
                  d={curvePath(hover && tool === 'curve' ? [...curvePts, (() => { const q = toDoc(hover.x, hover.y); return [q.x, q.y] as ShaperPoint })()] : curvePts, false)}
                  fill="none"
                  stroke="#3d8bfd"
                  strokeWidth={2 / view.s}
                />
              )}
              {curvePts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={(i === 0 && curvePts.length >= 3 ? 7 : 5) / view.s} fill="#fff" stroke="#3d8bfd" strokeWidth={2 / view.s} />
              ))}
            </svg>
          )}
          {settings.symmetry !== 'none' && (
            <SymmetryGuide
              w={doc.w}
              h={doc.h}
              kind={settings.symmetry}
              count={settings.symmetryCount}
              center={[settings.axis[0] * doc.w, settings.axis[1] * doc.h]}
              scale={view.s}
              toDoc={toDoc}
              onMove={(x, y) => setSettings({ axis: [Math.min(1, Math.max(0, x / doc.w)), Math.min(1, Math.max(0, y / doc.h))] })}
            />
          )}
        </div>
        {/* Contorno del pincel bajo el puntero (con ratón o lápiz) */}
        {hover && (tool === 'brush' || tool === 'eraser' || tool === 'shaper') && (
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
        {tool === 'curve' && curvePts.length > 0 && (
          <div className="lz-curvebar" onPointerDown={(ev) => ev.stopPropagation()}>
            <span>{curvePts.length} puntos</span>
            <button className="lz-chip" onClick={() => finishCurve(false)}>
              Terminar
            </button>
            {curvePts.length >= 3 && (
              <button className="lz-chip" onClick={() => finishCurve(true)}>
                Cerrar
              </button>
            )}
            <button className="lz-chip" onClick={() => setCurvePts(curvePts.slice(0, -1))}>
              Quitar punto
            </button>
            <button className="lz-chip" onClick={() => setCurvePts([])}>
              Cancelar
            </button>
          </div>
        )}
        {loading && <div className="lz-loading">Cargando lienzo…</div>}
        {notice && <div className="lz-notice">{notice}</div>}
      </div>

      {quick && (
        <div className="lz-quick" style={{ left: quick.x, top: quick.y }} onPointerDown={(e) => e.stopPropagation()}>
          {QUICK.map((q, i) => {
            const a = -Math.PI / 2 + (i / QUICK.length) * Math.PI * 2
            return (
              <button
                key={q.label}
                style={{ transform: `translate(-50%, -50%) translate(${Math.cos(a) * 108}px, ${Math.sin(a) * 92}px)` }}
                onClick={() => {
                  q.run()
                  setQuick(null)
                }}
              >
                {q.label}
              </button>
            )
          })}
          <button className="lz-quick-x" onClick={() => setQuick(null)} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}
      {tool === 'select' && (
        <div className="lz-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          {floating ? (
            <>
              <span>
                {floating.corners
                  ? 'Arrastra cada esquina para distorsionar (perspectiva); por dentro, para mover.'
                  : 'Arrastra para mover; la esquina escala, los lados estiran y el punto de arriba gira.'}
              </span>
              {!floating.corners && (
                <button className="lz-chip" onClick={() => setFloating((f) => f && { ...f, corners: cornersOf(f) })} title="Mover cada esquina por separado (perspectiva, deformar)">
                  Distorsionar
                </button>
              )}
              <button className="lz-chip on" onClick={() => endTransform(true)}>
                Aplicar (Intro)
              </button>
              <button className="lz-chip" onClick={() => endTransform(false)}>
                Cancelar (Esc)
              </button>
            </>
          ) : selection ? (
            <>
              <button className="lz-chip on" onClick={startTransform}>
                Transformar
              </button>
              <button className="lz-chip" onClick={() => selToLayer(false)}>
                Copiar a capa nueva
              </button>
              <button className="lz-chip" onClick={() => selToLayer(true)}>
                Cortar a capa nueva
              </button>
              <button className="lz-chip" onClick={selFill}>
                Rellenar
              </button>
              <button className="lz-chip" onClick={selErase}>
                Borrar
              </button>
              <button className={hwSave ? 'lz-chip on' : 'lz-chip'} onClick={() => setHwSave(hwSave ? null : { kind: 'tirador', name: '' })} title="Lo que has dibujado y seleccionado pasa a ser una fornitura tuya">
                Guardar como fornitura
              </button>
              <button className="lz-chip" onClick={clearSelection}>
                Quitar selección
              </button>
              {hwSave && (
                <div className="lz-hwsave">
                  <span>Es un…</span>
                  <div className="lz-chips">
                    {(
                      [
                        ['tirador', 'Tirador de cremallera'],
                        ['boton', 'Botón'],
                        ['tope', 'Tope de cordón'],
                        ['parche', 'Parche'],
                        ['etiqueta', 'Etiqueta'],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} className={hwSave.kind === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setHwSave({ ...hwSave, kind: id })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input value={hwSave.name} onChange={(ev) => setHwSave({ ...hwSave, name: ev.target.value })} placeholder="Nombre (p. ej. Tirador calavera)" maxLength={60} />
                  <button className="lz-btn primary" onClick={saveSelectionAsHardware}>
                    Guardar en Mis fornituras
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <span>Rodea a mano la zona de la capa de pintura que quieras tocar.</span>
              <button className="lz-chip" onClick={startTransform} title="Mover, escalar y girar todo lo pintado en la capa">
                Transformar la capa entera
              </button>
            </>
          )}
        </div>
      )}
      {tool === 'fill' && (
        <div className="lz-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <span>Bote:</span>
          <button className={settings.fillMode === 'pieza' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ fillMode: 'pieza' })} title="Toca una pieza de la prenda (manga, cuerpo, capucha…) para darle color">
            Pieza de la prenda
          </button>
          <button className={settings.fillMode === 'zona' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ fillMode: 'zona' })} title="Rellena la zona cerrada por líneas en la capa de pintura">
            Zona pintada
          </button>
          <label className="lz-toggle inline" title="El relleno no se sale de las prendas">
            <input type="checkbox" checked={settings.inside} onChange={(e) => setSettings({ inside: e.target.checked })} /> Solo la ropa
          </label>
          {doc.layers.some((l) => l.reference) && <span className="lz-muted">Usa la capa de referencia</span>}
          <span className="lz-sep" />
          <PatternPicker value={settings.fillPattern} color={settings.color} onChange={(fillPattern) => setSettings({ fillPattern })} onUpload={async (file) => {
            try {
              const { key } = await api.uploadImage(file)
              setSettings({ fillPattern: { ...settings.fillPattern, kind: 'imagen', file: key, size: settings.fillPattern.size || 20 } })
            } catch (e) {
              flash(e instanceof Error ? e.message : 'No se ha podido subir la imagen')
            }
          }} />
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
            onCreateArtwork={(template) => {
              setPanel(null)
              setCreator(template === 'graffiti' ? { graffiti: true } : { template })
            }}
            onEditArtwork={(a) => {
              setPanel(null)
              setCreator({ id: a.id })
            }}
            textures={assets.filter((a) => a.kind === 'textura')}
            onTexture={addTexture}
            onUploadTexture={uploadTexture}
            onDeleteTexture={deleteAsset}
            materials={materials}
            artworks={artworks}
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
      {panel === 'luces' && (
        <Pop className="lz-pop left wide" title="Luces y sombras">
          <p className="lz-muted">
            Dan volumen a la prenda: la app busca cada pieza (cuerpo, mangas, capucha, bolsillo…) y le pone sombra en los bordes, brillo en el centro, pliegues en las
            mangas y sombra bajo las costuras, con el color de cada pieza. Van en dos capas aparte: en 3D no se usan (allí la luz la pone la escena).
          </p>
          <p className="lz-label">Estilo</p>
          <div className="lz-chips">
            {(
              [
                ['suave', 'Suave'],
                ['marcado', 'Marcado'],
                ['comic', 'Cómic (sombras planas)'],
              ] as [ShadeStyle, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.shadeStyle === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ shadeStyle: id })}>
                {label}
              </button>
            ))}
          </div>
          <p className="lz-label">La luz viene de</p>
          <div className="lz-chips">
            {(
              [
                ['izquierda', 'Arriba a la izquierda'],
                ['arriba', 'Arriba'],
                ['derecha', 'Arriba a la derecha'],
              ] as [LightFrom, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.lightFrom === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ lightFrom: id })}>
                {label}
              </button>
            ))}
          </div>
          <button className="lz-btn primary lz-wide" onClick={generateShading}>
            {autoLayers.length ? 'Volver a generar' : 'Generar luces y sombras'}
          </button>
          {autoLayers.length > 0 && (
            <>
              <div className="lz-field">
                <span>
                  Intensidad <strong>{Math.round(autoLayers[0].opacity * 100)} %</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={autoLayers[0].opacity}
                  onChange={(ev) => {
                    const v = Number(ev.target.value)
                    change({ ...doc, layers: doc.layers.map((l) => (autoLayers.some((x) => x.id === l.id) ? { ...l, opacity: v } : l)) }, false)
                  }}
                />
              </div>
              <button className="lz-chip danger" onClick={() => change({ ...doc, layers: doc.layers.filter((l) => !autoLayers.some((x) => x.id === l.id)) })}>
                Quitar las automáticas
              </button>
            </>
          )}
          <p className="lz-label">A mano</p>
          <p className="lz-muted">Pinta encima con estos pinceles: cogen solos el color de la pieza (más oscuro o más claro), van a su capa y no se salen de la prenda.</p>
          <div className="lz-chips">
            {BRUSHES.filter((b) => b.group === 'Luces y sombras').map((b) => (
              <button
                key={b.id}
                className={settings.brush === b.id && tool === 'brush' ? 'lz-chip on' : 'lz-chip'}
                onClick={() => {
                  setSettings({ brush: b.id })
                  setTool('brush')
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
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
            brushes={allBrushes}
            current={brush.id}
            onPick={(id) => {
              const picked = allBrushes.find((b) => b.id === id)
              if (tool !== 'eraser' && picked?.pattern) {
                const d = patternDefaults(picked.pattern)
                setSettings({ brush: id, patternColors: [d.c2, d.c3], patternSize: 0 })
              } else setSettings(tool === 'eraser' ? { eraser: id } : { brush: id })
            }}
            color={tool === 'eraser' ? '#e7e5e4' : settings.color}
          />
          <p className="lz-label">Mis pinceles</p>
          <div className="lz-chips">
            <label className="lz-chip" title="Archivos .brushset o .brush de Procreate">
              Importar de Procreate…
              <input type="file" accept=".brushset,.brush" hidden onChange={(ev) => ev.target.files?.[0] && importBrushes(ev.target.files[0])} />
            </label>
            <label className="lz-chip" title="Una imagen como punta: lo claro pinta (o lo oscuro, si el fondo es blanco)">
              Punta con una imagen…
              <input type="file" accept="image/*" hidden onChange={(ev) => ev.target.files?.[0] && brushFromImage(ev.target.files[0], 'tip')} />
            </label>
            <label className="lz-chip" title="Una imagen como grano: el trazo sale con su dibujo">
              Grano con una imagen…
              <input type="file" accept="image/*" hidden onChange={(ev) => ev.target.files?.[0] && brushFromImage(ev.target.files[0], 'grain')} />
            </label>
            <button className="lz-chip" onClick={saveCurrentBrush} title="Una copia de este pincel con su tamaño y opacidad, para ajustarla">
              Guardar este como mío
            </button>
          </div>
          {(() => {
            const own = assets.find((a) => `u:${a.id}` === brush.id)
            return own ? (
              <BrushEditor
                key={own.id}
                asset={own}
                onSave={async (name, s) => {
                  try {
                    const a = await api.updateLienzoAsset(own.id, { name, settings: s })
                    setAssets((list) => list.map((x) => (x.id === a.id ? a : x)))
                    flash('Pincel guardado')
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'No se ha podido guardar')
                  }
                }}
                onDelete={() => {
                  deleteAsset(own)
                  setSettings({ brush: 'tecnica' })
                }}
              />
            ) : null
          })()}
          {tool !== 'eraser' && brush.pattern && (
            <div className="lz-field lz-pattern-brush">
              <span>
                Estampado: <strong>{brush.name}</strong>
              </span>
              <div className="lz-chips">
                <label className="lz-mini-color" title="Color de fondo (el color elegido)">
                  <input type="color" value={settings.color} onChange={(e) => setSettings({ color: e.target.value })} />
                </label>
                {([0, 1] as const).map((i) => (
                  <label key={i} className="lz-mini-color" title={i ? 'Tercer color' : 'Segundo color'}>
                    <input
                      type="color"
                      value={(settings.patternColors ?? [patternDefaults(brush.pattern!).c2, patternDefaults(brush.pattern!).c3])[i]}
                      onChange={(e) => {
                        const cur = settings.patternColors ?? [patternDefaults(brush.pattern!).c2, patternDefaults(brush.pattern!).c3]
                        setSettings({ patternColors: (i ? [cur[0], e.target.value] : [e.target.value, cur[1]]) as [string, string] })
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="lz-inline-range" title="Tamaño del dibujo que se repite">
                <span>{settings.patternSize || DEFAULT_SIZE[brush.pattern] || 4} cm</span>
                <input
                  type="range"
                  min={0.5}
                  max={Math.max(20, (DEFAULT_SIZE[brush.pattern] ?? 4) * 3)}
                  step={0.5}
                  value={settings.patternSize || DEFAULT_SIZE[brush.pattern] || 4}
                  onChange={(e) => setSettings({ patternSize: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          <div className="lz-field">
            <span>
              Estabilizador <strong>{Math.round(streamline * 100)} %</strong>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={streamline} onChange={(e) => setSettings({ streamline: { ...settings.streamline, [brush.id]: Number(e.target.value) } })} />
            <small className="lz-muted">Más alto = líneas más limpias y suaves (va un poco por detrás del lápiz)</small>
          </div>
        </Pop>
      )}
      {tabletOpen && <TabletPanel tablet={tablet} onClose={() => setTabletOpen(false)} />}
      {!tabletOpen && tablet.status === 'connected' && (
        <button className="lz-tablet-badge" onClick={() => setTabletOpen(true)} title="Móvil como tableta">
          ● Móvil conectado
        </button>
      )}
      {panel === 'color' && (
        <Pop className="lz-pop right" title="Color">
          <ColorPicker color={settings.color} onChange={(c) => setSettings({ color: c })} recent={settings.recent} brand={brand} />
        </Pop>
      )}
      {panel === 'layers' && (
        <Pop
          className="lz-pop right wide"
          title="Capas"
          action={
            <span className="lz-chips">
              <button className="lz-btn" onClick={addPaint} title="Capa de pintura nueva">
                + Capa
              </button>
              <button className="lz-btn" onClick={() => addShade('sombra')} title="Capa de sombra recortada a la capa elegida (Multiplicar)">
                + Sombra
              </button>
              <button className="lz-btn" onClick={() => addShade('luz')} title="Capa de luz recortada a la capa elegida (Trama)">
                + Luz
              </button>
            </span>
          }
        >
          <div className="lz-layers">
            {[...doc.layers].reverse().map((l) => (
              <LayerRow
                key={l.id}
                layer={l}
                active={l.id === active}
                thumb={l.kind === 'texture' ? (l.file ? undefined : textureTile(l.texture)) : l.kind === 'paint' ? r.layer(l.id) : l.kind === 'mockup' ? r.mockups.get(l.id) : l.kind === 'detail' ? detailCanvas(r, l) : l.kind === 'text' ? textCanvas(r, l) : undefined}
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
                image={l.kind === 'image' ? r.images.get(imageKey(l))?.src : l.kind === 'texture' && l.file ? fileOf(l.file) : undefined}
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
                onFlip={l.kind === 'paint' || l.kind === 'image' ? (axis) => flipLayer(l, axis) : undefined}
                onInvert={l.kind === 'paint' ? () => invertLayer(l) : undefined}
                clipped={!!clipBaseOf(doc, l)}
              />
            ))}
          </div>
        </Pop>
      )}
      {panel === 'ajustes' && (
        <Pop className="lz-pop left" title="Guía de dibujo">
          <p className="lz-label">Simetría</p>
          <div className="lz-chips">
            {(
              [
                ['none', 'Sin simetría'],
                ['vertical', 'Vertical'],
                ['horizontal', 'Horizontal'],
                ['cuadrante', 'Cuatro lados'],
                ['radial', 'Radial'],
                ['giratoria', 'Giratoria'],
              ] as [Symmetry, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.symmetry === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ symmetry: id })}>
                {label}
              </button>
            ))}
          </div>
          {(settings.symmetry === 'radial' || settings.symmetry === 'giratoria') && (
            <div className="lz-field">
              <span>
                Copias <strong>{settings.symmetryCount}</strong>
              </span>
              <input type="range" min={2} max={16} step={1} value={settings.symmetryCount} onChange={(e) => setSettings({ symmetryCount: Number(e.target.value) })} />
            </div>
          )}
          {settings.symmetry !== 'none' && (
            <p className="lz-muted">
              {settings.symmetry === 'radial' ? 'Radial: como un caleidoscopio (giros y reflejos). ' : settings.symmetry === 'giratoria' ? 'Giratoria: el trazo se repite girando alrededor del centro. ' : ''}
              Arrastra el punto azul para mover el centro.{' '}
              <button className="lz-link" onClick={() => setSettings({ axis: [0.5, 0.5] })}>
                Volver al centro
              </button>
            </p>
          )}
          <p className="lz-label">Perspectiva</p>
          <div className="lz-chips">
            {(
              [
                [0, 'Sin perspectiva'],
                [1, '1 punto de fuga'],
                [2, '2 puntos de fuga'],
              ] as [0 | 1 | 2, string][]
            ).map(([id, label]) => (
              <button key={id} className={settings.perspective === id ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ perspective: id })}>
                {label}
              </button>
            ))}
          </div>
          {settings.perspective > 0 && <p className="lz-muted">Arrastra los puntos azules para colocar el horizonte y los puntos de fuga.</p>}
          <label className="lz-toggle">
            <input type="checkbox" checked={settings.grid} onChange={(e) => setSettings({ grid: e.target.checked })} /> Cuadrícula
          </label>
          {settings.grid && (
            <div className="lz-chips">
              <button className={settings.gridKind === 'cuadrada' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ gridKind: 'cuadrada' })}>
                Cuadrada
              </button>
              <button className={settings.gridKind === 'isometrica' ? 'lz-chip on' : 'lz-chip'} onClick={() => setSettings({ gridKind: 'isometrica' })}>
                Isométrica
              </button>
            </div>
          )}
          <label className="lz-toggle" title="Las líneas siguen la cuadrícula o los puntos de fuga (la dirección se elige al empezar el trazo)">
            <input type="checkbox" checked={settings.assist} onChange={(e) => setSettings({ assist: e.target.checked })} /> Asistencia de dibujo
          </label>
          {settings.assist && !settings.grid && settings.perspective === 0 && <p className="lz-muted">Activa la cuadrícula o la perspectiva para que la asistencia tenga una guía que seguir.</p>}
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
      {props.mode3d !== 'off' && <div className="lz-3d">{props.view3d}</div>}
      {creator && (
        <div className="lz-creator" onPointerDown={(ev) => ev.stopPropagation()}>
          <ArtworkCreator
            embedded={{
              ...creator,
              onClose: () => setCreator(null),
              onSaved: (a) => {
                setArtworks((list) => [a, ...list.filter((x) => x.id !== a.id)])
                setCreator(null)
                const c = center()
                addArtwork(a, c.x, c.y)
              },
            }}
          />
        </div>
      )}
      {props.children}
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
          <p className="lz-label">Historial</p>
          {(() => {
            const c = r.history.counts()
            const total = c.undo + c.redo
            if (!total) return <p className="lz-muted">Aún no hay pasos que deshacer.</p>
            return (
              <div className="lz-field">
                <span>
                  Paso <strong>{c.undo}</strong> de {total}
                </span>
                <input
                  type="range"
                  min={0}
                  max={total}
                  step={1}
                  value={c.undo}
                  onChange={(e) => {
                    // Desliza para ir hacia atrás o hacia delante en lo que has hecho
                    let k = Number(e.target.value) - r.history.counts().undo
                    while (k < 0) {
                      undo()
                      k++
                    }
                    while (k > 0) {
                      redo()
                      k--
                    }
                  }}
                />
              </div>
            )
          })()}
          <p className="lz-label">Gestos</p>
          <p className="lz-muted">
            Dos dedos: mover, acercar y girar. Toque con dos dedos: deshacer; con tres: rehacer. Mantén el lápiz quieto al empezar: cuentagotas; al acabar un trazo: línea, círculo o rectángulo perfectos (QuickShape). Clic derecho: menú rápido. Con ratón: rueda para acercar, espacio + arrastrar para
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


/** Biblioteca de pinceles por grupos, cada uno con su muestra de trazo. */
function BrushLibrary({ brushes, current, onPick, color }: { brushes: BrushPreset[]; current: string; onPick: (id: string) => void; color: string }) {
  const groups = [...new Set(brushes.map((b) => b.group))]
  const [group, setGroup] = useState(brushes.find((b) => b.id === current)?.group ?? groups[0])
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
        {brushes.filter((b) => b.group === group).map((b) => (
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
    if (brush.smudge) {
      const rg = raw.getContext('2d')!
      for (let i = 0; i < 6; i++) {
        rg.fillStyle = i % 2 ? color : '#9ca3af'
        rg.fillRect((i * c.width) / 6, 0, c.width / 6, c.height)
      }
    }
    const s = new Stroke(raw, { brush, color, size: brush.pattern ? 34 : Math.min(brush.shape ? 16 : 26, brush.size * 1.4 + 3), opacity: 1, streamline: 0, symmetry: 'none', axis: { x: 0, y: 0 } })
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      s.add(12 + t * (c.width - 24), c.height / 2 + Math.sin(t * Math.PI * 2) * 10, Math.sin(t * Math.PI) * 0.9 + 0.1)
    }
    if (brush.pattern) fillWithPattern(raw.getContext('2d')!, { x0: 0, y0: 0, x1: raw.width, y1: raw.height }, brush.pattern, color, undefined, (DEFAULT_SIZE[brush.pattern] ?? 4) > 10 ? 6 : 3, 2.4)
    g.globalAlpha = brush.opacity
    g.drawImage(raw, 0, 0)
    if (brush.grain) {
      g.globalCompositeOperation = 'destination-out'
      g.globalAlpha = brush.grain * 0.85
      g.fillStyle = g.createPattern(grainFor(brush), 'repeat')!
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
  onFlip?: (axis: 'x' | 'y') => void
  onInvert?: () => void
  /** Recortada a la capa de debajo (se ve sangrada en la lista). */
  clipped: boolean
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
  const kind = l.kind === 'paint' ? 'Pintura' : l.kind === 'mockup' ? 'Prenda' : l.kind === 'detail' ? 'Fornitura' : l.kind === 'text' ? 'Texto' : l.kind === 'texture' ? 'Textura' : l.kind === 'vector' ? 'Trazados' : 'Imagen'
  return (
    <div className={`lz-layer-row${active ? ' on' : ''}${props.clipped ? ' clipped' : ''}`}>
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
            {l.reference ? ' · referencia' : ''}
            {l.role ? ` · ${l.role}` : ''}
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
          {l.kind === 'text' && <TextOptions layer={l} onPatch={props.onPatch} />}
          {l.kind === 'detail' && <DetailOptions layer={l} onPatch={props.onPatch} artworks={props.artworks} onSavePreset={props.onSavePreset} />}
          {l.kind === 'texture' && (
            <>
              <div className="lz-field">
                <span>
                  Escala <strong>{Math.round(l.scale * 100)} %</strong>
                </span>
                <input type="range" min={0.1} max={4} step={0.05} value={l.scale} onChange={(e) => props.onPatch({ scale: Number(e.target.value) })} />
              </div>
              <div className="lz-field">
                <span>
                  Giro <strong>{Math.round(l.rotation)}°</strong>
                </span>
                <input type="range" min={-180} max={180} step={1} value={l.rotation} onChange={(e) => props.onPatch({ rotation: Number(e.target.value) })} />
              </div>
              <p className="lz-muted">Prueba la fusión Superponer o Luz suave, y baja la opacidad para que se note menos.</p>
            </>
          )}
          {(l.kind === 'mockup' || l.kind === 'image' || l.kind === 'detail') && (
            <div className="lz-field">
              <span>
                Tamaño <strong>{Math.round(l.w)} px</strong>
              </span>
              <input type="range" min={l.kind === 'detail' ? 8 : 60} max={2400} step={l.kind === 'detail' ? 2 : 10} value={l.w} onChange={(e) => props.onPatch({ w: Number(e.target.value) })} />
            </div>
          )}
          {(l.kind === 'image' || l.kind === 'detail' || l.kind === 'text') && (
            <div className="lz-field">
              <span>
                Giro <strong>{Math.round(l.rotation)}°</strong>
              </span>
              <input type="range" min={-180} max={180} step={1} value={l.rotation} onChange={(e) => props.onPatch({ rotation: Number(e.target.value) })} />
            </div>
          )}
          <div className="lz-chips">
            <button className={l.clip ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ clip: !l.clip || undefined })} title="Solo se ve donde hay algo en la capa de debajo (texturas, sombras, estampados sin salirse)">
              Máscara de recorte
            </button>
            <button className={l.reference ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ reference: !l.reference || undefined })} title="El bote rellena en otra capa parándose en lo que hay en esta (las líneas)">
              Referencia
            </button>
          </div>
          <div className="lz-chips">
            <span className="lz-muted">Es de</span>
            {(
              [
                [undefined, 'Dibujo'],
                ['sombra', 'Sombra'],
                ['luz', 'Luz'],
              ] as [LayerRole | undefined, string][]
            ).map(([role, label]) => (
              <button key={label} className={l.role === role ? 'lz-chip on' : 'lz-chip'} onClick={() => props.onPatch({ role })} title={role ? 'Se ve en el dibujo; en 3D la luz y las sombras las pone la escena' : 'Parte del diseño (también en 3D)'}>
                {label}
              </button>
            ))}
          </div>
          {props.onFlip && (
            <div className="lz-chips">
              <button className="lz-chip" onClick={() => props.onFlip!('x')}>
                ↔ Voltear
              </button>
              <button className="lz-chip" onClick={() => props.onFlip!('y')}>
                ↕ Voltear
              </button>
              {props.onInvert && (
                <button className="lz-chip" onClick={props.onInvert}>
                  Invertir colores
                </button>
              )}
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
type LibraryItem =
  | { kind: 'garment'; id: string; label: string }
  | { kind: 'option'; option: string; value: string | boolean; label: string }
  | { kind: 'art'; artwork: Artwork; label: string } | { kind: 'mockup'; asset: MockupAsset; label: string } | { kind: 'detail'; detail: Detail; label: string }

/** Fornitura de la biblioteca: la de serie de su tipo, con un estilo. */
const stock = (kind: DetailKind, style: string | null): Detail => ({ ...DETAIL_DEFAULTS[kind], ...(style ? { style } : {}), id: 'stock', view: 'front', x: 0, y: 0 })

/** Fornituras de la biblioteca: cada tipo con sus estilos (cremalleras metálicas, invisibles, botones de 2 o 4 agujeros…). */
const EFFECTS: DetailKind[] = ['roto', 'deshilachado', 'desgaste']
const HARDWARE: { kind: DetailKind; styles: (string | null)[] }[] = DETAIL_KINDS.filter((k) => !EFFECTS.includes(k.id)).map((k) => ({
  kind: k.id,
  styles: DETAIL_STYLES[k.id]?.map((s) => s.id) ?? [null],
}))

/** Biblioteca visual: prendas del catálogo y fornituras, para tocar (al centro) o arrastrar al lienzo. */
function Library({
  onCreateArtwork,
  onEditArtwork,
  textures,
  onTexture,
  onUploadTexture,
  onDeleteTexture,
  materials,
  artworks,
  presets,
  onDeletePreset,
  onStart,
}: {
  onCreateArtwork: (template?: string) => void
  onEditArtwork: (a: Artwork) => void
  textures: LienzoAsset[]
  onTexture: (t: TextureDef | LienzoAsset) => void
  onUploadTexture: (f: File) => void
  onDeleteTexture: (t: LienzoAsset) => void
  materials: Map<string, import('../shared/library').Material>
  artworks: Artwork[]
  presets: HardwarePreset[]
  onDeletePreset: (p: HardwarePreset) => void
  onStart: (item: LibraryItem, e: React.PointerEvent) => void
}) {
  const brandColors = useAuth().user?.brandColors ?? []
  const [tab, setTab] = useState<'mockups' | 'texturas' | 'prendas' | 'cuellos' | 'graficos' | 'fornituras' | 'mias'>('mockups')
  const [kind, setKind] = useState<DetailKind>('cremallera')
  const body = useMemo(() => standardBody('M'), [])
  return (
    <div className="lz-library">
      <div className="lz-chips">
        <button className={tab === 'mockups' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('mockups')} title="Dibujos planos para pintar encima">
          Mockups
        </button>
        <button className={tab === 'texturas' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('texturas')} title="Telas y efectos: se ponen encima de la capa elegida, recortados a ella">
          Texturas
        </button>
        <button className={tab === 'prendas' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('prendas')} title="Prendas del Diseñador: se les cambia el cuello, la capucha… y se pintan por piezas">
          Prendas editables
        </button>
        <button className={tab === 'cuellos' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('cuellos')} title="Arrástralos encima de una prenda editable">
          Cuellos y capuchas
        </button>
        <button className={tab === 'graficos' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('graficos')} title="Tus logos y estampados de Biblioteca → Gráficos">
          Gráficos
        </button>
        <button className={tab === 'fornituras' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('fornituras')}>
          Fornituras y detalles
        </button>
        <button className={tab === 'mias' ? 'lz-chip on' : 'lz-chip'} onClick={() => setTab('mias')}>
          Mis fornituras{presets.length ? ` (${presets.length})` : ''}
        </button>
      </div>
      {tab === 'texturas' ? (
        <>
          <p className="lz-muted">Toca una: se pone encima de la capa elegida (la prenda o tu color), recortada a ella y en Superponer. Puedes poner varias.</p>
          {(['Telas', 'Efectos'] as const).map((group) => (
            <div key={group}>
              <p className="lz-label">{group}</p>
              <div className="lz-grid-items">
                {TEXTURES.filter((t) => t.group === group).map((t) => (
                  <button key={t.id} className="lz-lib-item" onClick={() => onTexture(t)} title={t.name}>
                    <TextureThumb id={t.id} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="lz-label">Mis texturas</p>
          <div className="lz-grid-items">
            <label className="lz-lib-item lz-upload" title="Cualquier imagen: una foto de tela, una textura descargada…">
              <div className="lz-lib-thumb">＋</div>
              <span>Subir textura</span>
              <input type="file" accept="image/*" hidden onChange={(ev) => ev.target.files?.[0] && onUploadTexture(ev.target.files[0])} />
            </label>
            {textures.map((t) => (
              <div key={t.id} className="lz-lib-item" title={t.name}>
                <button className="lz-lib-pick" onClick={() => onTexture(t)}>
                  <div className="lz-lib-thumb">
                    <img src={fileOf(t.file)} alt={t.name} draggable={false} />
                  </div>
                  <span>{t.name}</span>
                </button>
                <button className="lz-mini" onClick={() => confirm(`¿Quitar «${t.name}» de Mis texturas?`) && onDeleteTexture(t)} title="Quitar de Mis texturas">
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="lz-muted">Arrastra al lienzo o toca para ponerlo en el centro.</p>
      )}
      {tab === 'texturas' ? null : tab === 'cuellos' ? (
        <>
          <p className="lz-muted">Suéltalos encima de una prenda editable (la de tu diseño o las de «Prendas editables»).</p>
          <div className="lz-grid-items">
            {NECKS.map((n) => (
              <button key={n.option + String(n.value)} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'option', option: n.option, value: n.value, label: n.label }, ev)} title={n.label}>
                <div className="lz-lib-thumb neck">
                  <FlatView template={n.template} data={n.data} view="front" materials={materials} mode="linea" />
                </div>
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : tab === 'graficos' ? (
        <>
          <div className="lz-chips">
            <button className="lz-chip on" onClick={() => onCreateArtwork()}>
              + Crear un gráfico o logo
            </button>
            <button className="lz-chip on" onClick={() => onCreateArtwork('graffiti')} title="Escribe un texto y elige el estilo: burbuja, wildstyle, 3D, tag…">
              + Graffiti
            </button>
          </div>
          <p className="lz-label">Empezar con un logo</p>
          <div className="lz-templates">
            <TemplateGallery brand={brandColors} onPick={(t) => onCreateArtwork(t.id)} />
          </div>
          <p className="lz-label">Tus gráficos (toca para ponerlo; doble toque para editarlo)</p>
          {artworks.length ? (
          <div className="lz-grid-items">
            {artworks.map((a) => (
              <button key={a.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'art', artwork: a, label: a.name }, ev)} onDoubleClick={() => onEditArtwork(a)} title={a.name + " (doble toque para editarlo)"}>
                <div className="lz-lib-thumb checker">
                  <img src={fileOf(a.file)} alt={a.name} draggable={false} />
                </div>
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="lz-muted">Aún no tienes gráficos: crea uno arriba o súbelos en Biblioteca → Gráficos.</p>
          )}
        </>
      ) : tab === 'mockups' ? (
        <div className="lz-grid-items">
          {MOCKUPS.map((m) => (
            <button key={m.id} className="lz-lib-item" onPointerDown={(ev) => onStart({ kind: 'mockup', asset: m, label: m.name }, ev)} title={m.name}>
              <div className="lz-lib-thumb">
                <img src={m.file} alt={m.name} draggable={false} />
              </div>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      ) : tab === 'mias' ? (
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
  const withArt = d.kind === 'boton' || d.kind === 'parche' || d.kind === 'etiqueta' || (d.kind === 'cremallera' && d.puller === 'logo') || (d.kind === 'tope' && d.style === 'logo')
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
      {(d.kind === 'etiqueta' || d.kind === 'parche' || (d.kind === 'boton' && d.style === 'jeans') || (d.kind === 'cordon' && d.style === 'plano')) && (
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
  const pieces = Object.fromEntries(
    Object.entries(base.pieces).map(([k, v]) => [k, { ...v, color: l.pieces?.[k]?.color ?? (l.style === 'color' ? '#ebebea' : v.color), ...(l.pieces?.[k]?.surface ? { surface: l.pieces[k].surface } : {}) }]),
  )
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
  const [mode, setMode] = useState<'producto' | 'maniqui'>('producto')
  const [shot, setShot] = useState<ProductShot>('colgada')
  const [finish, setFinish] = useState('')
  const [exact, setExact] = useState(true)
  const base = useMemo(
    () =>
      mode === 'producto'
        ? productPrompt({ design, materials, shot, finish, exact, extra })
        : lookPrompt({
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
    [design, materials, female, scene, extra, mode, shot, finish, exact],
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
      <p className="lz-label">Tipo de foto</p>
      <div className="lz-chips">
        <button className={mode === 'producto' ? 'lz-chip on' : 'lz-chip'} onClick={() => setMode('producto')} title="La prenda sola, como en un catálogo">
          Foto de producto
        </button>
        <button className={mode === 'maniqui' ? 'lz-chip on' : 'lz-chip'} onClick={() => setMode('maniqui')} title="Puesta en un maniquí sin rostro (como el Lookbook)">
          En maniquí
        </button>
      </div>
      {mode === 'producto' ? (
        <>
          <p className="lz-label">Cómo</p>
          <div className="lz-chips">
            {PRODUCT_SHOTS.map((x) => (
              <button key={x.id} className={shot === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setShot(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <p className="lz-label">Acabado del tejido</p>
          <div className="lz-chips">
            {PRODUCT_FINISHES.map((x) => (
              <button key={x.id} className={finish === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setFinish(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <label className="lz-toggle" title="La IA no cambia nada del dibujo: logos, textos, colores, cremallera, bolsillos…">
            <input type="checkbox" checked={exact} onChange={(ev) => setExact(ev.target.checked)} /> Mantener el diseño exacto
          </label>
        </>
      ) : (
        <>
          <p className="lz-label">Escenario</p>
          <div className="lz-chips">
            {LOOK_SCENES.filter((x) => x.id !== 'otro').map((x) => (
              <button key={x.id} className={scene === x.id ? 'lz-chip on' : 'lz-chip'} onClick={() => setScene(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </>
      )}
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

/** Ajustes de un texto: lo que dice, fuente, tamaño, color, negrita, cursiva, espaciado, arco y contorno. */
function TextOptions({ layer: l, onPatch }: { layer: TextLayer; onPatch: (p: Partial<CanvasLayer>) => void }) {
  const set = (p: Partial<TextLayer>) => onPatch(p as Partial<CanvasLayer>)
  return (
    <div className="lz-text-opts">
      <label className="lz-field">
        <span>Texto</span>
        <textarea className="lz-hex" rows={2} value={l.text} onChange={(e) => set({ text: e.target.value })} />
      </label>
      <div className="lz-font">
        <FontPicker value={l.font} onChange={(font) => set({ font })} label="Fuente" />
      </div>
      <div className="lz-field">
        <span>
          Tamaño <strong>{Math.round(l.size)} px</strong>
        </span>
        <input type="range" min={10} max={500} step={1} value={l.size} onChange={(e) => set({ size: Number(e.target.value) })} />
      </div>
      <div className="lz-color-pair">
        <label className="lz-field">
          <span>Color</span>
          <input type="color" value={l.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="lz-field">
          <span>Contorno</span>
          <input type="color" value={l.stroke ?? '#ffffff'} onChange={(e) => set({ stroke: e.target.value, strokeWidth: l.strokeWidth ?? 4 })} />
        </label>
      </div>
      <div className="lz-chips">
        <button className={l.bold ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ bold: !l.bold })}>
          <strong>N</strong> Negrita
        </button>
        <button className={l.italic ? 'lz-chip on' : 'lz-chip'} onClick={() => set({ italic: !l.italic })}>
          <em>C</em> Cursiva
        </button>
        {l.stroke && (
          <button className="lz-chip" onClick={() => set({ stroke: undefined, strokeWidth: undefined })}>
            Sin contorno
          </button>
        )}
      </div>
      {l.stroke && (
        <div className="lz-field">
          <span>
            Grosor del contorno <strong>{l.strokeWidth ?? 4} px</strong>
          </span>
          <input type="range" min={1} max={40} step={1} value={l.strokeWidth ?? 4} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} />
        </div>
      )}
      <div className="lz-field">
        <span>
          Espacio entre letras <strong>{l.letterSpacing ?? 0} px</strong>
        </span>
        <input type="range" min={-20} max={120} step={1} value={l.letterSpacing ?? 0} onChange={(e) => set({ letterSpacing: Number(e.target.value) || undefined })} />
      </div>
      <div className="lz-field">
        <span>
          Arco <strong>{l.arc ?? 0}</strong>
        </span>
        <input type="range" min={-100} max={100} step={1} value={l.arc ?? 0} onChange={(e) => set({ arc: Number(e.target.value) || undefined })} />
      </div>
    </div>
  )
}

/** Estampados del bote (los mismos de las piezas del Diseñador). */
const FILL_PATTERNS: { id: SurfaceKind; label: string; group?: string }[] = [
  { id: 'liso', label: 'Color liso' },
  ...PATTERN_GROUPS.flatMap((g) => g.ids.map((id) => ({ id: id as SurfaceKind, label: SURFACE_KINDS.find((k) => k.id === id)?.label ?? id, group: g.label }))),
  { id: 'imagen', label: 'Tu tela', group: 'Otros' },
]

/** Con qué rellena el bote: color liso o estampado, con su segundo color y su tamaño. */
function PatternPicker({
  value,
  color,
  onChange,
  onUpload,
}: {
  value: Settings['fillPattern']
  color: string
  onChange: (v: Settings['fillPattern']) => void
  onUpload: (f: File) => void
}) {
  const v = value ?? { kind: 'liso' as SurfaceKind, color2: '#ffffff', size: 3, angle: 0 }
  return (
    <>
      <select
        value={v.kind}
        onChange={(e) => onChange({ ...v, kind: e.target.value as SurfaceKind, size: DEFAULT_SIZE[e.target.value] ?? v.size, color2: patternDefaults(e.target.value).c2 })}
        title="Rellenar con color liso o con un estampado"
        className="lz-select"
      >
        <option value="liso">Color liso</option>
        {[...new Set(FILL_PATTERNS.filter((p) => p.group).map((p) => p.group!))].map((g) => (
          <optgroup key={g} label={g}>
            {FILL_PATTERNS.filter((p) => p.group === g).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {v.kind !== 'liso' && (
        <>
          <PatternSwatch value={v} color={color} />
          {v.kind !== 'imagen' ? (
            <label className="lz-mini-color" title="Segundo color del estampado">
              <input type="color" value={v.color2} onChange={(e) => onChange({ ...v, color2: e.target.value })} />
            </label>
          ) : (
            <label className="lz-chip" title="Sube una muestra de tu tela (se repite)">
              {v.file ? 'Cambiar tela' : 'Subir tela'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
          )}
          <label className="lz-inline-range" title="Tamaño del dibujo que se repite">
            <span>{v.size} cm</span>
            <input type="range" min={0.5} max={Math.max(20, (DEFAULT_SIZE[v.kind] ?? 0) * 3)} step={0.5} value={v.size} onChange={(e) => onChange({ ...v, size: Number(e.target.value) })} />
          </label>
        </>
      )}
    </>
  )
}

/** Muestra pequeña del estampado elegido. */
function PatternSwatch({ value, color }: { value: Settings['fillPattern']; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    const tile = pieceTile({ color, surface: { kind: value.kind, color2: value.color2, color3: '#6b7280', size: value.size, angle: value.angle, ...(value.file ? { file: value.file } : {}) } })
    g.clearRect(0, 0, c.width, c.height)
    if (!tile) return
    const p = g.createPattern(tile.canvas, 'repeat')!
    p.setTransform(new DOMMatrix().scale(Math.max(0.03, Math.min(0.25, 10 / value.size / 10))))
    g.fillStyle = p
    g.fillRect(0, 0, c.width, c.height)
  })
  return <canvas ref={ref} width={30} height={30} className="lz-swatch-canvas" />
}

/** Caja de lo que hay pintado en un canvas (en px), o null si está vacío. Se mira en pequeño, rápido. */
function paintedBox(c: HTMLCanvasElement): [number, number, number, number] | null {
  const k = 0.125
  const s = document.createElement('canvas')
  s.width = Math.ceil(c.width * k)
  s.height = Math.ceil(c.height * k)
  const g = s.getContext('2d', { willReadFrequently: true })!
  g.drawImage(c, 0, 0, s.width, s.height)
  const d = g.getImageData(0, 0, s.width, s.height).data
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++)
      if (d[(y * s.width + x) * 4 + 3]) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  if (!Number.isFinite(x0)) return null
  return [(x0 - 1) / k, (y0 - 1) / k, (x1 + 2) / k, (y1 + 2) / k]
}

/**
 * Cuellos y capuchas de la biblioteca: cada tipo de cuello de las prendas del catálogo (una vez cada uno) y la
 * capucha, con la miniatura de una prenda que lo lleva.
 */
const NECKS: { option: string; value: string | boolean; label: string; template: GarmentTemplate; data: DesignData }[] = (() => {
  const out: { option: string; value: string | boolean; label: string; template: GarmentTemplate; data: DesignData }[] = []
  const seen = new Set<string>()
  for (const e of NEW_DESIGN_CATALOG) {
    const t = e.template
    for (const o of t.options) {
      if (o.id === 'cuello' && o.type === 'choice')
        for (const c of o.choices) {
          if (seen.has(c.id)) continue
          seen.add(c.id)
          out.push({ option: 'cuello', value: c.id, label: c.id === 'capucha' ? 'Capucha' : `Cuello ${c.label.toLowerCase()}`, template: t, data: { ...defaultDesign(t, { ...e.options, cuello: c.id }), prints: [] } as DesignData })
        }
      if (o.id === 'capucha' && o.type === 'toggle' && !seen.has('capucha-toggle')) {
        seen.add('capucha-toggle')
        out.push({ option: 'capucha', value: true, label: 'Capucha (sudadera)', template: t, data: { ...defaultDesign(t, { ...e.options, capucha: true }), prints: [] } as DesignData })
        out.push({ option: 'capucha', value: false, label: 'Sin capucha (sudadera)', template: t, data: { ...defaultDesign(t, { ...e.options, capucha: false }), prints: [] } as DesignData })
      }
    }
  }
  return out
})()

/** Guía de perspectiva: líneas que salen de cada punto de fuga y el horizonte; los puntos se arrastran. */
function PerspectiveGuide({
  w,
  h,
  points,
  scale,
  onMove,
  toDoc,
}: {
  w: number
  h: number
  points: [number, number][]
  scale: number
  onMove: (i: number, x: number, y: number) => void
  toDoc: (x: number, y: number) => { x: number; y: number }
}) {
  const L = Math.hypot(w, h) * 2
  const sw = 1.2 / scale
  return (
    <svg className="lz-overlay persp" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <line x1={-L} y1={points[0][1]} x2={L} y2={points[0][1]} stroke="#3d8bfd" strokeWidth={sw * 1.6} opacity={0.7} />
      {points.map(([px, py], i) => (
        <g key={i}>
          {Array.from({ length: 36 }, (_, k) => {
            const a = (k / 36) * Math.PI * 2
            return <line key={k} x1={px} y1={py} x2={px + Math.cos(a) * L} y2={py + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.35} />
          })}
          <circle
            cx={px}
            cy={py}
            r={12 / scale}
            fill="#ffffff"
            stroke="#3d8bfd"
            strokeWidth={3 / scale}
            style={{ pointerEvents: 'auto', cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              const move = (ev: PointerEvent) => {
                const p = toDoc(ev.clientX, ev.clientY)
                onMove(i, p.x, p.y)
              }
              const up = () => {
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
            }}
          />
        </g>
      ))}
    </svg>
  )
}

/** Cuadrícula isométrica: líneas a 30° hacia los dos lados y verticales. */
function isoGrid(size: number): React.CSSProperties {
  const c = 'rgba(61, 139, 253, 0.25)'
  const lines = (deg: number) => `repeating-linear-gradient(${deg}deg, ${c} 0 1px, transparent 1px ${size}px)`
  return { backgroundImage: [lines(150), lines(210), lines(90)].join(', ') }
}

/** Guía de la simetría: sus ejes (o los radios) y el centro, que se arrastra. */
function SymmetryGuide({
  w,
  h,
  kind,
  count,
  center,
  scale,
  toDoc,
  onMove,
}: {
  w: number
  h: number
  kind: Symmetry
  count: number
  center: [number, number]
  scale: number
  toDoc: (x: number, y: number) => { x: number; y: number }
  onMove: (x: number, y: number) => void
}) {
  const L = Math.hypot(w, h) * 2
  const [cx, cy] = center
  const sw = 2 / scale
  const full: number[] = []
  if (kind === 'vertical' || kind === 'cuadrante') full.push(Math.PI / 2)
  if (kind === 'horizontal' || kind === 'cuadrante') full.push(0)
  const n = kind === 'radial' || kind === 'giratoria' ? Math.max(2, Math.min(16, count)) : 0
  return (
    <svg className="lz-overlay persp" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {full.map((a) => (
        <line key={a} x1={cx - Math.cos(a) * L} y1={cy - Math.sin(a) * L} x2={cx + Math.cos(a) * L} y2={cy + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.8} />
      ))}
      {Array.from({ length: n }, (_, k) => {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2
        return <line key={k} x1={cx} y1={cy} x2={cx + Math.cos(a) * L} y2={cy + Math.sin(a) * L} stroke="#3d8bfd" strokeWidth={sw} opacity={0.7} />
      })}
      <circle
        cx={cx}
        cy={cy}
        r={11 / scale}
        fill="#fff"
        stroke="#3d8bfd"
        strokeWidth={3 / scale}
        style={{ pointerEvents: 'auto', cursor: 'grab' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          const el = e.currentTarget
          try {
            el.setPointerCapture(e.pointerId)
          } catch {
            // Puntero ya suelto
          }
          const move = (ev: PointerEvent) => {
            const p = toDoc(ev.clientX, ev.clientY)
            onMove(p.x, p.y)
          }
          const up = () => {
            el.removeEventListener('pointermove', move)
            el.removeEventListener('pointerup', up)
          }
          el.addEventListener('pointermove', move)
          el.addEventListener('pointerup', up)
        }}
      />
    </svg>
  )
}

/**
 * Pinta `img` deformado a las cuatro esquinas `c` (arriba izq., arriba der., abajo der., abajo izq.): se parte en una
 * rejilla de n × n trozos y cada uno se pinta como dos triángulos (cada triángulo con su transformación).
 */
function warpDraw(g: CanvasRenderingContext2D, img: HTMLCanvasElement, c: [number, number][], n: number) {
  const W = img.width
  const H = img.height
  const at = (u: number, v: number): [number, number] => {
    const tx = c[0][0] + (c[1][0] - c[0][0]) * u
    const ty = c[0][1] + (c[1][1] - c[0][1]) * u
    const bx = c[3][0] + (c[2][0] - c[3][0]) * u
    const by = c[3][1] + (c[2][1] - c[3][1]) * u
    return [tx + (bx - tx) * v, ty + (by - ty) * v]
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u0 = i / n
      const u1 = (i + 1) / n
      const v0 = j / n
      const v1 = (j + 1) / n
      const s = [
        [u0 * W, v0 * H],
        [u1 * W, v0 * H],
        [u1 * W, v1 * H],
        [u0 * W, v1 * H],
      ] as [number, number][]
      const d = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
      triangle(g, img, s[0], s[1], s[2], d[0], d[1], d[2])
      triangle(g, img, s[0], s[2], s[3], d[0], d[2], d[3])
    }
}
/** Un triángulo de la imagen (s0, s1, s2) pintado en (d0, d1, d2), un poco agrandado para que no se vean las juntas. */
function triangle(g: CanvasRenderingContext2D, img: HTMLCanvasElement, s0: [number, number], s1: [number, number], s2: [number, number], d0: [number, number], d1: [number, number], d2: [number, number]) {
  const [x0, y0] = s0
  const [x1, y1] = s1
  const [x2, y2] = s2
  const [u0, v0] = d0
  const [u1, v1] = d1
  const [u2, v2] = d2
  const dx1 = x1 - x0
  const dy1 = y1 - y0
  const dx2 = x2 - x0
  const dy2 = y2 - y0
  const det = dx1 * dy2 - dx2 * dy1
  if (!det) return
  const du1 = u1 - u0
  const du2 = u2 - u0
  const dv1 = v1 - v0
  const dv2 = v2 - v0
  const a = (du1 * dy2 - du2 * dy1) / det
  const cc = (du2 * dx1 - du1 * dx2) / det
  const b = (dv1 * dy2 - dv2 * dy1) / det
  const d = (dv2 * dx1 - dv1 * dx2) / det
  const e = u0 - a * x0 - cc * y0
  const f = v0 - b * x0 - d * y0
  // Recorte del triángulo de destino, agrandado medio píxel desde su centro
  const mx = (u0 + u1 + u2) / 3
  const my = (v0 + v1 + v2) / 3
  const grow = (x: number, y: number): [number, number] => {
    const l = Math.hypot(x - mx, y - my) || 1
    return [x + ((x - mx) / l) * 0.6, y + ((y - my) / l) * 0.6]
  }
  g.save()
  g.beginPath()
  g.moveTo(...grow(u0, v0))
  g.lineTo(...grow(u1, v1))
  g.lineTo(...grow(u2, v2))
  g.closePath()
  g.clip()
  g.transform(a, b, cc, d, e, f)
  g.drawImage(img, 0, 0)
  g.restore()
}

/** Ajustes de partida de un pincel importado o hecho con una imagen. */
const IMPORTED: LienzoAsset['settings'] = { size: 40, opacity: 1, flow: 0.85, spacing: 0.08, hardness: 1, grain: 0.8, pressureSize: 0.5, pressureOpacity: 0.3, taper: 0, streamline: 0.2, scatter: 0, orient: false }

/** Pincel propio (de la cuenta) como pincel del lienzo: parte de uno de la app y cambia lo que tiene guardado. */
function assetBrush(a: LienzoAsset): BrushPreset {
  const s = a.settings
  const base = BRUSHES.find((b) => b.id === s.base) ?? BRUSHES.find((b) => b.id === 'redondo')!
  const n = (k: string, d: number) => (typeof s[k] === 'number' ? (s[k] as number) : d)
  return {
    ...base,
    id: `u:${a.id}`,
    name: a.name,
    group: 'Mis pinceles',
    size: n('size', base.size),
    opacity: n('opacity', base.opacity),
    flow: n('flow', base.flow),
    spacing: n('spacing', base.spacing),
    hardness: n('hardness', base.hardness),
    grain: n('grain', base.grain),
    pressureSize: n('pressureSize', base.pressureSize),
    pressureOpacity: n('pressureOpacity', base.pressureOpacity),
    taper: n('taper', base.taper),
    streamline: n('streamline', base.streamline),
    scatter: n('scatter', base.scatter),
    tip: a.file ? 'image' : base.tip,
    orient: s.orient === true,
    tipFile: a.file || undefined,
    grainFile: a.grain || undefined,
  }
}

/** Una imagen cargada como canvas (para la punta y el grano de los pinceles). */
function canvasOf(img: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

/** Muestra de una textura de la app. */
function TextureThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Las texturas se hacen la primera vez (unas décimas cada una): de una en una, sin congelar el panel
    const i = TEXTURES.findIndex((t) => t.id === id)
    const timer = setTimeout(() => {
      const c = ref.current
      if (!c) return
      // Un trozo del azulejo a su tamaño (se ve el tejido)
      c.getContext('2d')!.drawImage(textureTile(id), 0, 0, 240, 156, 0, 0, c.width, c.height)
    }, 30 + Math.max(0, i) * 60)
    return () => clearTimeout(timer)
  }, [id])
  return (
    <div className="lz-lib-thumb">
      <canvas ref={ref} width={160} height={104} />
    </div>
  )
}

/** Ajustes de un pincel propio: nombre, flujo, separación, grano, presión, dispersión, afinado y giro de la punta. */
function BrushEditor({ asset, onSave, onDelete }: { asset: LienzoAsset; onSave: (name: string, s: LienzoAsset['settings']) => void; onDelete: () => void }) {
  const [name, setName] = useState(asset.name)
  const [s, setS] = useState(asset.settings)
  const base = assetBrush({ ...asset, settings: s })
  const fields: [keyof BrushPreset & string, string, number, number, number][] = [
    ['flow', 'Flujo', 0.01, 1, 0.01],
    ['spacing', 'Separación', 0.01, 3, 0.01],
    ...(asset.file ? [] : ([['hardness', 'Dureza', 0, 1, 0.05]] as [keyof BrushPreset & string, string, number, number, number][])),
    ['grain', 'Grano', 0, 1, 0.05],
    ['pressureSize', 'Presión → tamaño', 0, 1, 0.05],
    ['pressureOpacity', 'Presión → opacidad', 0, 1, 0.05],
    ['scatter', 'Dispersión', 0, 2, 0.05],
    ['taper', 'Afinado', 0, 120, 1],
  ]
  return (
    <div className="lz-brush-editor">
      <p className="lz-label">Ajustes de «{asset.name}»</p>
      <input className="lz-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del pincel" />
      {fields.map(([k, label, min, max, step]) => (
        <div key={k} className="lz-field">
          <span>
            {label} <strong>{Number(base[k]).toFixed(step < 1 ? 2 : 0)}</strong>
          </span>
          <input type="range" min={min} max={max} step={step} value={Number(base[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
        </div>
      ))}
      {asset.file && (
        <label className="lz-toggle">
          <input type="checkbox" checked={s.orient === true} onChange={(e) => setS({ ...s, orient: e.target.checked })} /> La punta gira con el trazo
        </label>
      )}
      <div className="lz-chips">
        <button className="lz-chip on" onClick={() => onSave(name.trim() || asset.name, s)}>
          Guardar cambios
        </button>
        <button className="lz-chip danger" onClick={() => confirm(`¿Borrar el pincel «${asset.name}»?`) && onDelete()}>
          Borrar pincel
        </button>
      </div>
    </div>
  )
}

/** Rellena lo pintado en el rectángulo con un estampado (el azulejo del Diseñador, a unos 10 px por cm del papel). */
function fillWithPattern(g: CanvasRenderingContext2D, f: { x0: number; y0: number; x1: number; y1: number }, kind: string, base: string, colors?: [string, string], size?: number, pxPerCm = 10) {
  const d = patternDefaults(kind)
  const tile = pieceTile({ color: base, surface: { kind: kind as SurfaceKind, color2: colors?.[0] ?? d.c2, color3: colors?.[1] ?? d.c3, size: size || DEFAULT_SIZE[kind] || 4, angle: 0 } })
  if (!tile) return
  const pattern = g.createPattern(tile.canvas, 'repeat')
  if (!pattern) return
  pattern.setTransform(new DOMMatrix().scale((tile.cm * pxPerCm) / tile.canvas.width))
  g.save()
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = pattern
  g.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0)
  g.restore()
}

/**
 * Botón flotante del menú rápido: se arrastra a cualquier sitio del lienzo (se recuerda) y al tocarlo abre el menú.
 */
function QuickButton({ at, open, onMove, onToggle }: { at: [number, number]; open: boolean; onMove: (at: [number, number]) => void; onToggle: (rect: DOMRect) => void }) {
  const [pos, setPos] = useState(at)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => setPos(at), [at[0], at[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const place = (ev: { clientX: number; clientY: number }, el: HTMLElement) => {
    const box = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    const x = Math.min(0.98, Math.max(0.02, (ev.clientX - box.left) / box.width))
    const y = Math.min(0.97, Math.max(0.06, (ev.clientY - box.top) / box.height))
    return [x, y] as [number, number]
  }
  return (
    <button
      className={open ? 'lz-fab on' : 'lz-fab'}
      style={{ left: `${pos[0] * 100}%`, top: `${pos[1] * 100}%` }}
      title="Menú rápido: tócalo para abrirlo o arrástralo donde quieras (también con clic derecho en el lienzo)"
      aria-label="Menú rápido"
      onPointerDown={(e) => {
        e.stopPropagation()
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Puntero ya suelto
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
        d.moved = true
        setPos(place(e, e.currentTarget))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d) return
        if (d.moved) onMove(place(e, e.currentTarget))
        else onToggle(e.currentTarget.getBoundingClientRect())
      }}
    >
      <Icon d="M10 3a7 7 0 100 14 7 7 0 000-14zM10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
    </button>
  )
}
