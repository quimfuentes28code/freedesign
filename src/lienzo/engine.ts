import { api } from '../api/client'
import { detailAspect, detailPrims, drawPrims } from '../designer/details'
import type { Shape } from '../designer/types'
import type { CanvasDoc, CanvasLayer, DetailLayer, PaintLayer, TextLayer } from '../shared/designs'
import { loadFont } from '../designer/fonts'
import { fileUrl } from '../shared/library'
import type { Rect } from './brushes'

/**
 * Lo que vive en memoria mientras se edita un lienzo: el canvas de cada capa de pintura, los mockups ya pintados,
 * las imágenes cargadas, qué capas han cambiado (para subirlas al guardar) y el historial de deshacer.
 * Se guarda por diseño, así no se pierde al cambiar a la vista 2D o 3D y volver.
 */
export class Runtime {
  readonly paint = new Map<string, HTMLCanvasElement>()
  readonly mockups = new Map<string, HTMLCanvasElement>()
  readonly images = new Map<string, HTMLImageElement>()
  /** Fornituras ya pintadas (se rehacen al cambiar su forma o color). */
  readonly details = new Map<string, { key: string; canvas: HTMLCanvasElement }>()
  /** Textos ya pintados. */
  readonly texts = new Map<string, { key: string; canvas: HTMLCanvasElement }>()
  /** Capas con máscara de recorte ya recortadas (y su base pintada). */
  readonly clips = new Map<string, { key: string; canvas: HTMLCanvasElement; base: HTMLCanvasElement }>()
  /** De cada mockup: su encuadre en unidades del dibujo y sus piezas (para pintar una pieza con un toque). */
  readonly mockupInfo = new Map<string, { box: { x: number; y: number; w: number; h: number }; shapes: Shape[] }>()
  /** Capas de pintura con cambios sin subir. */
  readonly dirty = new Set<string>()
  readonly history = new History()
  /** Archivos que dejarán de usarse al guardar (versiones anteriores de las capas). */
  readonly stale = new Set<string>()
  /** Archivo ya cargado en cada capa (para no volver a cargarlo ni pisar lo pintado después). */
  private readonly loaded = new Map<string, string>()
  constructor(
    public w: number,
    public h: number,
  ) {}

  /** Canvas de una capa de pintura (lo crea vacío si no existe). */
  layer(id: string) {
    let c = this.paint.get(id)
    if (!c) {
      c = document.createElement('canvas')
      c.width = this.w
      c.height = this.h
      this.paint.set(id, c)
    }
    return c
  }

  /** Apunta que el canvas de la capa ya tiene lo de `file` (al subirla). */
  markLoaded(id: string, file: string) {
    this.loaded.set(id, file)
  }

  /** Carga las capas de pintura guardadas (las que aún no están en memoria) y las imágenes. */
  async load(doc: CanvasDoc) {
    await Promise.all(
      doc.layers.map(async (l) => {
        // (el canvas de la capa puede existir ya, vacío: se crea al pintar la pantalla antes de que llegue la imagen)
        if (l.kind === 'paint' && l.file && this.loaded.get(l.id) !== l.file && !this.dirty.has(l.id)) {
          const img = await loadImage(fileUrl(l.file))
          const c = this.layer(l.id)
          if (img) {
            const g = c.getContext('2d')!
            g.clearRect(0, 0, this.w, this.h)
            g.drawImage(img, 0, 0, this.w, this.h)
          }
          this.loaded.set(l.id, l.file)
        }
        if (l.kind === 'image' && !this.images.has(imageKey(l))) {
          const img = await loadImage(l.asset ?? fileUrl(l.file))
          if (img) this.images.set(imageKey(l), img)
        }
      }),
    )
  }
}

const runtimes = new Map<string, Runtime>()
/** Lienzo en memoria de un diseño (se crea al abrirlo por primera vez). */
export function runtimeFor(designId: string, doc: CanvasDoc) {
  let r = runtimes.get(designId)
  if (!r || r.w !== doc.w || r.h !== doc.h) {
    r = new Runtime(doc.w, doc.h)
    runtimes.set(designId, r)
  }
  return r
}

