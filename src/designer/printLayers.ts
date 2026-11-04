import type { DesignData, Print } from '../shared/designs'
import { fileUrl } from '../shared/library'
import type { Body } from '../production/measurements'
import { buttonPrims, detailFiles, detailPrims, drawPrims, zipperPrims, type Prim } from './details'
import { CX } from './geometry'
import { drawScale } from './measures'
import { printSize } from './prints'
import { isPants, type GarmentTemplate, type View } from './types'

/**
 * Estampados para la vista 3D: los de una vista del dibujo (delantero o espalda) pintados en una imagen que
 * abarca el cuerpo de la prenda, de costado a costado y del punto más alto del hombro al bajo (o, en el pantalón,
 * de la cintura al bajo). La prenda 3D proyecta esa imagen sobre su propio cuerpo con el mismo encuadre,
 * así cada estampado cae en el mismo sitio y con el mismo tamaño relativo que en el dibujo.
 */

/** Encuadre del cuerpo de la prenda en el dibujo: centro, semiancho y alto (unidades del lienzo). */
export interface BodyFrame {
  half: number
  top: number
  bottom: number
}

/** Piezas que forman el «cuerpo» de cada tipo de prenda (las mismas que en 3D llevan los estampados). */
const BODY_PIECES = (t: GarmentTemplate) => (isPants(t) ? ['perneras', 'cinturilla'] : ['cuerpo'])

/** Encuadre del cuerpo a partir de los puntos de sus trazados. */
export function bodyFrame(t: GarmentTemplate, data: DesignData, view: View, body?: Body): BodyFrame | null {
  const pieces = BODY_PIECES(t)
  let half = 0
  let top = Infinity
  let bottom = -Infinity
  for (const s of t.draw(view, data.options, drawScale(t, data, body))) {
    if (s.kind !== 'fill' || !s.piece || !pieces.includes(s.piece)) continue
    const n = (s.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    for (let i = 0; i + 1 < n.length; i += 2) {
      half = Math.max(half, Math.abs(n[i] - CX))
      top = Math.min(top, n[i + 1])
      bottom = Math.max(bottom, n[i + 1])
    }
  }
  return half > 0 && bottom > top ? { half, top, bottom } : null
}

const images = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(file: string) {
  let p = images.get(file)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = fileUrl(file)
    })
    images.set(file, p)
  }
  return p
}

/** Alto de la imagen en píxeles (el ancho sale de la proporción del cuerpo). */
const HEIGHT = 1024

/** Imagen de una vista para el 3D: los colores y el mapa de relieve (blanco donde hay volumen). */
export interface PrintLayer {
  color: HTMLCanvasElement
  /** Bordados, parches y fornituras; null si no hay nada con relieve. */
  relief: HTMLCanvasElement | null
}

/** Imagen con los estampados, detalles y fornituras de una vista, o null si esa vista no tiene nada. */
export async function printLayer(t: GarmentTemplate, data: DesignData, view: View, body?: Body): Promise<PrintLayer | null> {
  const prints = (data.prints ?? []).filter((p) => p.view === view && !p.hidden)
  const details = (data.details ?? []).filter((d) => d.view === view && !d.hidden)
  const hw = data.hardware ?? {}
  // Botones y cremallera de la propia prenda, con su estilo
  const shapes = t.draw(view, data.options, drawScale(t, data, body)).filter((s) => s.role)
  const f = bodyFrame(t, data, view, body)
  if ((!prints.length && !details.length && !shapes.length) || !f) return null
  const k = HEIGHT / (f.bottom - f.top)
  const make = () => {
    const c = document.createElement('canvas')
    c.width = Math.round(f.half * 2 * k)
    c.height = HEIGHT
    return c
  }
  const color = make()
  const relief = make()
  const ctx = color.getContext('2d')
  const rctx = relief.getContext('2d')
  if (!ctx || !rctx) return null

  const files = [...prints.filter((p) => p.kind === 'artwork').map((p) => p.file), ...detailFiles(details, hw)]
  const loaded = new Map(await Promise.all(files.map(async (file) => [file, await loadImage(file)] as const)))
  const img = (file: string) => loaded.get(file) ?? null
  let raised = false

  // Lo que se pinta en (x, y) con giro, en unidades del lienzo del dibujo
  const at = (c: CanvasRenderingContext2D, x: number, y: number, rotation: number, paint: () => void) => {
    c.save()
    c.translate((x - (CX - f.half)) * k, (y - f.top) * k)
    c.rotate((rotation * Math.PI) / 180)
    c.scale(k, k)
    paint()
    c.restore()
  }

  for (const p of prints) {
    at(ctx, p.x, p.y, p.rotation, () => drawPrint(ctx, p, p.kind === 'artwork' ? img(p.file) : null))
    if (p.technique === 'bordado' || p.technique === 'parche') {
      raised = true
      at(rctx, p.x, p.y, p.rotation, () => drawPrint(rctx, p, p.kind === 'artwork' ? img(p.file) : null, '#ffffff'))
    }
  }
  const surface = (prims: Prim[], x: number, y: number, rotation: number, withRelief: boolean) => {
    at(ctx, x, y, rotation, () => drawPrims(ctx, prims, img))
    if (withRelief) {
      raised = true
      at(rctx, x, y, rotation, () => drawPrims(rctx, prims, img, '#ffffff'))
    }
  }
  for (const s of shapes) {
    const b = pathBox(s.d)
    const tint = (piece?: string) => (piece && data.pieces[piece]?.color) || t.pieces.find((p) => p.id === piece)?.defaultColor || '#cccccc'
    const prims =
      s.role === 'button'
        ? buttonPrims(hw.buttons ?? '4', b.w, tint(s.piece), hw.buttonArt)
        : zipperPrims(hw.zip ?? 'metal', hw.puller ?? 'clasico', b.w, b.h, tint(s.piece), tint(t.pieces[0]?.id), hw.pullerArt)
    surface(prims, b.x + b.w / 2, b.y + b.h / 2, 0, true)
  }
  for (const d of details) surface(detailPrims(d), d.x, d.y, d.rotation, d.kind !== 'etiqueta' || !!d.relief)

  return { color, relief: raised ? relief : null }
}

/** Pinta un estampado centrado en (0, 0), en unidades del lienzo. `mono` lo pinta de un solo color (relieve). */
function drawPrint(ctx: CanvasRenderingContext2D, p: Print, img: HTMLImageElement | null, mono?: string) {
  const { w, h } = printSize(p)
  if (p.kind === 'artwork') {
    if (!img) return
    if (!mono) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      return
    }
    // Silueta: el gráfico en un canvas aparte, teñido conservando su transparencia
    const tmp = document.createElement('canvas')
    tmp.width = 256
    tmp.height = Math.max(1, Math.round((256 * h) / w))
    const t = tmp.getContext('2d')!
    t.drawImage(img, 0, 0, tmp.width, tmp.height)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = mono
    t.fillRect(0, 0, tmp.width, tmp.height)
    ctx.drawImage(tmp, -w / 2, -h / 2, w, h)
  } else {
    ctx.font = `${p.bold ? 700 : 400} ${p.size}px ${p.font || 'sans-serif'}`
    ctx.fillStyle = mono ?? p.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.text, 0, 0)
  }
}

/** Caja de un trazado (sus puntos). */
function pathBox(d: string) {
  const v = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < v.length; i += 2) {
    x0 = Math.min(x0, v[i])
    x1 = Math.max(x1, v[i])
    y0 = Math.min(y0, v[i + 1])
    y1 = Math.max(y1, v[i + 1])
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