/** El borrador (lienzo sin guardar) pasa a ser el de un diseño ya creado, con lo pintado y su historial. */
export function moveRuntime(from: string, to: string) {
  const r = runtimes.get(from)
  if (!r) return
  runtimes.delete(from)
  runtimes.set(to, r)
}
/** Olvida el lienzo en memoria de un diseño (p. ej. para empezar un borrador nuevo). */
export function dropRuntime(designId: string) {
  runtimes.delete(designId)
}

/**
 * Sube las capas de pintura cambiadas y devuelve el documento con sus archivos nuevos. Lo llama el editor antes de
 * guardar el diseño (con cualquier botón de guardar). Después de guardar, `afterSave` borra las versiones viejas.
 */
const flushers = new Map<string, () => Promise<CanvasDoc | null>>()
export function registerFlush(designId: string, fn: () => Promise<CanvasDoc | null>) {
  flushers.set(designId, fn)
  return () => {
    if (flushers.get(designId) === fn) flushers.delete(designId)
  }
}
export async function flushCanvas(designId: string) {
  return (await flushers.get(designId)?.()) ?? null
}
export function afterSave(designId: string) {
  const r = runtimes.get(designId)
  if (!r) return
  for (const key of r.stale) api.deleteFile(key).catch(() => {})
  r.stale.clear()
}

/** Sube las capas cambiadas de `doc`. */
export async function uploadDirty(r: Runtime, doc: CanvasDoc): Promise<CanvasDoc> {
  if (!r.dirty.size) return doc
  const layers: CanvasLayer[] = []
  for (const l of doc.layers) {
    if (l.kind !== 'paint' || !r.dirty.has(l.id)) {
      layers.push(l)
      continue
    }
    const c = r.layer(l.id)
    let file: string | null = null
    if (!isEmpty(c)) {
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
      if (blob) file = (await api.uploadBlob(blob)).key
    }
    if (l.file) r.stale.add(l.file)
    if (file) r.markLoaded(l.id, file)
    layers.push({ ...l, file } satisfies PaintLayer)
  }
  r.dirty.clear()
  return { ...doc, layers }
}

/** ¿El canvas está vacío? (se mira una versión reducida, rápido). */
function isEmpty(c: HTMLCanvasElement) {
  const s = document.createElement('canvas')
  s.width = 128
  s.height = Math.max(1, Math.round((128 * c.height) / c.width))
  const g = s.getContext('2d', { willReadFrequently: true })!
  g.drawImage(c, 0, 0, s.width, s.height)
  const d = g.getImageData(0, 0, s.width, s.height).data
  for (let i = 3; i < d.length; i += 4) if (d[i]) return false
  return true
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Pinta una capa en `g` (sin su opacidad ni su fusión), en su sitio del lienzo. */
export function drawLayer(g: CanvasRenderingContext2D, r: Runtime, l: CanvasLayer) {
  g.save()
  if (l.kind === 'paint') g.drawImage(r.layer(l.id), 0, 0)
  else if (l.kind === 'mockup') {
    const m = r.mockups.get(l.id)
    if (m) g.drawImage(m, l.x, l.y, l.w, (l.w * m.height) / m.width)
  } else if (l.kind === 'text') {
    const c = textCanvas(r, l)
    g.translate(l.x, l.y)
    g.rotate((l.rotation * Math.PI) / 180)
    g.drawImage(c, -c.width / 4, -c.height / 4, c.width / 2, c.height / 2)
  } else if (l.kind === 'detail') {
    const c = detailCanvas(r, l)
    const h = (l.w * c.height) / c.width
    g.translate(l.x, l.y)
    g.rotate((l.rotation * Math.PI) / 180)
    g.drawImage(c, -l.w / 2, -h / 2, l.w, h)
  } else {
    const img = r.images.get(imageKey(l))
    if (img) {
      const h = l.w * l.aspect
      g.translate(l.x + l.w / 2, l.y + h / 2)
      g.rotate((l.rotation * Math.PI) / 180)
      g.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1)
      g.drawImage(img, -l.w / 2, -h / 2, l.w, h)
    }
  }
  g.restore()
}

/** Una capa sola en un canvas del tamaño del lienzo. */
export function renderLayer(r: Runtime, doc: CanvasDoc, l: CanvasLayer) {
  if (l.kind === 'paint') return r.layer(l.id)
  const c = document.createElement('canvas')
  c.width = doc.w
  c.height = doc.h
  drawLayer(c.getContext('2d')!, r, l)
  return c
}

/**
 * Base de una capa con máscara de recorte: la primera capa de debajo que no recorta. Sin base (la de abajo del todo),
 * la capa se ve entera.
 */
export function clipBaseOf(doc: CanvasDoc, l: CanvasLayer): CanvasLayer | null {
  if (!l.clip) return null
  let i = doc.layers.findIndex((x) => x.id === l.id) - 1
  while (i >= 0 && doc.layers[i].clip) i--
  return i >= 0 ? doc.layers[i] : null
}

/**
 * Capa con máscara de recorte tal como se ve: solo donde su base tiene algo. No toca lo pintado (si la base crece, se
 * ve más). Se guarda mientras ni la capa ni su base cambien (`doc.rev` sube con cada trazo).
 */
export function clippedLayer(r: Runtime, doc: CanvasDoc, l: CanvasLayer, base: CanvasLayer) {
  const ready = (x: CanvasLayer) => (x.kind === 'mockup' ? r.mockups.has(x.id) : x.kind === 'image' ? r.images.has(imageKey(x)) : true)
  const key = `${doc.rev ?? 0}|${JSON.stringify(l)}|${JSON.stringify(base)}|${ready(l)}${ready(base)}`
  const cached = r.clips.get(l.id)
  if (cached && cached.key === key) return cached
  const canvas = cached?.canvas ?? document.createElement('canvas')
  canvas.width = doc.w
  canvas.height = doc.h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, doc.w, doc.h)
  drawLayer(g, r, l)
  // (copia: la de una capa de pintura cambia al pintar en ella)
  const baseCanvas = document.createElement('canvas')
  baseCanvas.width = doc.w
  baseCanvas.height = doc.h
  drawLayer(baseCanvas.getContext('2d')!, r, base)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(baseCanvas, 0, 0)
  g.globalCompositeOperation = 'source-over'
  const out = { key, canvas, base: baseCanvas }
  r.clips.set(l.id, out)
  return out
}
/** Rehace solo una zona de una capa de pintura recortada (al borrar en directo sobre ella). */
export function refreshClip(r: Runtime, l: CanvasLayer, rect: Rect) {
  const c = r.clips.get(l.id)
  if (!c || l.kind !== 'paint') return
  const w = rect.x1 - rect.x0
  const h = rect.y1 - rect.y0
  if (w <= 0 || h <= 0) return
  const g = c.canvas.getContext('2d')!
  g.clearRect(rect.x0, rect.y0, w, h)
  g.drawImage(r.layer(l.id), rect.x0, rect.y0, w, h, rect.x0, rect.y0, w, h)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(c.base, rect.x0, rect.y0, w, h, rect.x0, rect.y0, w, h)
  g.globalCompositeOperation = 'source-over'
}

/** Pinta el lienzo entero (papel y capas visibles, con su opacidad, fusión y máscaras de recorte) en un canvas. */
export function compose(r: Runtime, doc: CanvasDoc, opts: { paper?: boolean; skip?: string } = {}) {
  const out = document.createElement('canvas')
  out.width = doc.w
  out.height = doc.h
  const g = out.getContext('2d', { willReadFrequently: true })!
  if (opts.paper !== false) {
    g.fillStyle = doc.paper
    g.fillRect(0, 0, doc.w, doc.h)
  }
  for (const l of doc.layers) {
    if (!l.visible || l.id === opts.skip) continue
    const base = clipBaseOf(doc, l)
    // Si su base está oculta, la capa recortada tampoco se ve
    if (base && !base.visible) continue
    g.save()
    g.globalAlpha = l.opacity
    g.globalCompositeOperation = (l.blend === 'normal' ? 'source-over' : l.blend) as GlobalCompositeOperation
    if (base) g.drawImage(clippedLayer(r, doc, l, base).canvas, 0, 0)
    else drawLayer(g, r, l)
    g.restore()
  }
  return out
}

/**
 * Silueta de las prendas (mockups visibles): blanco opaco donde hay prenda. Sirve para pintar solo dentro de ella
 * (sombras, desgastados, color) sin salirse.
 */
export function garmentMask(r: Runtime, doc: CanvasDoc) {
  const out = document.createElement('canvas')
  out.width = doc.w
  out.height = doc.h
  const g = out.getContext('2d')!
  for (const l of doc.layers) {
    if (!l.visible) continue
    if (l.kind === 'mockup') {
      const m = r.mockups.get(l.id)
      if (m) g.drawImage(m, l.x, l.y, l.w, (l.w * m.height) / m.width)
    } else if (l.kind === 'image' && l.asset) {
      // Los mockups de la biblioteca (imágenes con el fondo transparente) también son prenda
      const img = r.images.get(imageKey(l))
      if (!img) continue
      const h = l.w * l.aspect
      g.save()
      g.translate(l.x + l.w / 2, l.y + h / 2)
      g.rotate((l.rotation * Math.PI) / 180)
      g.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1)
      g.drawImage(img, -l.w / 2, -h / 2, l.w, h)
      g.restore()
    }
  }
  return out
}

/** Clave de la imagen de una capa de imagen (archivo subido o imagen de la app). */
export function imageKey(l: { file: string; asset?: string }) {
  return l.asset ?? l.file
}

/**
 * Bote de pintura: rellena la zona cerrada alrededor de (x, y) en lo que se ve (todas las capas), con un margen de 1 px
 * para que no quede un hilo claro junto a la línea. Devuelve la máscara de la zona (blanco = rellenar).
 */
export function floodMask(source: HTMLCanvasElement, x: number, y: number, tolerance = 40) {
  const w = source.width
  const h = source.height
  const data = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  x = Math.floor(x)
  y = Math.floor(y)
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  const k0 = (y * w + x) * 4
  const [r0, g0, b0, a0] = [data[k0], data[k0 + 1], data[k0 + 2], data[k0 + 3]]
  const same = (i: number) => {
    const k = i * 4
    return Math.abs(data[k] - r0) + Math.abs(data[k + 1] - g0) + Math.abs(data[k + 2] - b0) + Math.abs(data[k + 3] - a0) <= tolerance * 2
  }
  const seen = new Uint8Array(w * h)
  const stack = [y * w + x]
  seen[y * w + x] = 1
  let count = 0
  while (stack.length) {
    const i = stack.pop()!
    count++
    const px = i % w
    const py = (i - px) / w
    for (const j of [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j]) continue
      seen[j] = 1
      if (same(j)) stack.push(j)
      else seen[j] = 2
    }
  }
  // Demasiado grande (casi todo el lienzo): seguramente era el fondo; se rellena igual
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const mg = mask.getContext('2d')!
  const img = mg.createImageData(w, h)
  for (let i = 0; i < w * h; i++) if (seen[i]) img.data[i * 4 + 3] = 255
  mg.putImageData(img, 0, 0)
  return count ? mask : null
}

/** Logos de las fornituras (se cargan una vez; al llegar, se avisa para volver a pintar). */
const artImages = new Map<string, HTMLImageElement | null>()
export function onArtLoaded(fn: () => void) {
  artListeners.add(fn)
  return () => {
    artListeners.delete(fn)
  }
}
function artImage(file: string) {
  if (!artImages.has(file)) {
    artImages.set(file, null)
    loadImage(fileUrl(file)).then((img) => {
      artImages.set(file, img)
      for (const fn of artListeners) fn()
    })
  }
  return artImages.get(file) ?? null
}

/** Quien quiere saber cuándo llega una imagen o una fuente (para volver a pintar). */
const artListeners = new Set<() => void>()

/** Fuente CSS de un texto. */
export const textFont = (l: Pick<TextLayer, 'italic' | 'bold' | 'size' | 'font'>) => `${l.italic ? 'italic ' : ''}${l.bold ? 700 : 400} ${l.size}px ${l.font}`

/**
 * Texto pintado en un canvas al doble de resolución (se dibuja a la mitad). Varias líneas centradas, espaciado entre
 * letras, contorno y, con una sola línea, en arco. Si la fuente aún no ha llegado, se pide y avisa al llegar.
 */
export function textCanvas(r: Runtime, l: TextLayer) {
  const css = textFont(l)
  const ready = document.fonts.check(css)
  if (!ready) loadFont(l.font).then(() => artListeners.forEach((fn) => fn()))
  const key = JSON.stringify([l.text, css, l.color, l.letterSpacing, l.arc, l.stroke, l.strokeWidth, ready])
  const cached = r.texts.get(l.id)
  if (cached?.key === key) return cached.canvas
  const k = 2
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = css
  const spacing = l.letterSpacing ?? 0
  const widthOf = (s: string) => probe.measureText(s).width + Math.max(0, s.length - 1) * spacing
  const lines = l.text.split('\n')
  const lineH = l.size * 1.18
  const pad = (l.strokeWidth ?? 0) + l.size * 0.25
  const arc = lines.length === 1 && l.arc ? (l.arc / 100) * Math.PI : 0
  const textW = Math.max(1, ...lines.map(widthOf))
  let w = textW + pad * 2
  let h = lineH * lines.length + pad * 2
  const R = arc ? textW / Math.abs(arc) : 0
  if (arc) {
    const sag = R * (1 - Math.cos(Math.min(Math.PI, Math.abs(arc)) / 2))
    w = Math.max(w, Math.min(textW, 2 * R) + l.size + pad * 2)
    h = lineH + sag + pad * 2 + l.size * 0.3
  }
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.ceil(w * k))
  c.height = Math.max(2, Math.ceil(h * k))
  const g = c.getContext('2d')!
  g.scale(k, k)
  g.font = css
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.lineJoin = 'round'
  const paintChar = (s: string, x: number, y: number) => {
    if (l.stroke) {
      g.strokeStyle = l.stroke
      g.lineWidth = (l.strokeWidth ?? 4) * 2
      g.strokeText(s, x, y)
    }
    g.fillStyle = l.color
    g.fillText(s, x, y)
  }
  const paintLine = (s: string, cx: number, y: number) => {
    if (!spacing) return paintChar(s, cx, y)
    // Letra a letra para el espaciado
    let x = cx - widthOf(s) / 2
    g.textAlign = 'left'
    for (const ch of s) {
      if (l.stroke) {
        g.strokeStyle = l.stroke
        g.lineWidth = (l.strokeWidth ?? 4) * 2
        g.strokeText(ch, x, y)
      }
      g.fillStyle = l.color
      g.fillText(ch, x, y)
      x += probe.measureText(ch).width + spacing
    }
    g.textAlign = 'center'
  }
  if (arc) {
    // En arco: cada letra sobre un círculo de radio R (hacia arriba si el arco es positivo)
    const up = arc > 0
    const cy = up ? pad + l.size * 0.6 + R : h - pad - l.size * 0.6 - R
    let a = -Math.abs(arc) / 2
    for (const ch of lines[0]) {
      const cw = probe.measureText(ch).width
      const step = (cw + spacing) / R
      const mid = a + cw / R / 2
      g.save()
      g.translate(w / 2 + Math.sin(mid) * R, cy - (up ? 1 : -1) * Math.cos(mid) * R)
      g.rotate(up ? mid : -mid)
      paintChar(ch, 0, 0)
      g.restore()
      a += step
    }
  } else lines.forEach((s, i) => paintLine(s, w / 2, pad + lineH * (i + 0.5)))
  r.texts.set(l.id, { key, canvas: c })
  return c
}

/** Fornitura pintada en un canvas (a buena resolución para su tamaño en el lienzo). */
export function detailCanvas(r: Runtime, l: DetailLayer) {
  const art = l.detail.art?.file
  const key = JSON.stringify([l.detail, Math.round(l.w / 50), art ? !!artImages.get(art) : 0])
  const cached = r.details.get(l.id)
  if (cached?.key === key) return cached.canvas
  const d = l.detail
  const aspect = detailAspect(d)
  const px = Math.min(1600, Math.max(64, l.w * 2))
  const c = document.createElement('canvas')
  c.width = Math.round(px)
  c.height = Math.max(1, Math.round(px * aspect))
  const g = c.getContext('2d')!
  const k = px / d.w
  g.translate(c.width / 2, c.height / 2)
  g.scale(k, k)
  drawPrims(g, detailPrims({ ...d, x: 0, y: 0, rotation: 0 }), artImage)
  r.details.set(l.id, { key, canvas: c })
  return c
}

/**
 * Pieza de prenda bajo el punto (x, y) del lienzo: la del mockup visible más alto que tenga una pieza ahí.
 * Devuelve la capa y el id de la pieza.
 */
export function pieceAt(r: Runtime, doc: CanvasDoc, x: number, y: number) {
  const probe = document.createElement('canvas').getContext('2d')!
  for (const l of [...doc.layers].reverse()) {
    if (l.kind !== 'mockup' || !l.visible || l.locked) continue
    const info = r.mockupInfo.get(l.id)
    if (!info) continue
    const k = info.box.w / l.w
    const ux = info.box.x + (x - l.x) * k
    const uy = info.box.y + (y - l.y) * k
    for (const s of [...info.shapes].reverse()) {
      if (s.kind !== 'fill' || !s.piece) continue
      if (probe.isPointInPath(new Path2D(s.d), ux, uy)) return { layer: l, piece: s.piece }
    }
  }
  return null
}

/** Paso de deshacer: unos píxeles de una capa (antes y después) o el documento entero (capas, orden, ajustes). */
type Step =
  | { kind: 'pixels'; layer: string; rect: Rect; before: ImageData; after: ImageData }
  | { kind: 'doc'; before: CanvasDoc; after: CanvasDoc }

export class History {
  private undoStack: Step[] = []
  private redoStack: Step[] = []
  private readonly max = 60
  push(s: Step) {
    this.undoStack.push(s)
    if (this.undoStack.length > this.max) this.undoStack.shift()
    this.redoStack = []
  }
  canUndo() {
    return this.undoStack.length > 0
  }
  /** Pasos que se pueden deshacer y rehacer. */
  counts() {
    return { undo: this.undoStack.length, redo: this.redoStack.length }
  }
  canRedo() {
    return this.redoStack.length > 0
  }
  /** Deshace: devuelve el documento que hay que poner (si el paso era del documento). */
  undo(r: Runtime): CanvasDoc | null {
    const s = this.undoStack.pop()
    if (!s) return null
    this.redoStack.push(s)
    return apply(r, s, 'before')
  }
  redo(r: Runtime): CanvasDoc | null {
    const s = this.redoStack.pop()
    if (!s) return null
    this.undoStack.push(s)
    return apply(r, s, 'after')
  }
}

function apply(r: Runtime, s: Step, which: 'before' | 'after'): CanvasDoc | null {
  if (s.kind === 'doc') return s[which]
  const c = r.layer(s.layer)
  c.getContext('2d')!.putImageData(s[which], s.rect.x0, s.rect.y0)
  r.dirty.add(s.layer)
  return null
}

/** Píxeles de una zona de una capa (para deshacer). */
export function grab(c: HTMLCanvasElement, rect: Rect) {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(rect.x0, rect.y0, Math.max(1, rect.x1 - rect.x0), Math.max(1, rect.y1 - rect.y0))
}
